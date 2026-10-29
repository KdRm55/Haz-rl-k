'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HesapCubugu } from '@/components/HesapFormlari';
import { panelOzetiIslemi } from '@/app/yonetim/islemler';
import { AktarimSekmesi } from './AktarimSekmesi';
import { AyarlarSekmesi } from './AyarlarSekmesi';
import { DonemSekmesi } from './DonemSekmesi';
import { DuyurularSekmesi } from './DuyurularSekmesi';
import { GorunumSekmesi } from './GorunumSekmesi';
import { HesaplarSekmesi } from './HesaplarSekmesi';
import { YonetimKabuk } from './Kabuk';
import { KontrolSekmesi } from './KontrolSekmesi';
import { OgrencilerSekmesi } from './OgrencilerSekmesi';
import { OturumDustu } from './ortak';
import { ProgramSekmesi } from './ProgramSekmesi';
import { SinavSekmesi } from './SinavSekmesi';
import { SinavYeriSekmesi } from './SinavYeriSekmesi';
import { SinifDegisimSekmesi } from './SinifDegisimSekmesi';
import { SiniflarSekmesi } from './SiniflarSekmesi';
import { SinifOlusturmaSekmesi } from './SinifOlusturmaSekmesi';
import { YoklamaSekmesi } from './YoklamaSekmesi';

const SEKMELER = [
  ['ogrenci', 'Öğrenci listesi'], ['aktarim', 'Liste yükle'], ['sinav', 'Sınav ve muafiyet'], ['olustur', 'Sınıf oluşturma'], ['degisim', 'Sınıf değişikliği'], ['donem', 'Dönem sınavları'], ['syer', 'Sınav yerleri'], ['yoklama', 'Yoklama'], ['sinif', 'Sınıflar'], ['program', 'Ders programı'],
  ['duyuru', 'Duyurular'], ['ogrgor', 'Öğrenci ekranı'], ['hesap', 'Kullanıcılar'], ['ayar', 'Ayarlar'], ['kontrol', 'Sistem kontrolü']
] as const;
type Sekme = (typeof SEKMELER)[number][0];

export function YonetimEkrani({ ozet, kim }: { ozet: { ogrenci: number; sinif: number }; kim: string }) {
  const router = useRouter();
  const [sekme, setSekme] = useState<Sekme>('ogrenci');
  const [sayi, setSayi] = useState(ozet);
  const dustu = useCallback(() => router.refresh(), [router]);

  // Öğrenci ve sınıf değişikliklerinden sonra başlıktaki sayaç güncellenir
  const ozetYenile = useCallback(async () => {
    const r = await panelOzetiIslemi();
    if (r.ok) setSayi(r.veri); else if (r.yetkisiz) dustu();
  }, [dustu]);
  useEffect(() => { setSayi(ozet); }, [ozet]);

  return (
    <OturumDustu.Provider value={dustu}>
      <YonetimKabuk sayac={`${sayi.ogrenci} öğrenci · ${sayi.sinif} sınıf`}>
        <div className="tabs" role="tablist">
          {SEKMELER.map(([k, et]) => (
            <button key={k} className={'tab' + (sekme === k ? ' active' : '')} type="button" role="tab" aria-selected={sekme === k} onClick={() => setSekme(k)}>{et}</button>
          ))}
        </div>
        {sekme === 'ogrenci' && <OgrencilerSekmesi degisti={ozetYenile} />}
        {sekme === 'aktarim' && <AktarimSekmesi />}
        {sekme === 'sinav' && <SinavSekmesi />}
        {sekme === 'olustur' && <SinifOlusturmaSekmesi degisti={ozetYenile} />}
        {sekme === 'degisim' && <SinifDegisimSekmesi degisti={ozetYenile} />}
        {sekme === 'donem' && <DonemSekmesi />}
        {sekme === 'syer' && <SinavYeriSekmesi />}
        {sekme === 'yoklama' && <YoklamaSekmesi />}
        {sekme === 'sinif' && <SiniflarSekmesi degisti={ozetYenile} />}
        {sekme === 'program' && <ProgramSekmesi />}
        {sekme === 'duyuru' && <DuyurularSekmesi />}
        {sekme === 'ogrgor' && <GorunumSekmesi />}
        {sekme === 'hesap' && <HesaplarSekmesi />}
        {sekme === 'ayar' && <AyarlarSekmesi />}
        {sekme === 'kontrol' && <KontrolSekmesi />}
        <HesapCubugu sayfa="yonetim" kim={kim} butonSinifi="btn btn-secondary" />
      </YonetimKabuk>
    </OturumDustu.Provider>
  );
}
