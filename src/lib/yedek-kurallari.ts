/**
 * Tam yedek biçimi (Apps Script "Tam yedek al" karşılığı): bütün tabloların satırları tek JSON dosyasında.
 * Hem sunucu (yedek indirme) hem geri yükleme betiği kullanır; veritabanı bağlantısı içermez.
 */
import { getTableColumns, getTableName, type Table } from 'drizzle-orm';
import * as s from '../db/schema';

export const YEDEK_SURUM = 1;

/** Geri yüklemede bu sırayla eklenir, ters sırayla silinir (yabancı anahtarlar için). */
export const YEDEK_TABLOLARI: { ad: string; tablo: Table }[] = [
  s.siniflar, s.ogrenciler, s.ayarlar, s.yetkililer, s.kullanicilar, s.erisimKodlari, s.islemKaydi, s.hocaProgrami, s.duyurular, s.sinavSonuclari,
  s.aktarimGecmisi, s.ogrenciDegisiklikleri, s.sinifTaslagi,
  s.donemSinavlari, s.donemSinavDersleri, s.donemSinavOgrencileri, s.donemSinavPuanlari, s.donemSinavYerleri,
  s.sinavYeriListeleri, s.sinavYeriKayitlari, s.yoklamalar, s.yoklamaEvraklari, s.taramaGorselleri
].map(t => ({ ad: getTableName(t), tablo: t }));
/** Geçici kayıtlar yedeğe alınmaz (giriş denemeleri). Tarama görüntüleri isteğe bağlıdır. */
export const GORSEL_TABLOSU = getTableName(s.taramaGorselleri);

export type Yedek = { uygulama: 'hazirlik-sistemi'; surum: number; zaman: string; gorseller: boolean; tablolar: Record<string, Record<string, unknown>[]> };

/** JSON'dan gelen satırları ekleme için hazırlar: zaman damgaları Date'e çevrilir, bilinmeyen alanlar atılır. */
export function satirlariHazirla(tablo: Table, satirlar: Record<string, unknown>[]) {
  const kolonlar = getTableColumns(tablo);
  return satirlar.map(r => {
    const out: Record<string, unknown> = {};
    for (const [k, c] of Object.entries(kolonlar)) {
      if (!(k in r)) continue;
      const v = r[k];
      out[k] = c.columnType === 'PgTimestamp' && typeof v === 'string' ? new Date(v) : v;
    }
    return out;
  });
}

/** Sayaçlı (serial) kolonların sıra adları: geri yüklemeden sonra sıra en büyük değere ilerletilir. */
export function sayacKolonlari(tablo: Table) {
  return Object.values(getTableColumns(tablo)).filter(c => c.columnType === 'PgSerial').map(c => c.name);
}

export function yedekDogrula(v: unknown): Yedek {
  const y = v as Yedek;
  if (!y || y.uygulama !== 'hazirlik-sistemi' || typeof y.tablolar !== 'object') throw new Error('Bu dosya bir Hazırlık Sistemi yedeği değil.');
  if (y.surum > YEDEK_SURUM) throw new Error(`Yedek daha yeni bir sürümle alınmış (sürüm ${y.surum}). Uygulamayı güncelleyin.`);
  return y;
}
