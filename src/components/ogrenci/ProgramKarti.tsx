'use client';

import { useMemo, useState } from 'react';
import { ProgramA4Stil, ProgramCiktiDugmeleri, useProgramCikti, YonSecici } from '@/components/ProgramA4';
import type { ProgramSecenek } from '@/lib/yazdirma/program-a4';
import type { ProgramSatiri } from '@/lib/tipler';
import { bitisDakika, bugunAnahtar, dakika, GUN_ADI, GUN_KISA, GUN_SIRA, programDuzenle, trAnahtar } from './program';

function Ders({ x, tek }: { x: ProgramSatiri; tek: string }) {
  return (
    <div className="dh">
      <div className="dh-ad">{x.ders || 'Ders'}</div>
      {x.hoca && <div className="dh-hoca">{x.hoca}</div>}
      {x.derslik && x.derslik !== tek && <div className="dh-derslik">{x.derslik}</div>}
    </div>
  );
}

/** Sınıfım bölümündeki "Bugün" özeti. */
export function BugunOzet({ program }: { program: ProgramSatiri[] }) {
  if (!program.length) return null;
  const bg = bugunAnahtar();
  const bugunkiler = program.filter(x => trAnahtar(x.gun) === bg).sort((a, b) => dakika(a.saat) - dakika(b.saat));
  if (!bugunkiler.length) {
    return <div className="bugun"><strong>Bugün ({GUN_ADI[bg]}):</strong> <span className="yok">dersin yok.</span></div>;
  }
  const n = new Date(), simdi = n.getHours() * 60 + n.getMinutes();
  const suan = bugunkiler.find(x => dakika(x.saat) <= simdi && simdi < bitisDakika(x.saat));
  const sirada = bugunkiler.find(x => dakika(x.saat) > simdi);
  return (
    <div className="bugun">
      <strong>Bugün ({GUN_ADI[bg]}):</strong> {bugunkiler.length} ders.
      {suan && <><br />Şu an: <strong>{suan.saat}</strong> · {suan.ders || 'Ders'}</>}
      {sirada && <><br />Sıradaki: <strong>{sirada.saat}</strong> · {sirada.ders || 'Ders'}</>}
      {!suan && !sirada && <span className="yok"> Bugünkü derslerin bitti.</span>}
    </div>
  );
}

/** Öğrenci ekranının haftalık programı. kim/alt: A4 çıktının başlığı (sınıf adı kapalıysa öğrencinin adı). */
export function ProgramKarti({ program, sinif, kim, derslik, dosya }: { program: ProgramSatiri[]; sinif: string; kim: string; derslik: string; dosya: string }) {
  const d = useMemo(() => programDuzenle(program), [program]);
  const { yon, setYon, logo } = useProgramCikti();
  const cikti = useMemo<ProgramSecenek>(() => ({
    tur: 'sinif', yon, kim, logo, program, tekDerslik: d.tekDerslik,
    alt: derslik ? 'Derslik ' + (d.tekDerslik || derslik) : '',
    ozet: [program.length + ' ders', new Set(program.map(x => trAnahtar(x.gun))).size + ' gün', d.tekDerslik ? 'Tüm dersler ' + d.tekDerslik + ' dersliğinde' : sinif].filter(Boolean)
  }), [yon, kim, logo, program, d.tekDerslik, derslik, sinif]);
  const bg = bugunAnahtar();
  const [secili, setSecili] = useState(d.gunler.includes(bg) && GUN_SIRA.indexOf(bg) < 5 ? bg : d.gunler[0]);

  if (!program.length) return <div className="bl-bos">Sınıfının ders programı henüz yayınlanmadı.</div>;

  const altBaslik = [sinif, d.tekDerslik ? 'Tüm dersler ' + d.tekDerslik + ' dersliğinde' : ''].filter(Boolean).join(' · ');
  const gunDersleri = d.slotlar.flatMap(sl => d.hucre[secili + '|' + sl] ?? []);

  return (
    <>
      <div className="pk-ust">
        <div>
          <div className="pk-baslik">Haftalık ders programı</div>
          <div className="pk-alt">{altBaslik}</div>
        </div>
        {GUN_SIRA.indexOf(bg) < 5 && d.gunler.includes(bg) && <span className="pk-rozet">Bugün: {GUN_ADI[bg]}</span>}
      </div>
      <ProgramA4Stil />
      <div className="pk-cikti">
        <YonSecici yon={yon} degisti={setYon} />
        <ProgramCiktiDugmeleri o={cikti} ad={dosya} dugmeSinifi="pk-btn" ikincilSinif="pk-btn" durumSinifi="pk-durum" />
      </div>

      {/* Bilgisayar: çizelge */}
      <div className="izgara cizelge-kap">
        <table className="cizelge">
          <thead>
            <tr>
              <th className="saat-bas" />
              {d.gunler.map(g => <th key={g} className={g === bg ? 'bugun-sutun' : undefined}>{GUN_ADI[g]}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.slotlar.map(sl => (
              <tr key={sl}>
                <td className="saat">{d.slotAd[sl]}</td>
                {d.gunler.map(g => {
                  const l = d.hucre[g + '|' + sl];
                  return l
                    ? <td key={g} className={'ders-h' + (g === bg ? ' bugun-sutun' : '')}>{l.map((x, i) => <Ders key={i} x={x} tek={d.tekDerslik} />)}</td>
                    : <td key={g} className="bos" aria-label="Ders yok" />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Telefon: gün sekmeleri */}
      <div className="gun-sekme">
        <div className="gunler" role="tablist">
          {d.gunler.map(g => (
            <button key={g} type="button" role="tab" aria-label={GUN_ADI[g]} aria-selected={g === secili}
              className={'gun-dugme' + (g === bg ? ' bugun-gun' : '') + (g === secili ? ' secili' : '')} onClick={() => setSecili(g)}>
              {GUN_KISA[g]}<span className="nokta" />
            </button>
          ))}
        </div>
        <div className="gun-liste" role="tabpanel">
          {gunDersleri.length ? gunDersleri.map((x, i) => {
            const alt = [x.hoca, x.derslik && x.derslik !== d.tekDerslik ? x.derslik : ''].filter(Boolean).join(' · ');
            return (
              <div className="gun-ders" key={i}>
                <div className="saat">{x.saat}</div>
                <div><div className="ad">{x.ders || 'Ders'}</div>{alt && <div className="alt">{alt}</div>}</div>
              </div>
            );
          }) : <div className="gun-bos">{GUN_ADI[secili]} günü dersin yok.</div>}
        </div>
      </div>
    </>
  );
}
