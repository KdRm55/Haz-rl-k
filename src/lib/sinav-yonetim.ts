/** Muafiyet sınavı yönetimi — Apps Script Sinav.gs panel işlemleri karşılığı. */
import 'server-only';
import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { ALAN_ETIKET, LISTE_SINIRI, satirlariTemizle, sutunHarfi } from './aktarim-kurallari';
import { KullaniciHatasi } from './hata';
import { ayarlarOku } from './ogrenci';
import { islemKaydet, yetkiGerekli } from './oturum';
import {
  bosSayim, kuralDogrula, kuralMetni, PUAN_ALANLARI, puanBaslikBul, puanFarkHesapla, puanMetni, puanSatirEslesmesi, puanSonrasiSayim, say
} from './puan-kurallari';
import { puanGoster, SONUC, sinavKurali, sinavSonucu } from './sinav';
import { ayarYaz } from './ayar';

type Vt = ReturnType<typeof vt>;
type Islem = Parameters<Parameters<Vt['transaction']>[0]>[0];
const yonetici = () => yetkiGerekli(['admin']);

async function sinavSatirlari(db: Vt | Islem) {
  return db.select().from(schema.sinavSonuclari).orderBy(asc(schema.sinavSonuclari.no));
}
const imza = (l: { no: string; yazili: string; sozlu: string }[]) =>
  createHash('sha256').update(JSON.stringify(l.map(r => [r.no, r.yazili, r.sozlu]))).digest('base64url');

/** Durum özeti: kural, sayılar, hatalı puanlar, sözlü bekleyenler, yayın. */
export async function sinavDurumu() {
  await yonetici();
  const db = vt();
  const [a, satirlar, kayitli] = await Promise.all([
    ayarlarOku(), sinavSatirlari(db),
    db.select({ no: schema.ogrenciler.no }).from(schema.ogrenciler).where(and(eq(schema.ogrenciler.kayitli, true), eq(schema.ogrenciler.durum, 'aktif')))
  ]);
  const k = sinavKurali(a);
  const sayilar = { toplam: 0, bekliyor: 0, sozluBekliyor: 0, muaf: 0, hazirlik: 0, hata: 0 };
  const hatalar: { no: string; ad: string; neden: string }[] = [], bekleyenSozlu: { no: string; ad: string }[] = [];
  for (const r of satirlar) {
    sayilar.toplam++;
    const x = sinavSonucu(r.yazili, r.sozlu, k), ad = (r.adi + ' ' + r.soyadi).trim();
    if (x.sonuc === SONUC.MUAF) sayilar.muaf++;
    else if (x.sonuc === SONUC.HAZIRLIK) sayilar.hazirlik++;
    else if (x.sonuc === SONUC.HATA) { sayilar.hata++; hatalar.push({ no: r.no, ad, neden: x.aciklama }); }
    else if (x.aciklama.startsWith('Sözlü')) { sayilar.sozluBekliyor++; bekleyenSozlu.push({ no: r.no, ad }); }
    else sayilar.bekliyor++;
  }
  const listede = new Set(satirlar.map(r => r.no));
  return {
    kural: kuralMetni(k), ayar: k, yayinda: k.yayinda, yaziliTamam: k.yaziliTamam, sozluTamam: k.sozluTamam,
    sayilar, hatalar: hatalar.slice(0, 200), bekleyenSozlu: bekleyenSozlu.slice(0, 200),
    eksikOgrenci: kayitli.filter(o => !listede.has(o.no)).length
  };
}
export type SinavDurumu = Awaited<ReturnType<typeof sinavDurumu>>;

/** Tüm sınav listesi, her satırın güncel kurala göre sonucuyla. */
export async function sinavListesi() {
  await yonetici();
  const [a, satirlar] = await Promise.all([ayarlarOku(), sinavSatirlari(vt())]);
  const k = sinavKurali(a);
  return satirlar.map(r => {
    const x = sinavSonucu(r.yazili, r.sozlu, k);
    return { no: r.no, adi: r.adi, soyadi: r.soyadi, yer: r.yer, yazili: r.yazili, sozlu: r.sozlu, ortalama: x.ortalama, sonuc: x.sonuc, aciklama: x.aciklama };
  });
}
export type SinavListeSatiri = Awaited<ReturnType<typeof sinavListesi>>[number];

/** Aktif öğrencileri sınav listesine ekler; mevcut satırlara ve puanlara dokunmaz (yalnızca ad güncellenir). */
export async function sinavListesiniGuncelle() {
  await yonetici();
  const sonuc = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7302)`);
    const aktif = await tx.select().from(schema.ogrenciler).where(and(eq(schema.ogrenciler.kayitli, true), eq(schema.ogrenciler.durum, 'aktif'))).orderBy(asc(schema.ogrenciler.no));
    if (!aktif.length) throw new KullaniciHatasi('Sistemde aktif öğrenci yok. Önce "Liste yükle" sekmesinden öğrenci listesini yükleyin.');
    const mevcut = new Map((await sinavSatirlari(tx)).map(r => [r.no, r]));
    let adGuncel = 0;
    const yeni: (typeof schema.sinavSonuclari.$inferInsert)[] = [];
    for (const o of aktif) {
      const m = mevcut.get(o.no);
      if (!m) { yeni.push({ no: o.no, adi: o.adi, soyadi: o.soyadi }); continue; }
      if (m.adi !== o.adi || m.soyadi !== o.soyadi) {
        await tx.update(schema.sinavSonuclari).set({ adi: o.adi, soyadi: o.soyadi }).where(eq(schema.sinavSonuclari.no, o.no));
        adGuncel++;
      }
    }
    for (let i = 0; i < yeni.length; i += 500) await tx.insert(schema.sinavSonuclari).values(yeni.slice(i, i + 500));
    return { eklenen: yeni.length, adGuncel };
  });
  await islemKaydet('Sınav listesi', `${sonuc.eklenen} öğrenci eklendi, ${sonuc.adGuncel} ad güncellendi`);
  return { ...sonuc, durum: await sinavDurumu() };
}

/** Panelden tek öğrencinin sınav yeri ya da puanları düzeltilir; puan değişiklikleri öğrenci geçmişine yazılır. */
export async function sinavSatirGuncelle(no: string, v: { yer?: string; yazili?: string; sozlu?: string }) {
  await yonetici();
  const db = vt();
  const [r] = await db.select().from(schema.sinavSonuclari).where(eq(schema.sinavSonuclari.no, String(no)));
  if (!r) throw new KullaniciHatasi('Öğrenci sınav listesinde bulunamadı. Listeyi yenileyin.');
  const set: Partial<typeof schema.sinavSonuclari.$inferInsert> = {};
  const log: { alan: string; eski: string; yeni: string }[] = [];
  if (v.yer !== undefined && v.yer.trim().slice(0, 200) !== r.yer) set.yer = v.yer.trim().slice(0, 200);
  for (const [a, et] of [['yazili', 'Yazılı'], ['sozlu', 'Sözlü']] as const) {
    if (v[a] === undefined) continue;
    const m = puanMetni(v[a]);
    if (m === null) throw new KullaniciHatasi(`${et} puanı anlaşılamadı: "${v[a]}" (0–100 arası sayı ya da girmeyen için G yazın).`);
    if (m === r[a]) continue;
    set[a] = m;
    log.push({ alan: et + ' puanı', eski: puanGoster(r[a]), yeni: puanGoster(m) });
  }
  if (!Object.keys(set).length) return { degisti: false };
  const ad = (r.adi + ' ' + r.soyadi).trim();
  await db.transaction(async tx => {
    await tx.update(schema.sinavSonuclari).set(set).where(eq(schema.sinavSonuclari.no, r.no));
    if (log.length) await tx.insert(schema.ogrenciDegisiklikleri).values(log.map(l => ({ kaynak: 'Elle', ogrenciNo: r.no, adSoyad: ad, ...l })));
  });
  await islemKaydet('Sınav listesi', `${r.no} ${ad}: ${[set.yer !== undefined ? 'sınav yeri' : '', ...log.map(l => l.alan)].filter(Boolean).join(', ')} düzeltildi`);
  return { degisti: true };
}

/** Seçilen öğrencilere aynı sınav yerini / saatini yazar. */
export async function sinavYerYaz(nolar: string[], yer: string) {
  await yonetici();
  if (!Array.isArray(nolar) || !nolar.length) throw new KullaniciHatasi('Öğrenci seçilmedi.');
  const y = String(yer ?? '').trim().slice(0, 200);
  for (let i = 0; i < nolar.length; i += 500) {
    await vt().update(schema.sinavSonuclari).set({ yer: y }).where(inArray(schema.sinavSonuclari.no, nolar.slice(i, i + 500).map(String)));
  }
  await islemKaydet('Sınav listesi', `${nolar.length} öğrencinin sınav yeri ${y ? `"${y}" yapıldı` : 'silindi'}`);
  return { sayi: nolar.length };
}

export async function sinavSatirSil(no: string) {
  await yonetici();
  const [r] = await vt().select().from(schema.sinavSonuclari).where(eq(schema.sinavSonuclari.no, String(no)));
  if (!r) throw new KullaniciHatasi('Öğrenci sınav listesinde bulunamadı.');
  if (r.yazili || r.sozlu) throw new KullaniciHatasi('Puanı girilmiş öğrenci listeden çıkarılamaz. Önce puanlarını silin.');
  await vt().delete(schema.sinavSonuclari).where(eq(schema.sinavSonuclari.no, r.no));
  await islemKaydet('Sınav listesi', `${r.no} ${r.adi} ${r.soyadi} listeden çıkarıldı`);
  return { silindi: true };
}

/* ---------- Kural ---------- */
export async function kuralOnizle(kural: Record<string, unknown>, ornek?: { yazili?: string; sozlu?: string }) {
  await yonetici();
  const [a, satirlar] = await Promise.all([ayarlarOku(), sinavSatirlari(vt())]);
  const simdi = sinavKurali(a), yeni = kuralDogrula(kural, simdi);
  const eski = bosSayim(), sonra = bosSayim();
  const degisen: { no: string; ad: string; yazili: string; sozlu: string; eski: string; yeni: string }[] = [];
  for (const r of satirlar) {
    const x = sinavSonucu(r.yazili, r.sozlu, simdi), y = sinavSonucu(r.yazili, r.sozlu, yeni);
    say(eski, x.sonuc); say(sonra, y.sonuc);
    if (x.sonuc !== y.sonuc) degisen.push({ no: r.no, ad: (r.adi + ' ' + r.soyadi).trim(), yazili: puanGoster(r.yazili), sozlu: puanGoster(r.sozlu), eski: x.sonuc, yeni: y.sonuc });
  }
  const deneme = ornek && (String(ornek.yazili ?? '').trim() || String(ornek.sozlu ?? '').trim()) ? sinavSonucu(ornek.yazili, ornek.sozlu, yeni) : null;
  return { kural: kuralMetni(yeni), eskiKural: kuralMetni(simdi), ayni: kuralMetni(yeni) === kuralMetni(simdi), eski, sonra, degisenSayi: degisen.length, degisen: degisen.slice(0, 200), deneme, yayinda: simdi.yayinda };
}
export type KuralOnizleme = Awaited<ReturnType<typeof kuralOnizle>>;

export async function kuralKaydet(kural: Record<string, unknown>) {
  await yonetici();
  const simdi = sinavKurali(await ayarlarOku());
  const k = kuralDogrula(kural, simdi);
  await ayarYaz('MUAFIYET_YONTEMI', k.yontem === 'ORTALAMA' ? 'Ortalama' : 'Ayrı ayrı');
  for (const [anahtar, deger] of [['YAZILI_GECME_PUANI', k.yaziliGecme], ['YAZILI_AGIRLIK', k.yaziliAgirlik], ['MUAFIYET_PUANI', k.muafiyetPuani],
    ['SOZLU_ALT_SINIR', k.sozluAltSinir], ['SOZLU_GECME_PUANI', k.sozluGecme]] as const) await ayarYaz(anahtar, String(deger));
  await islemKaydet('Muafiyet kuralı', `Eski: ${kuralMetni(simdi)} | Yeni: ${kuralMetni(k)}`);
  return sinavDurumu();
}

/** Sınav aşamasını tamamlandı işaretler: puanı boş olanlar "girmedi" sayılır. */
export async function asamaIsaretle(asama: 'yazili' | 'sozlu', tamam: boolean) {
  await yonetici();
  if (asama !== 'yazili' && asama !== 'sozlu') throw new KullaniciHatasi('Geçersiz sınav aşaması.');
  const once = await sinavDurumu();
  if (!once.sayilar.toplam) throw new KullaniciHatasi('Sınav listesi boş. Önce "Sınav listesini güncelle"ye basın.');
  await ayarYaz(asama === 'yazili' ? 'YAZILI_TAMAMLANDI' : 'SOZLU_TAMAMLANDI', tamam ? 'Evet' : 'Hayır');
  const etkilenen = asama === 'yazili' ? once.sayilar.bekliyor : once.sayilar.sozluBekliyor;
  await islemKaydet('Sınav aşaması', `${asama === 'yazili' ? 'Yazılı' : 'Sözlü'} sınav ${tamam ? `tamamlandı olarak işaretlendi (${etkilenen} öğrenci girmedi sayıldı)` : 'işareti kaldırıldı'}`);
  return sinavDurumu();
}

export async function yayinla(ac: boolean) {
  await yonetici();
  if (ac) {
    const d = await sinavDurumu();
    if (!d.sayilar.toplam) throw new KullaniciHatasi('Yayınlanacak sınav sonucu yok.');
    if (d.sayilar.hata) throw new KullaniciHatasi(`${d.sayilar.hata} öğrencinin puanı hatalı. Düzeltmeden sonuçlar yayınlanamaz.`);
  }
  await ayarYaz('SINAV_SONUCLARI_YAYINDA', ac ? 'Evet' : 'Hayır');
  await islemKaydet('Sınav sonuçları', ac ? 'Öğrencilere açıldı' : 'Öğrencilere kapatıldı');
  return sinavDurumu();
}

/* ---------- Puan listesi yükleme ---------- */
export async function puanOnizle(satirlarHam: unknown, basSatirHam: unknown) {
  await yonetici();
  const satirlar = satirlariTemizle(satirlarHam);
  if (!satirlar.length) throw new KullaniciHatasi('Dosyada veri bulunamadı.');
  let bas: number, e, otomatik: boolean;
  if (basSatirHam != null && basSatirHam !== '') {
    bas = Math.max(0, Math.min(parseInt(String(basSatirHam), 10) || 0, satirlar.length - 1));
    e = puanSatirEslesmesi(satirlar[bas]); otomatik = false;
  } else {
    const b = puanBaslikBul(satirlar);
    otomatik = b.basSatir > -1; bas = otomatik ? b.basSatir : 0;
    e = b.eslesme ?? puanSatirEslesmesi(satirlar[0]);
  }
  const baslik = satirlar[bas] ?? [];
  const genislik = satirlar.slice(bas, bas + 50).reduce((m, r) => Math.max(m, r.length), 0);
  return {
    basSatir: bas, otomatikBulundu: otomatik, eslesme: e, veriSatiri: satirlar.length - bas - 1,
    sutunlar: Array.from({ length: genislik }, (_, i) => ({ i, ad: sutunHarfi(i) + ' — ' + (String(baslik[i] ?? '').trim() || '(başlıksız)') })),
    ornek: satirlar.slice(bas + 1).filter(r => r.some(v => v.trim())).slice(0, 3)
  };
}

export type PuanVerisi = { satirlar: unknown; basSatir: unknown; eslesme: Record<string, unknown>; dosyaAdi?: string; imza?: string; uzerineYaz?: boolean; adUyusmazYaz?: boolean };

async function puanHazirla(db: Vt | Islem, veri: PuanVerisi) {
  const satirlar = satirlariTemizle(veri?.satirlar);
  if (!satirlar.length) throw new KullaniciHatasi('Dosyada veri bulunamadı.');
  const bas = Math.max(0, parseInt(String(veri.basSatir ?? ''), 10) || 0);
  const genislik = satirlar.reduce((m, r) => Math.max(m, r.length), 0);
  const e: Record<string, number> = {};
  for (const a of PUAN_ALANLARI) {
    const v = parseInt(String(veri.eslesme?.[a] ?? ''), 10);
    e[a] = !isNaN(v) && v >= 0 && v < genislik ? v : -1;
  }
  if (e.no === -1) throw new KullaniciHatasi('"Öğrenci No" sütunu seçilmedi.');
  if (e.yazili === -1 && e.sozlu === -1) throw new KullaniciHatasi('Yazılı ya da sözlü puan sütunu seçilmedi.');
  if (e.yazili > -1 && e.yazili === e.sozlu) throw new KullaniciHatasi('Yazılı ve sözlü için aynı sütun seçilemez.');
  const [sinav, ogr, a] = await Promise.all([
    sinavSatirlari(db),
    db.select({ no: schema.ogrenciler.no, durum: schema.ogrenciler.durum, kayitli: schema.ogrenciler.kayitli }).from(schema.ogrenciler),
    ayarlarOku(db)
  ]);
  if (!sinav.length) throw new KullaniciHatasi('Sınav listesi boş. Önce "Sınav listesini güncelle"ye basın.');
  const ogrenci = new Map(ogr.filter(o => o.kayitli).map(o => [o.no, o]));
  const fark = puanFarkHesapla(satirlar, bas, e, sinav, ogrenci, { uzerineYaz: !!veri.uzerineYaz, adUyusmazYaz: !!veri.adUyusmazYaz });
  return { sinav, fark, e, imza: imza(sinav), kural: sinavKurali(a) };
}

export async function puanFark(veri: PuanVerisi) {
  await yonetici();
  const h = await puanHazirla(vt(), veri);
  const f = h.fark, k = <T,>(x: T[]) => x.slice(0, LISTE_SINIRI);
  const alan = (x: (typeof f.yeni)[number]) => ({ no: x.no, ad: x.ad, alan: x.alan, eski: x.eski, yeni: x.yeni, adUyusmaz: x.adUyusmaz });
  return {
    imza: h.imza,
    sayilar: { yeni: f.yeni.length, degisen: f.degisen.length, ayni: f.ayni, adUyusmaz: f.adUyusmaz.length, bulunamadi: f.bulunamadi.length, hatali: f.hatali.length, bosSatir: f.bosSatir, yazilacak: f.yazilacak.length },
    yeni: k(f.yeni.map(alan)), degisen: k(f.degisen.map(alan)), adUyusmaz: k(f.adUyusmaz), bulunamadi: k(f.bulunamadi), hatali: k(f.hatali),
    sonuc: puanSonrasiSayim(h.sinav, f.yazilacak, h.kural)
  };
}
export type PuanFarkOzeti = Awaited<ReturnType<typeof puanFark>>;

export async function puanUygula(veri: PuanVerisi) {
  await yonetici();
  const ozet = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7302)`);
    const h = await puanHazirla(tx, veri);
    if (h.imza !== veri.imza) throw new KullaniciHatasi('Önizlemeden sonra sınav listesinde puan değişti. Farkları yeniden hesaplayıp tekrar onaylayın.');
    const y = h.fark.yazilacak;
    if (!y.length) throw new KullaniciHatasi('Yazılacak puan yok.');
    const tarih = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const islemNo = 'P-' + tarih.replace(/\D/g, '').slice(2, 12).replace(/^(\d{6})/, '$1-');
    const satirBasi = new Map<string, Partial<Record<'yazili' | 'sozlu', string>>>();
    y.forEach(x => satirBasi.set(x.no, { ...satirBasi.get(x.no), [x.alanKod]: x.deger }));
    for (const [no, set] of satirBasi) await tx.update(schema.sinavSonuclari).set(set).where(eq(schema.sinavSonuclari.no, no));
    for (let i = 0; i < y.length; i += 500) {
      await tx.insert(schema.ogrenciDegisiklikleri).values(y.slice(i, i + 500).map(x => ({ kaynak: islemNo, ogrenciNo: x.no, adSoyad: x.ad, alan: x.alan + ' puanı', eski: x.eski, yeni: x.yeni })));
    }
    const yeniSay = y.filter(x => !x.eski).length;
    return { islemNo, yazilan: y.length, yeni: yeniSay, degistirilen: y.length - yeniSay,
      atlananDegisen: h.fark.degisen.length - y.filter(x => x.eski).length, bulunamadi: h.fark.bulunamadi.length, hatali: h.fark.hatali.length };
  });
  await islemKaydet('Puan yükleme', `${ozet.islemNo} (${String(veri.dosyaAdi ?? '').slice(0, 80)}): ${ozet.yeni} yeni, ${ozet.degistirilen} değiştirilen puan`);
  return { ozet, durum: await sinavDurumu() };
}

/** Sınav listesindeki öğrencilerle puan şablonu satırları (Öğrenci No, Adı, Soyadı, Yazılı, Sözlü). */
export async function puanSablonuSatirlari(): Promise<(string | number)[][]> {
  const satirlar = await sinavSatirlari(vt());
  if (!satirlar.length) throw new KullaniciHatasi('Sınav listesi boş. Önce "Sınav listesini güncelle"ye basın.');
  const hucre = (v: string) => (v === '' || v === 'G' || isNaN(Number(v)) ? v : Number(v));
  return [[ALAN_ETIKET.no, ALAN_ETIKET.adi, ALAN_ETIKET.soyadi, 'Yazılı', 'Sözlü'], ...satirlar.map(r => [r.no, r.adi, r.soyadi, hucre(r.yazili), hucre(r.sozlu)])];
}
