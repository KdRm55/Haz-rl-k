/** Sınav yeri listeleri (kelebek sistem çıktısı) — Apps Script SinavYeri.gs karşılığı. */
import 'server-only';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { LISTE_SINIRI, satirlariTemizle, sutunHarfi } from './aktarim-kurallari';
import { bugunGun, dsDersYetkisi, dsDurum } from './donem-sinav';
import { SY_ALIAS, SY_GECMIS_GUN, syBaslikEslestir, syGorunurluk, syKayitlariCikar, syMetaDogrula, trGun, type SyAlan, type SyEslesme, type SyMeta } from './donem-kurallari';
import { KullaniciHatasi } from './hata';
import { soyadMaskele } from './metin';
import { islemKaydet, yetkiGerekli } from './oturum';

type Vt = ReturnType<typeof vt>;
type Db = Vt | Parameters<Parameters<Vt['transaction']>[0]>[0];
const yonetici = () => yetkiGerekli(['admin']);
const tarihSaat = (d: Date) => new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(d);

async function ogrenciHaritasi(db: Db) {
  const l = await db.select({ no: schema.ogrenciler.no, adi: schema.ogrenciler.adi, soyadi: schema.ogrenciler.soyadi, durum: schema.ogrenciler.durum, kayitli: schema.ogrenciler.kayitli }).from(schema.ogrenciler);
  return new Map(l.filter(o => o.kayitli).map(o => [o.no, o]));
}

export async function syDurum() {
  await yonetici();
  const db = vt();
  const [listeler, sayilar, donem] = await Promise.all([
    db.select().from(schema.sinavYeriListeleri).orderBy(desc(schema.sinavYeriListeleri.yukleme)),
    db.select({ liste: schema.sinavYeriKayitlari.listeKod, salon: schema.sinavYeriKayitlari.salon, n: sql<number>`count(*)::int` })
      .from(schema.sinavYeriKayitlari).groupBy(schema.sinavYeriKayitlari.listeKod, schema.sinavYeriKayitlari.salon),
    db.select({ kod: schema.donemSinavlari.kod, ad: schema.donemSinavlari.ad }).from(schema.donemSinavlari).where(eq(schema.donemSinavlari.arsiv, false)).orderBy(asc(schema.donemSinavlari.olusturma))
  ]);
  const bugun = bugunGun();
  return {
    gecmisGun: SY_GECMIS_GUN, donemSinavlari: donem,
    listeler: listeler.map(l => {
      const salon = sayilar.filter(s => s.liste === l.kod).sort((a, b) => a.salon.localeCompare(b.salon, 'tr', { numeric: true }));
      return { ...l, yukleme: tarihSaat(l.yukleme), gorunurluk: syGorunurluk(l, bugun), ogrenci: salon.reduce((t, s) => t + s.n, 0), salonlar: salon.map(s => ({ salon: s.salon, n: s.n })) };
    })
  };
}
export type SyDurum = Awaited<ReturnType<typeof syDurum>>;

/** Başlık satırı: öğrenci no ve salon sütunlarının ikisini de içeren ilk satır (ilk 25 satırda); bulunamazsa ilk satır. */
function baslikBul(satirlar: string[][]) {
  for (let r = 0; r < Math.min(satirlar.length, 25); r++) { const x = syBaslikEslestir(satirlar[r]); if (x.no > -1 && x.salon > -1) return { bas: r, e: x }; }
  return { bas: 0, e: syBaslikEslestir(satirlar[0]) };
}

export async function syOnizle(satirlarHam: unknown, basSatirHam: unknown) {
  await yonetici();
  const satirlar = satirlariTemizle(satirlarHam);
  if (!satirlar.length) throw new KullaniciHatasi('Dosyada veri bulunamadı.');
  let bas: number, e: SyEslesme;
  if (basSatirHam != null && basSatirHam !== '') { bas = Math.max(0, Math.min(parseInt(String(basSatirHam), 10) || 0, satirlar.length - 1)); e = syBaslikEslestir(satirlar[bas]); }
  else ({ bas, e } = baslikBul(satirlar));
  const genislik = satirlar.slice(bas, bas + 50).reduce((m, r) => Math.max(m, r.length), 0);
  return { basSatir: bas, eslesme: e, sutunlar: Array.from({ length: genislik }, (_, i) => ({ i, ad: sutunHarfi(i) + ' — ' + (String(satirlar[bas]?.[i] ?? '').trim() || '(başlıksız)') })) };
}

export type SyVerisi = { satirlar: unknown; basSatir: unknown; eslesme: Partial<Record<SyAlan, unknown>>; dosyaAdi?: string; meta?: Partial<SyMeta>; listeKod?: string };
async function syHazirla(db: Db, veri: SyVerisi) {
  const satirlar = satirlariTemizle(veri?.satirlar);
  if (!satirlar.length) throw new KullaniciHatasi('Dosyada veri bulunamadı.');
  const bas = Math.max(0, parseInt(String(veri.basSatir ?? ''), 10) || 0);
  const gen = satirlar.reduce((m, r) => Math.max(m, r.length), 0);
  const e = Object.fromEntries((Object.keys(SY_ALIAS) as SyAlan[]).map(k => { const x = parseInt(String(veri.eslesme?.[k] ?? ''), 10); return [k, !isNaN(x) && x >= 0 && x < gen ? x : -1]; })) as SyEslesme;
  if (e.no === -1) throw new KullaniciHatasi('"Öğrenci No" sütunu seçilmedi.');
  if (e.salon === -1) throw new KullaniciHatasi('"Sınav salonu" sütunu seçilmedi.');
  return syKayitlariCikar(satirlar, bas, e, await ogrenciHaritasi(db));
}

/** Denetim raporu (kaydetmeden önce). */
export async function syFark(veri: SyVerisi) {
  await yonetici();
  const r = await syHazirla(vt(), veri), k = <T,>(a: T[]) => a.slice(0, LISTE_SINIRI);
  return {
    sayilar: { kayit: r.kayit.length, hatali: r.hatali.length, siraTekrar: r.siraTekrar.length, kayitsiz: r.kayitsiz.length, listedeYok: r.listedeYok.length, salon: r.salonOzet.length },
    salonOzet: r.salonOzet, hatali: k(r.hatali), siraTekrar: k(r.siraTekrar), kayitsiz: k(r.kayitsiz), listedeYok: k(r.listedeYok), meta: r.meta, kitapcikVar: r.kitapcikVar
  };
}
export type SyFarki = Awaited<ReturnType<typeof syFark>>;

type SyKayitlari = ReturnType<typeof syKayitlariCikar>;
/** Listeyi ve öğrenci yerlerini yazar: listeKod verilirse o listenin yerine (yayın durumu korunur), yoksa yeni ve gizli liste. */
async function listeYaz(tx: Db, r: SyKayitlari, deger: SyMeta & { donemDers?: string }, listeKod: string, dosyaAdi: unknown) {
  if (!r.kayit.length) throw new KullaniciHatasi('Kaydedilecek geçerli satır yok.');
  let kod = listeKod.trim();
  let eski: typeof schema.sinavYeriListeleri.$inferSelect | undefined;
  if (kod) { [eski] = await tx.select().from(schema.sinavYeriListeleri).where(eq(schema.sinavYeriListeleri.kod, kod)); if (!eski) throw new KullaniciHatasi('Değiştirilecek liste bulunamadı. Paneli yenileyin.'); }
  else {
    const kodlar = await tx.select({ kod: schema.sinavYeriListeleri.kod }).from(schema.sinavYeriListeleri);
    kod = 'L' + (kodlar.reduce((mx, x) => Math.max(mx, parseInt(x.kod.replace(/\D/g, ''), 10) || 0), 0) + 1);
  }
  const set = { ...deger, yukleme: new Date(), dosya: String(dosyaAdi ?? '').slice(0, 100) };
  if (eski) {
    await tx.update(schema.sinavYeriListeleri).set(set).where(eq(schema.sinavYeriListeleri.kod, kod));
    await tx.delete(schema.sinavYeriKayitlari).where(eq(schema.sinavYeriKayitlari.listeKod, kod));
  } else await tx.insert(schema.sinavYeriListeleri).values({ kod, ...set, yayinda: false });
  for (let i = 0; i < r.kayit.length; i += 500) {
    await tx.insert(schema.sinavYeriKayitlari).values(r.kayit.slice(i, i + 500).map(x => ({ listeKod: kod, no: x.no, adi: x.adi, soyadi: x.soyadi, salon: x.salon, sira: x.sira, kitapcik: x.kitapcik })));
  }
  return { kod, yenilendi: !!eski, ogrenci: r.kayit.length, salon: r.salonOzet.length, hatali: r.hatali.length };
}

/** Yeni liste ya da var olan listenin (listeKod) yerine; yayın durumu korunur, yeni liste gizli başlar. */
export async function syKaydet(veri: SyVerisi) {
  await yonetici();
  const m = syMetaDogrula(veri?.meta);
  const sonuc = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7307)`);
    if (veri.listeKod) await bagliDegil(tx, String(veri.listeKod));
    return listeYaz(tx, await syHazirla(tx, veri), m, String(veri.listeKod ?? ''), veri.dosyaAdi);
  });
  await islemKaydet('Sınav yeri listesi', `${sonuc.kod} "${m.ad}" ${sonuc.yenilendi ? 'yenilendi' : 'yüklendi'}: ${sonuc.ogrenci} öğrenci, ${sonuc.salon} salon${sonuc.hatali ? `, ${sonuc.hatali} hatalı satır alınmadı` : ''}`);
  return {
    mesaj: `${sonuc.ogrenci} öğrencinin sınav yeri kaydedildi${sonuc.hatali ? ` (${sonuc.hatali} hatalı satır alınmadı)` : ''}` + (sonuc.yenilendi ? '. Liste yenilendi; yayın durumu korundu.' : '. Liste henüz yayında değil; kontrol edip "Yayınla"ya basın.'),
    durum: await syDurum()
  };
}

async function listeBul(db: Db, kod: string) {
  const [l] = await db.select().from(schema.sinavYeriListeleri).where(eq(schema.sinavYeriListeleri.kod, String(kod)));
  if (!l) throw new KullaniciHatasi('Liste bulunamadı. Paneli yenileyin.');
  return l;
}
/** Dönem sınavı dersine bağlı liste (sınav giriş belgesi) yalnızca sınav kartından yenilenir, yayınlanır ve silinir. */
async function bagliDegil(db: Db, kod: string) {
  const l = await listeBul(db, kod);
  if (l.donemDers) throw new KullaniciHatasi(`Bu liste ${l.donemKod} sınavının "${l.donemDers}" dersinin sınav giriş belgesi. Yenilemeyi ve yayını "Dönem sınavları" sekmesindeki sınav kartından yapın.`);
  return l;
}

export async function syGuncelle(kod: string, meta: Partial<SyMeta>) {
  await yonetici();
  const l = await listeBul(vt(), kod);
  const m = syMetaDogrula(meta);
  // Sınav giriş belgesinin bağlı olduğu sınav değiştirilemez
  await vt().update(schema.sinavYeriListeleri).set(l.donemDers ? { ...m, donemKod: l.donemKod } : m).where(eq(schema.sinavYeriListeleri.kod, l.kod));
  await islemKaydet('Sınav yeri listesi', `${l.kod} bilgileri güncellendi`);
  return { mesaj: 'Liste bilgileri güncellendi.', durum: await syDurum() };
}

export async function syYayin(kod: string, ac: boolean) {
  await yonetici();
  const l = await bagliDegil(vt(), kod);
  await vt().update(schema.sinavYeriListeleri).set({ yayinda: !!ac }).where(eq(schema.sinavYeriListeleri.kod, l.kod));
  await islemKaydet('Sınav yeri listesi', `${l.kod} "${l.ad}" ${ac ? 'yayınlandı' : 'gizlendi'}`);
  // Tarihi geçmiş liste yayında olsa da öğrenciye gösterilmez: mesaj bunu açıkça söylemeli
  const eski = ac && syGorunurluk({ yayinda: true, tarih: l.tarih }, bugunGun()) === 'eski';
  return {
    mesaj: !ac ? 'Liste öğrencilerden gizlendi.'
      : eski ? `Liste yayına alındı AMA sınav tarihi (${l.tarih}) ${SY_GECMIS_GUN} günden eski olduğu için öğrenciler GÖRMEZ. Sınav henüz yapılmadıysa "Bilgileri düzenle" ile doğru tarihi girin.`
      : 'Sınav yerleri yayınlandı; öğrenciler numaralarıyla görebilir.',
    durum: await syDurum()
  };
}

export async function sySil(kod: string) {
  await yonetici();
  const l = await bagliDegil(vt(), kod);
  await vt().delete(schema.sinavYeriListeleri).where(eq(schema.sinavYeriListeleri.kod, l.kod));
  await islemKaydet('Sınav yeri listesi', `${l.kod} "${l.ad}" silindi`);
  return { mesaj: 'Liste silindi.', durum: await syDurum() };
}

/* ---------- Öğrenci ekranı ---------- */
export type SyOgrenciYeri = { ad: string; tarih: string; saat: string; yer: string; aciklama: string; salon: string; sira: string; donemKod: string; donemDers: string; gecti: boolean };

/** Öğrencinin yayındaki sınav yerleri; tarihi SY_GECMIS_GUN günden eski olanlar gösterilmez. Kitapçık türü verilmez. */
export async function syOgrenciBilgi(db: Db, no: string) {
  const kayit = await db.select().from(schema.sinavYeriKayitlari).where(eq(schema.sinavYeriKayitlari.no, no));
  if (!kayit.length) return { yerler: [] as SyOgrenciYeri[], ad: '', soyadi: '' };
  const listeler = await db.select().from(schema.sinavYeriListeleri).where(inArray(schema.sinavYeriListeleri.kod, kayit.map(k => k.listeKod)));
  const bugun = bugunGun();
  const yerler = kayit.flatMap(k => {
    const l = listeler.find(x => x.kod === k.listeKod);
    if (!l || syGorunurluk(l, bugun) !== 'gorunur') return [];
    const t = trGun(l.tarih);
    return [{ ad: l.ad, tarih: l.tarih, saat: l.saat, yer: l.yer, aciklama: l.aciklama, salon: k.salon, sira: k.sira, donemKod: l.donemKod, donemDers: l.donemDers, gecti: t != null && t < bugun, _t: t ?? 9e15 }];
  }).sort((a, b) => a._t - b._t).map(({ _t, ...x }) => x);
  const ilk = kayit.find(k => yerler.length && listeler.some(l => l.kod === k.listeKod));
  return { yerler, ad: ilk?.adi ?? '', soyadi: ilk?.soyadi ?? '' };
}

/** Dönem sınavı dersinin yayındaki sınav giriş belgesinde öğrencinin yeri (yoksa sınava bağlı genel liste). */
export function bagliYerBulucu(yerler: SyOgrenciYeri[]) {
  return (donemKod: string, ders: string) => {
    const y = yerler.find(x => x.donemKod === donemKod && x.donemDers === ders) ?? yerler.find(x => x.donemKod === donemKod && !x.donemDers);
    return y ? 'Salon ' + y.salon + (y.sira ? ' · Sıra ' + y.sira : '') + (y.yer ? ' · ' + y.yer : '') : '';
  };
}

/* ---------- Dönem sınavı: sınav giriş belgesi (kelebek listesi; yönetim ve dersin öğretim elemanı) ---------- */
type DersYetkisi = Awaited<ReturnType<typeof dsDersYetkisi>>;
async function belgeHazirla(db: Db, { s, d }: DersYetkisi, satirlarHam: unknown) {
  const satirlar = satirlariTemizle(satirlarHam);
  if (!satirlar.length) throw new KullaniciHatasi('Dosyada veri bulunamadı.');
  const { bas, e } = baslikBul(satirlar);
  if (e.no === -1 || e.salon === -1) throw new KullaniciHatasi('Dosyada "Öğrenci No" ve "Sınav salonu" sütunları bulunamadı (ör. OGR_NO, SINAV_SALONU, SIRA_NO). Kelebek dağıtım programının öğrenci listesi çıktısını yükleyin.');
  const r = syKayitlariCikar(satirlar, bas, e, await ogrenciHaritasi(db));
  const listede = new Set(r.kayit.map(x => x.no));
  const sinavdaYok = s.ogrenciler.filter(o => !listede.has(o.no));
  return { s, d, r, sinavdaYok };
}

/** Yüklenmeden önce özet: kaç öğrenci, hangi salonlar, alınmayacak satırlar, sınavda olup listede olmayanlar. */
export async function dsBelgeOnizle(kod: string, ders: string, satirlarHam: unknown) {
  const { d, r, sinavdaYok } = await belgeHazirla(vt(), await dsDersYetkisi(vt(), kod, ders), satirlarHam);
  const k = <T,>(a: T[]) => a.slice(0, LISTE_SINIRI);
  return {
    sayilar: { kayit: r.kayit.length, salon: r.salonOzet.length, hatali: r.hatali.length, siraTekrar: r.siraTekrar.length, sinavdaYok: sinavdaYok.length },
    salonOzet: r.salonOzet, hatali: k(r.hatali), siraTekrar: k(r.siraTekrar),
    sinavdaYok: k(sinavdaYok.map(o => ({ no: o.no, ad: (o.adi + ' ' + o.soyadi).trim(), sinif: o.sinif }))),
    tarih: r.meta.tarih[0] ?? '', saat: r.meta.saat[0] ?? '', yer: r.meta.yer[0] ?? '', dersTarih: d.tarih, dersSaat: d.saat
  };
}

/** Kelebek listesini dersin sınav giriş belgesi olarak kaydeder (varsa yerine); ders tarihi boşsa listedeki tarih alınır. */
export async function dsBelgeKaydet(kod: string, ders: string, satirlarHam: unknown, dosyaAdi: unknown) {
  // Yetki işlemden önce denetlenir (oturum okuması veritabanı işleminin içinde beklemesin)
  const yetki = await dsDersYetkisi(vt(), kod, ders);
  const sonuc = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7307)`);
    const { s, d, r } = await belgeHazirla(tx, yetki, satirlarHam);
    const [eski] = await tx.select({ kod: schema.sinavYeriListeleri.kod }).from(schema.sinavYeriListeleri)
      .where(and(eq(schema.sinavYeriListeleri.donemKod, s.kod), eq(schema.sinavYeriListeleri.donemDers, d.ders)));
    const m = syMetaDogrula({ ad: `${s.ad} · ${d.ders}`, sinavKodu: r.meta.sinavKodu[0] ?? '', tarih: d.tarih || r.meta.tarih[0] || '', saat: d.saat || r.meta.saat[0] || '',
      yer: r.meta.yer[0] ?? '', aciklama: '', donemKod: s.kod });
    const y = await listeYaz(tx, r, { ...m, donemDers: d.ders }, eski?.kod ?? '', dosyaAdi);
    if (!d.tarih && m.tarih) {
      await tx.update(schema.donemSinavDersleri).set({ tarih: m.tarih, saat: d.saat || m.saat })
        .where(and(eq(schema.donemSinavDersleri.sinavKod, s.kod), eq(schema.donemSinavDersleri.ders, d.ders)));
    }
    return { ...y, s, d };
  });
  await islemKaydet('Sınav giriş belgesi', `${sonuc.s.kod} ${sonuc.d.ders}: ${sonuc.ogrenci} öğrenci, ${sonuc.salon} salon ${sonuc.yenilendi ? '(liste yenilendi)' : 'yüklendi'}${sonuc.hatali ? `, ${sonuc.hatali} hatalı satır alınmadı` : ''}`);
  return dsDurum();
}
export const kayitsizAd = (ad: string, soyadi: string) => (ad + ' ' + soyadMaskele(soyadi)).trim();

/* ---------- Tanı ---------- */
export async function syTani(numaraHam: string, sorgu: (no: string) => Promise<{ bulundu: boolean; tur?: string; mesaj?: string; sinavYerleri?: unknown[] }>) {
  await yonetici();
  const numara = String(numaraHam ?? '').replace(/\s+/g, '');
  if (!/^\d+$/.test(numara)) throw new KullaniciHatasi('Geçerli bir öğrenci numarası yazın.');
  const db = vt();
  const [kayit, listeler, [og]] = await Promise.all([
    db.select().from(schema.sinavYeriKayitlari).where(eq(schema.sinavYeriKayitlari.no, numara)),
    db.select().from(schema.sinavYeriListeleri).orderBy(desc(schema.sinavYeriListeleri.yukleme)),
    db.select().from(schema.ogrenciler).where(eq(schema.ogrenciler.no, numara))
  ]);
  const bugun = bugunGun();
  const satirlar = listeler.map(l => {
    const k = kayit.find(x => x.listeKod === l.kod), g = syGorunurluk(l, bugun);
    const yerMetni = k ? `salon ${k.salon}${k.sira ? ', sıra ' + k.sira : ''}` : '';
    const [durum, aciklama] = !k ? ['yok', 'Bu numara listede yok.']
      : g === 'gizli' ? ['gizli', `Numara listede (${yerMetni}) ama liste yayında değil → "Yayınla"ya basın.`]
      : g === 'eski' ? ['eski', `Numara listede (${yerMetni}) ama sınav tarihi (${l.tarih}) ${SY_GECMIS_GUN} günden eski; öğrenciye gösterilmiyor. Sınav henüz yapılmadıysa "Bilgileri düzenle"den tarihi düzeltin.`]
      : ['gorunur', `Öğrenci görür: ${yerMetni}.`];
    return { liste: l.kod, ad: l.ad, tarih: l.tarih, durum, aciklama };
  });
  let s: { durum: string; aciklama: string };
  try {
    const r = await sorgu(numara);
    s = !r.bulundu ? { durum: 'bulunamadi', aciklama: 'Öğrenci sorgusu bu numarayı bulamıyor: ' + (r.mesaj ?? '') }
      : { durum: 'tamam', aciklama: `Öğrenci sorgusu ${(r.sinavYerleri ?? []).length} sınav yeri gönderiyor${r.tur === 'sinavyeri' ? ' (sistemde kaydı olmayan öğrenci olarak).' : '.'}` };
  } catch (e) { s = { durum: 'hata', aciklama: 'Öğrenci sorgusu denenemedi: ' + (e instanceof Error ? e.message : String(e)) }; }
  return { numara, kayitli: !!(og?.kayitli && og.durum === 'aktif'), ad: og ? (og.adi + ' ' + og.soyadi).trim() : kayit[0] ? (kayit[0].adi + ' ' + kayit[0].soyadi).trim() : '', listeler: satirlar, sorgu: s };
}
export type SyTani = Awaited<ReturnType<typeof syTani>>;
