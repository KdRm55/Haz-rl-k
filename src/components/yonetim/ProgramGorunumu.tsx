'use client';

/**
 * Yönetim · Ders programı: sınıfın ya da hocanın programını, öğrencinin ve hocanın gördüğü A4 görünümle gösterir
 * (yazdır ve PDF dahil). Kaydedilmiş programdan üretilir; şube eşleştirmesi öğrenci ve hoca ekranlarıyla aynıdır.
 */
import { useMemo, useState } from 'react';
import { ProgramA4Stil, ProgramCiktiDugmeleri, ProgramOnizleme, useProgramCikti, YonSecici } from '@/components/ProgramA4';
import { basNorm, sinifAnahtari, subeEslestir, TR_GUN_SIRA } from '@/lib/metin';
import type { ProgramSatiri } from '@/lib/program-kurallari';
import type { ProgramSecenek } from '@/lib/yazdirma/program-a4';

type Veri = { satirlar: ProgramSatiri[]; siniflar: string[]; derslikler: Record<string, string> };

const sirala = <T extends { gun: string; saat: string }>(l: T[]) =>
  l.filter(x => TR_GUN_SIRA[basNorm(x.gun)] != null).sort((a, b) => TR_GUN_SIRA[basNorm(a.gun)] - TR_GUN_SIRA[basNorm(b.gun)] || a.saat.localeCompare(b.saat, 'tr'));

export function ProgramGorunumu({ veri, tur }: { veri: Veri; tur: 'sinif' | 'hoca' }) {
  const { yon, setYon, logo } = useProgramCikti();
  const siniflar = useMemo(() => veri.siniflar.map(ad => ({ ad, anahtar: sinifAnahtari(ad) })), [veri.siniflar]);
  const hocalar = useMemo(() => [...new Set(veri.satirlar.map(x => x.hoca.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr')), [veri.satirlar]);
  const secenekler = tur === 'sinif' ? veri.siniflar : hocalar;
  const [secili, setSecili] = useState('');
  const kim = secenekler.includes(secili) ? secili : secenekler[0] ?? '';

  const o = useMemo<ProgramSecenek | null>(() => {
    if (!kim) return null;
    if (tur === 'sinif') {
      // Öğrenci ekranındaki gibi: şube bu sınıfla eşleşen satırlar, derslik yoksa sınıfın dersliği
      const program = sirala(veri.satirlar.filter(x => subeEslestir(x.sube, siniflar)?.ad === kim))
        .map(x => ({ gun: x.gun, saat: x.saat, ders: x.ders, hoca: x.hoca, derslik: x.derslik || veri.derslikler[kim] || '' }));
      const derslikler = new Set(program.map(x => x.derslik).filter(Boolean));
      const tek = derslikler.size === 1 ? [...derslikler][0] : '';
      const gun = new Set(program.map(x => basNorm(x.gun))).size;
      return { tur: 'sinif', yon, kim, logo, program, tekDerslik: tek, alt: tek || veri.derslikler[kim] ? 'Derslik ' + (tek || veri.derslikler[kim]) : '',
        ozet: [program.length + ' ders', gun + ' gün', tek ? 'Tüm dersler ' + tek + ' dersliğinde' : kim] };
    }
    // Hoca ekranındaki gibi: hocanın dersleri, şube sınıf adıyla
    const hn = basNorm(kim);
    const program = sirala(veri.satirlar.filter(x => basNorm(x.hoca) === hn)).map(x => {
      const s = subeEslestir(x.sube, siniflar);
      return { gun: x.gun, saat: x.saat, ders: x.ders, sube: s ? s.ad : x.sube, derslik: x.derslik || (s ? veri.derslikler[s.ad] : '') || '' };
    });
    const subeler = [...new Set(program.map(x => x.sube).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    const gun = new Set(program.map(x => basNorm(x.gun))).size;
    return { tur: 'hoca', yon, kim, logo, program, alt: subeler.join(' · '), ozet: [program.length + ' ders', gun + ' gün', subeler.length + ' şube'] };
  }, [kim, tur, veri, siniflar, yon, logo]);

  if (!secenekler.length) return <div className="durum">{tur === 'sinif' ? 'Aktif sınıf yok.' : 'Programda öğretim elemanı yok.'}</div>;
  return (
    <div>
      <ProgramA4Stil />
      <div className="prg-secim" role="group" aria-label={tur === 'sinif' ? 'Sınıf' : 'Öğretim elemanı'}>
        {secenekler.map(s => (
          <button key={s} type="button" className={'prg-secim-dugme' + (s === kim ? ' secili' : '')} aria-pressed={s === kim} onClick={() => setSecili(s)}>{s}</button>
        ))}
      </div>
      {o && !o.program.length && <div className="durum">{tur === 'sinif'
        ? `${kim} için programda ders yok. Şube sütununun bu sınıfla eşleştiğini kontrol edin.` : `${kim} için programda ders yok.`}</div>}
      {o && o.program.length > 0 && (
        <>
          <div className="prg-eylem">
            <div><strong>{o.kim}</strong><div className="hint" style={{ textAlign: 'left' }}>{tur === 'sinif' ? 'Öğrencilerin gördüğü program' : 'Hocanın gördüğü program'} · A4 {yon === 'dikey' ? 'dikey' : 'yatay'}</div></div>
            <div className="actions" style={{ margin: 0, alignItems: 'center' }}>
              <YonSecici yon={yon} degisti={setYon} />
              <ProgramCiktiDugmeleri o={o} ad={'Ders Programı - ' + o.kim} dugmeSinifi="btn btn-primary" ikincilSinif="btn btn-secondary" durumSinifi="hint" />
            </div>
          </div>
          <div style={{ margin: '0 auto', maxWidth: yon === 'dikey' ? 560 : undefined }}><ProgramOnizleme o={o} /></div>
        </>
      )}
    </div>
  );
}
