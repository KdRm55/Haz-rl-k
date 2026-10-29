import { YetkiHatasi } from '@/lib/hata';
import { oturumRolu } from '@/lib/oturum';
import { yedekAl } from '@/lib/yedek';

/** GET /yonetim/yedek[?gorsel=1] — bütün verilerin JSON yedeği (yalnızca yönetim). */
export async function GET(req: Request) {
  if ((await oturumRolu()) !== 'admin') return new Response('Yetkisiz', { status: 401 });
  try {
    const gorsel = new URL(req.url).searchParams.get('gorsel') === '1';
    const y = await yedekAl(gorsel);
    const tarih = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' }).format(new Date()).replace(/[: ]/g, '-');
    return new Response(JSON.stringify(y), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="Hazirlik_Yedek_${tarih}.json"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    if (e instanceof YetkiHatasi) return new Response('Yetkisiz', { status: 401 });
    console.error(e);
    return new Response('Yedek alınamadı.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
