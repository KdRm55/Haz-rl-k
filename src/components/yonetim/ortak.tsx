'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Sonuc } from '@/lib/islem-sonucu';

/** Oturum düştüğünde panel giriş ekranına döner (ana bileşen sağlar). */
export const OturumDustu = createContext<() => void>(() => {});

/**
 * Sunucu işlemi çağırır; yetki hatasında giriş ekranına döner, diğer hatalarda mesajı döndürür.
 * Kullanım: const r = await cagir(islem(...)); if (r.ok) ...
 */
export function useCagir() {
  const dustu = useContext(OturumDustu);
  return useCallback(async <T,>(p: Promise<Sonuc<T>>): Promise<Sonuc<T>> => {
    let r: Sonuc<T>;
    try { r = await p; } catch { r = { ok: false, hata: 'Sunucuya ulaşılamadı. Birkaç saniye sonra tekrar deneyin.' }; }
    if (!r.ok && r.yetkisiz) dustu();
    return r;
  }, [dustu]);
}

/** Bir sekmenin açılışta verisini yükler; yeniden yükleme ve yerel güncelleme imkânı verir. */
export function useVeri<T>(yukle: () => Promise<Sonuc<T>>) {
  const cagir = useCagir();
  const [veri, setVeri] = useState<T | null>(null);
  const [hata, setHata] = useState('');
  const yenile = useCallback(async () => {
    const r = await cagir(yukle());
    if (r.ok) { setVeri(r.veri); setHata(''); } else setHata(r.hata);
  }, [cagir, yukle]);
  useEffect(() => { yenile(); }, [yenile]);
  return { veri, setVeri, hata, yenile };
}

export type MesajDurumu = { metin: React.ReactNode; hata?: boolean } | null;
export function Mesaj({ m }: { m: MesajDurumu }) {
  if (!m) return null;
  return <div className={m.hata ? 'hata-kutu' : 'sonuc-kutu'} role={m.hata ? 'alert' : 'status'}>{m.metin}</div>;
}

export function Yukleniyor({ metin = 'Yükleniyor…' }: { metin?: string }) {
  return <div className="durum"><div className="loader" />{metin}</div>;
}

/** Açılır liste tablosu (fark önizlemesi vb.) */
export function ListeTablosu({ baslik, sayi, kolonlar, satirlar }: { baslik: string; sayi: number; kolonlar: string[]; satirlar: (string | number)[][] }) {
  if (!sayi) return null;
  return (
    <details className="liste">
      <summary>{baslik} ({sayi}){satirlar.length < sayi ? ` — ilk ${satirlar.length} gösteriliyor` : ''}</summary>
      <div className="table-card"><div className="scroller">
        <table>
          <thead><tr>{kolonlar.map(k => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>{satirlar.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
        </table>
      </div></div>
    </details>
  );
}

export function OzetKutu({ deger, etiket, tur }: { deger: React.ReactNode; etiket: string; tur?: string }) {
  return <div className={'ozet-kutu' + (tur ? ' ' + tur : '')}><div className="deger">{deger}</div><div className="etiket">{etiket}</div></div>;
}
