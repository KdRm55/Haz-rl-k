'use client';

import { useRef, useState } from 'react';
import { GirisFormu, GirisVeKayit, HesapCubugu, HF_CSS, KvkkOnayFormu, OgrenciKayitFormu, SifreDegistirFormu } from '@/components/HesapFormlari';
import { Logo } from '@/components/Logo';
import type { Duyuru, SorguSonucu } from '@/lib/tipler';
import { DuyuruListesi } from './DuyuruListesi';
import { BugunOzet, ProgramKarti } from './ProgramKarti';
import { Devamsizlik } from './Devamsizlik';
import { Sinavlarim, sinavListesi } from './Sinavlarim';

type Bulunan = Extract<SorguSonucu, { bulundu: true }>;
type Bolum = 'sinif' | 'program' | 'sinav' | 'devamsizlik';

const mobilMi = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 899px)').matches;

function Sinifim({ r }: { r: Bulunan }) {
  if (r.tur === 'sinif') {
    const g = r.gorunum;
    const dy = <DuyuruListesi liste={r.duyurular} baslik="Sınıfına özel duyurular" />;
    if (!g.sinif && !g.derslik) return r.duyurular.length ? <><div className="bl-baslik">Duyurular</div>{dy}</> : null;
    return (
      <>
        <div className="bl-baslik">Sınıfım</div>
        <div className="info-row">
          {g.sinif && <div className="info-item sinif"><div className="info-label">Sınıf</div><div className="info-value">{r.sinif}</div></div>}
          {g.derslik && <div className="info-item derslik"><div className="info-label">Derslik</div><div className="info-value">{r.derslik}</div></div>}
        </div>
        <BugunOzet program={r.program} />
        {dy}
      </>
    );
  }
  if (r.tur === 'muaf') {
    return (
      <>
        <div className="bl-baslik">Durumum</div>
        <div className="bl-durum muaf">
          <div className="durum-mesaj">Hazırlık sınıfından muafsın.</div>
          <div className="durum-alt">Muafiyet sınavını başarıyla geçtin. Bölüm derslerine ilişkin duyuruları takip et.</div>
        </div>
        <DuyuruListesi liste={r.duyurular} baslik="Sana özel duyurular" />
      </>
    );
  }
  return (
    <>
      <div className="bl-baslik">Sınıfım</div>
      <div className="bl-durum">
        <div className="durum-mesaj">{r.sinav?.sonuc === 'Hazırlık' ? 'Hazırlık sınıfına devam edeceksin.' : 'Kaydın alındı.'}</div>
        <div className="durum-alt">Sınıfın henüz belirlenmedi. Sınıf listeleri açıklandığında sınıfını ve dersliğini burada göreceksin.</div>
      </div>
      <DuyuruListesi liste={r.duyurular} baslik="Sana özel duyurular" />
    </>
  );
}

function bolumler(r: Bulunan): { ad: Bolum; et: string; sayi?: number }[] {
  const b: { ad: Bolum; et: string; sayi?: number }[] = [];
  const g = r.gorunum;
  if (r.tur === 'sinif') {
    if (g.sinif || g.derslik || r.duyurular.length) b.push({ ad: 'sinif', et: g.sinif || g.derslik ? 'Sınıfım' : 'Duyurular' });
    if (g.program) b.push({ ad: 'program', et: 'Ders programım' });
  } else if (r.tur !== 'sinavyeri') b.push({ ad: 'sinif', et: r.tur === 'muaf' ? 'Durumum' : 'Sınıfım' });
  const sn = sinavListesi(r).length;
  if (sn) b.push({ ad: 'sinav', et: 'Sınavlarım', sayi: sn });
  if (r.tur === 'sinif' && r.devamsizlik && g.devamsizlik) b.push({ ad: 'devamsizlik', et: 'Devamsızlık' });
  return b;
}

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
  const r = sonuc.bulundu ? sonuc : null;
  const liste = r ? bolumler(r) : [];
  const [acik, setAcik] = useState<Bolum | null>(liste[0]?.ad ?? null);
  const kartRef = useRef<HTMLElement>(null);
  const ikiSutun = !!r && liste.length > 0;

  function bolumSec(b: Bolum) {
    setAcik(b);
    if (mobilMi()) setTimeout(() => kartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  return (
    <div className={'sayfa' + (ikiSutun ? ' iki' : '')}>
      <main className="card">
        <Ust duyurular={duyurular} />
        <div className="result show" aria-live="polite">
          {r ? (
            <div className={'result-box ' + (r.tur === 'sinif' ? 'ok' : r.tur === 'muaf' ? 'muaf' : 'bekliyor')}>
              <div className="result-name">{r.adSoyad}</div>
              <div className="result-no">No: {r.numara}</div>
              {r.tur === 'sinif' && (r.gorunum.sinif || r.gorunum.derslik) && (
                <div className="bl-ozet">
                  {r.gorunum.sinif && <span><b>{r.sinif}</b></span>}
                  {r.gorunum.derslik && <span>Derslik <b>{r.derslik}</b></span>}
                </div>
              )}
              {r.tur === 'muaf' && <div className="bl-ozet"><span><b>Muaf</b></span></div>}
              {r.tur === 'bekliyor' && <div className="bl-ozet"><span>Sınıfın henüz belirlenmedi</span></div>}
              {r.tur === 'sinavyeri' && liste.length > 0 && <div className="bl-ozet"><span>Sınav giriş bilgilerin</span></div>}
              {liste.length > 1 && (
                <div className="bl-nav" role="tablist" aria-label="Bölümler">
                  {liste.map(b => (
                    <button key={b.ad} type="button" role="tab" aria-selected={acik === b.ad}
                      className={'bl-dugme' + (acik === b.ad ? ' secili' : '')} onClick={() => bolumSec(b.ad)}>{b.et}{b.sayi ? <> <span className="bl-sayi">{b.sayi}</span></> : null}</button>
                  ))}
                </div>
              )}
              {!liste.length && <div className="bl-bilgi-yok">Şu an gösterilecek bilgi bulunmuyor. Bilgiler açıklandığında burada göreceksin.</div>}
            </div>
          ) : (
            <div className="result-box err"><div className="err-text">{sonuc.bulundu ? '' : sonuc.mesaj || 'Bilgilerin okunamadı.'}</div></div>
          )}
        </div>
        <HesapCubugu sayfa="ogrenci" kim={r?.adSoyad || 'Öğrenci'} />
      </main>

      {ikiSutun && r && (
        <section className="card program-kart" ref={kartRef} aria-label="Ayrıntılar">
          {acik === 'sinif' && <Sinifim r={r} />}
          {acik === 'program' && r.tur === 'sinif' && <ProgramKarti program={r.program} sinif={r.gorunum.sinif ? r.sinif : ''} kim={r.gorunum.sinif ? r.sinif : r.adSoyad}
            derslik={r.gorunum.derslik ? r.derslik : ''} dosya={'Ders Programı - ' + (r.gorunum.sinif && r.sinif ? r.sinif : r.numara)} />}
          {acik === 'sinav' && <Sinavlarim key={r.numara} r={r} liste={sinavListesi(r)} />}
          {acik === 'devamsizlik' && r.tur === 'sinif' && <Devamsizlik d={r.devamsizlik} />}
        </section>
      )}
    </div>
  );
}
