'use client';

import { useMemo, useState } from 'react';
import { sinavListesiIslemi, sinavSatirGuncelleIslemi, sinavSatirSilIslemi, sinavYerYazIslemi } from '@/app/yonetim/islemler';
import { csvIndir } from '@/lib/dosya-oku';
import { basNorm } from '@/lib/metin';
import type { SinavListeSatiri } from '@/lib/sinav-yonetim';
import { Mesaj, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

type Duzen = { yer: string; yazili: string; sozlu: string };
const GOSTERIM = 300;
const puanEkran = (v: string) => (v === 'G' ? 'G' : v.replace('.', ','));

/** Sınav listesi: e-tablodaki "Sınav Sonuçları" sayfasının yerine; yer ve puanlar satırda düzeltilir. */
export function SinavListesi({ surum, degisti }: { surum: number; degisti: () => void }) {
  const cagir = useCagir();
  // surum değişince liste yeniden yüklenir
  const yukle = useMemo(() => { void surum; return () => sinavListesiIslemi(); }, [surum]);
  const { veri, hata, yenile } = useVeri(yukle);
  const [ara, setAra] = useState('');
  const [sonucF, setSonucF] = useState('tum');
  const [duzen, setDuzen] = useState<Record<string, Duzen>>({});
  const [toplu, setToplu] = useState('');
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [bekliyor, setBekliyor] = useState('');

  const liste = useMemo(() => {
    const q = basNorm(ara);
    return (veri ?? []).filter(r => (sonucF === 'tum' || r.sonuc === sonucF) &&
      (!q || r.no.includes(q.replace(/\s/g, '')) || basNorm(r.adi + ' ' + r.soyadi).includes(q) || basNorm(r.yer).includes(q)));
  }, [veri, ara, sonucF]);

  const d = (r: SinavListeSatiri): Duzen => duzen[r.no] ?? { yer: r.yer, yazili: puanEkran(r.yazili), sozlu: puanEkran(r.sozlu) };
  const farkli = (r: SinavListeSatiri) => { const x = duzen[r.no]; return !!x && (x.yer !== r.yer || x.yazili !== puanEkran(r.yazili) || x.sozlu !== puanEkran(r.sozlu)); };
  const yaz = (r: SinavListeSatiri, p: Partial<Duzen>) => setDuzen(x => ({ ...x, [r.no]: { ...d(r), ...p } }));
  const bitir = async (m: MesajDurumu) => { setMesaj(m); setDuzen({}); await yenile(); degisti(); };

  async function kaydet(r: SinavListeSatiri) {
    setBekliyor(r.no); setMesaj(null);
    const x = await cagir(sinavSatirGuncelleIslemi(r.no, d(r)));
    setBekliyor('');
    if (!x.ok) { setMesaj({ metin: x.hata, hata: true }); return; }
    await bitir({ metin: `${r.no} ${r.adi} ${r.soyadi} kaydedildi.` });
  }
  async function sil(r: SinavListeSatiri) {
    if (!confirm(`${r.no} ${r.adi} ${r.soyadi} sınav listesinden çıkarılsın mı?`)) return;
    const x = await cagir(sinavSatirSilIslemi(r.no));
    if (!x.ok) { setMesaj({ metin: x.hata, hata: true }); return; }
    await bitir({ metin: `${r.no} listeden çıkarıldı.` });
  }
  async function topluYer() {
    if (!liste.length) return;
    if (!confirm(`Listede görünen ${liste.length} öğrencinin sınav yeri "${toplu.trim() || '(boş)'}" yapılsın mı?`)) return;
    setBekliyor('toplu');
    const x = await cagir(sinavYerYazIslemi(liste.map(r => r.no), toplu));
    setBekliyor('');
    if (!x.ok) { setMesaj({ metin: x.hata, hata: true }); return; }
    setToplu('');
    await bitir({ metin: `${x.veri.sayi} öğrencinin sınav yeri güncellendi.` });
  }

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!veri) return <Yukleniyor />;
  return (
    <div className="adim">
      <div className="dosya-satir" style={{ justifyContent: 'space-between' }}>
        <div className="bolum-baslik" style={{ margin: 0 }}>Sınav listesi</div>
        <button className="btn btn-secondary btn-kucuk" type="button" onClick={() => csvIndir('Sinav_Sonuclari.csv', ['Öğrenci No', 'Adı', 'Soyadı', 'Sınav Yeri / Saati', 'Yazılı', 'Sözlü', 'Ortalama', 'Sonuç', 'Açıklama'],
          veri.map(r => [r.no, r.adi, r.soyadi, r.yer, puanEkran(r.yazili), puanEkran(r.sozlu), r.ortalama == null ? '' : String(r.ortalama).replace('.', ','), r.sonuc, r.aciklama]))}>⬇️ CSV indir</button>
      </div>
      <p className="aciklama">Puan: 0–100 arası sayı, sınava girmeyen için <strong>G</strong>, henüz girilmediyse boş. Sonuç, kayıttan sonra güncel kurala göre hesaplanır. Sınav yeri öğrencilere sonuçlar yayında olmasa da görünür.</p>
      <Mesaj m={mesaj} />
      <div className="filtre">
        <input type="search" placeholder="Numara, ad ya da sınav yeri ile ara" value={ara} onChange={e => setAra(e.target.value)} aria-label="Sınav listesinde ara" />
        <select value={sonucF} onChange={e => setSonucF(e.target.value)} aria-label="Sonuç">
          <option value="tum">Tüm sonuçlar</option><option>Muaf</option><option>Hazırlık</option><option>Bekliyor</option><option>Hatalı puan</option>
        </select>
        <span className="hint">{liste.length} öğrenci</span>
      </div>
      <div className="filtre">
        <input type="text" placeholder="Örn. Amfi 1, 10:00" value={toplu} onChange={e => setToplu(e.target.value)} aria-label="Toplu sınav yeri" style={{ flex: '1 1 240px', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: 10 }} />
        <button className="btn btn-secondary btn-kucuk" type="button" disabled={bekliyor === 'toplu' || !liste.length} onClick={topluYer}>Listede görünenlere sınav yeri yaz</button>
      </div>
      <div className="table-card"><div className="scroller">
        <table className="duzen-tablo">
          <thead><tr><th>No</th><th>Adı Soyadı</th><th>Sınav Yeri / Saati</th><th>Yazılı</th><th>Sözlü</th><th>Ort.</th><th>Sonuç</th><th></th></tr></thead>
          <tbody>
            {liste.slice(0, GOSTERIM).map(r => {
              const x = d(r);
              return (
                <tr key={r.no} className={farkli(r) ? 'degisti' : undefined}>
                  <td className="no">{r.no}</td>
                  <td>{r.adi} {r.soyadi}</td>
                  <td><input type="text" value={x.yer} onChange={e => yaz(r, { yer: e.target.value })} aria-label="Sınav yeri" /></td>
                  <td style={{ width: 80 }}><input type="text" inputMode="decimal" value={x.yazili} onChange={e => yaz(r, { yazili: e.target.value })} aria-label="Yazılı" /></td>
                  <td style={{ width: 80 }}><input type="text" inputMode="decimal" value={x.sozlu} onChange={e => yaz(r, { sozlu: e.target.value })} aria-label="Sözlü" /></td>
                  <td className="no">{r.ortalama == null ? '' : String(r.ortalama).replace('.', ',')}</td>
                  <td title={r.aciklama}><span className={'rozet-durum' + (r.sonuc === 'Hatalı puan' ? ' silindi' : r.sonuc === 'Bekliyor' ? ' listede-yok' : '')}>{r.sonuc}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {farkli(r) && <button className="btn btn-primary btn-kucuk" type="button" disabled={bekliyor === r.no} onClick={() => kaydet(r)}>{bekliyor === r.no ? '…' : 'Kaydet'}</button>}
                    {!r.yazili && !r.sozlu && <button className="sil" type="button" title="Listeden çıkar" aria-label="Listeden çıkar" onClick={() => sil(r)}>🗑</button>}
                  </td>
                </tr>
              );
            })}
            {!liste.length && <tr><td colSpan={8}><div className="durum">{veri.length ? 'Bu filtreyle öğrenci yok.' : 'Sınav listesi boş. "Sınav listesini güncelle"ye basın.'}</div></td></tr>}
          </tbody>
        </table>
      </div></div>
      {liste.length > GOSTERIM && <div className="hint">İlk {GOSTERIM} öğrenci gösteriliyor; aramayı daraltın.</div>}
    </div>
  );
}
