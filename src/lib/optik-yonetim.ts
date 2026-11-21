/**
 * Optik cevap kâğıtları (sunucu): bir dönem sınavı dersine bağlı "optik seti", cevap anahtarı, okunan optikler,
 * puanların dönem sınavına yazılması ve öğrenciye yayın. Okuma (görüntü işleme) tarayıcıda yapılır; sunucuya
 * yalnızca cevap dizisi ve küçültülmüş görüntü gelir.
 */
import 'server-only';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { satirlariTemizle } from './aktarim-kurallari';
import { KullaniciHatasi, YetkiHatasi } from './hata';
import { islemKaydet, oturum, yetkiGerekli } from './oturum';
import { anahtarCoz, cevapNorm, cevapTamamla, cezaOku, elleSatirlari, karekodKitapcigi, optikNotu } from './optik/kurallar';

type Vt = ReturnType<typeof vt>;
type Db = Vt | Parameters<Parameters<Vt['transaction']>[0]>[0];
const yonetici = () => yetkiGerekli(['admin']);
const GORSEL_EN_COK = 1_500_000;   // base64 karakter sayısı (≈1,1 MB)

async function setBul(db: Db, kod: string) {
  const [s] = await db.select().from(schema.optikSetleri).where(eq(schema.optikSetleri.kod, String(kod)));
  if (!s) throw new KullaniciHatasi('Optik seti bulunamadı. Paneli yenileyin.');
  return s;
}

/* ---------- Yönetim: durum ve set ---------- */
export async function optikDurum() {
  await yonetici();
  const db = vt();
  const [setler, sayilar, donemler, dersler] = await Promise.all([
    db.select().from(schema.optikSetleri).orderBy(asc(schema.optikSetleri.olusturma)),
    db.select({ set: schema.optikKayitlari.setKod, kaynak: schema.optikKayitlari.kaynak, n: sql<number>`count(*)::int` }).from(schema.optikKayitlari).groupBy(schema.optikKayitlari.setKod, schema.optikKayitlari.kaynak),
    db.select({ kod: schema.donemSinavlari.kod, ad: schema.donemSinavlari.ad }).from(schema.donemSinavlari).where(eq(schema.donemSinavlari.arsiv, false)).orderBy(asc(schema.donemSinavlari.olusturma)),
    db.select({ kod: schema.donemSinavDersleri.sinavKod, ders: schema.donemSinavDersleri.ders }).from(schema.donemSinavDersleri).orderBy(asc(schema.donemSinavDersleri.sira))
  ]);
  return {
    donemler: donemler.map(d => ({ ...d, dersler: dersler.filter(x => x.kod === d.kod).map(x => x.ders) })),
    setler: setler.map(s => ({
      kod: s.kod, ad: s.ad, donemKod: s.donemKod, ders: s.ders, soruSayisi: s.soruSayisi, yanlisCezasi: s.yanlisCezasi, anahtar: s.anahtar, yayinda: s.yayinda,
      kayit: sayilar.filter(x => x.set === s.kod).reduce((t, x) => t + x.n, 0), elle: sayilar.find(x => x.set === s.kod && x.kaynak === 'Elle')?.n ?? 0
    }))
  };
}
export type OptikDurumu = Awaited<ReturnType<typeof optikDurum>>;

export async function optikSetOlustur(v: { ad: string; donemKod: string; ders: string }) {
  await yonetici();
  const ad = String(v?.ad ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
  if (!ad) throw new KullaniciHatasi('Optik setine bir ad verin (örn. "Kıraat vize").');
  const db = vt();
  const [ders] = await db.select().from(schema.donemSinavDersleri)
    .where(and(eq(schema.donemSinavDersleri.sinavKod, String(v?.donemKod ?? '')), eq(schema.donemSinavDersleri.ders, String(v?.ders ?? ''))));
  if (!ders) throw new KullaniciHatasi('Dönem sınavını ve dersini seçin. Puanlar bu dersin puanlarına yazılır.');
  const kod = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7308)`);
    const l = await tx.select({ kod: schema.optikSetleri.kod }).from(schema.optikSetleri);
    const yeni = 'O' + (l.reduce((m, x) => Math.max(m, parseInt(x.kod.replace(/\D/g, ''), 10) || 0), 0) + 1);
    await tx.insert(schema.optikSetleri).values({ kod: yeni, ad, donemKod: ders.sinavKod, ders: ders.ders });
    return yeni;
  });
  await islemKaydet('Optik seti', `${kod} "${ad}" oluşturuldu (${v.donemKod} · ${v.ders})`);
  return { kod, durum: await optikDurum() };
}

export async function optikSetSil(kod: string) {
  await yonetici();
  const s = await setBul(vt(), kod);
  await vt().delete(schema.optikSetleri).where(eq(schema.optikSetleri.kod, s.kod));
  await islemKaydet('Optik seti', `${s.kod} "${s.ad}" silindi (optikler ve görüntüler dahil)`);
  return optikDurum();
}

/** Yüklenen şablonu doğrular ve anahtarı kaydeder. Optikler zaten yüklüyse puanlar yeni anahtara göre yeniden hesaplanır (kayıtlı değildir; puanı yeniden yazmak gerekir). */
export async function optikAnahtarKaydet(kod: string, satirlar: unknown, yanlisCezasi: unknown) {
  await yonetici();
  const s = await setBul(vt(), kod);
  const r = anahtarCoz(satirlariTemizle(satirlar));
  const ceza = cezaOku(yanlisCezasi);
  await vt().update(schema.optikSetleri).set({ anahtar: r.anahtar, soruSayisi: r.soruSayisi, yanlisCezasi: String(ceza) }).where(eq(schema.optikSetleri.kod, s.kod));
  await islemKaydet('Optik cevap anahtarı', `${s.kod} "${s.ad}": ${Object.keys(r.anahtar).join(', ')} kitapçıkları, ${r.soruSayisi} soru`);
  return { mesaj: `Cevap anahtarı kaydedildi: ${Object.keys(r.anahtar).join(', ')} kitapçıkları, ${r.soruSayisi} soru.`, durum: await optikDurum() };
}

export async function optikYayin(kod: string, ac: boolean) {
  await yonetici();
  const s = await setBul(vt(), kod);
  if (ac) {
    if (!Object.keys(s.anahtar).length) throw new KullaniciHatasi('Önce cevap anahtarını yükleyin.');
    const [{ n }] = await vt().select({ n: sql<number>`count(*)::int` }).from(schema.optikKayitlari).where(eq(schema.optikKayitlari.setKod, s.kod));
    if (!n) throw new KullaniciHatasi('Henüz hiç optik yüklenmedi.');
  }
  await vt().update(schema.optikSetleri).set({ yayinda: !!ac }).where(eq(schema.optikSetleri.kod, s.kod));
  await islemKaydet('Optik yayını', `${s.kod} "${s.ad}" ${ac ? 'öğrencilere yayınlandı' : 'gizlendi'}`);
  return { mesaj: ac ? 'Optikler ve cevap anahtarı öğrencilere açıldı. Her öğrenci yalnızca kendi optiğini görür.' : 'Optikler öğrencilerden gizlendi.', durum: await optikDurum() };
}

/* ---------- Optik yükleme ---------- */
type Eslesen = { no: string; ad: string; kitapcik: string; salon: string; sira: string };
/** QR metinlerini sınav yeri listelerindeki KAREKOD sütunuyla eşleştirir (yüklenen sınav yeri dosyasında karekod olmalı). */
async function karekodlariBul(db: Db, karekodlar: string[]) {
  const liste = [...new Set(karekodlar.map(k => String(k ?? '').trim()).filter(Boolean))].slice(0, 500);
  const harita = new Map<string, Eslesen>();
  if (!liste.length) return harita;
  const k = schema.sinavYeriKayitlari;
  const satirlar = await db.select({ karekod: k.karekod, no: k.no, adi: k.adi, soyadi: k.soyadi, kitapcik: k.kitapcik, salon: k.salon, sira: k.sira }).from(k).where(inArray(k.karekod, liste));
  for (const s of satirlar) if (!harita.has(s.karekod)) harita.set(s.karekod, { no: s.no, ad: (s.adi + ' ' + s.soyadi).trim(), kitapcik: (s.kitapcik || karekodKitapcigi(s.karekod)).toUpperCase(), salon: s.salon, sira: s.sira });
  return harita;
}

/** Önizleme için: karekodlar kime ait? */
export async function optikEslestir(karekodlar: unknown) {
  await yonetici();
  const liste = Array.isArray(karekodlar) ? karekodlar.map(String) : [];
  const h = await karekodlariBul(vt(), liste);
  const [{ n }] = await vt().select({ n: sql<number>`count(*)::int` }).from(schema.sinavYeriKayitlari).where(sql`${schema.sinavYeriKayitlari.karekod} <> ''`);
  return { karekodluKayit: n, eslesen: Object.fromEntries([...h.entries()]) as Record<string, Eslesen> };
}

export type OptikGirdisi = { setKod: string; karekod?: string; no?: string; kitapcik?: string; cevaplar: string; uyari?: string; gorsel?: string; kaynak?: 'QR' | 'Elle' };

async function ogrenciAdi(db: Db, no: string) {
  const [o] = await db.select({ adi: schema.ogrenciler.adi, soyadi: schema.ogrenciler.soyadi, durum: schema.ogrenciler.durum, kayitli: schema.ogrenciler.kayitli }).from(schema.ogrenciler).where(eq(schema.ogrenciler.no, no));
  if (!o || !o.kayitli) throw new KullaniciHatasi(`${no} numaralı öğrenci sistemde yok.`);
  return (o.adi + ' ' + o.soyadi).trim();
}

async function optikYaz(db: Db, s: typeof schema.optikSetleri.$inferSelect, v: { no: string; ad: string; kitapcik: string; cevaplar: string; uyari: string; kaynak: 'QR' | 'Elle'; gorsel?: string }) {
  if (!s.anahtar[v.kitapcik]) throw new KullaniciHatasi(`${v.no}: ${v.kitapcik} kitapçığının cevap anahtarı yok.`);
  const ayni = { adSoyad: v.ad, kitapcik: v.kitapcik, cevaplar: v.cevaplar, kaynak: v.kaynak, uyari: v.uyari.slice(0, 300), zaman: new Date() };
  let gorsel = false;
  if (v.gorsel) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(v.gorsel);
    if (!m || m[1].length > GORSEL_EN_COK) throw new KullaniciHatasi(`${v.no}: optik görüntüsü geçersiz ya da çok büyük.`);
    await db.insert(schema.optikGorselleri).values({ setKod: s.kod, no: v.no, veri: m[1] }).onConflictDoUpdate({ target: [schema.optikGorselleri.setKod, schema.optikGorselleri.no], set: { veri: m[1] } });
    gorsel = true;
  }
  await db.insert(schema.optikKayitlari).values({ setKod: s.kod, no: v.no, ...ayni, gorsel })
    .onConflictDoUpdate({ target: [schema.optikKayitlari.setKod, schema.optikKayitlari.no], set: gorsel ? { ...ayni, gorsel } : ayni });
  return optikNotu(v.cevaplar, s.anahtar[v.kitapcik], Number(s.yanlisCezasi));
}

/** Tek optiği kaydeder (QR ile eşleşen ya da öğrenci numarası verilen). Aynı öğrenci için tekrar yüklenirse yenisi geçerli olur. */
export async function optikKaydet(v: OptikGirdisi) {
  await yonetici();
  const db = vt(), s = await setBul(db, v?.setKod);
  const cevap = cevapNorm(v?.cevaplar);
  if (cevap === null || !cevap.length) throw new KullaniciHatasi('Cevaplar okunamadı.');
  let no = String(v.no ?? '').replace(/\D/g, ''), ad = '', kitapcik = String(v.kitapcik ?? '').toUpperCase();
  if (v.karekod) {
    const e = (await karekodlariBul(db, [v.karekod])).get(String(v.karekod).trim());
    if (!e) throw new KullaniciHatasi('Bu karekod sınav yeri listelerinde yok. Sınav yeri dosyasını KAREKOD sütunuyla yüklediğinizden emin olun.');
    ({ no, ad } = e); kitapcik = e.kitapcik || kitapcik;
  } else {
    if (!no) throw new KullaniciHatasi('Öğrenci numarası yok.');
    ad = await ogrenciAdi(db, no);
  }
  if (!/^[A-D]$/.test(kitapcik)) throw new KullaniciHatasi(`${no}: kitapçık türü anlaşılamadı.`);
  const n = await optikYaz(db, s, { no, ad, kitapcik, cevaplar: cevapTamamla(cevap), uyari: String(v.uyari ?? ''), kaynak: v.kaynak === 'Elle' ? 'Elle' : 'QR', gorsel: v.gorsel });
  return { no, ad, kitapcik, dogru: n.dogru, yanlis: n.yanlis, bos: n.bos, puan: n.puan };
}

/** QR'sız (farklı form) optikler: "öğrenci no  kitapçık  cevaplar" satırları. Hepsi önce denetlenir; biri hatalıysa hiçbiri yazılmaz. */
export async function optikElleKaydet(setKod: string, metin: string) {
  await yonetici();
  const db = vt(), s = await setBul(db, setKod);
  if (!s.soruSayisi) throw new KullaniciHatasi('Önce cevap anahtarını yükleyin (soru sayısı buradan belli olur).');
  const { satirlar, hatalar } = elleSatirlari(metin, s.soruSayisi);
  const adlar = new Map<string, string>();
  for (const x of satirlar) {
    if (!s.anahtar[x.kitapcik]) hatalar.push(`${x.no}: ${x.kitapcik} kitapçığının cevap anahtarı yok.`);
    try { adlar.set(x.no, await ogrenciAdi(db, x.no)); } catch (e) { hatalar.push((e as Error).message); }
  }
  if (hatalar.length) throw new KullaniciHatasi('Hiçbir kayıt yazılmadı:\n' + hatalar.slice(0, 15).join('\n'));
  if (!satirlar.length) throw new KullaniciHatasi('Yazılacak satır yok.');
  const sonuc = await db.transaction(async tx => {
    const o: { no: string; ad: string; dogru: number; puan: number }[] = [];
    for (const x of satirlar) {
      const n = await optikYaz(tx, s, { no: x.no, ad: adlar.get(x.no)!, kitapcik: x.kitapcik, cevaplar: cevapTamamla(x.cevaplar), uyari: 'Elle girildi', kaynak: 'Elle' });
      o.push({ no: x.no, ad: adlar.get(x.no)!, dogru: n.dogru, puan: n.puan });
    }
    return o;
  });
  await islemKaydet('Optik elle kayıt', `${s.kod}: ${sonuc.map(x => x.no).join(', ')}`);
  return { yazilan: sonuc };
}

/* ---------- Sonuçlar, puan yazma ---------- */
export async function optikSonuclar(kod: string) {
  await yonetici();
  const db = vt(), s = await setBul(db, kod);
  const [kayitlar, ogrenciler, puanlar] = await Promise.all([
    db.select().from(schema.optikKayitlari).where(eq(schema.optikKayitlari.setKod, s.kod)).orderBy(asc(schema.optikKayitlari.no)),
    db.select().from(schema.donemSinavOgrencileri).where(eq(schema.donemSinavOgrencileri.sinavKod, s.donemKod)),
    db.select().from(schema.donemSinavPuanlari).where(and(eq(schema.donemSinavPuanlari.sinavKod, s.donemKod), eq(schema.donemSinavPuanlari.ders, s.ders)))
  ]);
  const ceza = Number(s.yanlisCezasi);
  const mevcut = new Map(puanlar.map(p => [p.no, p.puan]));
  const satirlar = kayitlar.map(k => {
    const a = s.anahtar[k.kitapcik];
    const n = a ? optikNotu(k.cevaplar, a, ceza) : null;
    return { no: k.no, ad: k.adSoyad, kitapcik: k.kitapcik, dogru: n?.dogru ?? 0, yanlis: n?.yanlis ?? 0, bos: n?.bos ?? 0, puan: n?.puan ?? 0, kaynak: k.kaynak, uyari: k.uyari, gorsel: k.gorsel, donemPuani: mevcut.get(k.no) ?? '' };
  });
  const var_ = new Set(kayitlar.map(k => k.no));
  const puanlilar = satirlar.map(x => x.puan);
  return {
    set: { kod: s.kod, ad: s.ad, donemKod: s.donemKod, ders: s.ders, yayinda: s.yayinda },
    satirlar,
    ozet: { n: satirlar.length, ortalama: puanlilar.length ? Math.round(puanlilar.reduce((t, x) => t + x, 0) / puanlilar.length * 100) / 100 : 0, enYuksek: puanlilar.length ? Math.max(...puanlilar) : 0, enDusuk: puanlilar.length ? Math.min(...puanlilar) : 0 },
    optiksiz: ogrenciler.filter(o => !var_.has(o.no)).map(o => ({ no: o.no, ad: (o.adi + ' ' + o.soyadi).trim(), sinif: o.sinif })).slice(0, 300),
    optiksizSayi: ogrenciler.filter(o => !var_.has(o.no)).length,
    sinavdaYok: kayitlar.filter(k => !ogrenciler.some(o => o.no === k.no)).map(k => ({ no: k.no, ad: k.adSoyad }))
  };
}
export type OptikSonuclari = Awaited<ReturnType<typeof optikSonuclar>>;

/**
 * Hesaplanan puanları dönem sınavının ilgili ders puanı olarak yazar. Boş puanlar yazılır, aynı olanlar atlanır;
 * farklı puanın üzerine yalnızca uzerineYaz açıkken yazılır. Optiği olmayan öğrencilere dokunulmaz.
 */
export async function optikPuanYaz(kod: string, uzerineYaz: boolean) {
  await yonetici();
  const sonuc = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7306)`);   // dönem puan yükleme kilidiyle aynı
    const s = await setBul(tx, kod);
    if (!Object.keys(s.anahtar).length) throw new KullaniciHatasi('Önce cevap anahtarını yükleyin.');
    const [sinav] = await tx.select().from(schema.donemSinavlari).where(eq(schema.donemSinavlari.kod, s.donemKod));
    if (!sinav) throw new KullaniciHatasi('Bağlı dönem sınavı bulunamadı.');
    const [kayitlar, ogrenciler, puanlar] = await Promise.all([
      tx.select().from(schema.optikKayitlari).where(eq(schema.optikKayitlari.setKod, s.kod)),
      tx.select({ no: schema.donemSinavOgrencileri.no }).from(schema.donemSinavOgrencileri).where(eq(schema.donemSinavOgrencileri.sinavKod, s.donemKod)),
      tx.select().from(schema.donemSinavPuanlari).where(and(eq(schema.donemSinavPuanlari.sinavKod, s.donemKod), eq(schema.donemSinavPuanlari.ders, s.ders)))
    ]);
    const sinavda = new Set(ogrenciler.map(o => o.no)), mevcut = new Map(puanlar.map(p => [p.no, p.puan]));
    const ceza = Number(s.yanlisCezasi);
    const yaz: { no: string; ad: string; eski: string; yeni: string }[] = [];
    let ayni = 0, atlanan = 0, sinavdaYok = 0;
    for (const k of kayitlar) {
      if (!sinavda.has(k.no)) { sinavdaYok++; continue; }
      const yeni = String(optikNotu(k.cevaplar, s.anahtar[k.kitapcik], ceza).puan), eski = mevcut.get(k.no) ?? '';
      if (eski === yeni) ayni++;
      else if (eski && !uzerineYaz) atlanan++;
      else yaz.push({ no: k.no, ad: k.adSoyad, eski, yeni });
    }
    for (const x of yaz) {
      await tx.insert(schema.donemSinavPuanlari).values({ sinavKod: s.donemKod, no: x.no, ders: s.ders, puan: x.yeni })
        .onConflictDoUpdate({ target: [schema.donemSinavPuanlari.sinavKod, schema.donemSinavPuanlari.no, schema.donemSinavPuanlari.ders], set: { puan: x.yeni } });
    }
    const kaynak = 'OPT-' + s.kod;
    for (let i = 0; i < yaz.length; i += 500) {
      await tx.insert(schema.ogrenciDegisiklikleri).values(yaz.slice(i, i + 500).map(x => ({ kaynak, ogrenciNo: x.no, adSoyad: x.ad, alan: `${s.donemKod} ${sinav.ad} · ${s.ders}`, eski: x.eski, yeni: x.yeni })));
    }
    return { s, yazilan: yaz.length, yeni: yaz.filter(x => !x.eski).length, ayni, atlanan, sinavdaYok };
  });
  await islemKaydet('Optik puanı yazma', `${sonuc.s.kod}: ${sonuc.yazilan} puan yazıldı (${sonuc.s.donemKod} · ${sonuc.s.ders})`);
  const { s: _s, ...ozet } = sonuc;
  void _s;
  return ozet;
}

/* ---------- Öğrenci ---------- */
/** Giriş yapmış öğrencinin yayınlanmış optikleri: kendi cevapları, kendi kitapçığının anahtarı ve sonucu. */
export async function optikOgrenci() {
  const o = await oturum();
  if (!o || o.tur !== 'ogrenci' || o.sifreDegistirmeli || !o.kvkkOnayli) throw new YetkiHatasi();
  const db = vt();
  const k = schema.optikKayitlari, s = schema.optikSetleri;
  const satirlar = await db.select({ set: s, k }).from(k).innerJoin(s, eq(k.setKod, s.kod)).where(and(eq(k.no, o.ogrenciNo), eq(s.yayinda, true)));
  return satirlar.map(({ set, k: kayit }) => {
    const anahtar = set.anahtar[kayit.kitapcik] ?? '';
    return {
      kod: set.kod, ad: set.ad, donemKod: set.donemKod, ders: set.ders, kitapcik: kayit.kitapcik, no: kayit.no,
      anahtar, cevaplar: cevapTamamla(kayit.cevaplar).slice(0, anahtar.length), gorsel: kayit.gorsel,
      not: anahtar ? optikNotu(kayit.cevaplar, anahtar, Number(set.yanlisCezasi)) : null
    };
  });
}
export type OgrenciOptigi = Awaited<ReturnType<typeof optikOgrenci>>[number];

/** Optik görüntüsü: yönetici hepsini; öğrenci yalnızca yayınlanmış setteki kendi optiğini görebilir. */
export async function optikGorsel(kod: string, no: string) {
  const o = await oturum();
  if (!o || o.sifreDegistirmeli || !o.kvkkOnayli) throw new YetkiHatasi();
  const db = vt();
  if (o.tur === 'ogrenci') {
    const [s] = await db.select({ yayinda: schema.optikSetleri.yayinda }).from(schema.optikSetleri).where(eq(schema.optikSetleri.kod, kod));
    if (o.ogrenciNo !== no || !s?.yayinda) throw new YetkiHatasi();
  } else if (o.tur !== 'admin') throw new YetkiHatasi();
  const [g] = await db.select().from(schema.optikGorselleri).where(and(eq(schema.optikGorselleri.setKod, kod), eq(schema.optikGorselleri.no, no)));
  return g ? { turu: g.turu, veri: Buffer.from(g.veri, 'base64') } : null;
}
