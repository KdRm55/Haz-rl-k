import { oturumRolu } from '@/lib/oturum';
import { taramaGorseli } from '@/lib/yoklama';

/** GET /yonetim/tarama-gorseli/123 — arşivdeki taranmış sayfa görüntüsü (yalnızca yönetim; kişisel veri, önbelleğe alınmaz). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await oturumRolu()) !== 'admin') return new Response('Yetkisiz', { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response('Bulunamadı', { status: 404 });
  const r = await taramaGorseli(id);
  if (!r) return new Response('Bulunamadı', { status: 404 });
  return new Response(Buffer.from(r.veri, 'base64'), { headers: { 'Content-Type': r.turu, 'Cache-Control': 'private, no-store' } });
}
