'use client';

import { GirisFormu, GirisVeKayit, HesapCubugu, HF_CSS, KvkkOnayFormu, OgrenciKayitFormu, SifreDegistirFormu } from '@/components/HesapFormlari';
import { Logo } from '@/components/Logo';
import type { Duyuru, SorguSonucu } from '@/lib/tipler';
import { DuyuruListesi } from './DuyuruListesi';
import { OgrenciPaneli } from './OgrenciPaneli';

function Ust({ duyurular }: { duyurular: Duyuru[] }) {
  return (
    <>
      <Logo />
      <div className="kurum">Sinop İlahiyat Fakültesi</div>
      <div className="kurum-alt">Arapça Hazırlık Programı</div>
      <div className="divider" />
      <DuyuruListesi liste={duyurular} baslik="Duyurular" />
    </>
  );
}

/** Giriş yapmamış öğrenci: giriş ya da hesap oluşturma (öğrenci no + TC son 6 hane). */
export function OgrenciGiris({ duyurular }: { duyurular: Duyuru[] }) {
  return (
    <div className="sayfa">
      <main className="card">
        <Ust duyurular={duyurular} />
        <h1>Öğrenci girişi</h1>
        <p className="subtitle">Sınıfını, ders programını, sınavlarını ve devamsızlığını görmek için hesabınla gir. İlk kez kullanıyorsan önce hesap oluştur.</p>
        <GirisVeKayit giris={<GirisFormu sayfa="ogrenci" />} kayit={<OgrenciKayitFormu />} />
      </main>
    </div>
  );
}

/** Güncel KVKK metnini onaylamamış öğrenci: onay vermeden ekrana geçemez. */
export function OgrenciKvkk() {
  return (
    <div className="sayfa">
      <main className="card">
        <Logo />
        <div className="kurum">Sinop İlahiyat Fakültesi</div>
        <div className="kurum-alt">Arapça Hazırlık Programı</div>
        <div className="divider" />
        <h1>Devam etmeden önce</h1>
        <p className="subtitle">Bilgilerini nasıl koruduğumuzu okuyup onayını vermen gerekiyor. Metin değişmedikçe bu yalnızca bir kez sorulur.</p>
        <style>{HF_CSS}</style>
        <KvkkOnayFormu />
      </main>
    </div>
  );
}

/** Yöneticinin verdiği geçici şifreyle girildiğinde: önce kendi şifresini belirler. */
export function OgrenciSifre({ duyurular }: { duyurular: Duyuru[] }) {
  return (
    <div className="sayfa">
      <main className="card">
        <Ust duyurular={duyurular} />
        <h1>Şifreni belirle</h1>
        <style>{HF_CSS}</style>
        <SifreDegistirFormu sayfa="ogrenci" zorunlu />
      </main>
    </div>
  );
}

/** Giriş yapmış öğrencinin ekranı. */
export function OgrenciEkrani({ sonuc, duyurular }: { sonuc: SorguSonucu; duyurular: Duyuru[] }) {
  if (sonuc.bulundu) return <OgrenciPaneli r={sonuc} duyurular={duyurular} />;
  return (
    <div className="sayfa">
      <main className="card">
        <Ust duyurular={duyurular} />
        <div className="result show"><div className="result-box err"><div className="err-text">{sonuc.mesaj || 'Bilgilerin okunamadı.'}</div></div></div>
        <HesapCubugu sayfa="ogrenci" kim="Öğrenci" />
      </main>
    </div>
  );
}
