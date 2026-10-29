import { KullaniciHatasi } from '@/lib/hata';
import { islemKaydet, oturumRolu } from '@/lib/oturum';
import { puanSablonuSatirlari } from '@/lib/sinav-yonetim';
import { xlsxYaz } from '@/lib/xlsx-yaz';

/** GET /yonetim/puan-sablonu — sınav listesindeki öğrencilerle puan şablonu (yalnızca yönetim). */
export async function GET() {
  if ((await oturumRolu()) !== 'admin') return new Response('Yetkisiz', { status: 401 });
  try {
    const satirlar = await puanSablonuSatirlari();
    const veri = await xlsxYaz('Puanlar', satirlar, [14, 22, 18, 10, 10]);
    await islemKaydet('Şablon indirme', `Puan şablonu (${satirlar.length - 1} öğrenci)`);
    return new Response(Buffer.from(veri), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Sinav_Puanlari.xlsx"',
        'X-Ogrenci-Sayisi': String(satirlar.length - 1),
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    if (e instanceof KullaniciHatasi) return new Response(e.message, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    console.error(e);
    return new Response('Şablon hazırlanamadı.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
