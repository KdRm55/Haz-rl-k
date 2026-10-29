/**
 * Öğrenci listesi şablonu indirme (Apps Script Sablon.gs karşılığı).
 * Dolu şablonda aktif öğrenciler şablonun XML'ine doğrudan yazılır; böylece açılır liste (K/E),
 * renkli hata uyarıları, sütun açıklamaları ve metin biçimi korunur. TC sütunu boş gelir.
 */
import 'server-only';
import JSZip from 'jszip';
import { asc, and, eq } from 'drizzle-orm';
import { vt, schema } from '@/db';
import { KullaniciHatasi } from './hata';
import { SABLON_B64 } from './sablon-veri';
import { sablonXmlDoldur } from './sablon-xml';

export async function sablonDosyasi(dolu: boolean): Promise<{ ad: string; veri: Uint8Array; sayi: number }> {
  const bos = Buffer.from(SABLON_B64, 'base64');
  if (!dolu) return { ad: 'Ogrenci_Listesi_Sablonu.xlsx', veri: new Uint8Array(bos), sayi: 0 };
  const kayitlar = await vt().select().from(schema.ogrenciler)
    .where(and(eq(schema.ogrenciler.kayitli, true), eq(schema.ogrenciler.durum, 'aktif'))).orderBy(asc(schema.ogrenciler.no));
  if (!kayitlar.length) throw new KullaniciHatasi('Sistemde henüz aktif öğrenci yok. Boş şablonu indirip doldurun.');
  const satirlar = kayitlar.map(r => [r.no, r.adi, r.soyadi, r.cinsiyet, '', r.bolum, r.eposta, r.telefon]);
  const zip = await JSZip.loadAsync(bos);
  const ad = Object.keys(zip.files).find(n => /(^|\/)xl\/worksheets\/sheet1\.xml$/.test(n));
  if (!ad) throw new KullaniciHatasi('Şablon okunamadı: çalışma sayfası bulunamadı.');
  zip.file(ad, sablonXmlDoldur(await zip.file(ad)!.async('string'), satirlar));
  const tarih = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  return { ad: `Ogrenci_Listesi_${tarih}.xlsx`, veri: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), sayi: kayitlar.length };
}
