'use client';

import { useMemo, useState } from 'react';
import { disaAktarimIslemi, ogrenciEkleIslemi, ogrenciGecmisiIslemi, ogrenciGuncelleIslemi, ogrenciListesiIslemi } from '@/app/yonetim/islemler';
import { csvIndir } from '@/lib/dosya-oku';
import { basNorm } from '@/lib/metin';
import type { OgrenciListesi } from '@/lib/yonetim';
import { Mesaj, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

type Ogrenci = OgrenciListesi['ogrenciler'][number];
type Duzenleme = { sinifId: number | null; durum: string; cinsiyet: string; not: string };
const GOSTERIM_SINIRI = 300;
const DISA_BASLIK = ['OGR_NO', 'ADI_SOYADI', 'CINSIYET', 'SUBE', 'SINIF'];

function GecmisPaneli({ o, kapat }: { o: Ogrenci; kapat: () => void }) {
  const { veri, hata } = useVeri(useMemo(() => () => ogrenciGecmisiIslemi(o.no), [o.no]));
  return (
    <div className="yan-panel" onClick={e => { if (e.target === e.currentTarget) kapat(); }} onKeyDown={e => { if (e.key === 'Escape') kapat(); }}>
      <div role="dialog" aria-modal="true" aria-label="Değişiklik geçmişi">
        <div className="dosya-satir" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="bolum-baslik" style={{ margin: 0 }}>{o.no} · {o.adi} {o.soyadi}</div>
          <button className="btn btn-secondary btn-kucuk" type="button" onClick={kapat} autoFocus>Kapat</button>
        </div>
        {hata ? <div className="hata-kutu">{hata}</div> : !veri ? <Yukleniyor /> : !veri.length ? <div className="durum">Kayıtlı değişiklik yok.</div> : (
          <div className="table-card"><table>
            <thead><tr><th>Tarih</th><th>Kaynak</th><th>Alan</th><th>Değişiklik</th></tr></thead>
            <tbody>{veri.map((r, i) => <tr key={i}><td>{r.tarih}</td><td>{r.kaynak}</td><td>{r.alan}</td><td className="wrap-cell">{r.eski || '(boş)'} → {r.yeni || '(boş)'}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

const BOS_FORM = { no: '', adi: '', soyadi: '', cinsiyet: '', sinifId: '', tc: '', bolum: '', not: '' };

/** Liste yüklemeden tek öğrenci ekleme; isteğe bağlı olarak hemen bir sınıfa atanır. */
function OgrenciEkle({ siniflar, eklendi }: { siniflar: OgrenciListesi['siniflar']; eklendi: (no: string, mesaj: string) => void }) {
  const cagir = useCagir();
  const [f, setF] = useState(BOS_FORM);
  const [m, setM] = useState<MesajDurumu>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const alan = (k: keyof typeof BOS_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(x => ({ ...x, [k]: e.target.value }));
  async function ekle(e: React.FormEvent) {
    e.preventDefault();
    setBekliyor(true); setM(null);
    const r = await cagir(ogrenciEkleIslemi({ ...f, sinifId: f.sinifId ? Number(f.sinifId) : null }));
    setBekliyor(false);
    if (!r.ok) { setM({ metin: r.hata, hata: true }); return; }
    setF(x => ({ ...BOS_FORM, sinifId: x.sinifId }));   // art arda aynı sınıfa ekleme kolay olsun
    eklendi(r.veri.no, `${r.veri.no} ${r.veri.ad} eklendi${r.veri.sinif ? ` ve ${r.veri.sinif} sınıfına atandı` : ''}.` +
      (r.veri.tcVar ? '' : ' TC girilmediği için öğrenci hesap açamaz; TC’yi sonra liste yükleyerek ekleyebilirsiniz.'));
  }
  return (
    <details className="kural-form" style={{ marginBottom: 14 }}>
      <summary>+ Öğrenci ekle</summary>
      <form onSubmit={ekle}>
        <div className="form-izgara">
          <label className="alan">Öğrenci numarası *<input type="text" inputMode="numeric" value={f.no} onChange={alan('no')} required /></label>
          <label className="alan">Adı *<input type="text" value={f.adi} onChange={alan('adi')} required /></label>
          <label className="alan">Soyadı *<input type="text" value={f.soyadi} onChange={alan('soyadi')} required /></label>
          <label className="alan">Cinsiyet<select value={f.cinsiyet} onChange={alan('cinsiyet')}><option value="">—</option><option value="K">K</option><option value="E">E</option></select></label>
          <label className="alan">Sınıf<select value={f.sinifId} onChange={alan('sinifId')}>
            <option value="">— Sınıfı yok —</option>{siniflar.map(s => <option key={s.id} value={s.id}>{s.ad}{s.aktif ? '' : ' (pasif)'}</option>)}</select></label>
          <label className="alan">TC kimlik no (isteğe bağlı)<input type="text" inputMode="numeric" autoComplete="off" maxLength={11} value={f.tc} onChange={alan('tc')} /></label>
          <label className="alan">Bölüm / program<input type="text" value={f.bolum} onChange={alan('bolum')} /></label>
          <label className="alan">Not<input type="text" maxLength={500} value={f.not} onChange={alan('not')} /></label>
        </div>
        <button className="btn btn-primary" type="submit" disabled={bekliyor}>{bekliyor ? 'Ekleniyor…' : 'Öğrenciyi ekle'}</button>
        <p className="hint" style={{ textAlign: 'left' }}>TC numarasının tamamı saklanmaz; yalnızca son 6 hanesi tutulur ve öğrenci hesap açarken bununla doğrulanır. Elle eklenen öğrenci öğrenci listesinin parçası sayılır: sonraki liste yüklemesinde dosyada yoksa &quot;listeden çıkan&quot; olarak raporlanır.</p>
        <Mesaj m={m} />
      </form>
    </details>
  );
}

export function OgrencilerSekmesi({ degisti }: { degisti: () => void }) {
  const cagir = useCagir();
  const { veri, hata, yenile } = useVeri(ogrenciListesiIslemi);
  const [ara, setAra] = useState('');
  const [sinifF, setSinifF] = useState('tum');
  const [durumF, setDurumF] = useState('aktif');
  const [duzen, setDuzen] = useState<Record<string, Duzenleme>>({});
  const [kaydediliyor, setKaydediliyor] = useState('');
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [gecmis, setGecmis] = useState<Ogrenci | null>(null);

  const liste = useMemo(() => {
    if (!veri) return [];
    const q = basNorm(ara);
    return veri.ogrenciler.filter(o =>
      (durumF === 'tum' || (durumF === 'listede-yok' ? !o.kayitli : o.durum === durumF)) &&
      (sinifF === 'tum' || (sinifF === 'yok' ? !o.sinifId : String(o.sinifId) === sinifF)) &&
      (!q || o.no.includes(q.replace(/\s/g, '')) || basNorm(o.adi + ' ' + o.soyadi).includes(q)));
  }, [veri, ara, sinifF, durumF]);

  const deger = (o: Ogrenci): Duzenleme => duzen[o.no] ?? { sinifId: o.sinifId, durum: o.durum, cinsiyet: o.cinsiyet, not: o.not };
  const yaz = (o: Ogrenci, d: Partial<Duzenleme>) => setDuzen(x => ({ ...x, [o.no]: { ...deger(o), ...d } }));
  const farkli = (o: Ogrenci) => { const d = duzen[o.no]; return !!d && (d.sinifId !== o.sinifId || d.durum !== o.durum || d.cinsiyet !== o.cinsiyet || d.not !== o.not); };

  async function kaydet(o: Ogrenci) {
    setKaydediliyor(o.no); setMesaj(null);
    const r = await cagir(ogrenciGuncelleIslemi(o.no, deger(o)));
    setKaydediliyor('');
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setDuzen(x => { const y = { ...x }; delete y[o.no]; return y; });
    setMesaj({ metin: `${o.no} ${o.adi} ${o.soyadi} kaydedildi.` });
    await yenile(); degisti();
  }

  async function disaAktar(tur: 'kopya' | 'csv') {
    const r = await cagir(disaAktarimIslemi());
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    const satirlar = r.veri.map(x => [x.ogrNo, x.adSoyad, x.cinsiyet, x.sube, x.sinif]);
    if (tur === 'csv') { csvIndir('Hazirlik_Ogrenci_Listesi.csv', DISA_BASLIK, satirlar); return; }
    try {
      await navigator.clipboard.writeText([DISA_BASLIK, ...satirlar].map(s => s.join('\t')).join('\n'));
      setMesaj({ metin: `${satirlar.length} öğrenci panoya kopyalandı; Excel veya Google E-Tablolar'a yapıştırabilirsiniz.` });
    } catch { setMesaj({ metin: 'Panoya kopyalanamadı; "CSV indir"i kullanın.', hata: true }); }
  }

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!veri) return <Yukleniyor />;

  return (
    <section>
      <div className="actions">
        <button className="btn btn-primary" type="button" onClick={() => disaAktar('kopya')}>📋 Tabloyu kopyala</button>
        <button className="btn btn-secondary" type="button" onClick={() => disaAktar('csv')}>⬇️ CSV indir</button>
        <button className="btn btn-secondary" type="button" onClick={() => { setDuzen({}); yenile(); }}>🔄 Yenile</button>
      </div>
      <p className="aciklama">Kopyalama ve CSV, aktif sınıflardaki öğrencileri eski biçimle verir (OGR_NO, ADI_SOYADI, CINSIYET, SUBE, SINIF). Aşağıdaki tabloda bir öğrencinin sınıfını, kayıt durumunu, cinsiyetini ya da notunu değiştirip &quot;Kaydet&quot;e basın; her değişiklik geçmişe yazılır.</p>
      <OgrenciEkle siniflar={veri.siniflar} eklendi={async (no, m) => { setMesaj({ metin: m }); setAra(no); setDurumF('aktif'); setSinifF('tum'); await yenile(); degisti(); }} />
      <Mesaj m={mesaj} />
      <div className="filtre">
        <input type="search" placeholder="Numara ya da ad ile ara" value={ara} onChange={e => setAra(e.target.value)} aria-label="Öğrenci ara" />
        <select value={sinifF} onChange={e => setSinifF(e.target.value)} aria-label="Sınıf">
          <option value="tum">Tüm sınıflar</option><option value="yok">Sınıfı olmayanlar</option>
          {veri.siniflar.map(s => <option key={s.id} value={s.id}>{s.ad}{s.aktif ? '' : ' (pasif)'}</option>)}
        </select>
        <select value={durumF} onChange={e => setDurumF(e.target.value)} aria-label="Durum">
          <option value="aktif">Aktif</option><option value="silindi">Kaydı silinenler</option><option value="listede-yok">Öğrenci listesinde olmayanlar</option><option value="tum">Tümü</option>
        </select>
        <span className="hint">{liste.length} öğrenci</span>
      </div>
      <div className="table-card"><div className="scroller">
        <table className="duzen-tablo">
          <thead><tr><th>No</th><th>Adı Soyadı</th><th>Cinsiyet</th><th>Sınıf</th><th>Durum</th><th>Not</th><th></th></tr></thead>
          <tbody>
            {liste.slice(0, GOSTERIM_SINIRI).map(o => {
              const d = deger(o);
              return (
                <tr key={o.no} className={farkli(o) ? 'degisti' : undefined}>
                  <td className="no">{o.no}</td>
                  <td>{o.adi} {o.soyadi}{!o.kayitli && <> <span className="rozet-durum listede-yok" title="Yüklenen öğrenci listesinde yok">listede yok</span></>}</td>
                  <td style={{ width: 90 }}><select value={d.cinsiyet} onChange={e => yaz(o, { cinsiyet: e.target.value })} aria-label="Cinsiyet">
                    <option value="">—</option><option value="K">K</option><option value="E">E</option></select></td>
                  <td style={{ width: 170 }}><select value={d.sinifId ?? ''} onChange={e => yaz(o, { sinifId: e.target.value ? Number(e.target.value) : null })} aria-label="Sınıf">
                    <option value="">— Sınıfı yok —</option>
                    {veri.siniflar.map(s => <option key={s.id} value={s.id}>{s.ad}{s.aktif ? '' : ' (pasif)'}</option>)}</select></td>
                  <td style={{ width: 140 }}><select value={d.durum} onChange={e => yaz(o, { durum: e.target.value })} aria-label="Durum">
                    <option value="aktif">Aktif</option><option value="silindi">Kaydı silindi</option></select></td>
                  <td><input type="text" value={d.not} maxLength={500} onChange={e => yaz(o, { not: e.target.value })} aria-label="Not" /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {farkli(o) && <button className="btn btn-primary btn-kucuk" type="button" disabled={kaydediliyor === o.no} onClick={() => kaydet(o)}>{kaydediliyor === o.no ? '…' : 'Kaydet'}</button>}{' '}
                    <button className="btn btn-secondary btn-kucuk" type="button" onClick={() => setGecmis(o)} title="Değişiklik geçmişi">Geçmiş</button>
                  </td>
                </tr>
              );
            })}
            {!liste.length && <tr><td colSpan={7}><div className="durum">Bu filtreyle öğrenci yok.</div></td></tr>}
          </tbody>
        </table>
      </div></div>
      {liste.length > GOSTERIM_SINIRI && <div className="hint">İlk {GOSTERIM_SINIRI} öğrenci gösteriliyor; aramayı daraltın.</div>}
      {gecmis && <GecmisPaneli o={gecmis} kapat={() => setGecmis(null)} />}
    </section>
  );
}
