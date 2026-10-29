/**
 * Otomatik sınıf oluşturma ve sınıf değişikliği kuralları (saf, test edilebilir). Kaynak: Apps Script Siniflandirma.gs.
 *  - SEVİYELİ (varsayılan): grup yazılı puanına göre yüksekten düşüğe sıralanır, sınava girmeyenler sona konur;
 *    sınıflar sırayla eşit paylarına kadar doldurulur.
 *  - DENGELİ: her turda her sınıfa bir öğrenci verilir; puan ortalamaları yaklaşır, sınava girmeyenler eşit dağılır.
 *  Kız öğrenciler K, erkekler E türündeki sınıflara; o türde sınıf yoksa ya da cinsiyet bilinmiyorsa Karma sınıflara gider.
 */
import { KullaniciHatasi } from './hata';
import { SONUC } from './sinav';

export type Tur = 'K' | 'E' | 'Karma';
export type DagitimSinifi = { ad: string; tur: Tur; kapasite?: number; derslik?: string };
export type DagitimOgrencisi = { no: string; cinsiyet: string; puan: number | null };
export type Dagitim = { atama: Record<string, string>; yerlesemeyen: { no: string; neden: string }[] };

const yuvarla2 = (x: number) => Math.round(x * 100) / 100;

/** Öğrencinin gidebileceği sınıflar: kendi cinsiyet türü, yoksa karma. */
export function hedefSiniflar<T extends { tur: string }>(siniflar: T[], cinsiyet: string): T[] {
  let t = cinsiyet ? siniflar.filter(s => s.tur === cinsiyet) : [];
  if (!t.length) t = siniflar.filter(s => s.tur === 'Karma');
  return t;
}
const yerlesemezNedeni = (c: string) => (c ? (c === 'K' ? 'Kız' : 'Erkek') + ' ya da karma türde sınıf tanımlı değil' : 'Cinsiyet bilgisi yok ve karma sınıf tanımlı değil');
const puanSiralama = (a: DagitimOgrencisi, b: DagitimOgrencisi) => (b.puan ?? -1) - (a.puan ?? -1) || String(a.no).localeCompare(String(b.no));

/**
 * SEVİYELİ dağıtım. Pay: grup mevcudu / sınıf sayısı (artanlar ilk sınıflara birer birer, ör. 61 → 31 + 30).
 * Sabit öğrenciler bulundukları sınıfın payından düşülür.
 */
export function dagitSeviyeli(ogrenciler: DagitimOgrencisi[], siniflar: DagitimSinifi[], sabit: Record<string, string> = {}): Dagitim {
  const atama: Record<string, string> = {}, yerlesemeyen: Dagitim['yerlesemeyen'] = [], sayi: Record<string, number> = {};
  siniflar.forEach(s => { sayi[s.ad] = 0; });
  ogrenciler.forEach(o => { const s = sabit[o.no]; if (s && sayi[s] != null) { atama[o.no] = s; sayi[s]++; } });
  const gruplar = new Map<string, { siniflar: DagitimSinifi[]; ogr: DagitimOgrencisi[] }>();
  for (const o of ogrenciler) {
    const t = hedefSiniflar(siniflar, o.cinsiyet);
    if (!t.length) { if (!atama[o.no]) yerlesemeyen.push({ no: o.no, neden: yerlesemezNedeni(o.cinsiyet) }); continue; }
    const k = t.map(s => s.ad).join('|');
    if (!gruplar.has(k)) gruplar.set(k, { siniflar: t, ogr: [] });
    gruplar.get(k)!.ogr.push(o);
  }
  for (const g of gruplar.values()) {
    const n = g.siniflar.length, N = g.ogr.length;
    const pay = g.siniflar.map((_, i) => Math.floor(N / n) + (i < N % n ? 1 : 0));
    let i = 0;
    for (const o of g.ogr.filter(o => !atama[o.no]).sort(puanSiralama)) {
      while (i < n - 1 && sayi[g.siniflar[i].ad] >= pay[i]) i++;
      atama[o.no] = g.siniflar[i].ad;
      sayi[g.siniflar[i].ad]++;
    }
  }
  return { atama, yerlesemeyen };
}

/** DENGELİ dağıtım. Sınıf sırası önceliktir; eşitlikte önceki sınıf seçilir. */
export function dagitDengeli(ogrenciler: DagitimOgrencisi[], siniflar: DagitimSinifi[], sabit: Record<string, string> = {}): Dagitim {
  type Durum = { i: number; n: number; g: Record<string, number>; toplam: Record<string, number>; puansiz: number };
  const st: Record<string, Durum> = {};
  siniflar.forEach((s, i) => { st[s.ad] = { i, n: 0, g: { K: 0, E: 0, '': 0 }, toplam: { K: 0, E: 0, '': 0 }, puansiz: 0 }; });
  const atama: Record<string, string> = {}, yerlesemeyen: Dagitim['yerlesemeyen'] = [];
  const ekle = (o: DagitimOgrencisi, ad: string) => {
    const x = st[ad];
    x.n++; x.g[o.cinsiyet] = (x.g[o.cinsiyet] ?? 0) + 1;
    if (o.puan == null) x.puansiz++; else x.toplam[o.cinsiyet] = (x.toplam[o.cinsiyet] ?? 0) + o.puan;
    atama[o.no] = ad;
  };
  ogrenciler.forEach(o => { if (sabit[o.no] && st[sabit[o.no]]) ekle(o, sabit[o.no]); });
  const kiyasla = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
  for (const o of ogrenciler.filter(o => !atama[o.no]).sort(puanSiralama)) {
    const t = hedefSiniflar(siniflar, o.cinsiyet);
    if (!t.length) { yerlesemeyen.push({ no: o.no, neden: yerlesemezNedeni(o.cinsiyet) }); continue; }
    let en: { ad: string; a: number[] } | null = null;
    for (const s of t) {
      const x = st[s.ad];
      const a = [x.g[o.cinsiyet] ?? 0, o.puan == null ? x.puansiz : x.toplam[o.cinsiyet] ?? 0, x.n, x.i];
      if (!en || kiyasla(a, en.a) < 0) en = { ad: s.ad, a };
    }
    ekle(o, en!.ad);
  }
  return { atama, yerlesemeyen };
}

export type SinifMetrigi = { ad: string; tur: Tur; kapasite: number; n: number; K: number; E: number; bilinmeyen: number; puanli: number; min: number | null; max: number | null; puansiz: number; ort: number | null };
export type Denge = { tur: Tur; sinif: number; sayiFark: number; ortFark: number; puansizFark: number };

/** Sınıf başına sayı, cinsiyet, puan ortalaması, sınava girmeyen; tür grubu başına denge farkları. */
export function sinifMetrik(atama: Record<string, string>, bilgi: Record<string, { cinsiyet: string; puan: number | null }>, siniflar: DagitimSinifi[]) {
  const m = new Map(siniflar.map(s => [s.ad, { ad: s.ad, tur: s.tur, kapasite: s.kapasite ?? 0, n: 0, K: 0, E: 0, bilinmeyen: 0, puanli: 0, toplam: 0, min: null as number | null, max: null as number | null, puansiz: 0 }]));
  for (const [no, ad] of Object.entries(atama)) {
    const x = m.get(ad), b = bilgi[no];
    if (!x || !b) continue;
    x.n++;
    if (b.cinsiyet === 'K') x.K++; else if (b.cinsiyet === 'E') x.E++; else x.bilinmeyen++;
    if (b.puan == null) { x.puansiz++; continue; }
    x.puanli++; x.toplam += b.puan;
    x.min = x.min == null ? b.puan : Math.min(x.min, b.puan);
    x.max = x.max == null ? b.puan : Math.max(x.max, b.puan);
  }
  const liste: SinifMetrigi[] = siniflar.map(s => {
    const { toplam, ...x } = m.get(s.ad)!;
    return { ...x, ort: x.puanli ? yuvarla2(toplam / x.puanli) : null };
  });
  const denge: Denge[] = (['K', 'E', 'Karma'] as const).flatMap(tur => {
    const g = liste.filter(x => x.tur === tur);
    if (g.length < 2) return [];
    const fark = (f: (x: SinifMetrigi) => number | null) => { const v = g.map(f).filter((v): v is number => v != null); return v.length ? yuvarla2(Math.max(...v) - Math.min(...v)) : 0; };
    return [{ tur, sinif: g.length, sayiFark: fark(x => x.n), ortFark: fark(x => x.ort), puansizFark: fark(x => x.puansiz) }];
  });
  return { siniflar: liste, denge };
}

/* ---------- Sınıf düzeni ---------- */
export const SINIF_HARFLERI = 'ABCDEFGHIJKLMNOPRSTUVYZ';
export type Duzen = { duzen: 'AYRI' | 'KARMA'; kiz: number; erkek: number; karma: number; yontem: 'SEVIYELI' | 'DENGELI' };

/** Plan → sınıf listesi. Önce kız, sonra erkek sınıfları; harfler sırayla (A, B, C…). */
export function plandanSiniflar(p: Duzen): { ad: string; tur: Tur }[] {
  const out: { ad: string; tur: Tur }[] = [];
  let i = 0;
  const ekle = (tur: Tur, n: number) => { for (let k = 0; k < n && i < SINIF_HARFLERI.length; k++) out.push({ ad: 'Hazırlık ' + SINIF_HARFLERI.charAt(i++), tur }); };
  if (p.duzen === 'AYRI') { ekle('K', p.kiz); ekle('E', p.erkek); } else ekle('Karma', p.karma);
  return out;
}

export function duzenDogrula(d: Record<string, unknown> | null | undefined): Duzen {
  const n = (v: unknown, ad: string) => {
    const x = Number(v);
    if (String(v ?? '').trim() === '' || !Number.isInteger(x) || x < 0 || x > 20) throw new KullaniciHatasi(ad + ' 0 ile 20 arasında tam sayı olmalı.');
    return x;
  };
  const out: Duzen = { duzen: d?.duzen === 'KARMA' ? 'KARMA' : 'AYRI', yontem: d?.yontem === 'DENGELI' ? 'DENGELI' : 'SEVIYELI', kiz: 0, erkek: 0, karma: 0 };
  if (out.duzen === 'AYRI') {
    out.kiz = n(d?.kiz, 'Kız sınıfı sayısı'); out.erkek = n(d?.erkek, 'Erkek sınıfı sayısı');
    if (!out.kiz && !out.erkek) throw new KullaniciHatasi('En az bir kız ya da erkek sınıfı olmalı.');
  } else {
    out.karma = n(d?.karma, 'Sınıf sayısı');
    if (!out.karma) throw new KullaniciHatasi('En az bir sınıf olmalı.');
  }
  if (out.kiz + out.erkek + out.karma > SINIF_HARFLERI.length) throw new KullaniciHatasi(`En fazla ${SINIF_HARFLERI.length} sınıf tanımlanabilir.`);
  return out;
}

/* ---------- Taslak doğrulama ---------- */
export type YerlestirmeBilgisi = { no: string; adi: string; soyadi: string; cinsiyet: string; puan: number | null; yazili: string; sozlu: string; sonuc: string; sinavdaVar: boolean };
export type Sorun = { seviye: 'hata' | 'uyari' | 'bilgi'; konu: string; ayrinti: string };

/**
 * Taslak satırlarını denetler; yayındaki listelerle karşılaştırır.
 * bilgi: aktif öğrenciler (no → bilgi); yayin: no → şu anki sınıf adı (aktif sınıflarda).
 */
export function taslakDenetle(satirlar: { no: string; sinif: string }[], bilgi: Record<string, YerlestirmeBilgisi>, siniflar: DagitimSinifi[], yayin: Record<string, string>) {
  const sinifAd = new Map(siniflar.map(s => [s.ad, s]));
  const sorun: Sorun[] = [];
  const ekle = (seviye: Sorun['seviye'], konu: string, ayrinti: string) => sorun.push({ seviye, konu, ayrinti });
  const atama: Record<string, string> = {}, gorulen = new Set<string>();
  const kisiAdi = (no: string) => { const b = bilgi[no]; return b ? `${no} ${(b.adi + ' ' + b.soyadi).trim()}` : no; };
  for (const r of satirlar) {
    const b = bilgi[r.no], kisi = kisiAdi(r.no);
    if (gorulen.has(r.no)) { ekle('hata', r.no, 'Numara taslakta birden fazla kez geçiyor.'); continue; }
    gorulen.add(r.no);
    if (!b) { ekle('hata', r.no, 'Aktif bir öğrenci değil (kaydı silinmiş ya da öğrenci listesinde yok). Yeniden dağıtın.'); continue; }
    if (b.sonuc === SONUC.MUAF) { ekle('hata', kisi, 'Muafiyet sınavını geçmiş; taslaktan çıkarılmalı (yeniden dağıtın).'); continue; }
    if (!r.sinif) { ekle('uyari', kisi, 'Sınıf seçilmemiş; yayında hiçbir sınıfta görünmez.'); continue; }
    const s = sinifAd.get(r.sinif);
    if (!s) { ekle('hata', kisi, `"${r.sinif}" adında bir sınıf düzende yok.`); continue; }
    if ((s.tur === 'K' || s.tur === 'E') && b.cinsiyet && b.cinsiyet !== s.tur) ekle('hata', kisi, `${b.cinsiyet === 'K' ? 'Kız' : 'Erkek'} öğrenci, ${s.ad} ise ${s.tur === 'K' ? 'kız' : 'erkek'} sınıfı.`);
    if ((s.tur === 'K' || s.tur === 'E') && !b.cinsiyet) ekle('uyari', kisi, `Cinsiyet bilgisi yok ama ${s.ad} tek cinsiyetli bir sınıf.`);
    atama[r.no] = r.sinif;
  }
  const hazirlik = Object.values(bilgi).filter(b => b.sonuc !== SONUC.MUAF).map(b => b.no);
  const eksik = hazirlik.filter(no => !gorulen.has(no));
  if (eksik.length) ekle('uyari', 'Taslakta olmayanlar', `${eksik.length} hazırlık öğrencisi taslakta yok (sonradan kayıt olmuş olabilir): ${eksik.slice(0, 10).join(', ')}${eksik.length > 10 ? ' …' : ''}. "Yeniden dağıt" ile ekleyin; sabit öğrencilerin yeri korunur.`);
  const belirsiz = Object.keys(atama).filter(no => bilgi[no].sonuc === SONUC.BEKLIYOR);
  if (belirsiz.length) ekle('uyari', 'Sınav sonucu', `${belirsiz.length} öğrencinin sınav sonucu henüz belli değil; muaf olurlarsa sınıftan çıkarılmaları gerekir.`);

  const metrik = sinifMetrik(atama, bilgi, siniflar);
  metrik.siniflar.forEach(x => { if (x.kapasite && x.n > x.kapasite) ekle('uyari', x.ad, `Öğrenci sayısı (${x.n}) kapasiteyi (${x.kapasite}) aşıyor.`); });

  const tasinan: { no: string; ad: string; eski: string; yeni: string }[] = [], yeni: { no: string; ad: string; sinif: string }[] = [], cikan: { no: string; ad: string; eski: string; neden: string }[] = [];
  const ad = (no: string) => (bilgi[no] ? (bilgi[no].adi + ' ' + bilgi[no].soyadi).trim() : '');
  for (const [no, s] of Object.entries(atama)) {
    if (!yayin[no]) yeni.push({ no, ad: ad(no), sinif: s });
    else if (yayin[no] !== s) tasinan.push({ no, ad: ad(no), eski: yayin[no], yeni: s });
  }
  for (const [no, eski] of Object.entries(yayin)) {
    if (!atama[no]) cikan.push({ no, ad: ad(no), eski, neden: !bilgi[no] ? 'kaydı aktif değil' : bilgi[no].sonuc === SONUC.MUAF ? 'muaf' : 'taslakta sınıfı yok' });
  }
  const sira = { hata: 0, uyari: 1, bilgi: 2 };
  sorun.sort((a, b) => sira[a.seviye] - sira[b.seviye]);
  return {
    atama, metrik, sorunlar: sorun.slice(0, 300),
    hata: sorun.filter(x => x.seviye === 'hata').length, uyari: sorun.filter(x => x.seviye === 'uyari').length,
    degisim: { ilkYayin: !Object.keys(yayin).length, tasinan: tasinan.slice(0, 300), tasinanSayi: tasinan.length, yeni: yeni.slice(0, 300), yeniSayi: yeni.length, cikan: cikan.slice(0, 300), cikanSayi: cikan.length }
  };
}

/* ---------- Tek tek sınıf değişikliği ---------- */
export type SinifDegisikligi = { no: string; eski: string; yeni: string };

/** Tüm değişiklikler önce denetlenir; biri bile hatalıysa hiçbiri uygulanmaz. Hata mesajlarını döndürür. */
export function degisiklikleriDenetle(liste: SinifDegisikligi[], ogrenci: Map<string, { adi: string; soyadi: string; cinsiyet: string; durum: string; muaf: boolean }>,
  yer: Record<string, string>, siniflar: Map<string, { tur: string }>): string[] {
  const hatalar: string[] = [], gorulen = new Set<string>();
  for (const d of liste) {
    const k = ogrenci.get(d.no), kisi = k ? (k.adi + ' ' + k.soyadi).trim() : d.no;
    if (gorulen.has(d.no)) { hatalar.push(`${d.no}: aynı öğrenci için birden fazla değişiklik var.`); continue; }
    gorulen.add(d.no);
    if (!k || k.durum !== 'aktif') { hatalar.push(`${d.no}: aktif bir öğrenci değil.`); continue; }
    if ((yer[d.no] ?? '') !== d.eski) { hatalar.push(`${kisi}: sınıfı siz bakarken değişmiş (şu an ${yer[d.no] || 'sınıfsız'}). Paneli yenileyin.`); continue; }
    if (d.yeni === d.eski) { hatalar.push(`${kisi}: zaten ${d.yeni || 'sınıfsız'}.`); continue; }
    if (!d.yeni) continue;
    const s = siniflar.get(d.yeni);
    if (!s) { hatalar.push(`${kisi}: "${d.yeni}" adında yayında bir sınıf yok.`); continue; }
    if ((s.tur === 'K' || s.tur === 'E') && k.cinsiyet && k.cinsiyet !== s.tur) hatalar.push(`${kisi}: ${k.cinsiyet === 'K' ? 'kız' : 'erkek'} öğrenci ${s.tur === 'K' ? 'kız' : 'erkek'} sınıfına (${d.yeni}) alınamaz.`);
    if (k.muaf) hatalar.push(`${kisi}: muafiyet sınavını geçmiş, sınıfa alınamaz.`);
  }
  return hatalar;
}

/** Sınıf listesi sırası: ada göre alfabetik (Türkçe), eşitlikte numara. */
export const alfabetik = (a: { no: string; adi: string; soyadi: string }, b: { no: string; adi: string; soyadi: string }) =>
  (a.adi + ' ' + a.soyadi).localeCompare(b.adi + ' ' + b.soyadi, 'tr') || a.no.localeCompare(b.no);
