'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { pdf, PRG_CSS, sayfaHtml, yazdir, yonKaydet, yonTercihi, type ProgramSecenek, type Yon } from '@/lib/yazdirma/program-a4';
import { logoAdresi } from '@/lib/yazdirma/ortak';

/** A4 programın stili sayfaya bir kez eklenir. */
export function ProgramA4Stil() {
  return <style dangerouslySetInnerHTML={{ __html: PRG_CSS }} />;
}

export function YonSecici({ yon, degisti }: { yon: Yon; degisti: (y: Yon) => void }) {
  return (
    <div className="prg-yon" role="radiogroup" aria-label="Sayfa yönü">
      {(['yatay', 'dikey'] as const).map(y => (
        <button key={y} type="button" role="radio" aria-checked={yon === y} className={yon === y ? 'secili' : undefined}
          onClick={() => { yonKaydet(y); degisti(y); }}>
          <span className={'ikon ' + (y === 'yatay' ? 'y' : 'd')} />{y === 'yatay' ? 'Yatay' : 'Dikey'}
        </button>
      ))}
    </div>
  );
}

/** Kayıtlı yön tercihi ve logo adresi (yalnızca tarayıcıda okunabilir). */
export function useProgramCikti() {
  const [yon, setYon] = useState<Yon>('yatay');
  const [logo, setLogo] = useState('');
  useEffect(() => { setYon(yonTercihi()); logoAdresi().then(setLogo); }, []);
  return { yon, setYon, logo };
}

/** Ekranda, kutunun genişliğine sığacak şekilde ölçeklenmiş A4 önizleme. */
export function ProgramOnizleme({ o }: { o: ProgramSecenek }) {
  const dis = useRef<HTMLDivElement>(null), olc = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const ayarla = () => {
      const sayfa = olc.current?.firstElementChild as HTMLElement | null;
      if (!dis.current || !olc.current || !sayfa) return;
      const k = dis.current.clientWidth / sayfa.offsetWidth;
      olc.current.style.transform = `scale(${k})`;
      dis.current.style.height = Math.ceil(sayfa.offsetHeight * k) + 'px';
    };
    ayarla();
    document.fonts?.ready.then(ayarla);
    window.addEventListener('resize', ayarla, { passive: true });
    return () => window.removeEventListener('resize', ayarla);
  }, [o]);
  return (
    <div className="prg-onizleme" ref={dis}>
      <div className="prg-olcek" ref={olc} dangerouslySetInnerHTML={{ __html: sayfaHtml(o) }} />
    </div>
  );
}

/** Yazdır ve PDF düğmeleri; durum metni ile birlikte. */
export function ProgramCiktiDugmeleri({ o, ad, dugmeSinifi, ikincilSinif, durumSinifi }: {
  o: ProgramSecenek; ad: string; dugmeSinifi: string; ikincilSinif: string; durumSinifi: string;
}) {
  const [durum, setDurum] = useState('');
  const [hazirlaniyor, setHazirlaniyor] = useState(false);
  async function pdfIndir() {
    setHazirlaniyor(true); setDurum('');
    try { await pdf(o, ad); setDurum('PDF indirildi.'); }
    catch (e) { console.error(e); setDurum('PDF oluşturulamadı. "Yazdır" → "PDF olarak kaydet"i kullanın.'); }
    finally { setHazirlaniyor(false); }
  }
  return (
    <>
      <button type="button" className={dugmeSinifi} onClick={() => yazdir(o)}>🖨️ Yazdır</button>
      <button type="button" className={ikincilSinif} onClick={pdfIndir} disabled={hazirlaniyor}>{hazirlaniyor ? 'Hazırlanıyor…' : '⬇️ PDF indir'}</button>
      <span className={durumSinifi} role="status" aria-live="polite">{durum}</span>
    </>
  );
}
