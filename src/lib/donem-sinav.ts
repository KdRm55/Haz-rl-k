/** Dönem (yıl içi) sınavları — Apps Script DonemSinav.gs karşılığı. */
import 'server-only';
import { createHash } from 'node:crypto';
import { and, asc, count, eq, gt, inArray, sql } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { satirlariTemizle, sutunHarfi, LISTE_SINIRI } from './aktarim-kurallari';
import {
  DS_KILIT_DENEME, DS_KILIT_SURE_MS, DS_ORT_ESIK, dersleriDogrula, dsBaslikBul, dsOrtalama, dsPuanFarkHesapla, dsSatirEslesmesi, trGun,
  type DersGirdisi, type DsEslesme
} from './donem-kurallari';
import { KullaniciHatasi } from './hata';
import { basNorm } from './metin';
import { dogrulamaEslesir } from './ogrenci-kurallari';
import { islemKaydet, oturumGerekli, yetkiGerekli } from './oturum';
import { puanMetni } from './puan-kurallari';
import { alfabetik } from './siniflandirma-kurallari';
import { puanGoster, puanOku } from './sinav';

type Vt = ReturnType<typeof vt>;
type Db = Vt | Parameters<Parameters<Vt['transaction']>[0]>[0];
const yonetici = () => yetkiGerekli(['admin']);
const zamanKodu = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'medium' })
  .format(new Date()).replace(/\D/g, '').slice(2, 14).replace(/^(\d{6})/, '$1-');
/** İstanbul'a göre bugünün takvim günü (UTC gün başlangıcı olarak). */
export const bugunGun = () => { const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()).split('-').map(Number); return Date.UTC(y, m - 1, d); };

/* ---------- Okuma ---------- */
async function sinavlar(db: Db, kodlar?: string[]) {
  const where = kodlar ? inArray(schema.donemSinavlari.kod, kodlar) : undefined;
  const [s, d, o, p, y] = await Promise.all([
    db.select().from(schema.donemSinavlari).where(where).orderBy(asc(schema.donemSinavlari.olusturma)),
    db.select().from(schema.donemSinavDersleri).where(kodlar ? inArray(schema.donemSinavDersleri.sinavKod, kodlar) : undefined).orderBy(asc(schema.donemSinavDersleri.sira)),
    db.select().from(schema.donemSinavOgrencileri).where(kodlar ? inArray(schema.donemSinavOgrencileri.sinavKod, kodlar) : undefined),
    db.select().from(schema.donemSinavPuanlari).where(kodlar ? inArray(schema.donemSinavPuanlari.sinavKod, kodlar) : undefined),
    db.select().from(schema.donemSinavYerleri).where(kodlar ? inArray(schema.donemSinavYerleri.sinavKod, kodlar) : undefined)
  ]);
  return s.map(x => {
    const ogr = o.filter(r => r.sinavKod === x.kod);
    const puan = new Map<string, Record<string, string>>();
    p.filter(r => r.sinavKod === x.kod).forEach(r => puan.set(r.no, { ...puan.get(r.no), [r.ders]: r.puan }));
    return {
      ...x, dersler: d.filter(r => r.sinavKod === x.kod),
      ogrenciler: ogr.map(r => ({ ...r, p: puan.get(r.no) ?? {} })),
      yerler: Object.fromEntries(y.filter(r => r.sinavKod === x.kod).map(r => [r.sinif, r.yer]))
    };
  });
}
type Sinav = Awaited<ReturnType<typeof sinavlar>>[number];
async function sinavBul(db: Db, kod: string): Promise<Sinav> {
  const [s] = await sinavlar(db, [String(kod)]);
  if (!s) throw new KullaniciHatasi('Sınav bulunamadı. Paneli yenileyin.');
  return s;
}

async function aktifSinifUyeleri(db: Db, adlar: string[]) {
  const siniflar = await db.select().from(schema.siniflar).where(eq(schema.siniflar.aktif, true));
  const secili = siniflar.filter(s => adlar.includes(s.ad));
  if (!secili.length) return [];
  const ogr = await db.select().from(schema.ogrenciler).where(inArray(schema.ogrenciler.sinifId, secili.map(s => s.id)));
  return secili.flatMap(s => ogr.filter(o => o.sinifId === s.id && /^\d+$/.test(o.no)).sort(alfabetik).map(o => ({ no: o.no, adi: o.adi, soyadi: o.soyadi, sinif: s.ad })));
}

/* ---------- Durum ---------- */
export async function dsDurum() {
  await yonetici();
  const db = vt();
  const [liste, siniflar, program, ogr] = await Promise.all([
    sinavlar(db),
    db.select().from(schema.siniflar).orderBy(asc(schema.siniflar.anahtar)),
    db.select({ ders: schema.hocaProgrami.ders }).from(schema.hocaProgrami),
    db.select({ no: schema.ogrenciler.no, tc4: schema.ogrenciler.tc4 }).from(schema.ogrenciler)
  ]);
  const tc = new Map(ogr.map(o => [o.no, o.tc4]));
  const derslik = new Map(siniflar.map(s => [s.ad, s.derslik]));
  return {
    esik: DS_ORT_ESIK,
    siniflar: siniflar.filter(s => s.aktif).map(s => s.ad),
    dersOneri: [...new Set(program.map(p => p.ders).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')),
    sinavlar: liste.map(x => ({
      kod: x.kod, ad: x.ad, siniflar: x.siniflar, yerYayinda: x.yerYayinda, arsiv: x.arsiv, ogrenci: x.ogrenciler.length,
      tcEksik: x.ogrenciler.filter(o => !tc.get(o.no)).length,
      yerler: x.siniflar.map(s => ({ sinif: s, derslik: derslik.get(s) ?? '', ozel: x.yerler[s] ?? '' })),
      dersler: x.dersler.map(d => {
        const tum = x.ogrenciler.map(o => o.p[d.ders] ?? '');
        const siniflarIc = [...new Set(x.ogrenciler.map(o => o.sinif))].sort((a, b) => a.localeCompare(b, 'tr')).map(sn => {
          const v = x.ogrenciler.filter(o => o.sinif === sn).map(o => o.p[d.ders] ?? '');
          const sayi = v.map(p => puanOku(p)).filter((p): p is number => typeof p === 'number');
          return { sinif: sn, n: v.length, girilen: sayi.length, ort: dsOrtalama(v, 1), min: sayi.length ? Math.min(...sayi) : null, max: sayi.length ? Math.max(...sayi) : null };
        });
        return { ders: d.ders, tarih: d.tarih, saat: d.saat, sonucYayinda: d.sonucYayinda, n: tum.length,
          girilen: tum.filter(p => typeof puanOku(p) === 'number').length, girmedi: tum.filter(p => p === 'G').length, bos: tum.filter(p => p === '').length,
          ort: dsOrtalama(tum, 1), sinif: siniflarIc };
      })
    }))
  };
}
export type DsDurum = Awaited<ReturnType<typeof dsDurum>>;

/* ---------- Tanım ---------- */
export async function dsSinavOlustur(v: { ad?: string; siniflar?: string[]; dersler?: Partial<DersGirdisi>[] }) {
  await yonetici();
  const ad = String(v?.ad ?? '').trim().replace(/\s+/g, ' ');
  if (!ad) throw new KullaniciHatasi('Sınavın adını yazın.');
  if (ad.length > 60) throw new KullaniciHatasi('Sınav adı en fazla 60 karakter olabilir.');
  const dersler = dersleriDogrula(v?.dersler);
  const sonuc = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7306)`);
    const aktif = (await tx.select().from(schema.siniflar).where(eq(schema.siniflar.aktif, true))).map(s => s.ad);
    const siniflar = (v?.siniflar ?? []).filter(s => aktif.includes(s));
    if (!siniflar.length) throw new KullaniciHatasi('En az bir sınıf seçin.');
    const kodlar = await tx.select({ kod: schema.donemSinavlari.kod }).from(schema.donemSinavlari);
    const kod = 'S' + (kodlar.reduce((m, k) => Math.max(m, parseInt(k.kod.replace(/\D/g, ''), 10) || 0), 0) + 1);
    await tx.insert(schema.donemSinavlari).values({ kod, ad, siniflar });
    await tx.insert(schema.donemSinavDersleri).values(dersler.map((d, i) => ({ sinavKod: kod, ...d, sira: i + 1 })));
    const uyeler = await aktifSinifUyeleri(tx, siniflar);
    if (uyeler.length) await tx.insert(schema.donemSinavOgrencileri).values(uyeler.map(u => ({ sinavKod: kod, ...u })));
    return { kod, ogrenci: uyeler.length, siniflar };
  });
  await islemKaydet('Dönem sınavı', `${sonuc.kod} "${ad}" oluşturuldu: ${dersler.map(d => d.ders).join(', ')} · ${sonuc.siniflar.join(', ')} · ${sonuc.ogrenci} öğrenci`);
  return dsDurum();
}

/** Ad, ders tarih/saatleri güncellenir; yeni ders eklenebilir; puanı olmayan ders çıkarılabilir. */
export async function dsSinavGuncelle(v: { kod: string; ad?: string; dersler?: Partial<DersGirdisi>[] }) {
  await yonetici();
  const dersler = dersleriDogrula(v?.dersler);
  await vt().transaction(async tx => {
    const s = await sinavBul(tx, v.kod);
    const ad = String(v.ad ?? '').trim().replace(/\s+/g, ' ') || s.ad;
    const yeni = new Map(dersler.map(d => [basNorm(d.ders), d]));
    for (const d of s.dersler) {
      if (yeni.has(basNorm(d.ders))) continue;
      const dolu = s.ogrenciler.filter(o => o.p[d.ders]).length;
      if (dolu) throw new KullaniciHatasi(`"${d.ders}" dersinde ${dolu} puan var; bu ders çıkarılamaz.`);
    }
    await tx.update(schema.donemSinavlari).set({ ad }).where(eq(schema.donemSinavlari.kod, s.kod));
    const eski = new Map(s.dersler.map(d => [basNorm(d.ders), d]));
    await tx.delete(schema.donemSinavDersleri).where(eq(schema.donemSinavDersleri.sinavKod, s.kod));
    // Var olan dersin adı (puanlara bağlı) korunur; yayın durumu da korunur
    await tx.insert(schema.donemSinavDersleri).values(dersler.map((d, i) => {
      const e = eski.get(basNorm(d.ders));
      return { sinavKod: s.kod, ders: e?.ders ?? d.ders, tarih: d.tarih, saat: d.saat, sonucYayinda: e?.sonucYayinda ?? false, sira: i + 1 };
    }));
  });
  await islemKaydet('Dönem sınavı', `${v.kod} güncellendi`);
  return dsDurum();
}

/** Seçili sınıflara sonradan katılan öğrencileri ekler; puanı olmayanların sınıfını günceller. Puanlara dokunmaz. */
export async function dsOgrenciGuncelle(kod: string) {
  await yonetici();
  const r = await vt().transaction(async tx => {
    const s = await sinavBul(tx, kod);
    const guncel = new Map((await aktifSinifUyeleri(tx, s.siniflar)).map(u => [u.no, u]));
    let sinifGuncel = 0;
    for (const o of s.ogrenciler) {
      const g = guncel.get(o.no);
      if (g && g.sinif !== o.sinif && !Object.keys(o.p).length) {
        await tx.update(schema.donemSinavOgrencileri).set({ sinif: g.sinif }).where(and(eq(schema.donemSinavOgrencileri.sinavKod, s.kod), eq(schema.donemSinavOgrencileri.no, o.no)));
        sinifGuncel++;
      }
    }
    const var_ = new Set(s.ogrenciler.map(o => o.no));
    const yeni = [...guncel.values()].filter(u => !var_.has(u.no));
    if (yeni.length) await tx.insert(schema.donemSinavOgrencileri).values(yeni.map(u => ({ sinavKod: s.kod, ...u })));
    return { eklenen: yeni.length, sinifGuncel };
  });
  await islemKaydet('Dönem sınavı', `${kod} öğrenci listesi: ${r.eklenen} eklendi, ${r.sinifGuncel} sınıf güncellendi`);
  return { ...r, durum: await dsDurum() };
}

/** Sınıf bazında sınav yeri (boş = sınıfın dersliği). */
export async function dsYerKaydet(kod: string, yerler: Record<string, string>) {
  await yonetici();
  await vt().transaction(async tx => {
    const s = await sinavBul(tx, kod);
    await tx.delete(schema.donemSinavYerleri).where(eq(schema.donemSinavYerleri.sinavKod, s.kod));
    const satirlar = s.siniflar.map(sn => ({ sinavKod: s.kod, sinif: sn, yer: String(yerler?.[sn] ?? '').trim().replace(/\s+/g, ' ').slice(0, 60) })).filter(r => r.yer);
    if (satirlar.length) await tx.insert(schema.donemSinavYerleri).values(satirlar);
  });
  await islemKaydet('Dönem sınavı', `${kod} sınav yerleri kaydedildi`);
  return dsDurum();
}

/** alan 'yer': sınav bazında; 'sonuc': ders bazında yayın. */
export async function dsYayin(kod: string, alan: 'yer' | 'sonuc', ders: string | null, ac: boolean) {
  await yonetici();
  const db = vt();
  const s = await sinavBul(db, kod);
  if (alan === 'yer') {
    await db.update(schema.donemSinavlari).set({ yerYayinda: !!ac }).where(eq(schema.donemSinavlari.kod, s.kod));
    await islemKaydet('Dönem sınavı', `${s.kod} sınav yerleri ${ac ? 'yayınlandı' : 'gizlendi'}`);
  } else if (alan === 'sonuc') {
    const d = s.dersler.find(x => x.ders === ders);
    if (!d) throw new KullaniciHatasi('Ders bulunamadı.');
    await db.update(schema.donemSinavDersleri).set({ sonucYayinda: !!ac }).where(and(eq(schema.donemSinavDersleri.sinavKod, s.kod), eq(schema.donemSinavDersleri.ders, d.ders)));
    await islemKaydet('Dönem sınavı', `${s.kod} ${d.ders} sonuçları ${ac ? 'yayınlandı' : 'gizlendi'}`);
  } else throw new KullaniciHatasi('Geçersiz işlem.');
  return dsDurum();
}

export async function dsArsiv(kod: string, arsiv: boolean) {
  await yonetici();
  const s = await sinavBul(vt(), kod);
  await vt().update(schema.donemSinavlari).set({ arsiv: !!arsiv }).where(eq(schema.donemSinavlari.kod, s.kod));
  await islemKaydet('Dönem sınavı', `${s.kod}${arsiv ? ' arşivlendi' : ' arşivden çıkarıldı'}`);
  return dsDurum();
}

/* ---------- Panelde puan tablosu (e-tablodaki "DS …" sayfasının yerine) ---------- */
export async function dsPuanTablosu(kod: string) {
  await yonetici();
  const s = await sinavBul(vt(), kod);
  return {
    kod: s.kod, ad: s.ad, dersler: s.dersler.map(d => d.ders),
    ogrenciler: s.ogrenciler.slice().sort((a, b) => a.sinif.localeCompare(b.sinif, 'tr') || alfabetik(a, b))
      .map(o => ({ no: o.no, adi: o.adi, soyadi: o.soyadi, sinif: o.sinif, p: o.p }))
  };
}
export type DsPuanTablosu = Awaited<ReturnType<typeof dsPuanTablosu>>;

const yazPuanlar = async (tx: Db, kod: string, l: { no: string; ders: string; puan: string }[]) => {
  for (const x of l) {
    const k = and(eq(schema.donemSinavPuanlari.sinavKod, kod), eq(schema.donemSinavPuanlari.no, x.no), eq(schema.donemSinavPuanlari.ders, x.ders));
    if (x.puan === '') await tx.delete(schema.donemSinavPuanlari).where(k);
    else await tx.insert(schema.donemSinavPuanlari).values({ sinavKod: kod, no: x.no, ders: x.ders, puan: x.puan })
      .onConflictDoUpdate({ target: [schema.donemSinavPuanlari.sinavKod, schema.donemSinavPuanlari.no, schema.donemSinavPuanlari.ders], set: { puan: x.puan } });
  }
};

/** Tablodan elle girilen puanlar: hepsi önce denetlenir; biri hatalıysa hiçbiri yazılmaz. */
export async function dsPuanKaydet(kod: string, degisiklikler: { no: string; ders: string; puan: string }[]) {
  await yonetici();
  if (!Array.isArray(degisiklikler) || !degisiklikler.length) throw new KullaniciHatasi('Kaydedilecek değişiklik yok.');
  const sonuc = await vt().transaction(async tx => {
    const s = await sinavBul(tx, kod);
    const ogr = new Map(s.ogrenciler.map(o => [o.no, o]));
    const dersler = new Set(s.dersler.map(d => d.ders));
    const hatalar: string[] = [], yazim: { no: string; ders: string; puan: string; eski: string; ad: string }[] = [];
    for (const d of degisiklikler) {
      const o = ogr.get(String(d.no));
      if (!o || !dersler.has(d.ders)) { hatalar.push(`${d.no} · ${d.ders}: sınavda yok.`); continue; }
      const m = puanMetni(d.puan);
      if (m === null) { hatalar.push(`${o.no} ${o.adi} ${o.soyadi} · ${d.ders}: "${d.puan}" anlaşılamadı (0–100 ya da G).`); continue; }
      if (m !== (o.p[d.ders] ?? '')) yazim.push({ no: o.no, ders: d.ders, puan: m, eski: o.p[d.ders] ?? '', ad: (o.adi + ' ' + o.soyadi).trim() });
    }
    if (hatalar.length) throw new KullaniciHatasi('Hiçbir puan kaydedilmedi:\n' + hatalar.slice(0, 20).join('\n'));
    await yazPuanlar(tx, s.kod, yazim);
    const kaynak = 'D-' + zamanKodu();
    if (yazim.length) await tx.insert(schema.ogrenciDegisiklikleri).values(yazim.map(x => ({ kaynak, ogrenciNo: x.no, adSoyad: x.ad, alan: `${s.kod} ${s.ad} · ${x.ders}`, eski: puanGoster(x.eski), yeni: puanGoster(x.puan) })));
    return { yazilan: yazim.length, kaynak };
  });
  await islemKaydet('Dönem sınavı puan girişi', `${kod} · ${sonuc.kaynak}: ${sonuc.yazilan} puan`);
  return { ...sonuc, tablo: await dsPuanTablosu(kod) };
}

/* ---------- Puan listesi yükleme ---------- */
export async function dsPuanOnizle(kod: string, satirlarHam: unknown, basSatirHam: unknown) {
  await yonetici();
  const s = await sinavBul(vt(), kod);
  const satirlar = satirlariTemizle(satirlarHam);
  if (!satirlar.length) throw new KullaniciHatasi('Dosyada veri bulunamadı.');
  const dersler = s.dersler.map(d => d.ders);
  let bas: number, e: DsEslesme;
  if (basSatirHam != null && basSatirHam !== '') { bas = Math.max(0, Math.min(parseInt(String(basSatirHam), 10) || 0, satirlar.length - 1)); e = dsSatirEslesmesi(satirlar[bas], dersler); }
  else { const b = dsBaslikBul(satirlar, dersler); bas = Math.max(0, b.basSatir); e = b.eslesme ?? dsSatirEslesmesi(satirlar[0], dersler); }
  const genislik = satirlar.slice(bas, bas + 50).reduce((m, r) => Math.max(m, r.length), 0);
  return { basSatir: bas, eslesme: e, dersler,
    sutunlar: Array.from({ length: genislik }, (_, i) => ({ i, ad: sutunHarfi(i) + ' — ' + (String(satirlar[bas]?.[i] ?? '').trim() || '(başlıksız)') })),
    ornek: satirlar.slice(bas + 1).filter(r => r.some(v => v.trim())).slice(0, 3) };
}

export type DsPuanVerisi = { sinavKod: string; satirlar: unknown; basSatir: unknown; eslesme: Partial<DsEslesme>; dosyaAdi?: string; imza?: string; uzerineYaz?: boolean; adUyusmazYaz?: boolean };
async function dsPuanHazirla(db: Db, veri: DsPuanVerisi) {
  const s = await sinavBul(db, veri?.sinavKod);
  const satirlar = satirlariTemizle(veri.satirlar);
  const bas = Math.max(0, parseInt(String(veri.basSatir ?? ''), 10) || 0);
  const gen = satirlar.reduce((m, r) => Math.max(m, r.length), 0);
  const sayi = (v: unknown) => { const x = parseInt(String(v ?? ''), 10); return !isNaN(x) && x >= 0 && x < gen ? x : -1; };
  const es = veri.eslesme ?? {};
  const e: DsEslesme = { no: sayi(es.no), adi: sayi(es.adi), soyadi: sayi(es.soyadi), adSoyad: sayi(es.adSoyad), dersKolon: {} };
  s.dersler.forEach(d => { e.dersKolon[d.ders] = sayi(es.dersKolon?.[d.ders]); });
  if (e.no === -1) throw new KullaniciHatasi('"Öğrenci No" sütunu seçilmedi.');
  const secili = Object.values(e.dersKolon).filter(i => i > -1);
  if (!secili.length) throw new KullaniciHatasi('En az bir dersin puan sütununu seçin.');
  if (new Set(secili).size !== secili.length) throw new KullaniciHatasi('Aynı sütun iki derse seçilemez.');
  const ogr = await db.select({ no: schema.ogrenciler.no, durum: schema.ogrenciler.durum, kayitli: schema.ogrenciler.kayitli }).from(schema.ogrenciler);
  const imza = createHash('sha256').update(JSON.stringify(s.ogrenciler.map(o => [o.no, Object.entries(o.p).sort()]))).digest('base64url');
  const fark = dsPuanFarkHesapla(satirlar, bas, e, s.ogrenciler, new Map(ogr.filter(o => o.kayitli).map(o => [o.no, o])), { uzerineYaz: !!veri.uzerineYaz, adUyusmazYaz: !!veri.adUyusmazYaz });
  return { s, fark, imza };
}

export async function dsPuanFark(veri: DsPuanVerisi) {
  await yonetici();
  const { fark: f, imza } = await dsPuanHazirla(vt(), veri);
  const k = <T,>(a: T[]) => a.slice(0, LISTE_SINIRI);
  const alan = (x: (typeof f.yeni)[number]) => ({ no: x.no, ad: x.ad, alan: x.alan, eski: x.eski, yeni: x.yeni, adUyusmaz: x.adUyusmaz });
  return { imza,
    sayilar: { yeni: f.yeni.length, degisen: f.degisen.length, ayni: f.ayni, adUyusmaz: f.adUyusmaz.length, bulunamadi: f.bulunamadi.length, hatali: f.hatali.length, bosSatir: f.bosSatir, yazilacak: f.yazilacak.length },
    yeni: k(f.yeni.map(alan)), degisen: k(f.degisen.map(alan)), adUyusmaz: k(f.adUyusmaz), bulunamadi: k(f.bulunamadi), hatali: k(f.hatali) };
}
export type DsPuanFarki = Awaited<ReturnType<typeof dsPuanFark>>;

export async function dsPuanUygula(veri: DsPuanVerisi) {
  await yonetici();
  const sonuc = await vt().transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(7306)`);
    const h = await dsPuanHazirla(tx, veri);
    if (h.imza !== veri.imza) throw new KullaniciHatasi('Önizlemeden sonra sınavın puanları değişti. Farkları yeniden hesaplayıp tekrar onaylayın.');
    const y = h.fark.yazilacak;
    if (!y.length) throw new KullaniciHatasi('Yazılacak puan yok.');
    await yazPuanlar(tx, h.s.kod, y.map(x => ({ no: x.no, ders: x.alan, puan: x.deger })));
    const kaynak = 'D-' + zamanKodu();
    for (let i = 0; i < y.length; i += 500) {
      await tx.insert(schema.ogrenciDegisiklikleri).values(y.slice(i, i + 500).map(x => ({ kaynak, ogrenciNo: x.no, adSoyad: x.ad, alan: `${h.s.kod} ${h.s.ad} · ${x.alan}`, eski: x.eski, yeni: x.yeni })));
    }
    return { yazilan: y.length, kaynak };
  });
  await islemKaydet('Dönem sınavı puan yükleme', `${veri.sinavKod} · ${sonuc.kaynak}: ${sonuc.yazilan} puan (${String(veri.dosyaAdi ?? '').slice(0, 60)})`);
  return { ...sonuc, durum: await dsDurum() };
}

/* ---------- Sistem kontrolü ---------- */
export async function dsKontrol(db: Db, ekle: (seviye: 'hata' | 'uyari' | 'bilgi', konu: string, ayrinti: string) => void) {
  const [liste, ogr] = await Promise.all([sinavlar(db), db.select({ no: schema.ogrenciler.no, tc4: schema.ogrenciler.tc4 }).from(schema.ogrenciler)]);
  const tc = new Map(ogr.map(o => [o.no, o.tc4]));
  for (const s of liste.filter(x => !x.arsiv)) {
    const konu = `Dönem sınavı ${s.kod} (${s.ad})`;
    if (!s.ogrenciler.length) ekle('uyari', konu, 'Sınavda hiç öğrenci yok. "Öğrenci listesini güncelle"ye basın.');
    const tcEksik = s.ogrenciler.filter(o => !tc.get(o.no)).length;
    if (tcEksik && s.dersler.some(d => d.sonucYayinda)) ekle('uyari', konu, `${tcEksik} öğrencinin TC son 4 hanesi yok; sonuçlarını göremezler.`);
  }
}

/* ---------- Öğrenci ekranı ---------- */
export type DsOgrenciSinavi = { kod: string; ad: string; sinif: string; yerYayinda: boolean; sonucVar: boolean; dersler: { ders: string; tarih: string; saat: string; yer: string; gecti: boolean }[] };

/** Öğrencinin sınavları: yer yayındaysa tarih ve yer; değilse yalnızca sonucu açıklanmış sınavlar (yer verilmez). */
export async function dsOgrenciBilgi(db: Db, no: string, bagliYer: (donemKod: string) => string): Promise<{ sinavlar: DsOgrenciSinavi[]; sonucVar: boolean } | null> {
  const kayitlar = await db.select({ kod: schema.donemSinavOgrencileri.sinavKod }).from(schema.donemSinavOgrencileri).where(eq(schema.donemSinavOgrencileri.no, no));
  if (!kayitlar.length) return null;
  const [liste, siniflar] = await Promise.all([sinavlar(db, kayitlar.map(k => k.kod)), db.select({ ad: schema.siniflar.ad, derslik: schema.siniflar.derslik }).from(schema.siniflar)]);
  const derslik = new Map(siniflar.map(s => [s.ad, s.derslik]));
  const bugun = bugunGun();
  let sonucVar = false;
  const out: DsOgrenciSinavi[] = [];
  for (const s of liste.filter(x => !x.arsiv)) {
    const o = s.ogrenciler.find(x => x.no === no);
    if (!o) continue;
    const buSonuc = s.dersler.some(d => d.sonucYayinda);
    if (buSonuc) sonucVar = true;
    if (!s.yerYayinda && !buSonuc) continue;
    let yer = s.yerYayinda ? s.yerler[o.sinif] || derslik.get(o.sinif) || '' : '';
    if (s.yerYayinda) { const b = bagliYer(s.kod); if (b) yer = b; }
    out.push({ kod: s.kod, ad: s.ad, sinif: o.sinif, yerYayinda: s.yerYayinda, sonucVar: buSonuc,
      dersler: s.dersler.map(d => { const t = trGun(d.tarih); return { ders: d.ders, tarih: d.tarih, saat: d.saat, yer, gecti: t != null && t < bugun }; }) });
  }
  return { sinavlar: out, sonucVar };
}

/** Giriş yapmış öğrencinin yayınlanmış dönem sınavı puanları (kimlik hesap açılırken TC son 6 haneyle doğrulandı). */
export async function donemSonuclari() {
  const ot = await oturumGerekli(['ogrenci']);
  const numara = ot.ogrenciNo;
  const db = vt();
  const [k] = await db.select().from(schema.ogrenciler).where(eq(schema.ogrenciler.no, numara));
  if (!k) return { ok: false as const, mesaj: 'Öğrenci kaydın bulunamadı. İdareye başvur.' };
  const kayitlar = await db.select({ kod: schema.donemSinavOgrencileri.sinavKod }).from(schema.donemSinavOgrencileri).where(eq(schema.donemSinavOgrencileri.no, numara));
  const liste = kayitlar.length ? await sinavlar(db, kayitlar.map(x => x.kod)) : [];
  const out = liste.filter(s => !s.arsiv).flatMap(s => {
    const o = s.ogrenciler.find(x => x.no === numara)!;
    const dersler = s.dersler.filter(d => d.sonucYayinda).map(d => {
      const v = o.p[d.ders] ?? '', p = puanOku(v);
      return { ders: d.ders, tarih: d.tarih, puan: typeof p === 'number' ? p : v === 'G' ? 'Girmedi' : 'Girilmedi',
        sinifOrt: dsOrtalama(s.ogrenciler.filter(x => x.sinif === o.sinif).map(x => x.p[d.ders] ?? '')) };
    });
    return dersler.length ? [{ kod: s.kod, ad: s.ad, sinif: o.sinif, dersler }] : [];
  });
  return { ok: true as const, adSoyad: (k.adi + ' ' + k.soyadi).trim(), sinavlar: out, esik: DS_ORT_ESIK };
}
export type DonemSonuclari = Awaited<ReturnType<typeof donemSonuclari>>;
