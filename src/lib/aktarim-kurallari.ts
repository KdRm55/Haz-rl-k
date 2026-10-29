/**
 * Öğrenci listesi yükleme kuralları (saf, test edilebilir). Kaynak: Apps Script Aktarim.gs.
 * Akış: dosya satırları → başlık ve sütun eşleştirmesi → doğrulanmış kayıtlar → mevcut kayıtlarla fark.
 */
import { KullaniciHatasi } from './hata';
import { basNorm, cinsiyetKod } from './metin';

export const ESLESME_ALANLARI = ['no', 'tc', 'adi', 'soyadi', 'adSoyad', 'cinsiyet', 'bolum', 'eposta', 'telefon'] as const;
export type EslesmeAlani = (typeof ESLESME_ALANLARI)[number];
export type Eslesme = Record<EslesmeAlani, number>;
export type KayitliEslesme = Partial<Record<EslesmeAlani, string>>;

export const ALAN_ETIKET: Record<string, string> = {
  no: 'Öğrenci No', tc: 'TC Kimlik No', tc4: 'TC son 4', tc6: 'TC son 6', adi: 'Adı', soyadi: 'Soyadı',
  adSoyad: 'Adı Soyadı (tek sütun)', cinsiyet: 'Cinsiyet', bolum: 'Bölüm / Program',
  eposta: 'E-posta', telefon: 'Telefon', durum: 'Kayıt durumu', sinif: 'Sınıf', not: 'Not'
};

const ALIAS: Record<EslesmeAlani, string[]> = {
  no: ['OGRENCI NO', 'OGRENCI NUMARASI', 'OGR NO', 'OGRNO', 'OGRENCINO', 'NUMARA', 'NO'],
  tc: ['TC KIMLIK NO', 'TC KIMLIK NUMARASI', 'T C KIMLIK NO', 'TC NO', 'TCKN', 'TC', 'KIMLIK NO', 'TC KIMLIK'],
  adi: ['ADI', 'AD'],
  soyadi: ['SOYADI', 'SOYAD'],
  adSoyad: ['ADI SOYADI', 'AD SOYAD', 'ADSOYAD', 'OGRENCI ADI SOYADI'],
  cinsiyet: ['CINSIYET', 'CINSIYETI'],
  bolum: ['BOLUM', 'BOLUM ADI', 'PROGRAM', 'PROGRAM ADI', 'BIRIM', 'BIRIM ADI'],
  eposta: ['E POSTA', 'EPOSTA', 'E MAIL', 'EMAIL', 'MAIL', 'E POSTA ADRESI'],
  telefon: ['TELEFON', 'CEP TELEFONU', 'CEP TEL', 'GSM', 'TELEFON NO', 'CEP']
};

export const LISTE_SINIRI = 300;   // önizlemede her listeden gösterilecek en fazla kayıt

export const alanNorm = (s: unknown) => basNorm(s).replace(/[-/()]/g, ' ').replace(/\s+/g, ' ').trim();
export const tekBosluk = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ');
export const buyukTR = (s: unknown) => tekBosluk(s).toLocaleUpperCase('tr-TR');

export function sutunHarfi(i: number): string {
  let s = '', n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const kolonBul = (satir: string[], aliaslar: string[]) => { for (const a of aliaslar) { const i = satir.indexOf(a); if (i > -1) return i; } return -1; };

/** T.C. kimlik numarası algoritma kontrolü */
export function tcGecerli(tc: string): boolean {
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  const d = tc.split('').map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8];
  const cift = d[1] + d[3] + d[5] + d[7];
  const d10 = (((tek * 7 - cift) % 10) + 10) % 10;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d[9] === d10 && d[10] === d11;
}

export function satirlariTemizle(satirlar: unknown): string[][] {
  if (!Array.isArray(satirlar)) return [];
  return satirlar.slice(0, 20000).map(r => (Array.isArray(r) ? r.slice(0, 60) : []).map(v => (v == null ? '' : String(v))));
}

/**
 * Bazı dışa aktarımlar başlıklara ortak bir ek koyabiliyor ("Öğrenci No_0404KZ" gibi; ek hocaya göre değişir).
 * Dolu başlıkların en az %80'i aynı "_…" ekiyle bitiyorsa ek yok sayılır.
 */
export function ortakEkiTemizle(satir: string[]): string[] {
  const temiz = satir.map(v => String(v ?? '').trim());
  const dolu = temiz.filter(Boolean);
  if (dolu.length < 3) return temiz;
  const ek = dolu[0].match(/_[^_\s]+$/)?.[0] ?? '';
  const ortak = !!ek && dolu.filter(v => v.endsWith(ek)).length >= dolu.length * 0.8;
  return temiz.map(t => (ortak && t.endsWith(ek) ? t.slice(0, -ek.length) : t));
}

export function satirEslesmesi(satir: string[], kayitli: KayitliEslesme | null): Eslesme {
  const row = ortakEkiTemizle(satir).map(alanNorm);
  const e = {} as Eslesme;
  for (const a of ESLESME_ALANLARI) {
    let i = -1;
    if (kayitli?.[a]) i = row.indexOf(alanNorm(kayitli[a]));
    if (i === -1) i = kolonBul(row, ALIAS[a]);
    e[a] = i;
  }
  return e;
}

/** Başlık satırını bulur. Önce son aktarımda kullanılan başlık adları, sonra bilinen adlar denenir. */
export function baslikBul(satirlar: string[][], kayitli: KayitliEslesme | null) {
  for (let r = 0; r < Math.min(satirlar.length, 25); r++) {
    const e = satirEslesmesi(satirlar[r] ?? [], kayitli);
    if (e.no > -1 && ((e.adi > -1 && e.soyadi > -1) || e.adSoyad > -1)) return { basSatir: r, eslesme: e };
  }
  return { basSatir: -1, eslesme: null };
}

export function eslesmeDogrula(e: Partial<Record<string, unknown>> | null | undefined, sutunSayisi: number): Eslesme {
  const temiz = {} as Eslesme;
  for (const a of ESLESME_ALANLARI) {
    const v = parseInt(String(e?.[a] ?? ''), 10);
    temiz[a] = !isNaN(v) && v >= 0 && v < sutunSayisi ? v : -1;
  }
  if (temiz.no === -1) throw new KullaniciHatasi('"Öğrenci No" sütunu seçilmedi.');
  if (!((temiz.adi > -1 && temiz.soyadi > -1) || temiz.adSoyad > -1)) throw new KullaniciHatasi('"Adı" ve "Soyadı" sütunlarını ya da tek sütunlu "Adı Soyadı"nı seçin.');
  return temiz;
}

/** Eşleştirmede eşlenen alanlara göre karşılaştırılacak alanlar */
export type KarsilastirmaAlani = 'adi' | 'soyadi' | 'tc4' | 'tc6' | 'cinsiyet' | 'bolum' | 'eposta' | 'telefon';
export function eslenenAlanlar(e: Eslesme): KarsilastirmaAlani[] {
  const a: KarsilastirmaAlani[] = ['adi', 'soyadi'];
  if (e.tc > -1) a.push('tc4', 'tc6');
  (['cinsiyet', 'bolum', 'eposta', 'telefon'] as const).forEach(k => { if (e[k] > -1) a.push(k); });
  return a;
}

export type DosyaKaydi = { no: string; tc4: string; tc6: string; adi: string; soyadi: string; cinsiyet: string; bolum: string; eposta: string; telefon: string; satir: number };
export type SatirSorunu = { satir: number; no: string; ad: string; neden: string };

/** Dosya satırlarını doğrulanmış öğrenci kayıtlarına çevirir. */
export function dosyaKayitlari(satirlar: string[][], bas: number, e: Eslesme) {
  const kayit: Record<string, DosyaKaydi> = {};
  const hatalar: SatirSorunu[] = [], uyarilar: SatirSorunu[] = [];
  const g = (row: string[], i: number) => (i > -1 ? tekBosluk(row[i]) : '');
  for (let r = bas + 1; r < satirlar.length; r++) {
    const row = satirlar[r];
    if (!row?.some(v => String(v || '').trim())) continue;
    const satir = r + 1;

    // Numara önündeki "(A)" gibi işaretler ayrılır ve uyarı olarak raporlanır
    let hamNo = g(row, e.no), isaret = '';
    const isaretli = hamNo.match(/^\(([^)]{1,6})\)\s*(\d+)$/);
    if (isaretli) { isaret = isaretli[1]; hamNo = isaretli[2]; }
    const no = hamNo.replace(/\s+/g, '').replace(/\.0+$/, '');
    let adi = g(row, e.adi), soyadi = g(row, e.soyadi);
    if (!adi && !soyadi && e.adSoyad > -1) {
      const p = g(row, e.adSoyad).split(' ').filter(Boolean);
      soyadi = p.length > 1 ? p.pop()! : '';
      adi = p.join(' ');
    }
    const kisi = (adi + ' ' + soyadi).trim();

    if (!no) { if (kisi) hatalar.push({ satir, no: '', ad: kisi, neden: 'Öğrenci numarası boş' }); continue; }
    if (!/^\d+$/.test(no)) { hatalar.push({ satir, no, ad: kisi, neden: 'Öğrenci numarası rakam dışında karakter içeriyor' }); continue; }
    if (!kisi) { hatalar.push({ satir, no, ad: '', neden: 'Ad ve soyad boş' }); continue; }
    if (isaret) uyarilar.push({ satir, no, ad: kisi, neden: `Numaranın önünde "(${isaret})" işareti vardı; numara ${no} olarak alındı` });

    // TC kimlik numarasının tamamı saklanmaz: son 6 hane (hesap açarken doğrulama) ve son 4 hane
    let tc4 = '', tc6 = '';
    if (e.tc > -1) {
      const tc = g(row, e.tc).replace(/\D/g, '');
      // TC isteğe bağlıdır: boş TC uyarı üretmez (doğrulama açıksa eksikler "Sistem kontrolü"nde toplu raporlanır)
      if (tc) {
        if (!tcGecerli(tc)) uyarilar.push({ satir, no, ad: kisi, neden: 'TC kimlik numarası geçerli görünmüyor (yabancı uyruklu olabilir); son haneleri yine de saklandı' });
        if (tc.length >= 4) tc4 = tc.slice(-4);
        if (tc.length >= 6) tc6 = tc.slice(-6);
        else uyarilar.push({ satir, no, ad: kisi, neden: 'TC kimlik numarası 6 haneden kısa; bu öğrenci hesap açamaz' });
      }
    }
    let cinsiyet = '';
    if (e.cinsiyet > -1) {
      const ham = g(row, e.cinsiyet);
      cinsiyet = cinsiyetKod(ham);
      if (ham && !cinsiyet) uyarilar.push({ satir, no, ad: kisi, neden: `Cinsiyet değeri tanınmadı: "${ham}"` });
    }
    const rec: DosyaKaydi = { no, tc4, tc6, adi, soyadi, cinsiyet, bolum: g(row, e.bolum), eposta: g(row, e.eposta).toLowerCase(), telefon: g(row, e.telefon), satir };
    const once = kayit[no];
    if (once) {
      const farkli = (['tc6', 'adi', 'soyadi', 'cinsiyet', 'bolum'] as const).some(k => buyukTR(once[k]) !== buyukTR(rec[k]));
      if (farkli) hatalar.push({ satir, no, ad: kisi, neden: `Numara dosyada tekrar ediyor ve bilgileri ${once.satir}. satırdakinden farklı; ${once.satir}. satır esas alındı` });
      continue;
    }
    kayit[no] = rec;
  }
  return { kayit, hatalar, uyarilar };
}

export function degerEsit(alan: string, a: unknown, b: unknown): boolean {
  if (alan === 'adi' || alan === 'soyadi' || alan === 'bolum') return buyukTR(a) === buyukTR(b);
  if (alan === 'eposta') return tekBosluk(a).toLowerCase() === tekBosluk(b).toLowerCase();
  return tekBosluk(a) === tekBosluk(b);
}

export type MevcutKayit = { no: string; adi: string; soyadi: string; durum: 'aktif' | 'silindi' } & Partial<Record<KarsilastirmaAlani, string>>;
export type AlanDegisikligi = { alan: string; eski: string; yeni: string };
export type Fark = {
  yeni: DosyaKaydi[];
  degisen: { no: string; ad: string; degisiklikler: AlanDegisikligi[] }[];
  geriGelen: { no: string; ad: string; degisiklikler: AlanDegisikligi[] }[];
  silinen: { no: string; ad: string }[];
  ayni: number;
};

/**
 * Mevcut kayıtlarla dosyayı karşılaştırır.
 * Dosyada boş gelen bir alan, mevcut dolu değeri silmez (dışa aktarma hatasına karşı koruma).
 */
export function farkHesapla(mevcut: MevcutKayit[], dosya: Record<string, DosyaKaydi>, alanlar: KarsilastirmaAlani[]): Fark {
  const m = new Map(mevcut.map(r => [r.no, r]));
  const f: Fark = { yeni: [], degisen: [], geriGelen: [], silinen: [], ayni: 0 };
  for (const [no, d] of Object.entries(dosya)) {
    const x = m.get(no);
    const ad = (d.adi + ' ' + d.soyadi).trim();
    if (!x) { f.yeni.push(d); continue; }
    const deg = alanlar.filter(a => d[a] !== '' && !degerEsit(a, x[a], d[a])).map(a => ({ alan: a, eski: x[a] || '', yeni: d[a] }));
    if (x.durum === 'silindi') { f.geriGelen.push({ no, ad, degisiklikler: deg }); continue; }
    if (deg.length) f.degisen.push({ no, ad, degisiklikler: deg });
    else f.ayni++;
  }
  for (const x of mevcut) if (x.durum !== 'silindi' && !dosya[x.no]) f.silinen.push({ no: x.no, ad: (x.adi + ' ' + x.soyadi).trim() });
  return f;
}

/** Toplu silme koruması: aktif kayıtların %10'undan (en az 5) fazlası silinecekse ayrıca onay istenir. */
export const silmeEsigi = (aktifSayi: number) => Math.max(5, Math.ceil(aktifSayi * 0.1));

/** Eşleştirmenin başlık adları sonraki aktarımlarda otomatik tanınmak üzere saklanır (ek temizlenmiş hâliyle). */
export function eslesmeKaydi(baslikSatiri: string[], e: Eslesme): KayitliEslesme {
  const bas = ortakEkiTemizle(baslikSatiri);
  const k: KayitliEslesme = {};
  for (const a of ESLESME_ALANLARI) if (e[a] > -1 && bas[e[a]]) k[a] = bas[e[a]];
  return k;
}
