'use client';

import { LogoResmi } from '@/components/Logo';
import { GirisFormu, GirisVeKayit, HF_CSS, HocaKayitFormu, SifreDegistirFormu } from '@/components/HesapFormlari';
import { HOCA_CSS } from './stil';

/** Hoca ekranının üst bandı ve stili (giriş ve çalışma alanı ortak). */
export function HocaKabuk({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HOCA_CSS }} />
      <header className="app-hero">
        <div className="hero-inner">
          <LogoResmi className="hero-logo-resim" alt="Sinop Üniversitesi İlahiyat Fakültesi logosu" />
          <div className="hero-text">
            <div className="hero-inst">T.C. Sinop Üniversitesi</div>
            <h1>Sinop İlahiyat Fakültesi</h1>
            <p>Ders Yoklama Evrakı ve İmza Sirküsü Sistemi</p>
          </div>
        </div>
      </header>
      <div className="container">{children}</div>
    </>
  );
}

export function HocaGiris({ mesaj, hocaAdlari }: { mesaj?: string; hocaAdlari: string[] }) {
  return (
    <HocaKabuk>
      <section className="gate">
        <h2>Öğretim elemanı girişi</h2>
        <p>E-posta adresiniz ve şifrenizle girin. İlk kez kullanıyorsanız hesap oluşturun; yönetici onayladığında giriş yapabilirsiniz.</p>
        <GirisVeKayit giris={<GirisFormu sayfa="hoca" mesaj={mesaj} />} kayit={<HocaKayitFormu hocaAdlari={hocaAdlari} />} />
      </section>
    </HocaKabuk>
  );
}

/** Yöneticinin verdiği geçici şifreyle girildiğinde: önce kendi şifresini belirler. */
export function HocaSifre() {
  return (
    <HocaKabuk>
      <style>{HF_CSS}</style>
      <section className="gate">
        <h2>Şifrenizi belirleyin</h2>
        <SifreDegistirFormu sayfa="hoca" zorunlu />
      </section>
    </HocaKabuk>
  );
}
