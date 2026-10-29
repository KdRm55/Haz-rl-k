'use client';

import { useEffect, useMemo, useState } from 'react';
import { taslakDurumuIslemi, taslakOlusturIslemi, taslakSatirIslemi, taslakYayinlaIslemi } from '@/app/yonetim/islemler';
import { basNorm } from '@/lib/metin';
import type { TaslakDurumu } from '@/lib/siniflandirma';
import { SINIF_HARFLERI } from '@/lib/siniflandirma-kurallari';
import { ListeTablosu, Mesaj, OzetKutu, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

const TUR_AD = { K: 'Kız sınıfları', E: 'Erkek sınıfları', Karma: 'Karma sınıflar' } as const;
const ETIKET = { hata: 'Hata', uyari: 'Uyarı', bilgi: 'Bilgi' } as const;
type Form = { duzen: 'AYRI' | 'KARMA'; kiz: string; erkek: string; karma: string; yontem: 'SEVIYELI' | 'DENGELI' };
type Taslakli = Extract<TaslakDurumu, { taslakVar: true }>;
type Yerlesemeyen = { no: string; ad: string; neden: string }[];

const adlar = (bas: number, n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => 'Hazırlık ' + SINIF_HARFLERI.charAt(bas + i));
const pay = (toplam: number, n: number) => { if (!n) return ''; const k = Math.floor(toplam / n), f = toplam % n; return f ? `${k + 1} / ${k}` : String(k); };

function DuzenFormu({ d, f, setF }: { d: TaslakDurumu; f: Form; setF: (f: Form) => void }) {
  const ayri = f.duzen === 'AYRI', o = d.ozet;
  const k = parseInt(f.kiz, 10) || 0, e = parseInt(f.erkek, 10) || 0, m = parseInt(f.karma, 10) || 0;
  const sayi = (et: string, v: string, p: (x: string) => void, en = 0) => <label className="alan">{et}<input type="number" min={en} max={20} step={1} value={v} onChange={x => p(x.target.value)} /></label>;
  return (
    <>
      <div className="form-izgara">
        <label className="alan">Düzen
          <select value={f.duzen} onChange={x => setF({ ...f, duzen: x.target.value as Form['duzen'] })}>
            <option value="AYRI">Kız ve erkek sınıfları ayrı</option><option value="KARMA">Karma sınıflar</option>
          </select></label>
        {ayri ? <>{sayi('Kız sınıfı sayısı', f.kiz, v => setF({ ...f, kiz: v }))}{sayi('Erkek sınıfı sayısı', f.erkek, v => setF({ ...f, erkek: v }))}</>
          : sayi('Sınıf sayısı', f.karma, v => setF({ ...f, karma: v }), 1)}
        <label className="alan">Dağıtım yöntemi
          <select value={f.yontem} onChange={x => setF({ ...f, yontem: x.target.value as Form['yontem'] })}>
            <option value="SEVIYELI">Seviyeli (puan sırasıyla)</option><option value="DENGELI">Dengeli (karışık puanlar)</option>
          </select></label>
      </div>
      <div className="kural-metin" style={{ fontWeight: 500, fontSize: 14 }}>
        {ayri ? <>
          <strong>Kız:</strong> {k ? <>{adlar(0, k).join(', ')} <span className="hint">({o.kiz} öğrenci → sınıf başına {pay(o.kiz, k)})</span></> : '—'}<br />
          <strong>Erkek:</strong> {e ? <>{adlar(k, e).join(', ')} <span className="hint">({o.erkek} öğrenci → sınıf başına {pay(o.erkek, e)})</span></> : '—'}
        </> : <><strong>Karma:</strong> {m ? <>{adlar(0, m).join(', ')} <span className="hint">({o.yerlesecek} öğrenci → sınıf başına {pay(o.yerlesecek, m)})</span></> : '—'}</>}
      </div>
      <p className="aciklama">{f.yontem === 'SEVIYELI'
        ? 'Her cinsiyet kendi içinde yazılı puanına göre en yüksekten sıralanır; sınava girmeyenler en sona konur. İlk sınıf payına ulaşınca sıradaki sınıfa geçilir. Böylece en iyi puanlılar ilk sınıfta toplanır, sınava girmeyenler son sınıfa düşer. Muaf öğrenciler dağıtıma girmez.'
        : 'Her turda her sınıfa birer öğrenci verilir; sınıf mevcutları en fazla 1 farklı olur, puan ortalamaları birbirine yaklaşır, sınava girmeyenler sınıflara eşit dağılır. Muaf öğrenciler dağıtıma girmez.'}</p>
    </>
  );
}

function TaslakTablosu({ d, guncelle }: { d: Taslakli; guncelle: (no: string, v: { sinif?: string; sabit?: boolean }) => void }) {
  const [ara, setAra] = useState('');
  const [sinifF, setSinifF] = useState('tum');
  const liste = useMemo(() => {
    const q = basNorm(ara);
    return d.satirlar.filter(r => (sinifF === 'tum' || (sinifF === '' ? !r.sinif : r.sinif === sinifF)) &&
      (!q || r.no.includes(q.replace(/\s/g, '')) || basNorm(r.adi + ' ' + r.soyadi).includes(q)));
  }, [d.satirlar, ara, sinifF]);
  return (
    <details className="liste" open>
      <summary>Taslak ({d.satirlar.length} öğrenci) — sınıfı değiştirdiğiniz öğrenci otomatik sabitlenir</summary>
      <div style={{ padding: '0 10px 10px' }}>
        <div className="filtre">
          <input type="search" placeholder="Numara ya da ad ile ara" value={ara} onChange={e => setAra(e.target.value)} aria-label="Taslakta ara" />
          <select value={sinifF} onChange={e => setSinifF(e.target.value)} aria-label="Sınıf">
            <option value="tum">Tüm sınıflar</option><option value="">Sınıf seçilmemiş</option>
            {d.sinifAdlari.map(s => <option key={s}>{s}</option>)}
          </select>
          <span className="hint">{liste.length} öğrenci</span>
        </div>
        <div className="table-card"><div className="scroller">
          <table className="duzen-tablo">
            <thead><tr><th>No</th><th>Adı Soyadı</th><th>Cins.</th><th>Yazılı</th><th>Sonuç</th><th>Sınıf</th><th>Sabit</th><th>Yayındaki</th></tr></thead>
            <tbody>{liste.slice(0, 400).map(r => (
              <tr key={r.no}>
                <td className="no">{r.no}</td><td>{r.adi} {r.soyadi}</td><td>{r.cinsiyet}</td><td className="no">{r.yazili.replace('.', ',')}</td><td>{r.sonuc}</td>
                <td style={{ width: 150 }}><select value={r.sinif} onChange={e => guncelle(r.no, { sinif: e.target.value })} aria-label="Sınıf">
                  <option value="">—</option>{d.sinifAdlari.map(s => <option key={s}>{s}</option>)}</select></td>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={r.sabit} onChange={e => guncelle(r.no, { sabit: e.target.checked })} aria-label="Sabit" style={{ width: 18, height: 18, accentColor: 'var(--brand)' }} /></td>
                <td>{r.yayindaki !== r.sinif ? <span className="rozet-durum listede-yok">{r.yayindaki || 'sınıfsız'}</span> : r.yayindaki}</td>
              </tr>
            ))}</tbody>
          </table>
        </div></div>
        {liste.length > 400 && <div className="hint">İlk 400 öğrenci gösteriliyor; aramayı daraltın.</div>}
      </div>
    </details>
  );
}

export function SinifOlusturmaSekmesi({ degisti }: { degisti: () => void }) {
  const cagir = useCagir();
  const { veri: d, setVeri, hata, yenile } = useVeri(taslakDurumuIslemi);
  const [f, setF] = useState<Form>({ duzen: 'AYRI', kiz: '0', erkek: '0', karma: '1', yontem: 'SEVIYELI' });
  const [koru, setKoru] = useState(true);
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [yerlesemeyen, setYerlesemeyen] = useState<Yerlesemeyen>([]);
  const [bekliyor, setBekliyor] = useState('');
  const [formDolu, setFormDolu] = useState(false);
  useEffect(() => {
    if (d && !formDolu) { setF({ duzen: d.duzen.duzen, kiz: String(d.duzen.kiz), erkek: String(d.duzen.erkek), karma: String(d.duzen.karma || 1), yontem: d.duzen.yontem }); setFormDolu(true); }
  }, [d, formDolu]);

  async function olustur() {
    if (d?.taslakVar && !confirm((koru
      ? 'Sabit işaretli olmayan öğrencilerin sınıfları yeniden hesaplanacak.' + (d.sabit ? ` ${d.sabit} sabit öğrencinin yeri korunacak.` : '')
      : 'DİKKAT: "Sabitleri koru" kapalı. Taslakta elle yaptığınız TÜM değişiklikler silinecek ve herkes baştan dağıtılacak.') +
      '\n\nFormdaki sınıf düzeni ve dağıtım yöntemi kullanılır. Yayındaki sınıf listeleri değişmez; yalnızca taslak güncellenir. Devam edilsin mi?')) return;
    setBekliyor('taslak'); setMesaj(null);
    const r = await cagir(taslakOlusturIslemi(koru, f));
    setBekliyor('');
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setVeri(r.veri.durum); setYerlesemeyen(r.veri.yerlesemeyen);
    setMesaj({ metin: <>Taslak hazırlandı: {r.veri.sayi} öğrenci dağıtıldı{r.veri.sabitKorunan ? `, ${r.veri.sabitKorunan} sabit öğrencinin yeri korundu` : ''}
      {r.veri.yerlesemeyen.length > 0 && <>. <strong>{r.veri.yerlesemeyen.length} öğrenci yerleştirilemedi</strong> (listeye bakın)</>}. Aşağıdaki taslakta istediğiniz öğrencinin sınıfını değiştirebilirsiniz; değiştirdikleriniz otomatik sabitlenir.</> });
  }
  async function satir(no: string, v: { sinif?: string; sabit?: boolean }) {
    const r = await cagir(taslakSatirIslemi(no, v));
    if (r.ok) setVeri(r.veri); else setMesaj({ metin: r.hata, hata: true });
  }
  async function yayinla() {
    if (!d?.taslakVar || d.hata) return;
    const g = d.degisim;
    if (!confirm('Sınıf listeleri yayınlansın mı?\n\n' + d.metrik.siniflar.map(x => `${x.ad}: ${x.n} öğrenci`).join('\n') +
      (g.ilkYayin ? '' : `\n\n${g.tasinanSayi} öğrencinin sınıfı değişecek, ${g.yeniSayi} yeni, ${g.cikanSayi} çıkan.`) +
      '\n\nÖğrenciler ve hocalar yeni listeleri hemen görecek. Her değişiklik öğrencinin geçmişine yazılır.')) return;
    setBekliyor('yayin'); setMesaj(null);
    const r = await cagir(taslakYayinlaIslemi(d.imza));
    setBekliyor('');
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    const y = r.veri.ozet;
    setVeri(r.veri.durum); degisti();
    setMesaj({ metin: <><strong>Sınıf listeleri yayınlandı ({y.kaynak}).</strong> {y.ogrenci} öğrenci {y.sinif} sınıfta.{' '}
      {y.tasinan || y.yeni || y.cikan ? `${y.tasinan} öğrencinin sınıfı değişti, ${y.yeni} öğrenci ilk kez yerleşti, ${y.cikan} öğrenci listeden çıktı. ` : ''}
      {y.kapanan.length ? `Düzende olmayan ${y.kapanan.join(', ')} kapatıldı (pasif yapıldı). ` : ''}Her değişiklik öğrenci geçmişinde.</> });
  }

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!d) return <Yukleniyor />;
  const o = d.ozet, t = d.siniflarTanim;
  const uyarilar = [
    d.derssiz.length && `Dersliği girilmemiş sınıflar: ${d.derssiz.join(', ')}. Öğrenciler dersliği "-" görür; "Sınıflar" sekmesinden ekleyin (yayından sonra da eklenebilir).`,
    o.cinsiyetsiz && (t.K.length || t.E.length) && !t.Karma.length && `${o.cinsiyetsiz} öğrencinin cinsiyeti bilinmiyor; kız/erkek sınıflarına yerleştirilemez. Öğrenci listesinde Cinsiyet sütununu doldurup yeniden yükleyin ya da "Öğrenci listesi" sekmesinden girin.`,
    o.sonucuBelirsiz && `${o.sonucuBelirsiz} öğrencinin sınav sonucu henüz belli değil. Muaf olurlarsa sınıftan çıkarılmaları gerekir; mümkünse sınav aşamalarını tamamlayıp sonra dağıtın.`
  ].filter(Boolean) as string[];
  const g = d.taslakVar ? d.degisim : null;
  const degisimYok = !!g && !g.ilkYayin && !g.tasinanSayi && !g.yeniSayi && !g.cikanSayi;
  const seviyeli = d.yontem !== 'DENGELI';

  return (
    <section>
      <div className="adim">
        <div className="bolum-baslik">Yerleştirilecek öğrenciler</div>
        <div className="ozet">
          <OzetKutu deger={o.yerlesecek} etiket="yerleştirilecek" tur="yeni" />
          <OzetKutu deger={o.kiz} etiket="kız" /><OzetKutu deger={o.erkek} etiket="erkek" />
          <OzetKutu deger={o.cinsiyetsiz} etiket="cinsiyeti bilinmeyen" tur={o.cinsiyetsiz ? 'uyari' : ''} />
          <OzetKutu deger={o.puansiz} etiket="sınava girmeyen / puansız" />
          <OzetKutu deger={o.muaf} etiket="muaf (dağıtıma girmez)" tur="temiz" />
        </div>
        {uyarilar.length > 0 && <p className="aciklama uyari-metin">{uyarilar.map((u, i) => <span key={i}>{i > 0 && <br />}{u}</span>)}</p>}
      </div>
      <div className="adim">
        <div className="bolum-baslik">Sınıf düzeni ve dağıtım</div>
        <DuzenFormu d={d} f={f} setF={setF} />
        <div className="actions" style={{ marginBottom: 0, alignItems: 'center' }}>
          <button className="btn btn-primary" type="button" onClick={olustur} disabled={!!bekliyor}>{bekliyor === 'taslak' ? 'Dağıtılıyor…' : d.taslakVar ? 'Yeniden dağıt' : 'Taslak oluştur'}</button>
          <label className="onay" style={{ margin: 0 }}><input type="checkbox" checked={koru} onChange={e => setKoru(e.target.checked)} /><span>Sabit işaretli öğrencilerin yerini koru</span></label>
        </div>
      </div>
      <Mesaj m={mesaj} />
      {d.taslakVar && (
        <>
          <div className="denge">{d.metrik.denge.map(x => {
            const iyi = seviyeli ? x.sayiFark <= 1 : x.sayiFark <= 1 && x.puansizFark <= 1;
            return <div key={x.tur} className={'denge-kutu' + (iyi ? '' : ' dengesiz')}><strong>{TUR_AD[x.tur]} ({x.sinif})</strong>
              Öğrenci sayısı farkı {x.sayiFark}{seviyeli ? ' · Sınıflar puan sırasına göre dolduruldu' : ` · Puan ortalaması farkı ${x.ortFark} · Sınava girmeyen farkı ${x.puansizFark}`}</div>;
          })}</div>
          <div className="table-card"><div className="scroller"><table>
            <thead><tr><th>Sınıf</th><th>Tür</th><th>Öğrenci</th><th>Kız</th><th>Erkek</th><th>Puan ort.</th><th>En düşük–en yüksek</th><th>Sınava girmeyen</th><th>Kapasite</th></tr></thead>
            <tbody>{d.metrik.siniflar.map(x => (
              <tr key={x.ad}><td><strong>{x.ad}</strong></td><td>{x.tur}</td><td className="no" style={x.kapasite && x.n > x.kapasite ? { color: 'var(--err)', fontWeight: 700 } : undefined}>{x.n}</td>
                <td className="no">{x.K}</td><td className="no">{x.E}</td><td className="no">{x.ort == null ? '—' : String(x.ort).replace('.', ',')}</td>
                <td className="no">{x.min == null ? '—' : `${x.min}–${x.max}`}</td><td className="no">{x.puansiz}</td><td className="no">{x.kapasite || '—'}</td></tr>
            ))}</tbody>
          </table></div></div>
          {d.sabit > 0 && <p className="aciklama">{d.sabit} öğrenci sabit işaretli (taslakta elle yerleştirilmiş). &quot;Yeniden dağıt&quot; bu öğrencilere dokunmaz.</p>}
          <ListeTablosu baslik="Yerleştirilemeyenler" sayi={yerlesemeyen.length} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Neden']} satirlar={yerlesemeyen.map(x => [x.no, x.ad, x.neden])} />
          {d.sorunlar.length > 0 && <ul className="sorun-listesi">{d.sorunlar.map((x, i) => <li key={i} className={'sorun ' + x.seviye}><span className="rozet">{ETIKET[x.seviye]}</span><div><span className="konu">{x.konu}:</span> {x.ayrinti}</div></li>)}</ul>}
          {!d.degisim.ilkYayin && <>
            <ListeTablosu baslik="Sınıfı değişecek öğrenciler" sayi={d.degisim.tasinanSayi} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Şu anki sınıf', 'Yeni sınıf']} satirlar={d.degisim.tasinan.map(x => [x.no, x.ad, x.eski, x.yeni])} />
            <ListeTablosu baslik="İlk kez yerleşecek öğrenciler" sayi={d.degisim.yeniSayi} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Sınıf']} satirlar={d.degisim.yeni.map(x => [x.no, x.ad, x.sinif])} />
            <ListeTablosu baslik="Sınıf listesinden çıkacak öğrenciler" sayi={d.degisim.cikanSayi} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Şu anki sınıf', 'Neden']} satirlar={d.degisim.cikan.map(x => [x.no, x.ad, x.eski, x.neden])} />
          </>}
          <TaslakTablosu d={d} guncelle={satir} />
          <div className="adim">
            <div className="bolum-baslik">Yayınla</div>
            <p className="aciklama">{d.hata
              ? <><span style={{ color: 'var(--err)', fontWeight: 700 }}>Taslakta {d.hata} hata var; hatalar giderilmeden yayınlanamaz.</span> Taslakta düzeltin ya da &quot;Yeniden dağıt&quot;a basın.</>
              : degisimYok ? 'Taslak, yayındaki sınıf listeleriyle aynı; yayınlanacak değişiklik yok.'
              : <>Yayınladığınızda sınıf listeleri bu taslaktan yeniden kurulur. Öğrenci sorgulama ve hoca imza sirküleri yeni listeyi hemen kullanır.{!d.degisim.ilkYayin && <strong> {d.degisim.tasinanSayi} öğrencinin sınıfı değişecek, {d.degisim.yeniSayi} öğrenci ilk kez yerleşecek, {d.degisim.cikanSayi} öğrenci listeden çıkacak.</strong>}</>}</p>
            <div className="actions" style={{ marginBottom: 0 }}>
              <button className="btn btn-primary" type="button" onClick={yayinla} disabled={!!bekliyor || !!d.hata || degisimYok}>{bekliyor === 'yayin' ? 'Yayınlanıyor…' : 'Sınıf listelerini yayınla'}</button>
              <button className="btn btn-secondary" type="button" onClick={() => { setMesaj(null); yenile(); }}>Yenile</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
