import { KullaniciHatasi } from '@/lib/hata';
import { islemKaydet, oturumRolu } from '@/lib/oturum';
import { sablonDosyasi } from '@/lib/sablon';

/** GET /yonetim/sablon?dolu=1 — öğrenci listesi şablonu (yalnızca yönetim). */
export async function GET(req: Request) {
  if ((await oturumRolu()) !== 'admin') return new Response('Yetkisiz', { status: 401 });
  const dolu = new URL(req.url).searchParams.get('dolu') === '1';
  try {
    const s = await sablonDosyasi(dolu);
    await islemKaydet('Şablon indirme', dolu ? s.sayi + ' aktif öğrenciyle dolu şablon' : 'Boş şablon');
    return new Response(Buffer.from(s.veri), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${s.ad}"`,
        'X-Ogrenci-Sayisi': String(s.sayi),
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    if (e instanceof KullaniciHatasi) return new Response(e.message, { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    console.error(e);
    return new Response('Şablon hazırlanamadı.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
