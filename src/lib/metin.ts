/** Metin yardımcıları — Apps Script Code.gs'teki normalizeTR_ / basNorm_ / sinifKey_ ile aynı davranış. */

export function normalizeTR(s: unknown): string {
  return (s == null ? '' : String(s)).trim().toUpperCase()
    .replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ç/g, 'C')
    .replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O')
    .replace(/Â/g, 'A').replace(/Ê/g, 'E').replace(/Î/g, 'I').replace(/Ô/g, 'O').replace(/Û/g, 'U');
}

/** Başlık / anahtar karşılaştırması: Türkçe karakter, nokta, alt çizgi ve fazla boşluk temizlenir. */
export function basNorm(s: unknown): string {
  return normalizeTR(s).replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
}

export const SINIF_ONEK = 'HAZIRLIK ';

export function hazirlikMi(ad: string): boolean {
  const n = basNorm(ad);
  return n.startsWith(SINIF_ONEK) && n.length > SINIF_ONEK.length;
}

/** "Hazırlık Özel" → "OZEL" */
export function sinifAnahtari(ad: string): string {
  return basNorm(ad).substring(SINIF_ONEK.length).trim();
}

export function cinsiyetKod(v: unknown): 'K' | 'E' | '' {
  const n = basNorm(v);
  if (['K', 'KIZ', 'KADIN', 'F'].includes(n)) return 'K';
  if (['E', 'ERKEK', 'M'].includes(n)) return 'E';
  return '';
}

export function sinifTuru(v: unknown): 'K' | 'E' | 'Karma' {
  const t = basNorm(v);
  return t === 'K' || t === 'KIZ' ? 'K' : t === 'E' || t === 'ERKEK' ? 'E' : 'Karma';
}

/** "Hayır", "H", "Pasif", "0", "False" → false; diğer her şey (boş dahil) → true */
export function evetMi(v: unknown): boolean {
  return !['HAYIR', 'H', 'PASIF', '0', 'FALSE', 'YANLIS'].includes(basNorm(v));
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Program hücresindeki şube yazımını sınıfla eşleştirir: "A", "A Şubesi", "Hazırlık A", "Özel" vb. */
export function subeEslestir<T extends { ad: string; anahtar: string }>(hucre: string, siniflar: T[]): T | null {
  const h = basNorm(hucre);
  if (!h) return null;
  for (const s of siniflar) if (h === s.anahtar || h === basNorm(s.ad)) return s;
  for (const s of siniflar) {
    if (new RegExp('(^|[^A-Z0-9])' + escRe(s.anahtar) + '($|[^A-Z0-9])').test(h)) return s;
  }
  return null;
}

export const TR_GUN_SIRA: Record<string, number> = { PAZARTESI: 0, SALI: 1, CARSAMBA: 2, PERSEMBE: 3, CUMA: 4, CUMARTESI: 5, PAZAR: 6 };

export function soyadMaskele(soyadi: string): string {
  return String(soyadi || '').split(/\s+/).filter(Boolean).map(w => w.charAt(0) + '***').join(' ');
}
