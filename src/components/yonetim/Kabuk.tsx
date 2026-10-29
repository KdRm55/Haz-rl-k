'use client';

import { GirisFormu, HF_CSS, SifreDegistirFormu } from '@/components/HesapFormlari';
import { LogoResmi } from '@/components/Logo';
import { YONETIM_CSS } from './stil';

export function YonetimKabuk({ sayac, children }: { sayac?: string; children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: YONETIM_CSS }} />
      <div className="wrap">
        <div className="head">
          <LogoResmi className="logo-resim" alt="Logo" />
          <div className="titles">
            <div className="kurum">Sinop İlahiyat Fakültesi</div>
            <div className="alt">Arapça Hazırlık Programı — Yönetim</div>
          </div>
          {sayac && <div className="sayac">{sayac}</div>}
        </div>
        {children}
      </div>
    </>
  );
}

export function YonetimGiris({ mesaj }: { mesaj?: string }) {
  return (
    <YonetimKabuk>
      <style>{HF_CSS}</style>
      <section className="gate">
        <h2>Yönetici girişi</h2>
        <p>E-posta adresiniz ve şifrenizle girin. Hesabınız yoksa sistemdeki bir yöneticiden isteyin.</p>
        <GirisFormu sayfa="yonetim" mesaj={mesaj} />
      </section>
    </YonetimKabuk>
  );
}

/** Yöneticinin verdiği geçici şifreyle girildiğinde: önce kendi şifresini belirler. */
export function YonetimSifre() {
  return (
    <YonetimKabuk>
      <style>{HF_CSS}</style>
      <section className="gate">
        <h2>Şifrenizi belirleyin</h2>
        <SifreDegistirFormu sayfa="yonetim" zorunlu />
      </section>
    </YonetimKabuk>
  );
}
