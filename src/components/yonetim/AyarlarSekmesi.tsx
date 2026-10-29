'use client';

import { useEffect, useState } from 'react';
import { ayarlarKaydetIslemi, ayarListesiIslemi, islemKaydiIslemi } from '@/app/yonetim/islemler';
import { Mesaj, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';


function IslemKaydi() {
  const { veri, hata, yenile } = useVeri(islemKaydiIslemi);
  return (
    <div className="adim">
      <div className="dosya-satir" style={{ justifyContent: 'space-between' }}>
        <div className="bolum-baslik" style={{ margin: 0 }}>İşlem kaydı (son 200)</div>
        <button className="btn btn-secondary btn-kucuk" type="button" onClick={yenile}>🔄 Yenile</button>
      </div>
      {hata ? <div className="hata-kutu">{hata}</div> : !veri ? <Yukleniyor /> : (
        <div className="table-card" style={{ marginTop: 10 }}><div className="scroller">
          <table><thead><tr><th>Zaman</th><th>Kullanıcı</th><th>İşlem</th><th>Ayrıntı</th></tr></thead>
            <tbody>{veri.map((r, i) => <tr key={i}><td>{r.zaman}</td><td>{r.kullanici}</td><td>{r.islem}</td><td className="wrap-cell">{r.ayrinti}</td></tr>)}</tbody></table>
        </div></div>
      )}
    </div>
  );
}

export function AyarlarSekmesi() {
  const cagir = useCagir();
  const { veri, setVeri, hata } = useVeri(ayarListesiIslemi);
  const [degerler, setDegerler] = useState<Record<string, string>>({});
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [bekliyor, setBekliyor] = useState(false);
  useEffect(() => { if (veri) setDegerler(Object.fromEntries(veri.bilinen.map(t => [t.anahtar, t.deger]))); }, [veri]);

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!veri) return <Yukleniyor />;
  const degisen = veri.bilinen.filter(t => (degerler[t.anahtar] ?? t.deger) !== t.deger);
  const gruplar = [...new Set(veri.bilinen.map(t => t.grup))];

  async function kaydet() {
    setBekliyor(true); setMesaj(null);
    const r = await cagir(ayarlarKaydetIslemi(Object.fromEntries(degisen.map(t => [t.anahtar, degerler[t.anahtar]]))));
    setBekliyor(false);
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setVeri(r.veri); setMesaj({ metin: `${degisen.length} ayar kaydedildi; hemen geçerli olur.` });
  }
  return (
    <section>
      <Mesaj m={mesaj} />
      {gruplar.map(g => (
        <div className="adim" key={g}>
          <div className="bolum-baslik">{g}</div>
          {veri.bilinen.filter(t => t.grup === g).map(t => {
            const v = degerler[t.anahtar] ?? t.deger;
            const set = (x: string) => setDegerler(d => ({ ...d, [t.anahtar]: x }));
            return (
              <div className="ayar-satir" key={t.anahtar}>
                <div><div className="ayar-ad">{t.anahtar}{!t.kayitli && <span className="hint"> (varsayılan)</span>}</div><div className="ayar-aciklama">{t.aciklama}</div></div>
                {t.tur === 'evet-hayir' ? <select value={v} onChange={e => set(e.target.value)} aria-label={t.anahtar}><option>Evet</option><option>Hayır</option></select>
                  : t.tur === 'secim' ? <select value={v} onChange={e => set(e.target.value)} aria-label={t.anahtar}>{t.secenekler!.map(s => <option key={s}>{s}</option>)}</select>
                  : <input type={t.tur === 'sayi' ? 'number' : 'text'} min={0} max={100} value={v} onChange={e => set(e.target.value)} aria-label={t.anahtar} />}
              </div>
            );
          })}
        </div>
      ))}
      <div className="actions">
        <button className="btn btn-primary" type="button" onClick={kaydet} disabled={!degisen.length || bekliyor}>{bekliyor ? 'Kaydediliyor…' : degisen.length ? `${degisen.length} değişikliği kaydet` : 'Değişiklik yok'}</button>
      </div>
      {veri.diger.length > 0 && (
        <div className="adim">
          <div className="bolum-baslik">Diğer kayıtlı ayarlar</div>
          <p className="aciklama">Sistemin tanımadığı (eski sürümlerden kalan) ayarlar; yalnızca bilgi için gösterilir.</p>
          {veri.diger.map(d => <div className="ayar-satir" key={d.anahtar}><div><div className="ayar-ad">{d.anahtar}</div><div className="ayar-aciklama">{d.aciklama}</div></div><div>{d.deger}</div></div>)}
        </div>
      )}
      <div className="adim">
        <div className="bolum-baslik">Hesaplar</div>
        <p className="aciklama">Ortak erişim kodları kaldırıldı; herkes kendi hesabıyla girer. Yönetici ve öğretim elemanı hesapları ile öğrenci hesapları &quot;Kullanıcılar&quot; sekmesinden yönetilir.</p>
      </div>
      <IslemKaydi />
    </section>
  );
}
