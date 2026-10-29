/**
 * Muafiyet sınavı yönetim kuralları (saf, test edilebilir). Kaynak: Apps Script Sinav.gs
 * kuralDogrula_, sinavKuralMetni_, puanSatirEslesmesi_, puanBaslikBul_, adUyumlu_, puanFarkHesapla_.
 */
import { alanNorm, ortakEkiTemizle, tekBosluk } from './aktarim-kurallari';
import { KullaniciHatasi } from './hata';
import { basNorm } from './metin';
import { puanGoster, puanOku, SONUC, sinavSonucu, type SinavKurali } from './sinav';

const yuvarla2 = (x: number) => Math.round(x * 100) / 100;

/** Panelden gelen kuralı doğrular; hatalıysa anlaşılır bir mesajla durur. Kullanılmayan alanlar mevcut değerini korur. */
export function kuralDogrula(k: Record<string, unknown> | null | undefined, mevcut: SinavKurali): SinavKurali {
  const sayi = (v: unknown, ad: string) => {
    const s = String(v ?? '').trim(), x = Number(s.replace(',', '.'));
    if (s === '' || isNaN(x) || x < 0 || x > 100) throw new KullaniciHatasi(ad + ' 0 ile 100 arasında bir sayı olmalı.');
    return x;
  };
  const yontem = k?.yontem === 'AYRI' ? 'AYRI' : k?.yontem === 'ORTALAMA' ? 'ORTALAMA' : null;
  if (!yontem) throw new KullaniciHatasi('Muafiyet yöntemi seçilmedi.');
  const out: SinavKurali = { ...mevcut, yontem, yaziliGecme: sayi(k!.yaziliGecme, 'Sözlüye girme puanı') };
  if (yontem === 'ORTALAMA') {
    out.yaziliAgirlik = sayi(k!.yaziliAgirlik, 'Yazılı ağırlığı');
    out.muafiyetPuani = sayi(k!.muafiyetPuani, 'Muafiyet puanı');
    out.sozluAltSinir = sayi(k!.sozluAltSinir == null || k!.sozluAltSinir === '' ? 0 : k!.sozluAltSinir, 'Sözlü alt sınırı');
  } else {
    out.sozluGecme = sayi(k!.sozluGecme, 'Sözlü geçme puanı');
  }
  return out;
}

export function kuralMetni(k: SinavKurali): string {
  const sozluSart = k.yaziliGecme > 0 ? `Yazılıdan en az ${k.yaziliGecme} alan sözlüye girer.` : 'Herkes sözlüye girer.';
  if (k.yontem === 'ORTALAMA') {
    return `${sozluSart} Muafiyet için (yazılı × %${k.yaziliAgirlik}) + (sözlü × %${yuvarla2(100 - k.yaziliAgirlik)}) en az ${k.muafiyetPuani} olmalıdır.` +
      (k.sozluAltSinir > 0 ? ` Ayrıca sözlüden en az ${k.sozluAltSinir} alınmalıdır.` : '');
  }
  return `${sozluSart} Muafiyet için sözlüden de en az ${k.sozluGecme} alınmalıdır.`;
}

export type Sayim = { muaf: number; hazirlik: number; bekliyor: number; hata: number };
export const bosSayim = (): Sayim => ({ muaf: 0, hazirlik: 0, bekliyor: 0, hata: 0 });
export function say(s: Sayim, sonuc: string) {
  if (sonuc === SONUC.MUAF) s.muaf++; else if (sonuc === SONUC.HAZIRLIK) s.hazirlik++; else if (sonuc === SONUC.HATA) s.hata++; else s.bekliyor++;
}

/** Puanı veritabanında saklanacak metne çevirir: sayı → "72.5", girmedi → "G", boş → "". Hatalıysa null. */
export function puanMetni(v: unknown): string | null {
  const p = puanOku(v);
  if (p === null) return '';
  if (p === 'G') return 'G';
  if (typeof p === 'object') return null;
  return String(p);
}

/* ---------- Puan listesi yükleme ---------- */
const PUAN_ALIAS = {
  no: ['OGRENCI NO', 'OGRENCI NUMARASI', 'OGR NO', 'OGRNO', 'OGRENCINO', 'NUMARA', 'NO'],
  adi: ['ADI', 'AD'],
  soyadi: ['SOYADI', 'SOYAD'],
  adSoyad: ['ADI SOYADI', 'AD SOYAD', 'ADSOYAD', 'OGRENCI ADI SOYADI'],
  yazili: ['YAZILI', 'YAZILI PUAN', 'YAZILI PUANI', 'YAZILI NOT', 'YAZILI NOTU', 'YAZILI SINAV', 'YAZILI SINAV PUANI'],
  sozlu: ['SOZLU', 'SOZLU PUAN', 'SOZLU PUANI', 'SOZLU NOT', 'SOZLU NOTU', 'SOZLU SINAV', 'SOZLU SINAV PUANI'],
  genel: ['PUAN', 'PUANI', 'NOT', 'NOTU', 'HBN', 'SINAV PUANI', 'SINAV NOTU', 'BASARI NOTU', 'HAM NOT']
} as const;
export const PUAN_ALANLARI = ['no', 'adi', 'soyadi', 'adSoyad', 'yazili', 'sozlu'] as const;
export type PuanEslesme = Record<keyof typeof PUAN_ALIAS, number>;

const kolonBul = (satir: string[], a: readonly string[]) => { for (const x of a) { const i = satir.indexOf(x); if (i > -1) return i; } return -1; };

export function puanSatirEslesmesi(satir: string[]): PuanEslesme {
  const row = ortakEkiTemizle(satir).map(alanNorm);
  return Object.fromEntries(Object.entries(PUAN_ALIAS).map(([k, a]) => [k, kolonBul(row, a)])) as PuanEslesme;
}

export function puanBaslikBul(satirlar: string[][]) {
  for (let r = 0; r < Math.min(satirlar.length, 25); r++) {
    const e = puanSatirEslesmesi(satirlar[r] ?? []);
    if (e.no > -1 && (e.yazili > -1 || e.sozlu > -1 || e.genel > -1)) return { basSatir: r, eslesme: e };
  }
  return { basSatir: -1, eslesme: null };
}

/** Dosyadaki ad ile listedeki ad aynı kişiyi mi gösteriyor? (ikinci ad eksik yazılmışsa da kabul) */
export function adUyumlu(da: string, ds: string, ra: string, rs: string): boolean {
  const n = basNorm;
  if (!n(da) && !n(ds)) return true;   // dosyada ad yoksa karşılaştırma yapılmaz
  if (n(ds) !== n(rs)) return false;
  const d = n(da).split(' '), r = n(ra).split(' ');
  return n(da) === n(ra) || (!!d[0] && d[0] === r[0]);
}

export type SinavSatiri = { no: string; adi: string; soyadi: string; yazili: string; sozlu: string };
export type PuanAlani = 'yazili' | 'sozlu';
export type PuanYazimi = { no: string; ad: string; alan: string; alanKod: PuanAlani; eski: string; yeni: string; deger: string; dosyaSatir: number; adUyusmaz: boolean };
export type PuanFarki = {
  yeni: PuanYazimi[]; degisen: PuanYazimi[]; ayni: number; yazilacak: PuanYazimi[]; bosSatir: number;
  adUyusmaz: { satir: number; no: string; dosyaAd: string; listeAd: string }[];
  bulunamadi: { satir: number; no: string; ad: string; neden: string }[];
  hatali: { satir: number; no: string; ad: string; neden: string }[];
};

/**
 * Saf fark hesabı. ogrenci: no → {durum} (bulunamayanların nedenini açıklamak için).
 * Aynı numara dosyada farklı bilgilerle tekrar ediyorsa o numaraya hiç yazılmaz.
 */
export function puanFarkHesapla(dosya: string[][], bas: number, e: Record<string, number>, sinav: SinavSatiri[],
  ogrenci: Map<string, { durum: string }>, sec: { uzerineYaz?: boolean; adUyusmazYaz?: boolean } = {}): PuanFarki {
  const alanlar = (['yazili', 'sozlu'] as const).filter(a => e[a] > -1);
  const etiket = { yazili: 'Yazılı', sozlu: 'Sözlü' };
  const hedefler = new Map(sinav.map(r => [r.no, r]));
  const g = (row: string[], i: number) => (i > -1 ? tekBosluk(row[i]) : '');
  const out: PuanFarki = { yeni: [], degisen: [], ayni: 0, adUyusmaz: [], bulunamadi: [], hatali: [], bosSatir: 0, yazilacak: [] };

  type Kayit = { dSatir: number; no: string; adi: string; soyadi: string; kisi: string; degerler: Partial<Record<PuanAlani, string>> };
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
    if (!adi && !soyadi && e.adSoyad > -1) {
      const p = g(row, e.adSoyad).split(' ').filter(Boolean);
      soyadi = p.length > 1 ? p.pop()! : ''; adi = p.join(' ');
    }
    const kisi = (adi + ' ' + soyadi).trim();
    const degerler: Kayit['degerler'] = {};
    let hataVar = false;
    for (const a of alanlar) {
      const ham = g(row, e[a]);
      if (!ham) continue;
      const p = puanOku(ham);
      if (p && typeof p === 'object') { out.hatali.push({ satir: dSatir, no, ad: kisi, neden: etiket[a] + ': ' + p.hata }); hataVar = true; continue; }
      degerler[a] = p === 'G' ? 'G' : String(p);
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
    const tutarli = g2.every(k => basNorm(k.kisi) === basNorm(ilk.kisi) && alanlar.every(a => k.degerler[a] === ilk.degerler[a]));
    if (g2.length > 1 && !tutarli) {
      const ayrinti = g2.map(k => `${k.dSatir}. satır: ${k.kisi || '(adsız)'} ` + alanlar.filter(a => a in k.degerler).map(a => etiket[a] + ' ' + k.degerler[a]).join(', ')).join(' | ');
      g2.forEach(k => out.hatali.push({ satir: k.dSatir, no, ad: k.kisi, neden: `Numara dosyada birden fazla satırda farklı bilgilerle geçiyor, bu numaraya puan yazılmadı (${ayrinti}). Numaralardan biri yanlış yazılmış olabilir.` }));
      return;
    }
    tekil.push(ilk);
  });
  tekil.sort((x, y) => x.dSatir - y.dSatir);

  for (const k of tekil) {
    const h = hedefler.get(k.no);
    if (!h) {
      const o = ogrenci.get(k.no);
      out.bulunamadi.push({ satir: k.dSatir, no: k.no, ad: k.kisi,
        neden: !o ? 'Öğrenci listesinde yok' : o.durum === 'silindi' ? 'Kaydı silinmiş öğrenci' : 'Öğrenci listesinde var ama sınav listesinde yok ("Sınav listesini güncelle"ye basın)' });
      continue;
    }
    const hedefAd = (h.adi + ' ' + h.soyadi).trim();
    const uyumlu = adUyumlu(k.adi, k.soyadi, h.adi, h.soyadi);
    if (!uyumlu) out.adUyusmaz.push({ satir: k.dSatir, no: k.no, dosyaAd: k.kisi, listeAd: hedefAd });
    for (const a of alanlar) {
      const yeni = k.degerler[a];
      if (yeni === undefined) continue;
      const eskiP = puanOku(h[a]);
      const eskiHatali = !!eskiP && typeof eskiP === 'object';
      const kayit: PuanYazimi = { no: k.no, ad: hedefAd, alan: etiket[a], alanKod: a, eski: puanGoster(h[a]) || (eskiHatali ? h[a] : ''),
        yeni: yeni === 'G' ? 'Girmedi' : yeni, deger: yeni, dosyaSatir: k.dSatir, adUyusmaz: !uyumlu };
      if (eskiP !== null && !eskiHatali && String(eskiP) === yeni) { out.ayni++; continue; }
      const bos = eskiP === null;
      (bos ? out.yeni : out.degisen).push(kayit);
      if ((bos || sec.uzerineYaz) && (uyumlu || sec.adUyusmazYaz)) out.yazilacak.push(kayit);
    }
  }
  out.hatali.sort((x, y) => x.satir - y.satir);
  return out;
}

/** Yükleme sonrası sonuç dağılımı (yazılacak puanlar uygulanmış gibi). */
export function puanSonrasiSayim(sinav: SinavSatiri[], yazilacak: PuanYazimi[], k: SinavKurali) {
  const deg = new Map<string, Partial<Record<PuanAlani, string>>>();
  yazilacak.forEach(x => deg.set(x.no, { ...deg.get(x.no), [x.alanKod]: x.deger }));
  const once = bosSayim(), sonra = bosSayim();
  for (const r of sinav) {
    say(once, sinavSonucu(r.yazili, r.sozlu, k).sonuc);
    const d = deg.get(r.no) ?? {};
    say(sonra, sinavSonucu(d.yazili ?? r.yazili, d.sozlu ?? r.sozlu, k).sonuc);
  }
  return { once, sonra };
}
