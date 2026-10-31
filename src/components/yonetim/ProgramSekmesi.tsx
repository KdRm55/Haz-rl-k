'use client';

import { useEffect, useMemo, useState } from 'react';
import { programKaydetIslemi, programListesiIslemi } from '@/app/yonetim/islemler';
import { csvIndir, dosyaOku, xlsxIndir } from '@/lib/dosya-oku';
import { basNorm, sinifAnahtari, subeEslestir, TR_GUN_SIRA } from '@/lib/metin';
import { programTablosuOku, type ProgramSatiri } from '@/lib/program-kurallari';
import { Mesaj, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';
import { ProgramGorunumu } from './ProgramGorunumu';

const GUNLER = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const bosSatir: ProgramSatiri = { hoca: '', ders: '', gun: 'Pazartesi', saat: '', sube: '', derslik: '' };
const BASLIK = ['Hoca Adı', 'Ders', 'Gün', 'Saat', 'Şube', 'Derslik'];

export function ProgramSekmesi() {
  const cagir = useCagir();
  const { veri, setVeri, hata } = useVeri(programListesiIslemi);
  const [satirlar, setSatirlar] = useState<ProgramSatiri[]>([]);
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const [ara, setAra] = useState('');
  const [gorunum, setGorunum] = useState<'duzen' | 'sinif' | 'hoca'>('duzen');
  useEffect(() => { if (veri) setSatirlar(veri.satirlar); }, [veri]);

  const degisti = useMemo(() => !!veri && JSON.stringify(veri.satirlar) !== JSON.stringify(satirlar), [veri, satirlar]);
  const yaz = (i: number, d: Partial<ProgramSatiri>) => setSatirlar(l => l.map((r, k) => (k === i ? { ...r, ...d } : r)));
  const gorunen = satirlar.map((r, i) => ({ r, i })).filter(({ r }) => !ara || basNorm(Object.values(r).join(' ')).includes(basNorm(ara)));

  async function kaydet() {
    setBekliyor(true); setMesaj(null);
    const r = await cagir(programKaydetIslemi(satirlar));
    setBekliyor(false);
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setVeri(r.veri); setMesaj({ metin: `Ders programı kaydedildi (${r.veri.satirlar.length} satır). İmza sirkülerinde ve öğrenci ekranında hemen görünür.` });
  }

  async function excelden(f: File | undefined) {
    if (!f) return;
    setMesaj(null);
    try {
      const d = await dosyaOku(f);
      const okunan = d.sayfalar.map(ad => ({ ad, ...programTablosuOku(d.satirlar(ad)) })).find(x => !x.eksik);
      if (!okunan) { setMesaj({ metin: 'Dosyada ders programı başlığı bulunamadı. Gerekli sütunlar: Hoca Adı, Ders, Gün, Saat, Şube (Derslik isteğe bağlı).', hata: true }); return; }
      if (!confirm(`"${okunan.ad}" sayfasından ${okunan.satirlar.length} satır okundu. Ekrandaki program bu satırlarla değiştirilsin mi? (Kaydet'e basana kadar hiçbir şey kaydedilmez.)`)) return;
      setSatirlar(okunan.satirlar);
      setMesaj({ metin: `${okunan.satirlar.length} satır yüklendi. Kontrol edip "Programı kaydet"e basın.` });
    } catch (e) {
      setMesaj({ metin: 'Dosya okunamadı: ' + (e instanceof Error ? e.message : String(e)), hata: true });
    }
  }

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!veri) return <Yukleniyor />;
  const aktifSiniflar = veri.siniflar.map(ad => ({ ad, anahtar: sinifAnahtari(ad) }));
  const secici = (
    <div className="prg-gorunum" role="tablist" aria-label="Ders programı görünümü">
      {([['duzen', 'Düzenle'], ['sinif', 'Sınıf programları'], ['hoca', 'Hoca programları']] as const).map(([k, et]) => (
        <button key={k} type="button" role="tab" aria-selected={gorunum === k} className={gorunum === k ? 'secili' : undefined} onClick={() => setGorunum(k)}>{et}</button>
      ))}
    </div>
  );
  if (gorunum !== 'duzen') {
    return (
      <section>
        <div className="adim">
          <div className="bolum-baslik">Ders programı</div>
          {secici}
          {degisti && <div className="uyari-metin" style={{ marginBottom: 10 }}>Kaydedilmemiş değişiklikleriniz var; görünüm kaydedilmiş programı gösteriyor.</div>}
          <ProgramGorunumu veri={veri} tur={gorunum} />
        </div>
      </section>
    );
  }
  return (
    <section>
      <div className="adim">
        <div className="bolum-baslik">Ders programı</div>
        {secici}
        <p className="aciklama">Her satır bir ders saatidir. Şube, sınıf adıyla (&quot;Hazırlık A&quot;) ya da kısaca (&quot;A&quot;) yazılabilir. Programı Excel&apos;den de yükleyebilirsiniz: &quot;Şablon indir&quot; ekrandaki programı Excel olarak verir (program boşsa yalnızca başlıklar); düzenleyip &quot;Excel&apos;den yükle&quot; ile geri yükleyin (sütunlar: Hoca Adı, Ders, Gün, Saat, Şube, Derslik). Değişiklikler &quot;Programı kaydet&quot;e basınca geçerli olur.</p>
        <div className="actions">
          <button className="btn btn-primary" type="button" onClick={kaydet} disabled={!degisti || bekliyor}>{bekliyor ? 'Kaydediliyor…' : 'Programı kaydet'}</button>
          {degisti && <button className="btn btn-secondary" type="button" onClick={() => setSatirlar(veri.satirlar)}>Değişiklikleri geri al</button>}
          <button className="btn btn-secondary" type="button" onClick={() => xlsxIndir('Ders_Programi_Sablon.xlsx', 'Ders Programı', [BASLIK, ...satirlar.map(r => [r.hoca, r.ders, r.gun, r.saat, r.sube, r.derslik])], [28, 26, 12, 16, 14, 12])}>📄 Şablon indir</button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>⬆️ Excel&apos;den yükle<input type="file" accept=".xlsx,.csv" hidden onChange={e => { excelden(e.target.files?.[0]); e.target.value = ''; }} /></label>
          <button className="btn btn-secondary" type="button" onClick={() => csvIndir('Ders_Programi.csv', BASLIK, satirlar.map(r => [r.hoca, r.ders, r.gun, r.saat, r.sube, r.derslik]))}>⬇️ CSV indir</button>
        </div>
        <Mesaj m={mesaj} />
        <div className="filtre">
          <input type="search" placeholder="Hoca, ders ya da şube ile ara" value={ara} onChange={e => setAra(e.target.value)} aria-label="Programda ara" />
          <span className="hint">{satirlar.length} satır{degisti ? ' · kaydedilmemiş değişiklik var' : ''}</span>
        </div>
        <datalist id="subeSecenek">{veri.siniflar.map(s => <option key={s} value={s} />)}</datalist>
        <div className="table-card"><div className="scroller">
          <table className="duzen-tablo">
            <thead><tr>{BASLIK.map(b => <th key={b}>{b}</th>)}<th></th></tr></thead>
            <tbody>
              {gorunen.map(({ r, i }) => {
                const gunHata = TR_GUN_SIRA[basNorm(r.gun)] == null;
                const subeUyari = !!r.sube && !subeEslestir(r.sube, aktifSiniflar);
                return (
                  <tr key={i}>
                    <td><input type="text" value={r.hoca} onChange={e => yaz(i, { hoca: e.target.value })} aria-label="Hoca adı" /></td>
                    <td><input type="text" value={r.ders} onChange={e => yaz(i, { ders: e.target.value })} aria-label="Ders" /></td>
                    <td style={{ width: 130 }}><select value={GUNLER.find(g => basNorm(g) === basNorm(r.gun)) ?? r.gun} onChange={e => yaz(i, { gun: e.target.value })} aria-label="Gün"
                      style={gunHata ? { borderColor: 'var(--err)' } : undefined}>
                      {gunHata && <option value={r.gun}>{r.gun || '—'}</option>}
                      {GUNLER.map(g => <option key={g}>{g}</option>)}</select></td>
                    <td style={{ width: 140 }}><input type="text" value={r.saat} onChange={e => yaz(i, { saat: e.target.value })} aria-label="Saat" placeholder="09:00 - 09:45" /></td>
                    <td style={{ width: 150 }}><input type="text" list="subeSecenek" value={r.sube} onChange={e => yaz(i, { sube: e.target.value })} aria-label="Şube"
                      title={subeUyari ? 'Bu şube hiçbir aktif sınıfla eşleşmiyor; ders imza sirküsüne düşmez' : undefined} style={subeUyari ? { borderColor: 'var(--accent)' } : undefined} /></td>
                    <td style={{ width: 110 }}><input type="text" value={r.derslik} onChange={e => yaz(i, { derslik: e.target.value })} aria-label="Derslik" /></td>
                    <td><button className="sil" type="button" title="Satırı sil" aria-label="Satırı sil" onClick={() => setSatirlar(l => l.filter((_, k) => k !== i))}>🗑</button></td>
                  </tr>
                );
              })}
              {!gorunen.length && <tr><td colSpan={7}><div className="durum">{satirlar.length ? 'Aramayla eşleşen satır yok.' : 'Program boş.'}</div></td></tr>}
            </tbody>
          </table>
        </div></div>
        <button className="btn btn-secondary" type="button" onClick={() => { setAra(''); setSatirlar(l => [...l, { ...bosSatir, hoca: l[l.length - 1]?.hoca ?? '' }]); }}>+ Satır ekle</button>
      </div>
    </section>
  );
}
