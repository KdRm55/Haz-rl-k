import './ogrenci.css';
import { OgrenciEkrani, OgrenciGiris, OgrenciSifre } from '@/components/ogrenci/SorgulamaEkrani';
import { genelDuyurular, ogrenciAra } from '@/lib/ogrenci';
import { oturum } from '@/lib/oturum';
import type { Duyuru, SorguSonucu } from '@/lib/tipler';

// Duyurular ve öğrenci bilgileri her istekte güncel okunur.
export const dynamic = 'force-dynamic';

export default async function OgrenciSayfasi() {
  let duyurular: Duyuru[] = [];
  try { duyurular = await genelDuyurular(); } catch (e) { console.error(e); }
  const o = await oturum().catch(() => null);
  if (!o || o.tur !== 'ogrenci') return <OgrenciGiris duyurular={duyurular} />;
  if (o.sifreDegistirmeli) return <OgrenciSifre duyurular={duyurular} />;
  let sonuc: SorguSonucu;
  try {
    // Kimlik hesap açılırken doğrulandı: öğrenci yalnızca kendi bilgilerini görür
    sonuc = await ogrenciAra(o.ogrenciNo, '', true, true);
  } catch (e) {
    console.error(e);
    sonuc = { bulundu: false, mesaj: 'Bilgilerin okunamadı. Birkaç saniye sonra sayfayı yenile.' };
  }
  if (!sonuc.bulundu) sonuc = { bulundu: false, mesaj: 'Öğrenci kaydın şu an sistemde bulunamadı. İdareye başvur.' };
  return <OgrenciEkrani sonuc={sonuc} duyurular={duyurular} />;
}
