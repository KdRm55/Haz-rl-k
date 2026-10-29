import type { Metadata } from 'next';
import { YonetimGiris, YonetimSifre } from '@/components/yonetim/Kabuk';
import { YonetimEkrani } from '@/components/yonetim/YonetimEkrani';
import { kimAdi, oturum } from '@/lib/oturum';
import { panelOzeti } from '@/lib/yonetim';

export const metadata: Metadata = { title: 'Sinop İlahiyat Fakültesi - Yönetim' };

export default async function YonetimSayfasi() {
  const o = await oturum();
  if (!o || o.tur !== 'admin') return <YonetimGiris />;
  if (o.sifreDegistirmeli) return <YonetimSifre />;
  try {
    return <YonetimEkrani ozet={await panelOzeti()} kim={kimAdi(o)} />;
  } catch (e) {
    console.error(e);
    return <YonetimGiris mesaj="Veriler okunamadı. Birkaç saniye sonra sayfayı yenileyin." />;
  }
}
