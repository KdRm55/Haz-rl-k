'use client';

/** Hoca ekranı · Yoklama: girilen bütün yoklamaların sınıf listeli PDF dökümü. */
import { useState } from 'react';
import { hocaYoklamaDokumuIslemi } from '@/app/hoca/islemler';
import type { Sonuc } from '@/lib/islem-sonucu';
import { logoAdresi } from '@/lib/yazdirma/ortak';

export function YoklamaDokumu({ hoca, yetkiHatasi }: { hoca: string; yetkiHatasi: (r: Sonuc<unknown>) => boolean }) {
  const [bas, setBas] = useState('');
  const [bit, setBit] = useState('');
  const [durum, setDurum] = useState('');
  const [calisiyor, setCalisiyor] = useState(false);

  async function indir() {
    if (!hoca) { setDurum('Önce yukarıdan öğretim elemanını seçin.'); return; }
    setCalisiyor(true); setDurum('Yoklamalar okunuyor…');
    try {
      const r = await hocaYoklamaDokumuIslemi(hoca, bas, bit);
      if (yetkiHatasi(r)) return;
      if (!r.ok) { setDurum(r.hata); return; }
      if (!r.veri.siniflar.length) { setDurum(`${r.veri.bas} – ${r.veri.bit} arasında ${r.veri.teacher} adına girilmiş yoklama yok.`); return; }
      const { yoklamaDokumuPdf } = await import('@/lib/yazdirma/yoklama-dokum');
      await yoklamaDokumuPdf(r.veri, await logoAdresi(), setDurum);
    } catch (e) {
      console.error(e);
      setDurum('PDF oluşturulamadı: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setCalisiyor(false); }
  }

  return (
    <details className="yk-telafi yk-dokum">
      <summary>Yoklama dökümü (PDF)</summary>
      <p className="yk-dokum-not">Girdiğiniz bütün yoklamalar sınıf sınıf, öğrenci listesiyle tek PDF&apos;te: kim geldi, kim gelmedi tabloda işaretli. Tarih boş bırakılırsa dönem başından bugüne kadar alınır.</p>
      <div className="yk-form">
        <div className="field"><label htmlFor="ydBas">Başlangıç</label><input type="date" id="ydBas" value={bas} onChange={e => setBas(e.target.value)} /></div>
        <div className="field"><label htmlFor="ydBit">Bitiş</label><input type="date" id="ydBit" value={bit} onChange={e => setBit(e.target.value)} /></div>
        <div className="field"><button className="btn btn-primary" type="button" disabled={calisiyor} onClick={indir}>{calisiyor ? 'Hazırlanıyor…' : 'PDF indir'}</button></div>
      </div>
      {durum && <div className="yk-dokum-durum" role="status" aria-live="polite">{durum}</div>}
    </details>
  );
}
