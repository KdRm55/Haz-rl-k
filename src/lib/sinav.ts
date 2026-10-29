/**
 * Muafiyet sınavı hesabı — Apps Script Sinav.gs ile birebir aynı kurallar.
 * Sonuç hiçbir yerde saklanmaz; her seferinde puanlardan ve Ayarlar'daki kurallardan hesaplanır.
 */
import { basNorm } from './metin';

export const SONUC = { MUAF: 'Muaf', HAZIRLIK: 'Hazırlık', BEKLIYOR: 'Bekliyor', HATA: 'Hatalı puan' } as const;
export type Sonuc = (typeof SONUC)[keyof typeof SONUC];

export type SinavKurali = {
  yontem: 'ORTALAMA' | 'AYRI';
  yaziliGecme: number;
  yaziliAgirlik: number;
  muafiyetPuani: number;
  sozluAltSinir: number;
  sozluGecme: number;
  yaziliTamam: boolean;
  sozluTamam: boolean;
  yayinda: boolean;
};

export const SINAV_VARSAYILAN = { yontem: 'ORTALAMA', yaziliGecme: 50, yaziliAgirlik: 50, muafiyetPuani: 60, sozluAltSinir: 0, sozluGecme: 60 } as const;

type Puan = number | 'G' | null | { hata: string };

/** Hücre değeri → sayı | 'G' (girmedi) | null (boş) | {hata} */
export function puanOku(v: unknown): Puan {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v >= 0 && v <= 100 ? v : { hata: 'Puan 0–100 arasında olmalı: ' + v };
  const s = String(v).trim();
  if (!s) return null;
  if (['G', 'GIRMEDI', 'GR', 'GM'].includes(basNorm(s))) return 'G';
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return { hata: 'Puan anlaşılamadı: "' + s + '" (sayı ya da girmeyen için G yazın)' };
  const x = Number(t);
  return x >= 0 && x <= 100 ? x : { hata: 'Puan 0–100 arasında olmalı: ' + s };
}

function sayiAyar(v: string | undefined, varsayilan: number): number {
  const s = String(v ?? '').trim();
  const x = Number(s.replace(',', '.'));
  return s !== '' && !isNaN(x) && x >= 0 && x <= 100 ? x : varsayilan;
}

export function sinavKurali(a: Record<string, string>): SinavKurali {
  const v = SINAV_VARSAYILAN;
  const yn = basNorm(a.MUAFIYET_YONTEMI);
  return {
    yontem: yn.includes('AYRI') ? 'AYRI' : yn.includes('ORTALAMA') ? 'ORTALAMA' : v.yontem,
    yaziliGecme: sayiAyar(a.YAZILI_GECME_PUANI, v.yaziliGecme),
    yaziliAgirlik: sayiAyar(a.YAZILI_AGIRLIK, v.yaziliAgirlik),
    muafiyetPuani: sayiAyar(a.MUAFIYET_PUANI, v.muafiyetPuani),
    sozluAltSinir: sayiAyar(a.SOZLU_ALT_SINIR, v.sozluAltSinir),
    sozluGecme: sayiAyar(a.SOZLU_GECME_PUANI, v.sozluGecme),
    yaziliTamam: basNorm(a.YAZILI_TAMAMLANDI) === 'EVET',
    sozluTamam: basNorm(a.SOZLU_TAMAMLANDI) === 'EVET',
    yayinda: basNorm(a.SINAV_SONUCLARI_YAYINDA) === 'EVET'
  };
}

const yuvarla2 = (x: number) => Math.round(x * 100) / 100;
const hataMi = (p: Puan): p is { hata: string } => typeof p === 'object' && p !== null;

export type SinavSonucu = { sonuc: Sonuc; aciklama: string; ortalama: number | null };

/** Tek öğrencinin sonucu. */
export function sinavSonucu(yaziliHam: unknown, sozluHam: unknown, k: SinavKurali): SinavSonucu {
  const y = puanOku(yaziliHam), s = puanOku(sozluHam);
  if (hataMi(y)) return { sonuc: SONUC.HATA, aciklama: 'Yazılı: ' + y.hata, ortalama: null };
  if (hataMi(s)) return { sonuc: SONUC.HATA, aciklama: 'Sözlü: ' + s.hata, ortalama: null };

  if (y === null) {
    return k.yaziliTamam
      ? { sonuc: SONUC.HAZIRLIK, aciklama: 'Yazılı sınava girmedi (puanı yok, yazılı sınav tamamlandı)', ortalama: null }
      : { sonuc: SONUC.BEKLIYOR, aciklama: 'Yazılı sınav puanı bekleniyor', ortalama: null };
  }
  if (y === 'G') return { sonuc: SONUC.HAZIRLIK, aciklama: 'Yazılı sınava girmedi', ortalama: null };
  if (k.yaziliGecme > 0 && y < k.yaziliGecme) {
    return { sonuc: SONUC.HAZIRLIK, aciklama: 'Yazılı puanı sözlüye girme puanının (' + k.yaziliGecme + ') altında', ortalama: null };
  }
  if (s === null) {
    return k.sozluTamam
      ? { sonuc: SONUC.HAZIRLIK, aciklama: 'Sözlü sınava girmedi (puanı yok, sözlü sınav tamamlandı)', ortalama: null }
      : { sonuc: SONUC.BEKLIYOR, aciklama: 'Sözlü sınav puanı bekleniyor', ortalama: null };
  }
  if (s === 'G') return { sonuc: SONUC.HAZIRLIK, aciklama: 'Sözlü sınava girmedi', ortalama: null };

  if (k.yontem === 'ORTALAMA') {
    const ort = yuvarla2(y * k.yaziliAgirlik / 100 + s * (100 - k.yaziliAgirlik) / 100);
    if (k.sozluAltSinir > 0 && s < k.sozluAltSinir) {
      return { sonuc: SONUC.HAZIRLIK, aciklama: 'Ortalama ' + ort + ' ama sözlü puanı alt sınırın (' + k.sozluAltSinir + ') altında', ortalama: ort };
    }
    return ort >= k.muafiyetPuani
      ? { sonuc: SONUC.MUAF, aciklama: 'Ortalama ' + ort + ', muafiyet puanı ' + k.muafiyetPuani, ortalama: ort }
      : { sonuc: SONUC.HAZIRLIK, aciklama: 'Ortalama ' + ort + ', muafiyet puanının (' + k.muafiyetPuani + ') altında', ortalama: ort };
  }
  return s >= k.sozluGecme
    ? { sonuc: SONUC.MUAF, aciklama: 'Yazılı ve sözlü sınavı geçti', ortalama: null }
    : { sonuc: SONUC.HAZIRLIK, aciklama: 'Sözlü puanı geçme puanının (' + k.sozluGecme + ') altında', ortalama: null };
}

/** Öğrenciye gösterilecek puan metni */
export function puanGoster(v: unknown): string {
  const p = puanOku(v);
  if (p === null || hataMi(p)) return '';
  if (p === 'G') return 'Girmedi';
  return String(p);
}
