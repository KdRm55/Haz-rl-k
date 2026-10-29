import type { Metadata } from 'next';
import { HocaEkrani } from '@/components/hoca/HocaEkrani';
import { HocaGiris, HocaSifre } from '@/components/hoca/Kabuk';
import { hocaAdlari, hocaBaslangic } from '@/lib/hoca';
import { kimAdi, oturum, SAYFA_ROLLERI } from '@/lib/oturum';

export const metadata: Metadata = { title: 'Sinop İlahiyat Fakültesi | Ders Yoklama Evrakı' };

export default async function HocaSayfasi() {
  const o = await oturum();
  if (!o || !SAYFA_ROLLERI.hoca.includes(o.tur)) return <HocaGiris hocaAdlari={await hocaAdlari().catch(() => [])} />;
  if (o.sifreDegistirmeli) return <HocaSifre />;
  try {
    return <HocaEkrani b={await hocaBaslangic()} kim={kimAdi(o)} />;
  } catch (e) {
    console.error(e);
    return <HocaGiris mesaj="Veriler okunamadı. Birkaç saniye sonra sayfayı yenileyin." hocaAdlari={[]} />;
  }
}
