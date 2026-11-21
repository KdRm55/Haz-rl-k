import { YetkiHatasi } from '@/lib/hata';
import { optikKitapcikPdf } from '@/lib/optik-yonetim';

/** GET /optik-kitapcik/O1/B — soru kitapçığı PDF'i (yönetici hepsini, öğrenci yalnızca yayınlanmış kendi kitapçığını görür). */
export async function GET(istek: Request, ctx: { params: Promise<{ kod: string; kitapcik: string }> }) {
  const { kod, kitapcik } = await ctx.params;
  const indir = new URL(istek.url).searchParams.has('indir');   // ?indir=1 → tarayıcı açmak yerine indirir
  try {
    const p = await optikKitapcikPdf(kod, kitapcik);
    if (!p) return new Response('Kitapçık yok', { status: 404 });
    const ad = (p.ad || `Kitapcik_${kitapcik}.pdf`).replace(/[^\w.\- ]+/g, '_');
    return new Response(new Uint8Array(p.veri), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `${indir ? 'attachment' : 'inline'}; filename="${ad}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  } catch (e) {
    if (e instanceof YetkiHatasi) return new Response('Yetkisiz', { status: 403 });
    console.error(e);
    return new Response('Kitapçık alınamadı', { status: 500 });
  }
}
