/**
 * Dönem sınavları ve sınav yeri listeleri kuralları (saf, test edilebilir).
 * Kaynak: Apps Script DonemSinav.gs ve SinavYeri.gs.
 */
import { alanNorm, ortakEkiTemizle, tekBosluk } from './aktarim-kurallari';
import { KullaniciHatasi } from './hata';
import { basNorm } from './metin';
import { adUyumlu, puanMetni } from './puan-kurallari';
import { puanGoster, puanOku } from './sinav';

export const DS_ORT_ESIK = 5;          // sınıf ortalaması için gereken en az puan sayısı
export const DS_KILIT_DENEME = 5;      // TC doğrulaması: 5 hatalı deneme → 15 dk bekleme
export const DS_KILIT_SURE_MS = 15 * 60 * 1000;
export const SY_GECMIS_GUN = 3;        // tarihi geçen sınav yeri öğrenci ekranında bu kadar gün daha görünür

const yuvarla2 = (x: number) => Math.round(x * 100) / 100;
const kolonBul = (satir: string[], a: readonly string[]) => { for (const x of a) { const i = satir.indexOf(x); if (i > -1) return i; } return -1; };

/** "gg.aa.yyyy" → gün başlangıcının zaman damgası (UTC takvim günü) ya da null. */
export function trGun(t: string): number | null {
  const m = String(t ?? '').trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null;
}
export function isoTR(iso: string): string {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso ?? '').trim();
}

/** Bir dersin ortalaması: yalnızca sayısal puanlar; eşiğin altındaysa null. */
export function dsOrtalama(puanlar: (string | undefined)[], esik = DS_ORT_ESIK): number | null {
  const s = puanlar.map(v => puanOku(v)).filter((v): v is number => typeof v === 'number');
  if (s.length < esik || !s.length) return null;
  return yuvarla2(s.reduce((a, b) => a + b, 0) / s.length);
}

export type DersGirdisi = { ders: string; tarih: string; saat: string };
export function dersleriDogrula(liste: Partial<DersGirdisi>[] | null | undefined): DersGirdisi[] {
  const dersler = (liste ?? []).map(d => ({ ders: tekBosluk(d.ders), tarih: isoTR(String(d.tarih ?? '')), saat: tekBosluk(d.saat).slice(0, 20) })).filter(d => d.ders);
  if (!dersler.length) throw new KullaniciHatasi('En az bir ders ekleyin.');
  const gorulen = new Set<string>();
  for (const d of dersler) {
    const k = basNorm(d.ders);
    if (gorulen.has(k)) throw new KullaniciHatasi(`"${d.ders}" dersi iki kez yazılmış.`);
    gorulen.add(k);
    if (d.ders.length > 60) throw new KullaniciHatasi('Ders adı en fazla 60 karakter olabilir.');
    if (d.tarih && trGun(d.tarih) == null) throw new KullaniciHatasi(`"${d.ders}" için tarih anlaşılamadı.`);
  }
  return dersler;
}

/* ---------- Dönem sınavı puan listesi ---------- */
const AD_ALIAS = {
  no: ['OGRENCI NO', 'OGRENCI NUMARASI', 'OGR NO', 'OGRNO', 'OGRENCINO', 'NUMARA', 'NO'],
  adi: ['ADI', 'AD'], soyadi: ['SOYADI', 'SOYAD'], adSoyad: ['ADI SOYADI', 'AD SOYAD', 'ADSOYAD', 'OGRENCI ADI SOYADI']
} as const;
const GENEL = ['PUAN', 'PUANI', 'NOT', 'NOTU', 'HBN', 'SINAV PUANI', 'SINAV NOTU', 'BASARI NOTU', 'HAM NOT'];

export type DsEslesme = { no: number; adi: number; soyadi: number; adSoyad: number; dersKolon: Record<string, number> };

/** Başlık satırındaki sütunlar; tek dersli sınavda "Puan/HBN" gibi genel sütun o derse eşlenir. */
export function dsSatirEslesmesi(satir: string[], dersler: string[]): DsEslesme {
  const n = ortakEkiTemizle(satir).map(alanNorm);
  const e: DsEslesme = { no: kolonBul(n, AD_ALIAS.no), adi: kolonBul(n, AD_ALIAS.adi), soyadi: kolonBul(n, AD_ALIAS.soyadi), adSoyad: kolonBul(n, AD_ALIAS.adSoyad), dersKolon: {} };
  dersler.forEach(d => { e.dersKolon[d] = n.indexOf(alanNorm(d)); });
  const genel = kolonBul(n, GENEL);
  if (dersler.length === 1 && e.dersKolon[dersler[0]] === -1 && genel > -1) e.dersKolon[dersler[0]] = genel;
  return e;
}
export function dsBaslikBul(satirlar: string[][], dersler: string[]) {
  for (let r = 0; r < Math.min(satirlar.length, 25); r++) {
    const x = dsSatirEslesmesi(satirlar[r] ?? [], dersler);
    if (x.no > -1 && Object.values(x.dersKolon).some(i => i > -1)) return { basSatir: r, eslesme: x };
  }
  return { basSatir: -1, eslesme: null };
}

export type DsHedef = { no: string; adi: string; soyadi: string; p: Record<string, string> };
export type DsYazim = { no: string; ad: string; alan: string; eski: string; yeni: string; deger: string; adUyusmaz: boolean };

/** Çok dersli puan farkı (muafiyet sınavıyla aynı korumalar: ad uyumu, tekrar eden numara, dolu puan). */
export function dsPuanFarkHesapla(dosya: string[][], bas: number, e: DsEslesme, hedefler: DsHedef[], ogrenci: Map<string, { durum: string }>,
  sec: { uzerineYaz?: boolean; adUyusmazYaz?: boolean } = {}) {
  const dersler = Object.keys(e.dersKolon).filter(d => e.dersKolon[d] > -1);
  const hedefHarita = new Map(hedefler.map(r => [r.no, r]));
  const g = (row: string[], i: number) => (i > -1 ? tekBosluk(row[i]) : '');
  const out = { yeni: [] as DsYazim[], degisen: [] as DsYazim[], ayni: 0, yazilacak: [] as DsYazim[], bosSatir: 0,
    adUyusmaz: [] as { satir: number; no: string; dosyaAd: string; listeAd: string }[],
    bulunamadi: [] as { satir: number; no: string; ad: string; neden: string }[], hatali: [] as { satir: number; no: string; ad: string; neden: string }[] };

  type Kayit = { dSatir: number; no: string; adi: string; soyadi: string; kisi: string; degerler: Record<string, string> };
  const kayitlar: Kayit[] = [];
  for (let r = bas + 1; r < dosya.length; r++) {
    const row = dosya[r];
    if (!row?.some(v => String(v || '').trim())) continue;
    const dSatir = r + 1;
    let hamNo = g(row, e.no);
    const isaretli = hamNo.match(/^\(([^)]{1,6})\)\s*(\d+)$/);
    if (isaretli) hamNo = isaretli[2];
    const no = hamNo.replace(/\s+/g, '').replace(/\.0+$/, '');
    let adi = g(row, e.adi), soyadi = g(row, e.soyadi);
    if (!adi && !soyadi && e.adSoyad > -1) { const p = g(row, e.adSoyad).split(' ').filter(Boolean); soyadi = p.length > 1 ? p.pop()! : ''; adi = p.join(' '); }
    const kisi = (adi + ' ' + soyadi).trim();
    const degerler: Record<string, string> = {};
    let hataVar = false;
    for (const d of dersler) {
      const ham = g(row, e.dersKolon[d]);
      if (!ham) continue;
      const m = puanMetni(ham);
      if (m === null) { const p = puanOku(ham) as { hata: string }; out.hatali.push({ satir: dSatir, no, ad: kisi, neden: d + ': ' + p.hata }); hataVar = true; continue; }
      degerler[d] = m;
    }
    if (hataVar) continue;
    if (!Object.keys(degerler).length) { out.bosSatir++; continue; }
    if (!no) { out.hatali.push({ satir: dSatir, no: '', ad: kisi, neden: 'Öğrenci numarası boş' }); continue; }
    if (!/^\d+$/.test(no)) { out.hatali.push({ satir: dSatir, no, ad: kisi, neden: 'Öğrenci numarası rakam dışında karakter içeriyor' }); continue; }
    kayitlar.push({ dSatir, no, adi, soyadi, kisi, degerler });
  }
  const grup = new Map<string, Kayit[]>();
  kayitlar.forEach(k => grup.set(k.no, [...(grup.get(k.no) ?? []), k]));
  const tekil: Kayit[] = [];
  grup.forEach((g2, no) => {
    const ilk = g2[0];
    if (g2.length > 1 && !g2.every(k => basNorm(k.kisi) === basNorm(ilk.kisi) && dersler.every(d => k.degerler[d] === ilk.degerler[d]))) {
      g2.forEach(k => out.hatali.push({ satir: k.dSatir, no, ad: k.kisi, neden: `Numara dosyada birden fazla satırda farklı bilgilerle geçiyor (satır ${g2.map(x => x.dSatir).join(', ')}); bu numaraya puan yazılmadı.` }));
      return;
    }
    tekil.push(ilk);
  });
  tekil.sort((x, y) => x.dSatir - y.dSatir);
  for (const k of tekil) {
    const h = hedefHarita.get(k.no);
    if (!h) {
      const o = ogrenci.get(k.no);
      out.bulunamadi.push({ satir: k.dSatir, no: k.no, ad: k.kisi, neden: !o ? 'Öğrenci listesinde yok' : o.durum === 'silindi' ? 'Kaydı silinmiş öğrenci' : 'Bu sınavın listesinde yok ("Öğrenci listesini güncelle"ye basın)' });
      continue;
    }
    const hedefAd = (h.adi + ' ' + h.soyadi).trim();
    const uyumlu = adUyumlu(k.adi, k.soyadi, h.adi, h.soyadi);
    if (!uyumlu) out.adUyusmaz.push({ satir: k.dSatir, no: k.no, dosyaAd: k.kisi, listeAd: hedefAd });
    for (const [d, yeni] of Object.entries(k.degerler)) {
      const eski = h.p[d] ?? '';
      const kayit: DsYazim = { no: k.no, ad: hedefAd, alan: d, eski: puanGoster(eski), yeni: yeni === 'G' ? 'Girmedi' : yeni, deger: yeni, adUyusmaz: !uyumlu };
      if (eski !== '' && eski === yeni) { out.ayni++; continue; }
      (eski === '' ? out.yeni : out.degisen).push(kayit);
      if ((eski === '' || sec.uzerineYaz) && (uyumlu || sec.adUyusmazYaz)) out.yazilacak.push(kayit);
    }
  }
  out.hatali.sort((x, y) => x.satir - y.satir);
  return out;
}

/* ---------- Sınav yeri listesi (kelebek sistem) ---------- */
export const SY_ALIAS = {
  no: ['OGR NO', 'OGRENCI NO', 'OGRENCI NUMARASI', 'OGRNO', 'NUMARA', 'NO', 'OKUL NO', 'OGRENCI NO SU'],
  adi: ['ADI', 'AD', 'OGRENCI ADI'],
  soyadi: ['SOYADI', 'SOYAD', 'OGRENCI SOYADI'],
  adSoyad: ['ADI SOYADI', 'AD SOYAD', 'ADSOYAD', 'ADI VE SOYADI', 'OGRENCI ADI SOYADI'],
  salon: ['SINAV SALONU', 'SALON', 'SALON ADI', 'DERSLIK', 'SINIF SALON'],
  sira: ['SIRA NO', 'SIRANO', 'SIRA NUMARASI', 'OTURMA SIRASI', 'KOLTUK NO', 'MASA NO'],
  kitapcik: ['KITAPCIK TURU', 'KITAPCIK', 'KITAPCIK TIPI'],
  sinavAdi: ['SINAV ADI', 'SINAV'],
  sinavKodu: ['SINAV KODU'],
  tarih: ['SINAV TARIHI', 'TARIH'],
  saat: ['SINAV SAATI', 'SAAT', 'BASLAMA SAATI'],
  yer: ['SINAV YERI', 'BINA', 'YERLESKE']
} as const;
export type SyAlan = keyof typeof SY_ALIAS;
export type SyEslesme = Record<SyAlan, number>;

const syNorm = (s: unknown) => alanNorm(String(s ?? '').replace(/_/g, ' ')).replace(/\s+/g, ' ').trim();
export function syBaslikEslestir(satir: string[]): SyEslesme {
  const n = (satir ?? []).map(syNorm);
  return Object.fromEntries((Object.keys(SY_ALIAS) as SyAlan[]).map(k => [k, n.findIndex(h => (SY_ALIAS[k] as readonly string[]).includes(h))])) as SyEslesme;
}

/** "23-09-2026", "23.09.2026", "2026-09-23" → "23.09.2026"; anlaşılamazsa olduğu gibi. */
export function syTarih(v: unknown): string {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return m[1].padStart(2, '0') + '.' + m[2].padStart(2, '0') + '.' + m[3];
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[3].padStart(2, '0') + '.' + m[2].padStart(2, '0') + '.' + m[1];
  return s;
}

export type SyKayit = { satir: number; no: string; adi: string; soyadi: string; salon: string; sira: string; kitapcik: string };

/** Dosya satırlarından kayıtları ve denetim raporunu çıkarır. ogrenci: sistemdeki kayıtlı öğrenciler. */
export function syKayitlariCikar(dosya: string[][], bas: number, e: SyEslesme, ogrenci: Map<string, { adi: string; soyadi: string; durum: string }>) {
  const g = (row: string[], i: number) => (i > -1 ? tekBosluk(row[i]) : '');
  const kayit: SyKayit[] = [], hatali: { satir: number; no: string; ad: string; neden: string }[] = [];
  const meta: Record<'sinavAdi' | 'sinavKodu' | 'tarih' | 'saat' | 'yer', Record<string, number>> = { sinavAdi: {}, sinavKodu: {}, tarih: {}, saat: {}, yer: {} };
  let bos = 0;
  for (let r = bas + 1; r < dosya.length; r++) {
    const row = dosya[r];
    if (!row?.some(v => String(v || '').trim())) { bos++; continue; }
    const dSatir = r + 1;
    let no = g(row, e.no).replace(/\s+/g, '').replace(/\.0+$/, '');
    const isaretli = no.match(/^\(([^)]{1,6})\)(\d+)$/);
    if (isaretli) no = isaretli[2];
    let adi = g(row, e.adi), soyadi = g(row, e.soyadi);
    if ((!adi || !soyadi) && e.adSoyad > -1) {
      const p = g(row, e.adSoyad).split(' ').filter(Boolean);
      if (p.length) { soyadi = soyadi || (p.length > 1 ? p.pop()! : ''); adi = adi || p.join(' '); }
    }
    const salon = g(row, e.salon), sira = g(row, e.sira).replace(/\.0+$/, ''), kisi = (adi + ' ' + soyadi).trim();
    if (!no) { hatali.push({ satir: dSatir, no: '', ad: kisi, neden: 'Öğrenci numarası boş' }); continue; }
    if (!/^\d+$/.test(no)) { hatali.push({ satir: dSatir, no, ad: kisi, neden: 'Öğrenci numarası rakam dışında karakter içeriyor' }); continue; }
    if (!salon) { hatali.push({ satir: dSatir, no, ad: kisi, neden: 'Sınav salonu boş' }); continue; }
    (['sinavAdi', 'sinavKodu', 'saat', 'yer'] as const).forEach(k => { const v = g(row, e[k]); if (v) meta[k][v] = (meta[k][v] ?? 0) + 1; });
    const t = syTarih(e.tarih > -1 ? row[e.tarih] : '');
    if (t) meta.tarih[t] = (meta.tarih[t] ?? 0) + 1;
    kayit.push({ satir: dSatir, no, adi, soyadi, salon, sira, kitapcik: g(row, e.kitapcik) });
  }
  // Aynı numara farklı salon/sırada → hiçbiri alınmaz; birebir aynıysa bir kez alınır
  const grup = new Map<string, SyKayit[]>();
  kayit.forEach(k => grup.set(k.no, [...(grup.get(k.no) ?? []), k]));
  const tekil: SyKayit[] = [];
  grup.forEach((gr, no) => {
    if (gr.length > 1 && !gr.every(k => k.salon === gr[0].salon && k.sira === gr[0].sira)) {
      gr.forEach(k => hatali.push({ satir: k.satir, no, ad: (k.adi + ' ' + k.soyadi).trim(), neden: `Numara birden fazla satırda farklı salon/sırayla geçiyor (satır ${gr.map(x => x.satir).join(', ')})` }));
      return;
    }
    tekil.push(gr[0]);
  });
  tekil.sort((a, b) => a.satir - b.satir);
  const salonlar = new Map<string, { n: number; siralar: Map<string, string> }>(), siraTekrar: { salon: string; sira: string; nolar: string }[] = [];
  for (const k of tekil) {
    const s = salonlar.get(k.salon) ?? { n: 0, siralar: new Map() };
    salonlar.set(k.salon, s);
    s.n++;
    if (k.sira) { const once = s.siralar.get(k.sira); if (once) siraTekrar.push({ salon: k.salon, sira: k.sira, nolar: once + ', ' + k.no }); else s.siralar.set(k.sira, k.no); }
  }
  const salonOzet = [...salonlar.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr', { numeric: true })).map(([salon, s]) => ({ salon, n: s.n }));
  const kayitsiz = tekil.filter(k => ogrenci.get(k.no)?.durum !== 'aktif').map(k => ({ no: k.no, ad: (k.adi + ' ' + k.soyadi).trim(), neden: !ogrenci.get(k.no) ? 'Öğrenci listesinde yok' : 'Kaydı silinmiş' }));
  const listede = new Set(tekil.map(k => k.no));
  const listedeYok = [...ogrenci.entries()].filter(([no, o]) => o.durum === 'aktif' && !listede.has(no)).map(([no, o]) => ({ no, ad: (o.adi + ' ' + o.soyadi).trim() }));
  const enCok = (m: Record<string, number>) => Object.keys(m).sort((a, b) => m[b] - m[a]);
  return {
    kayit: tekil, hatali: hatali.sort((a, b) => a.satir - b.satir), bosSatir: bos, salonOzet, siraTekrar, kayitsiz, listedeYok,
    kitapcikVar: tekil.some(k => k.kitapcik),
    meta: { sinavAdi: enCok(meta.sinavAdi), sinavKodu: enCok(meta.sinavKodu), tarih: enCok(meta.tarih), saat: enCok(meta.saat), yer: enCok(meta.yer) }
  };
}

export type SyMeta = { ad: string; sinavKodu: string; tarih: string; saat: string; yer: string; aciklama: string; donemKod: string };
export function syMetaDogrula(m: Partial<Record<keyof SyMeta, unknown>> | null | undefined): SyMeta {
  const ad = tekBosluk(m?.ad);
  if (!ad) throw new KullaniciHatasi('Sınavın adını yazın.');
  if (ad.length > 100) throw new KullaniciHatasi('Sınav adı en fazla 100 karakter olabilir.');
  const tarih = syTarih(m?.tarih);
  if (tarih && trGun(tarih) == null) throw new KullaniciHatasi('Tarih anlaşılamadı (gg.aa.yyyy).');
  return { ad, sinavKodu: tekBosluk(m?.sinavKodu).slice(0, 30), tarih, saat: tekBosluk(m?.saat).slice(0, 20), yer: tekBosluk(m?.yer).slice(0, 100),
    aciklama: tekBosluk(m?.aciklama).slice(0, 300), donemKod: tekBosluk(m?.donemKod).slice(0, 10) };
}

/** Liste öğrenciye şu an gösteriliyor mu? Tarihi SY_GECMIS_GUN günden eski olan yayındaki liste gösterilmez. */
export function syGorunurluk(l: { yayinda: boolean; tarih: string }, bugun: number): 'gorunur' | 'gizli' | 'eski' {
  if (!l.yayinda) return 'gizli';
  const t = trGun(l.tarih);
  return t != null && t < bugun - SY_GECMIS_GUN * 86400000 ? 'eski' : 'gorunur';
}
