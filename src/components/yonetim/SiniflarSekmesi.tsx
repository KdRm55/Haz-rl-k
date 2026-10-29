'use client';

import { useState } from 'react';
import { sinifKaydetIslemi, sinifListesiIslemi, sinifSilIslemi } from '@/app/yonetim/islemler';
import type { SinifSatiri } from '@/lib/yonetim';
import { Mesaj, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

type Form = { id: number | null; ad: string; derslik: string; tur: string; kapasite: string; aktif: boolean };
const bos: Form = { id: null, ad: 'Hazırlık ', derslik: '', tur: 'Karma', kapasite: '', aktif: true };
const formdan = (s: SinifSatiri): Form => ({ id: s.id, ad: s.ad, derslik: s.derslik, tur: s.tur, kapasite: s.kapasite ? String(s.kapasite) : '', aktif: s.aktif });

function SinifSatirFormu({ f, ogrenci, kaydet, sil, iptal }: { f: Form; ogrenci?: number; kaydet: (f: Form) => Promise<void>; sil?: () => void; iptal?: () => void }) {
  const [d, setD] = useState(f);
  const [bekliyor, setBekliyor] = useState(false);
  const degisti = JSON.stringify(d) !== JSON.stringify(f);
  return (
    <tr className={degisti ? 'degisti' : undefined}>
      <td><input type="text" value={d.ad} onChange={e => setD({ ...d, ad: e.target.value })} aria-label="Sınıf adı" /></td>
      <td><input type="text" value={d.derslik} onChange={e => setD({ ...d, derslik: e.target.value })} aria-label="Derslik" placeholder="Örn. Z-05" /></td>
      <td><select value={d.tur} onChange={e => setD({ ...d, tur: e.target.value })} aria-label="Tür">
        <option value="Karma">Karma</option><option value="K">Kız (K)</option><option value="E">Erkek (E)</option></select></td>
      <td style={{ width: 100 }}><input type="number" min={0} value={d.kapasite} onChange={e => setD({ ...d, kapasite: e.target.value })} aria-label="Kapasite" placeholder="—" /></td>
      <td style={{ width: 110 }}><select value={d.aktif ? '1' : '0'} onChange={e => setD({ ...d, aktif: e.target.value === '1' })} aria-label="Aktif">
        <option value="1">Aktif</option><option value="0">Pasif</option></select></td>
      <td className="no">{ogrenci ?? '—'}</td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {(degisti || !f.id) && <button className="btn btn-primary btn-kucuk" type="button" disabled={bekliyor}
          onClick={async () => { setBekliyor(true); await kaydet(d); setBekliyor(false); }}>{bekliyor ? '…' : f.id ? 'Kaydet' : 'Ekle'}</button>}{' '}
        {iptal && <button className="btn btn-secondary btn-kucuk" type="button" onClick={iptal}>Vazgeç</button>}
        {sil && <button className="sil" type="button" title="Sınıfı sil" aria-label="Sınıfı sil" onClick={sil}>🗑</button>}
      </td>
    </tr>
  );
}

export function SiniflarSekmesi({ degisti }: { degisti: () => void }) {
  const cagir = useCagir();
  const { veri, setVeri, hata } = useVeri(sinifListesiIslemi);
  const [yeni, setYeni] = useState(false);
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);

  async function kaydet(f: Form) {
    setMesaj(null);
    const r = await cagir(sinifKaydetIslemi({ ...f, kapasite: f.kapasite }));
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setVeri(r.veri); setYeni(false); setMesaj({ metin: `${f.ad.trim()} kaydedildi.` }); degisti();
  }
  async function sil(s: SinifSatiri) {
    if (!confirm(`${s.ad} silinsin mi? Geçici olarak gizlemek için "Pasif" yapmanız yeterli.`)) return;
    const r = await cagir(sinifSilIslemi(s.id));
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setVeri(r.veri); setMesaj({ metin: `${s.ad} silindi.` }); degisti();
  }

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!veri) return <Yukleniyor />;
  return (
    <section>
      <div className="adim">
        <div className="bolum-baslik">Sınıflar</div>
        <p className="aciklama">Sınıf adı &quot;Hazırlık A&quot; biçiminde olmalı; ders programındaki şube yazımları (&quot;A&quot;, &quot;A Şubesi&quot;, &quot;Hazırlık A&quot;) bu adla eşleşir. Tür, kız/erkek sınıfları için cinsiyet denetiminde kullanılır; kapasite girilirse aşım uyarısı verilir. Pasif sınıf hiçbir ekranda görünmez. Öğrencileri sınıflara &quot;Öğrenci listesi&quot; sekmesinden atayın.</p>
        <Mesaj m={mesaj} />
        <div className="table-card"><div className="scroller">
          <table className="duzen-tablo">
            <thead><tr><th>Sınıf</th><th>Derslik</th><th>Tür</th><th>Kapasite</th><th>Durum</th><th>Öğrenci</th><th></th></tr></thead>
            <tbody>
              {veri.map(s => <SinifSatirFormu key={s.id + '|' + JSON.stringify(formdan(s))} f={formdan(s)} ogrenci={s.ogrenci} kaydet={kaydet} sil={() => sil(s)} />)}
              {yeni && <SinifSatirFormu f={bos} kaydet={kaydet} iptal={() => setYeni(false)} />}
              {!veri.length && !yeni && <tr><td colSpan={7}><div className="durum">Henüz sınıf yok.</div></td></tr>}
            </tbody>
          </table>
        </div></div>
        {!yeni && <button className="btn btn-secondary" type="button" onClick={() => setYeni(true)}>+ Sınıf ekle</button>}
      </div>
    </section>
  );
}
