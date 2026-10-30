'use client';

import { useRef, useState } from 'react';
import { ogrenciListesiIslemi, syDurumIslemi, syFarkIslemi, syGuncelleIslemi, syKaydetIslemi, syOnizleIslemi, sySilIslemi, syTaniIslemi, syYayinIslemi } from '@/app/yonetim/islemler';
import type { SyMeta } from '@/lib/donem-kurallari';
import { dosyaOku, xlsxIndir } from '@/lib/dosya-oku';
import type { Sonuc } from '@/lib/islem-sonucu';
import type { SyDurum, SyFarki, SyTani } from '@/lib/sinav-yeri';
import { ListeTablosu, Mesaj, OzetKutu, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

type Liste = SyDurum['listeler'][number];
type Onizleme = Extract<Awaited<ReturnType<typeof syOnizleIslemi>>, { ok: true }>['veri'];
const ALANLAR = [
  ['no', 'Öğrenci No *'], ['salon', 'Sınav salonu *'], ['sira', 'Sıra no'], ['adi', 'Adı'], ['soyadi', 'Soyadı'], ['adSoyad', 'Adı Soyadı (tek sütun)'],
  ['kitapcik', 'Kitapçık türü'], ['sinavAdi', 'Sınav adı'], ['sinavKodu', 'Sınav kodu'], ['tarih', 'Sınav tarihi'], ['saat', 'Sınav saati'], ['yer', 'Sınav yeri (bina)']
] as const;
const SABLON_BASLIK = ['Öğrenci No', 'Adı', 'Soyadı', 'Sınıf', 'Sınav Salonu', 'Sıra No', 'Kitapçık Türü', 'Sınav Adı', 'Sınav Tarihi', 'Sınav Saati', 'Sınav Yeri'];
const trIso = (t: string) => { const m = String(t || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
const isoTr = (i: string) => { const m = String(i || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}.${m[2]}.${m[1]}` : i; };
const bosMeta: SyMeta = { ad: '', sinavKodu: '', tarih: '', saat: '', yer: '', aciklama: '', donemKod: '' };

function MetaFormu({ m, setM, donem }: { m: SyMeta; setM: (m: SyMeta) => void; donem: SyDurum['donemSinavlari'] }) {
  const alan = (k: keyof SyMeta, et: string, p: { genis?: boolean; max?: number; placeholder?: string } = {}) => (
    <label className={p.genis ? 'genis' : undefined}>{et}<input type="text" maxLength={p.max ?? 100} placeholder={p.placeholder} value={m[k]} onChange={e => setM({ ...m, [k]: e.target.value })} /></label>
  );
  return (
    <div className="sy-meta-form">
      {alan('ad', 'Sınav adı', { genis: true })}
      <label>Tarih<input type="date" value={trIso(m.tarih)} onChange={e => setM({ ...m, tarih: isoTr(e.target.value) })} /></label>
      {alan('saat', 'Saat', { max: 20, placeholder: 'Örn. 10.00' })}
      {alan('yer', 'Sınav yeri (bina)')}
      {alan('sinavKodu', 'Sınav kodu', { max: 30 })}
      {alan('aciklama', 'Öğrenciye açıklama (isteğe bağlı)', { genis: true, max: 300, placeholder: 'Örn. Sınava kimliğinizle ve 15 dakika önce gelin.' })}
      {donem.length > 0 && <label className="genis">Bağlı dönem sınavı (isteğe bağlı)
        <select value={m.donemKod} onChange={e => setM({ ...m, donemKod: e.target.value })}><option value="">— yok —</option>{donem.map(x => <option key={x.kod} value={x.kod}>{x.kod} · {x.ad}</option>)}</select></label>}
    </div>
  );
}

function Yukleme({ d, hedef, setHedef, bitti, mesaj }: { d: SyDurum; hedef: Liste | null; setHedef: (l: Liste | null) => void; bitti: (d: SyDurum, m: string) => void; mesaj: (m: MesajDurumu) => void }) {
  const cagir = useCagir();
  const dosyaRef = useRef<HTMLInputElement>(null);
  const [satirlar, setSatirlar] = useState<string[][]>([]);
  const [dosyaAdi, setDosyaAdi] = useState('');
  const [oniz, setOniz] = useState<Onizleme | null>(null);
  const [es, setEs] = useState<Record<string, number>>({});
  const [f, setF] = useState<SyFarki | null>(null);
  const [m, setM] = useState<SyMeta>(bosMeta);
  const [durum, setDurum] = useState('');
  const [bekliyor, setBekliyor] = useState(false);

  async function denetle(e = es, s = satirlar, o = oniz) {
    setBekliyor(true);
    const r = await cagir(syFarkIslemi({ satirlar: s, basSatir: o!.basSatir, eslesme: e, dosyaAdi }));
    setBekliyor(false);
    if (!r.ok) { mesaj({ metin: r.hata, hata: true }); setF(null); return; }
    setF(r.veri);
    setM(hedef ? { ad: hedef.ad, sinavKodu: hedef.sinavKodu, tarih: hedef.tarih, saat: hedef.saat, yer: hedef.yer, aciklama: hedef.aciklama, donemKod: hedef.donemKod }
      : { ...bosMeta, ad: r.veri.meta.sinavAdi[0] ?? '', sinavKodu: r.veri.meta.sinavKodu[0] ?? '', tarih: r.veri.meta.tarih[0] ?? '', saat: r.veri.meta.saat[0] ?? '', yer: r.veri.meta.yer[0] ?? '' });
  }
  async function dosya(file: File | undefined) {
    setOniz(null); setF(null); mesaj(null);
    if (!file) return;
    setDurum('Okunuyor…');
    try {
      const k = await dosyaOku(file);
      const s = k.sayfalar.map(ad => k.satirlar(ad)).find(r => r.some(x => x.some(v => v.trim())));
      if (!s) { setDurum('Dosyada veri bulunamadı.'); return; }
      setSatirlar(s); setDosyaAdi(file.name);
      const r = await cagir(syOnizleIslemi(s, null));
      if (!r.ok) { setDurum(r.hata); return; }
      setDurum(''); setOniz(r.veri);
      const e = { ...r.veri.eslesme };
      setEs(e);
      if (e.no > -1 && e.salon > -1) await denetle(e, s, r.veri);
    } catch (e) { setDurum('Dosya okunamadı: ' + (e instanceof Error ? e.message : String(e))); }
  }
  async function sablonIndir(dolu: boolean) {
    let ogr: string[][] = [];
    if (dolu) {
      setDurum('Şablon hazırlanıyor…');
      const r = await cagir(ogrenciListesiIslemi());
      if (!r.ok) { setDurum(r.hata); return; }
      ogr = r.veri.ogrenciler.filter(o => o.durum === 'aktif' && o.sinif).map(o => [o.no, o.adi, o.soyadi, o.sinif]);
    }
    await xlsxIndir('Sinav_Yeri_Sablon.xlsx', 'Sınav Yerleri', [SABLON_BASLIK, ...ogr], [14, 18, 18, 16, 16, 10, 14, 24, 14, 12, 18]);
    setDurum(dolu ? `Sinav_Yeri_Sablon.xlsx indirildi (${ogr.length} öğrenci). Salon ve sıra numaralarını doldurup buradan yükleyin; salonu boş kalan satırlar alınmaz.`
      : 'Sinav_Yeri_Sablon.xlsx indirildi. Öğrenci No ve Sınav Salonu zorunludur; Sınav Adı, Tarihi, Saati ve Yeri boş bırakılırsa yüklerken yazılabilir.');
  }
  async function kaydet() {
    if (!m.ad.trim()) { alert('Sınavın adını yazın.'); return; }
    setBekliyor(true);
    const r = await cagir(syKaydetIslemi({ satirlar, basSatir: oniz!.basSatir, eslesme: es, dosyaAdi, meta: m, listeKod: hedef?.kod }));
    setBekliyor(false);
    if (!r.ok) { mesaj({ metin: r.hata, hata: true }); return; }
    setOniz(null); setF(null); setHedef(null); if (dosyaRef.current) dosyaRef.current.value = '';
    bitti(r.veri.durum, r.veri.mesaj);
  }
  const tanindi = oniz ? ALANLAR.filter(([k]) => (es[k] ?? -1) > -1).map(([, et]) => et.replace(' *', '')) : [];
  const eksik = !!oniz && ((es.no ?? -1) === -1 || (es.salon ?? -1) === -1);
  const s = f?.sayilar;
  const cok = (a: string[], ne: string) => (a.length > 1 ? <div className="uyari-metin" style={{ fontSize: 13 }}>Dosyada birden fazla {ne} var ({a.slice(0, 4).join(', ')}); hepsi tek liste olarak kaydedilir.</div> : null);

  return (
    <div className="adim">
      <div className="bolum-baslik">Sınav yeri listesi yükle</div>
      <p className="aciklama">Kelebek sistemden aldığınız yerleşim listesini (Excel ya da CSV) ya da doldurduğunuz şablonu yükleyin. &quot;Öğrencilerle şablon&quot; sınıftaki aktif öğrencileri yazılı verir; salon ve sıra sütunlarını doldurmanız yeter. Öğrenci numarası, salon ve sıra numarası okunur; yayınladığınızda öğrenciler numaralarıyla salonlarını ve sıralarını görür. Kitapçık türü saklanır ama öğrenciye gösterilmez. Sistemde kaydı olmayan öğrenci de numarasıyla yerini görür.</p>
      <div className="dosya-satir">
        <input ref={dosyaRef} type="file" accept=".xlsx,.csv" onChange={e => dosya(e.target.files?.[0])} />
        <button type="button" className="btn btn-secondary" onClick={() => sablonIndir(false)}>📄 Boş şablon</button>
        <button type="button" className="btn btn-secondary" onClick={() => sablonIndir(true)}>📄 Öğrencilerle şablon</button>
        {hedef && <span className="hint">Yüklenecek dosya &quot;{hedef.ad}&quot; ({hedef.kod}) listesinin yerine geçecek; yayın durumu korunur. <button type="button" className="btn btn-secondary btn-kucuk" onClick={() => setHedef(null)}>Vazgeç</button></span>}
      </div>
      {durum && <div className="hint" style={{ textAlign: 'left', marginTop: 8 }}>{durum}</div>}
      {oniz && (
        <div className="ds-alt-bolum">
          {eksik ? <div className="hata-kutu" style={{ margin: '0 0 10px' }}>Öğrenci No ya da Sınav salonu sütunu tanınamadı; aşağıdan seçin.</div>
            : <p className="aciklama" style={{ margin: '0 0 6px' }}>Tanınan sütunlar: {tanindi.join(', ')}.</p>}
          <details open={eksik}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13.5 }}>Sütun eşleştirmesini göster / düzelt</summary>
            <div className="sy-meta-form">{ALANLAR.map(([k, et]) => (
              <label key={k}>{et}<select value={es[k] ?? -1} onChange={e => { setEs(v => ({ ...v, [k]: Number(e.target.value) })); setF(null); }}>
                <option value={-1}>— yok —</option>{oniz.sutunlar.map(c => <option key={c.i} value={c.i}>{c.ad}</option>)}</select></label>
            ))}</div>
          </details>
          <button type="button" className="btn btn-primary" style={{ marginTop: 10 }} disabled={bekliyor} onClick={() => denetle()}>{bekliyor && !f ? 'Denetleniyor…' : 'Listeyi denetle'}</button>
          {f && s && (
            <>
              <div className="ozet" style={{ marginTop: 12 }}>
                <OzetKutu deger={s.kayit} etiket="öğrenci" tur="yeni" /><OzetKutu deger={s.salon} etiket="salon" />
                <OzetKutu deger={s.hatali} etiket="alınmayacak satır" tur={s.hatali ? 'uyari' : ''} />
                <OzetKutu deger={s.siraTekrar} etiket="aynı salonda tekrar eden sıra" tur={s.siraTekrar ? 'uyari' : ''} />
                <OzetKutu deger={s.kayitsiz} etiket="sistemde kaydı olmayan" />
              </div>
              <div className="sy-salonlar">{f.salonOzet.map(x => <span key={x.salon} className="sy-salon">{x.salon}: {x.n}</span>)}</div>
              <ListeTablosu baslik="Alınmayacak satırlar" sayi={s.hatali} kolonlar={['Dosya satırı', 'No', 'Ad', 'Neden']} satirlar={f.hatali.map(x => [x.satir, x.no, x.ad, x.neden])} />
              <ListeTablosu baslik="Aynı salonda tekrar eden sıra numaraları" sayi={s.siraTekrar} kolonlar={['Salon', 'Sıra', 'Numaralar']} satirlar={f.siraTekrar.map(x => [x.salon, x.sira, x.nolar])} />
              <ListeTablosu baslik="Sistemde kaydı olmayanlar (yine de yerlerini görebilirler)" sayi={s.kayitsiz} kolonlar={['No', 'Ad', 'Durum']} satirlar={f.kayitsiz.map(x => [x.no, x.ad, x.neden])} />
              <ListeTablosu baslik="Sistemde kayıtlı olup bu listede olmayanlar" sayi={s.listedeYok} kolonlar={['No', 'Adı Soyadı']} satirlar={f.listedeYok.map(x => [x.no, x.ad])} />
              <div className="ds-alt-bolum">
                <h4>Öğrencinin göreceği bilgiler</h4>
                {cok(f.meta.sinavAdi, 'sınav adı')}{cok(f.meta.tarih, 'tarih')}
                <MetaFormu m={m} setM={setM} donem={d.donemSinavlari} />
                {!f.meta.saat.length && <p className="aciklama" style={{ margin: '-4px 0 8px' }}>Dosyada saat yok; yukarıya yazın.</p>}
                <button type="button" className="btn btn-primary" disabled={!s.kayit || bekliyor} onClick={kaydet}>{hedef ? 'Listeyi yenile' : 'Listeyi kaydet'} ({s.kayit} öğrenci)</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Tani() {
  const cagir = useCagir();
  const [no, setNo] = useState('');
  const [r, setR] = useState<SyTani | string | null>(null);
  const renk: Record<string, string> = { gorunur: 'var(--ok)', gizli: 'var(--warn)', eski: 'var(--warn)', yok: '#64748b', tamam: 'var(--ok)', bulunamadi: 'var(--err)', hata: 'var(--err)' };
  const isaret: Record<string, string> = { gorunur: '✓', gizli: '!', eski: '!', yok: '–', tamam: '✓', bulunamadi: '✗', hata: '✗' };
  async function calistir() {
    if (!no.trim()) return;
    setR('Kontrol ediliyor…');
    const x = await cagir(syTaniIslemi(no.trim()));
    setR(x.ok ? x.veri : x.hata);
  }
  const satir = (durum: string, baslik: React.ReactNode, aciklama: string, k: string) => (
    <li key={k} style={{ display: 'flex', gap: 10, padding: '6px 0', borderTop: '1px solid #eef1f6' }}>
      <b style={{ color: renk[durum], width: 16, textAlign: 'center' }}>{isaret[durum]}</b>
      <div><div>{baslik}</div><div style={{ fontSize: 13, color: '#475569' }}>{aciklama}</div></div>
    </li>
  );
  return (
    <div className="adim">
      <div className="bolum-baslik">Numarayla kontrol et</div>
      <p className="aciklama" style={{ marginTop: 0 }}>Bir öğrenci sınav yerini göremiyorsa numarasını yazın; hangi listede olduğunu ve neden görüp görmediğini gösterir.</p>
      <div className="dosya-satir">
        <input type="text" inputMode="numeric" maxLength={15} placeholder="Öğrenci numarası" value={no} onChange={e => setNo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') calistir(); }}
          style={{ padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 14, maxWidth: 220 }} aria-label="Öğrenci numarası" />
        <button type="button" className="btn btn-secondary" onClick={calistir}>Kontrol et</button>
      </div>
      {typeof r === 'string' && <div className="durum">{r}</div>}
      {r && typeof r !== 'string' && (
        <>
          <div style={{ marginTop: 10, fontSize: 14 }}><strong>{r.numara}{r.ad ? ' · ' + r.ad : ''}</strong> <span className="hint">({r.kayitli ? 'sistemde kayıtlı' : 'sistemde kaydı yok'})</span></div>
          {!r.listeler.length && <p className="aciklama">Henüz sınav yeri listesi yüklenmemiş.</p>}
          <ul className="sorun-listesi" style={{ marginTop: 8 }}>
            {r.listeler.map(x => satir(x.durum, <><strong>{x.ad}</strong> <span className="hint">{x.liste}{x.tarih ? ' · ' + x.tarih : ''}</span></>, x.aciklama, x.liste))}
            {satir(r.sorgu.durum, <strong>Öğrenci sorgusu</strong>, r.sorgu.aciklama, '__sorgu')}
          </ul>
        </>
      )}
    </div>
  );
}

function ListeKarti({ l, d, setDurum, mesaj, yenile }: { l: Liste; d: SyDurum; setDurum: (d: SyDurum) => void; mesaj: (m: MesajDurumu) => void; yenile: () => void }) {
  const cagir = useCagir();
  const [duzen, setDuzen] = useState<SyMeta | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const donemAd = new Map(d.donemSinavlari.map(x => [x.kod, x.ad]));
  async function calis(p: Promise<Sonuc<{ mesaj: string; durum: SyDurum }>>) {
    setBekliyor(true);
    const r = await cagir(p);
    setBekliyor(false);
    if (r.ok) { setDurum(r.veri.durum); mesaj({ metin: r.veri.mesaj }); setDuzen(null); } else mesaj({ metin: r.hata, hata: true });
  }
  return (
    <div className={'ds-kart' + (l.yayinda ? '' : ' arsiv')}>
      <div className="ds-k-ust">
        <div>
          <div className="ds-k-ad">{l.ad}<span className="kod">{l.kod}{l.sinavKodu ? ' · ' + l.sinavKodu : ''}</span></div>
          <div className="ds-k-meta">{[l.tarih, l.saat || 'saat girilmedi', l.yer].filter(Boolean).join(' · ')} · {l.ogrenci} öğrenci{l.donemKod ? ` · Bağlı: ${l.donemKod}${donemAd.get(l.donemKod) ? ' ' + donemAd.get(l.donemKod) : ''}` : ''}</div>
          {l.aciklama && <div className="ds-k-meta">Açıklama: {l.aciklama}</div>}
          <div className="ds-k-meta">Yükleme: {l.yukleme}{l.dosya ? ' · ' + l.dosya : ''}</div>
        </div>
        {l.gorunurluk === 'eski'
          ? <span className="ds-cip uyari" title={`Sınav tarihi ${d.gecmisGun} günden eski olduğu için öğrencilere gösterilmiyor`}>Tarihi geçti — öğrencilere gösterilmiyor</span>
          : <span className={'ds-cip' + (l.yayinda ? ' acik' : '')}>{l.yayinda ? 'Öğrencilere açık' : 'Gizli'}</span>}
      </div>
      <div className="sy-salonlar">{l.salonlar.map(s => <span key={s.salon} className="sy-salon">{s.salon}: {s.n}</span>)}</div>
      <div className="ds-eylem">
        <button type="button" className={'btn btn-kucuk ' + (l.yayinda ? 'btn-secondary' : 'btn-primary')} disabled={bekliyor} onClick={() => {
          if (!l.yayinda && !confirm(`"${l.ad}" sınav yerleri öğrencilere açılsın mı?\n\n${l.ogrenci} öğrenci · ${[l.tarih, l.saat || 'saat girilmemiş'].join(' · ')}` +
            (l.saat ? '' : '\n\nDİKKAT: Saat girilmemiş; öğrenciler yalnızca tarihi görür.'))) return;
          calis(syYayinIslemi(l.kod, !l.yayinda));
        }}>{l.yayinda ? 'Gizle' : 'Yayınla'}</button>
        <button type="button" className="btn btn-secondary btn-kucuk" onClick={() => setDuzen(duzen ? null : { ad: l.ad, sinavKodu: l.sinavKodu, tarih: l.tarih, saat: l.saat, yer: l.yer, aciklama: l.aciklama, donemKod: l.donemKod })}>Bilgileri düzenle</button>
        <button type="button" className="btn btn-secondary btn-kucuk" onClick={yenile}>Yeni sürümünü yükle</button>
        <button type="button" className="btn btn-tehlike btn-kucuk" disabled={bekliyor} onClick={() => { if (confirm(`"${l.ad}" listesi silinsin mi? Öğrenciler bu sınavın yerini artık göremez.`)) calis(sySilIslemi(l.kod)); }}>Sil</button>
      </div>
      {duzen && (
        <div className="ds-alt-bolum">
          <MetaFormu m={duzen} setM={setDuzen} donem={d.donemSinavlari} />
          <div className="ds-eylem">
            <button type="button" className="btn btn-primary btn-kucuk" disabled={bekliyor} onClick={() => calis(syGuncelleIslemi(l.kod, duzen))}>Kaydet</button>
            <button type="button" className="btn btn-secondary btn-kucuk" onClick={() => setDuzen(null)}>Vazgeç</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SinavYeriSekmesi() {
  const { veri: d, setVeri, hata } = useVeri(syDurumIslemi);
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [hedef, setHedef] = useState<Liste | null>(null);
  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!d) return <Yukleniyor />;
  return (
    <section>
      <Yukleme key={hedef?.kod ?? '__yeni'} d={d} hedef={hedef} setHedef={setHedef} mesaj={setMesaj} bitti={(x, m) => { setVeri(x); setMesaj({ metin: m }); }} />
      <Mesaj m={mesaj} />
      <Tani />
      <div className="bolum-baslik">Listeler</div>
      {!d.listeler.length ? <div className="durum">Henüz sınav yeri listesi yüklenmedi.</div>
        : d.listeler.map(l => <ListeKarti key={l.kod} l={l} d={d} setDurum={setVeri} mesaj={setMesaj} yenile={() => { setHedef(l); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}
    </section>
  );
}
