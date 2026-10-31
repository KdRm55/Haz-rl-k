'use client';

/**
 * Giriş yapmış öğrencinin paneli: üst şerit, "Bugün" ana sayfası (sıradaki ders, yaklaşan sınav, devamsızlık özeti, duyurular)
 * ve bölümler. Telefonda bölümler alttaki sekme çubuğundan, bilgisayarda soldaki menüden açılır.
 */
import { useEffect, useMemo, useState } from 'react';
import { HesapCubugu, HF_CSS } from '@/components/HesapFormlari';
import { LogoResmi } from '@/components/Logo';
import type { DevamsizlikOzeti, Duyuru, ProgramSatiri } from '@/lib/tipler';
import { Devamsizlik } from './Devamsizlik';
import { DuyuruListesi } from './DuyuruListesi';
import { bitisDakika, dakika, GUN_ADI, GUN_SIRA, trAnahtar } from './program';
import { ProgramKarti } from './ProgramKarti';
import { type Bulunan, type SinavOgesi, sinavListesi } from './sinav-listesi';
import { Sinavlarim } from './Sinavlarim';

type Bolum = 'bugun' | 'program' | 'sinav' | 'devamsizlik';

/* ---------- Simgeler (çizgi, 24'lük) ---------- */
const Simge = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const SIMGE: Record<Bolum, string> = {
  bugun: 'M4 11l8-7 8 7M6 9.5V20h4v-5h4v5h4V9.5',
  program: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  sinav: 'M8 4h8l3 3v13H5V4h3M9 11h6M9 15h6M9 7h3',
  devamsizlik: 'M5 20V10M12 20V4M19 20v-7'
};

/* ---------- Bugün: sıradaki ders ---------- */
const dkYaz = (n: number) => (n < 60 ? `${n} dk` : n % 60 ? `${Math.floor(n / 60)} sa ${n % 60} dk` : `${n / 60} saat`);

function useSimdi() {
  const [t, setT] = useState<Date | null>(null);
  useEffect(() => { setT(new Date()); const i = setInterval(() => setT(new Date()), 60_000); return () => clearInterval(i); }, []);
  return t;
}

function BugunKarti({ program, derslik }: { program: ProgramSatiri[]; derslik: string }) {
  const simdi = useSimdi();
  if (!simdi || !program.length) return null;
  const gunNo = (simdi.getDay() + 6) % 7, dk = simdi.getHours() * 60 + simdi.getMinutes();
  const gunun = (g: number) => program.filter(x => trAnahtar(x.gun) === GUN_SIRA[g]).sort((a, b) => dakika(a.saat) - dakika(b.saat));
  const bugun = gunun(gunNo);
  const suan = bugun.find(x => dakika(x.saat) <= dk && dk < bitisDakika(x.saat));
  const sirada = bugun.find(x => dakika(x.saat) > dk);
  const odak = suan ?? sirada;
  // Bugün ders kalmadıysa sonraki ders günü
  let sonraki: { gun: string; ders: ProgramSatiri } | null = null;
  if (!odak) for (let i = 1; i <= 7 && !sonraki; i++) { const l = gunun((gunNo + i) % 7); if (l.length) sonraki = { gun: i === 1 ? 'Yarın' : GUN_ADI[GUN_SIRA[(gunNo + i) % 7]], ders: l[0] }; }
  const ders = odak ?? sonraki?.ders;
  if (!ders) return null;
  const etiket = suan ? 'Şu an derstesin' : sirada ? `Sıradaki ders · ${dkYaz(dakika(sirada.saat) - dk)} sonra` : `${sonraki!.gun} ilk dersin`;
  const yer = ders.derslik || derslik;
  return (
    <section className="op-bugun" aria-label="Bugün">
      <div className="op-bugun-ust"><span className={'op-etiket' + (suan ? ' canli' : '')}>{etiket}</span>
        <span className="op-gun">{GUN_ADI[GUN_SIRA[gunNo]]}</span></div>
      <div className="op-ders-ad">{ders.ders || 'Ders'}</div>
      <div className="op-ders-alt">{[ders.saat, yer && 'Derslik ' + yer].filter(Boolean).join(' · ')}</div>
      {ders.hoca && <div className="op-ders-hoca">{ders.hoca}</div>}
      {bugun.length > 0 && (
        <div className="op-gunluk">{bugun.map((x, i) => {
          const bitti = bitisDakika(x.saat) <= dk, aktif = x === odak;
          return <div key={i} className={'op-gunluk-oge' + (bitti ? ' bitti' : '') + (aktif ? ' aktif' : '')}>
            <b>{x.saat.split(/\s*[-–]\s*/)[0]}</b><span>{x.ders || 'Ders'}</span>{bitti && <i>bitti</i>}</div>;
        })}</div>
      )}
      {!bugun.length && <div className="op-not">Bugün dersin yok.</div>}
    </section>
  );
}

/* ---------- Özet kartları ---------- */
const GUN_MS = 86_400_000;
function SinavOzeti({ liste, ac }: { liste: SinavOgesi[]; ac: () => void }) {
  const simdi = useSimdi();
  const s = liste.find(x => !x.gecti);
  if (!s || !simdi) return null;
  const bugun0 = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate()).getTime();
  const gun = s.t != null ? Math.round((s.t - bugun0) / GUN_MS) : null;
  const yer = s.tip === 'muafiyet' ? null : s.yer;
  return (
    <button type="button" className="op-ozet" onClick={ac}>
      <span className="op-ozet-et">Yaklaşan sınav</span>
      <span className="op-ozet-deger">{gun == null ? s.ad : gun <= 0 ? 'Bugün' : gun === 1 ? 'Yarın' : `${gun} gün`}</span>
      <span className="op-ozet-alt">{gun == null ? 'Ayrıntılar için dokun' : s.ad}{yer?.salon ? ` · ${yer.salon}${yer.sira ? ', sıra ' + yer.sira : ''}` : ''}</span>
    </button>
  );
}

function devamsizlikOzeti(d: DevamsizlikOzeti | null | undefined) {
  if (!d?.dersler.length) return null;
  const toplam = d.dersler.reduce((t, x) => t + x.yokSaat, 0);
  const riskli = d.dersler.filter(x => x.durum).sort((a, b) => (a.durum === 'asti' ? 0 : 1) - (b.durum === 'asti' ? 0 : 1) || (a.sinir! - a.yokSaat) - (b.sinir! - b.yokSaat))[0];
  return { toplam, riskli, durum: d.dersler.some(x => x.durum === 'asti') ? 'asti' : riskli ? 'yakin' : '' };
}

function DevamsizlikKarti({ d, ac }: { d: DevamsizlikOzeti | null | undefined; ac: () => void }) {
  const o = devamsizlikOzeti(d);
  if (!o) return null;
  const alt = o.riskli ? (o.riskli.durum === 'asti' ? `${o.riskli.ders}: sınırı aştın` : `${o.riskli.ders}: ${Math.max(0, o.riskli.sinir! - o.riskli.yokSaat)} saat hakkın kaldı`)
    : o.toplam ? 'Bütün derslerde sınırın altındasın' : 'Tam katılım, böyle devam';
  return (
    <button type="button" className={'op-ozet' + (o.durum ? ' ' + o.durum : '')} onClick={ac}>
      <span className="op-ozet-et">Devamsızlık</span>
      <span className="op-ozet-deger">{o.toplam} saat</span>
      <span className="op-ozet-alt">{alt}</span>
    </button>
  );
}

/* ---------- Durum (sınıfı olmayanlar) ---------- */
function DurumKarti({ r }: { r: Bulunan }) {
  if (r.tur === 'muaf') return <div className="op-durum muaf"><b>Hazırlık sınıfından muafsın.</b><span>Muafiyet sınavını başarıyla geçtin. Bölüm derslerine ilişkin duyuruları takip et.</span></div>;
  if (r.tur === 'bekliyor') return <div className="op-durum"><b>{r.sinav?.sonuc === 'Hazırlık' ? 'Hazırlık sınıfına devam edeceksin.' : 'Kaydın alındı.'}</b><span>Sınıfın henüz belirlenmedi. Sınıf listeleri açıklandığında sınıfını ve dersliğini burada göreceksin.</span></div>;
  if (r.tur === 'sinavyeri') return <div className="op-durum"><b>Sınav giriş bilgilerin</b><span>Sınav yerini ve sıra numaranı Sınavlar bölümünde bulabilirsin.</span></div>;
  return null;
}

/* ---------- Panel ---------- */
export function OgrenciPaneli({ r, duyurular }: { r: Bulunan; duyurular: Duyuru[] }) {
  const g = r.gorunum, sinifta = r.tur === 'sinif';
  const sinavlar = useMemo(() => sinavListesi(r), [r]);
  const bolumler = useMemo(() => {
    const b: { ad: Bolum; et: string; sayi?: number }[] = [{ ad: 'bugun', et: sinifta ? 'Bugün' : 'Durumum' }];
    if (sinifta && g.program) b.push({ ad: 'program', et: 'Program' });
    if (sinavlar.length) b.push({ ad: 'sinav', et: 'Sınavlar', sayi: sinavlar.filter(x => !x.gecti).length || undefined });
    if (sinifta && r.devamsizlik && g.devamsizlik) b.push({ ad: 'devamsizlik', et: 'Devamsızlık' });
    return b;
  }, [r, g, sinifta, sinavlar]);
  const [acik, setAcik] = useState<Bolum>('bugun');
  const sec = (b: Bolum) => { setAcik(b); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const ad = r.adSoyad.split(' ')[0]?.toLocaleLowerCase('tr-TR').replace(/^./, c => c.toLocaleUpperCase('tr-TR')) || '';
  const sinifAd = sinifta && g.sinif ? r.sinif : '', derslik = sinifta && g.derslik ? r.derslik : '';
  const program = sinifta && g.program ? r.program : [];
  const menu = bolumler.length > 1;

  return (
    <div className={'op' + (menu ? ' menulu' : '')}>
      <style>{HF_CSS}</style>
      {menu && (
        <nav className="op-menu" aria-label="Bölümler">
          <div className="op-marka"><LogoResmi className="op-marka-logo" alt="" /><span>Arapça Hazırlık<br /><small>Sinop İlahiyat Fakültesi</small></span></div>
          {bolumler.map(b => (
            <button key={b.ad} type="button" className={'op-sekme' + (acik === b.ad ? ' secili' : '')} aria-current={acik === b.ad ? 'page' : undefined} onClick={() => sec(b.ad)}>
              <Simge d={SIMGE[b.ad]} /><span className="op-sekme-ad">{b.et}</span>{b.sayi ? <span className="op-sayi">{b.sayi}</span> : null}
            </button>
          ))}
        </nav>
      )}

      <main className="op-ana">
        <header className="op-ust">
          <div className="op-logo"><LogoResmi className="op-logo-img" alt="Sinop İlahiyat Fakültesi logosu" /></div>
          <div className="op-kim">
            <div className="op-merhaba">Merhaba {ad}</div>
            <div className="op-cipler">
              <span className="op-no">No {r.numara}</span>
              {sinifAd && <span className="op-cip">{sinifAd}</span>}
              {derslik && <span className="op-cip turuncu">Derslik {derslik}</span>}
              {r.tur === 'muaf' && <span className="op-cip yesil">Muaf</span>}
            </div>
          </div>
        </header>

        {acik === 'bugun' && (
          <div className="op-izgara">
            {sinifta ? <BugunKarti program={program} derslik={derslik} /> : <DurumKarti r={r} />}
            <div className="op-ozetler">
              <SinavOzeti liste={sinavlar} ac={() => sec('sinav')} />
              {sinifta && g.devamsizlik && <DevamsizlikKarti d={r.devamsizlik} ac={() => sec('devamsizlik')} />}
            </div>
            {sinifta && !program.length && !g.sinif && !g.derslik && !r.duyurular.length && !duyurular.length && <div className="bl-bos">Şu an gösterilecek bilgi bulunmuyor. Bilgiler açıklandığında burada göreceksin.</div>}
            {(r.duyurular.length > 0 || duyurular.length > 0) && (
              <section className="op-kart">
                <div className="op-kart-baslik">Duyurular</div>
                <DuyuruListesi liste={r.duyurular} baslik={sinifta ? 'Sınıfına özel duyurular' : 'Sana özel duyurular'} />
                <DuyuruListesi liste={duyurular} baslik="Genel duyurular" />
              </section>
            )}
          </div>
        )}
        {acik === 'program' && sinifta && (
          <section className="op-kart program-kart">
            <ProgramKarti program={r.program} sinif={sinifAd} kim={sinifAd || r.adSoyad} derslik={derslik} dosya={'Ders Programı - ' + (sinifAd || r.numara)} />
          </section>
        )}
        {acik === 'sinav' && <section className="op-kart"><Sinavlarim key={r.numara} r={r} liste={sinavlar} /></section>}
        {acik === 'devamsizlik' && sinifta && <section className="op-kart"><Devamsizlik d={r.devamsizlik} /></section>}

        <div className="op-hesap"><HesapCubugu sayfa="ogrenci" kim={r.adSoyad} butonSinifi="op-cikis" /></div>
      </main>
    </div>
  );
}
