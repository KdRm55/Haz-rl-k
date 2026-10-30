/** Kişisel hesap kuralları (saf, test edilebilir): şifre, e-posta, TC son 6 hane, geçici şifre. */
import { KullaniciHatasi } from './hata';

export const SIFRE_EN_AZ = 8;
export const TC_HANE = 6;
/** Veritabanındaki son 6 hane özetinin öneki (tc-ozeti.ts); öneksiz değer eski, açık yazılmış kayıttır. */
export const TC_OZET_ONEK = 'h1:';
export type HesapTuru = 'admin' | 'hoca' | 'ogrenci';
export type HesapDurumu = 'bekliyor' | 'aktif' | 'pasif';
export const TUR_ETIKET: Record<HesapTuru, string> = { admin: 'Yönetici', hoca: 'Öğretim elemanı', ogrenci: 'Öğrenci' };
export const DURUM_ETIKET: Record<HesapDurumu, string> = { bekliyor: 'Onay bekliyor', aktif: 'Etkin', pasif: 'Kapalı' };

export function sifreDenetle(sifre: unknown, tekrar?: unknown): string {
  const s = String(sifre ?? '');
  if (s.length < SIFRE_EN_AZ) throw new KullaniciHatasi(`Şifre en az ${SIFRE_EN_AZ} karakter olmalı.`);
  if (s.length > 128) throw new KullaniciHatasi('Şifre çok uzun.');
  if (/^\d+$/.test(s)) throw new KullaniciHatasi('Şifre yalnızca rakamlardan oluşmamalı.');
  if (tekrar !== undefined && s !== String(tekrar ?? '')) throw new KullaniciHatasi('Şifreler birbirini tutmuyor.');
  return s;
}

export function epostaNorm(v: unknown): string {
  const e = String(v ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 200) throw new KullaniciHatasi('Geçerli bir e-posta adresi yazın.');
  return e;
}

export function adSoyadNorm(v: unknown): string {
  const a = String(v ?? '').trim().replace(/\s+/g, ' ');
  if (a.length < 3) throw new KullaniciHatasi('Adınızı ve soyadınızı yazın.');
  return a.slice(0, 120);
}

/** TC kimlik numarasından (ya da yalnızca son hanelerinden) son 6 hane; yoksa ''. */
export function tcSon6(v: unknown): string {
  const t = String(v ?? '').replace(/\D/g, '');
  return t.length >= TC_HANE ? t.slice(-TC_HANE) : '';
}

/**
 * Öğrencinin yazdığı son 6 hane kayıttakiyle eşleşiyor mu (kayıt boşsa eşleşmez).
 * Kayıt özetliyse yazılan da aynı anahtarla özetlenip karşılaştırılır (ozetle: tcOzeti).
 */
export function tc6Eslesir(kayit: string, girilen: unknown, ozetle: (son6: string) => string): boolean {
  const g = String(girilen ?? '').replace(/\D/g, '');
  if (!kayit || g.length !== TC_HANE) return false;
  return kayit.startsWith(TC_OZET_ONEK) ? ozetle(g) === kayit : g === kayit;
}

/**
 * Hesap açarken yazılan son 6 hane öğrenci kaydıyla çelişiyor mu?
 * Kayıtta son 6 varsa tam eşleşmeli; yalnızca son 4 varsa yazılanın son 4 hanesi tutmalı; hiçbiri yoksa kabul edilir.
 */
export function tcKayitlaUyumlu(kayit: { tc6: string; tc4: string }, girilen: unknown, ozetle: (son6: string) => string): boolean {
  const g = String(girilen ?? '').replace(/\D/g, '');
  if (g.length !== TC_HANE) return false;
  if (kayit.tc6) return tc6Eslesir(kayit.tc6, g, ozetle);
  if (kayit.tc4) return g.endsWith(kayit.tc4);
  return true;
}

/** Geçici şifre: karışan harfler (I, O, 0, 1, l) yok. rastgele: 0 ≤ r < uzunluk tam sayı üretir. */
export function geciciSifre(rastgele: (n: number) => number, uzunluk = 10): string {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < uzunluk; i++) s += A[rastgele(A.length)];
  // en az bir rakam ve bir harf içersin
  return /\d/.test(s) && /[A-Za-z]/.test(s) ? s : geciciSifre(rastgele, uzunluk);
}
