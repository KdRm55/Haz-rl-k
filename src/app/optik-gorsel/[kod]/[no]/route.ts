import { YetkiHatasi } from '@/lib/hata';
import { optikGorsel } from '@/lib/optik-yonetim';

/** GET /optik-gorsel/O1/268303044 — optik görüntüsü (yönetici hepsini, öğrenci yalnızca yayınlanmış kendi optiğini görür). */
export async function GET(_istek: Request, ctx: { params: Promise<{ kod: string; no: string }> }) {
  const { kod, no } = await ctx.params;
  try {
    const g = await optikGorsel(kod, no);
    if (!g) return new Response('Görüntü yok', { status: 404 });
    return new Response(new Uint8Array(g.veri), { headers: { 'Content-Type': g.turu, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (e) {
    if (e instanceof YetkiHatasi) return new Response('Yetkisiz', { status: 403 });
    console.error(e);
    return new Response('Görüntü alınamadı', { status: 500 });
  }
}
