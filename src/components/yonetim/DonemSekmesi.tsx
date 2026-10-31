'use client';

import { useCallback, useState } from 'react';
import { dsArsivIslemi, dsBelgeKaydetIslemi, dsBelgeOnizleIslemi, dsDersTarihIslemi, dsDurumIslemi, dsGuncelleIslemi, dsOgrenciGuncelleIslemi, dsOlusturIslemi, dsYayinIslemi } from '@/app/yonetim/islemler';
import { dosyaOku } from '@/lib/dosya-oku';
import type { DsDurum, DsYayinAlani } from '@/lib/donem-sinav';
import type { Sonuc } from '@/lib/islem-sonucu';
import { DonemPuanTablosu, DonemPuanYukleme } from './DonemPuan';
import { ListeTablosu, Mesaj, OzetKutu, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

type Sinav = DsDurum['sinavlar'][number];
type FormDers = { ders: string; tarih: string; saat: string; eski?: boolean };
const puanTr = (v: number | null) => (v == null ? '—' : String(v).replace('.', ','));
const trIso = (t: string) => { const m = String(t || '').match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };

function SinavFormu({ d, x, kapat, kaydet }: { d: DsDurum; x: Sinav | null; kapat: () => void; kaydet: (v: { ad: string; siniflar?: string[]; dersler: FormDers[] }) => Promise<boolean> }) {
  const [ad, setAd] = useState(x?.ad ?? '');
  const [siniflar, setSiniflar] = useState<string[]>(d.siniflar);
  const [dersler, setDersler] = useState<FormDers[]>(x ? x.dersler.map(y => ({ ders: y.ders, tarih: trIso(y.tarih), saat: y.saat, eski: true })) : [{ ders: '', tarih: '', saat: '' }]);
  const [bekliyor, setBekliyor] = useState(false);
  const yaz = (i: number, p: Partial<FormDers>) => setDersler(l => l.map((y, k) => (k === i ? { ...y, ...p } : y)));
  return (
    <div className="ds-alt-bolum">
      <h4>{x ? `${x.ad} — düzenle` : 'Yeni sınav'}</h4>
      <datalist id="dsDersOneri">{d.dersOneri.map(o => <option key={o} value={o} />)}</datalist>
      <label className="alan" style={{ maxWidth: 420 }}>Sınavın adı<input type="text" maxLength={60} placeholder="Örn. 1. Ara Sınav" value={ad} onChange={e => setAd(e.target.value)} autoFocus /></label>
      {!x ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10 }}>Katılan sınıflar</div>
          <div className="ds-sinif-sec">{d.siniflar.length ? d.siniflar.map(s => (
            <label key={s} className="onay" style={{ margin: 0 }}><input type="checkbox" checked={siniflar.includes(s)} onChange={e => setSiniflar(l => e.target.checked ? [...l, s] : l.filter(y => y !== s))} /><span>{s}</span></label>
          )) : <span className="uyari-metin">Yayında sınıf listesi yok. Önce &quot;Sınıf oluşturma&quot;dan sınıfları yayınlayın.</span>}</div>
        </>
      ) : <p className="aciklama" style={{ margin: '8px 0 0' }}>Sınıflar: {x.siniflar.join(', ')}. Var olan derslerin adı değiştirilemez; tarih ve saati değiştirilebilir, yeni ders eklenebilir, puanı olmayan ders çıkarılabilir.</p>}
      <table className="ds-form-tablo">
        <thead><tr><th>Ders</th><th style={{ width: 170 }}>Tarih</th><th style={{ width: 150 }}>Saat</th><th style={{ width: 70 }} /></tr></thead>
        <tbody>{dersler.map((y, i) => (
          <tr key={i}>
            <td><input type="text" list="dsDersOneri" maxLength={60} placeholder="Örn. SARF" value={y.ders} readOnly={y.eski} style={y.eski ? { background: '#f8fafc' } : undefined} onChange={e => yaz(i, { ders: e.target.value })} aria-label="Ders" /></td>
            <td><input type="date" value={y.tarih} onChange={e => yaz(i, { tarih: e.target.value })} aria-label="Tarih" /></td>
            <td><input type="text" maxLength={20} placeholder="10.00" value={y.saat} onChange={e => yaz(i, { saat: e.target.value })} aria-label="Saat" /></td>
            <td><button type="button" className="btn btn-secondary btn-kucuk" title="Dersi çıkar" onClick={() => setDersler(l => l.filter((_, k) => k !== i))}>✕</button></td>
          </tr>
        ))}</tbody>
      </table>
      <button type="button" className="btn btn-secondary btn-kucuk" onClick={() => setDersler(l => [...l, { ders: '', tarih: '', saat: '' }])}>+ Ders ekle</button>
      <div className="ds-eylem">
        <button type="button" className="btn btn-primary" disabled={bekliyor} onClick={async () => { setBekliyor(true); const ok = await kaydet({ ad, siniflar: x ? undefined : siniflar, dersler }); setBekliyor(false); if (ok) kapat(); }}>
          {x ? 'Değişiklikleri kaydet' : 'Sınavı oluştur'}</button>
        <button type="button" className="btn btn-secondary" onClick={kapat}>Vazgeç</button>
      </div>
    </div>
  );
}

type Ders = Sinav['dersler'][number];
const ADIMLAR = [['tarih', 'Sınav tarihi'], ['yer', 'Sınav giriş belgesi'], ['sonuc', 'Puanlar']] as const;
type BelgeOnizleme = Extract<Awaited<ReturnType<typeof dsBelgeOnizleIslemi>>, { ok: true }>['veri'];

/** Sınav giriş belgesi: kelebek dağıtım programının öğrenci listesi (her öğrencinin salonu ve sırası). */
function GirisBelgesi({ x, d, calis }: { x: Sinav; d: Ders; calis: (p: Promise<Sonuc<DsDurum>>, basari: string, onay?: string) => Promise<void> }) {
  const cagir = useCagir();
  const [acik, setAcik] = useState(false);
  const [dosya, setDosya] = useState<{ ad: string; satirlar: string[][] } | null>(null);
  const [oniz, setOniz] = useState<BelgeOnizleme | null>(null);
  const [durum, setDurum] = useState('');
  const b = d.belge;

  async function sec(f: File | undefined) {
    setOniz(null); setDosya(null);
    if (!f) return;
    setDurum('Okunuyor…');
    try {
      const k = await dosyaOku(f);
      const satirlar = k.sayfalar.map(ad => k.satirlar(ad)).find(r => r.some(y => y.some(v => v.trim())));
      if (!satirlar) { setDurum('Dosyada veri bulunamadı.'); return; }
      const r = await cagir(dsBelgeOnizleIslemi(x.kod, d.ders, satirlar));
      if (!r.ok) { setDurum(r.hata); return; }
      setDurum(''); setDosya({ ad: f.name, satirlar }); setOniz(r.veri);
    } catch (e) { setDurum('Dosya okunamadı: ' + (e instanceof Error ? e.message : String(e))); }
  }
  async function kaydet() {
    if (!dosya || !oniz) return;
    await calis(dsBelgeKaydetIslemi(x.kod, d.ders, dosya.satirlar, dosya.ad),
      `${d.ders} sınav giriş belgesi kaydedildi (${oniz.sayilar.kayit} öğrenci, ${oniz.sayilar.salon} salon).` + (d.yerYayinda ? ' Liste yayında olduğu için öğrenciler yeni yerlerini hemen görür.' : ' Duyurmak için "Sınav giriş belgesini yayınla"ya basın.'));
    setAcik(false); setOniz(null); setDosya(null);
  }
  const s = oniz?.sayilar;
  return (
    <div className="ds-belge">
      <div className="ds-belge-ust">
        <span>{b ? <>Sınav giriş belgesi: <b>{b.ogrenci}</b> öğrenci · {b.salon} salon{b.yer ? ` · ${b.yer}` : ''} <span className="hint">({b.dosya || 'liste'}, {b.yukleme})</span></>
          : <span className="uyari-metin">Sınav giriş belgesi (kelebek listesi) yüklenmedi.</span>}</span>
        <button type="button" className="ds-baglanti" onClick={() => { setAcik(a => !a); setOniz(null); setDurum(''); }}>{acik ? 'Vazgeç' : b ? 'Listeyi yenile' : 'Liste yükle'}</button>
      </div>
      {acik && (
        <div className="ds-belge-yukle">
          <p className="aciklama" style={{ margin: '0 0 6px' }}>Kelebek dağıtım programının öğrenci listesi çıktısını (Excel ya da CSV) seçin. Öğrenci numarası, sınav salonu ve sıra numarası okunur; tarih, saat ve sınav yeri dosyada varsa alınır. Kitapçık türü saklanır, öğrenciye gösterilmez.{b ? ' Yeni liste eskisinin yerine geçer.' : ''}</p>
          <input type="file" accept=".xlsx,.csv" onChange={e => sec(e.target.files?.[0])} />
          {durum && <div className="hint" style={{ textAlign: 'left', marginTop: 6 }}>{durum}</div>}
          {oniz && s && (
            <>
              <div className="ozet" style={{ marginTop: 10 }}>
                <OzetKutu deger={s.kayit} etiket="öğrenci" tur="yeni" /><OzetKutu deger={s.salon} etiket="salon" />
                <OzetKutu deger={s.hatali} etiket="alınmayacak satır" tur={s.hatali ? 'uyari' : ''} />
                <OzetKutu deger={s.siraTekrar} etiket="salonda tekrar eden sıra" tur={s.siraTekrar ? 'uyari' : ''} />
                <OzetKutu deger={s.sinavdaYok} etiket="sınavda olup listede olmayan" tur={s.sinavdaYok ? 'uyari' : ''} />
              </div>
              <div className="sy-salonlar">{oniz.salonOzet.map(y => <span key={y.salon} className="sy-salon">{y.salon}: {y.n}</span>)}</div>
              <div className="hint" style={{ textAlign: 'left' }}>Dosyadaki tarih: {oniz.tarih || '—'}{oniz.saat ? ' ' + oniz.saat : ''}{oniz.yer ? ' · ' + oniz.yer : ''}.
                {' '}{d.tarih ? `Öğrencilere dersin tarihi (${[d.tarih, d.saat].filter(Boolean).join(' ')}) gösterilir.` : 'Dersin tarihi boş olduğu için dosyadaki tarih alınır.'}</div>
              <ListeTablosu baslik="Alınmayacak satırlar" sayi={s.hatali} kolonlar={['Dosya satırı', 'No', 'Ad', 'Neden']} satirlar={oniz.hatali.map(y => [y.satir, y.no, y.ad, y.neden])} />
              <ListeTablosu baslik="Aynı salonda tekrar eden sıra numaraları" sayi={s.siraTekrar} kolonlar={['Salon', 'Sıra', 'Numaralar']} satirlar={oniz.siraTekrar.map(y => [y.salon, y.sira, y.nolar])} />
              <ListeTablosu baslik="Sınavda olup listede olmayanlar (sınav yerini göremez)" sayi={s.sinavdaYok} kolonlar={['No', 'Adı Soyadı', 'Sınıf']} satirlar={oniz.sinavdaYok.map(y => [y.no, y.ad, y.sinif])} />
              <button type="button" className="btn btn-primary btn-kucuk" disabled={!s.kayit} onClick={kaydet}>{b ? 'Listeyi yenile' : 'Listeyi kaydet'} ({s.kayit} öğrenci)</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
const acikMi = (d: Ders, a: DsYayinAlani) => (a === 'tarih' ? d.tarihYayinda : a === 'yer' ? d.yerYayinda : d.sonucYayinda);

/** Bir dersin satırı: tarih/saat düzenleme, puan durumu ve sırayla yayın (tarih → yer → puanlar). */
function DersSatiri({ x, d, bekliyor, calis }: {
  x: Sinav; d: Ders; bekliyor: boolean; calis: (p: Promise<Sonuc<DsDurum>>, basari: string, onay?: string) => Promise<void>;
}) {
  const [duzen, setDuzen] = useState<{ tarih: string; saat: string } | null>(null);
  // Sıradaki aşama: henüz açılmamış ilk adım; hepsi açıksa yok
  const sonraki = ADIMLAR.find(([a]) => !acikMi(d, a))?.[0] ?? null;
  const sonAcik = [...ADIMLAR].reverse().find(([a]) => acikMi(d, a))?.[0] ?? null;
  const yayinla = (a: DsYayinAlani) => {
    const onay = a === 'tarih' ? `${x.ad} · ${d.ders} sınav tarihi (${[d.tarih, d.saat].filter(Boolean).join(' ')}) öğrencilere duyurulsun mu?`
      : a === 'yer' ? `${x.ad} · ${d.ders} sınav giriş belgesi öğrencilere duyurulsun mu?\n\nÖğrenciler salonlarını, sıra numaralarını, sınav yerini, tarihi ve saati görür (${d.belge?.ogrenci ?? 0} öğrenci, ${d.belge?.salon ?? 0} salon).`
      : `${x.ad} · ${d.ders} puanları öğrencilere yayınlansın mı?\n\nGirilen: ${d.girilen} / ${d.n}, girmedi: ${d.girmedi}, boş: ${d.bos}` + (d.bos ? `\n\nDİKKAT: ${d.bos} öğrencinin puanı henüz girilmemiş; bu öğrenciler "Girilmedi" görür.` : '');
    const basari = a === 'tarih' ? `${d.ders} sınav tarihi öğrencilere duyuruldu.` : a === 'yer' ? `${d.ders} sınav giriş belgesi duyuruldu; öğrenciler salon ve sıralarını görebilir.` : `${d.ders} puanları yayınlandı. Öğrenciler kendi hesaplarından görebilir.`;
    calis(dsYayinIslemi(x.kod, a, d.ders, true), basari, onay);
  };
  const gizle = (a: DsYayinAlani) => calis(dsYayinIslemi(x.kod, a, d.ders, false), `${d.ders}: ${a === 'tarih' ? 'sınav duyurusu' : a === 'yer' ? 'sınav giriş belgesi' : 'puanlar'} öğrencilerden gizlendi.`,
    a === 'tarih' ? `${d.ders} sınavı öğrencilerden gizlensin mi? Sınav giriş belgesi ve puanlar da gizlenir.` : a === 'yer' ? `${d.ders} sınav giriş belgesi gizlensin mi? Puanlar da gizlenir.` : `${d.ders} puanları öğrencilerden gizlensin mi?`);
  const engel = sonraki === 'tarih' && !d.tarih ? 'Önce sınav tarihini girin.' : sonraki === 'yer' && !d.belge ? 'Önce sınav giriş belgesini (kelebek listesi) yükleyin.' : sonraki === 'sonuc' && !d.girilen && !d.girmedi ? 'Puanları girdikten sonra yayınlayın.' : '';

  return (
    <div className="ds-ders">
      <div className="ds-ders-ust">
        <div>
          <div className="ds-ders-ad">{d.ders}</div>
          {!duzen ? (
            <div className="ds-k-meta">{[d.tarih, d.saat].filter(Boolean).join(' · ') || 'Tarih girilmedi'} ·{' '}
              <button type="button" className="ds-baglanti" onClick={() => setDuzen({ tarih: trIso(d.tarih), saat: d.saat })}>{d.tarih ? 'Tarihi değiştir' : 'Tarih gir'}</button></div>
          ) : (
            <div className="ds-tarih-form">
              <input type="date" value={duzen.tarih} onChange={e => setDuzen({ ...duzen, tarih: e.target.value })} aria-label="Sınav tarihi" />
              <input type="text" maxLength={20} placeholder="Saat, örn. 10.00" value={duzen.saat} onChange={e => setDuzen({ ...duzen, saat: e.target.value })} aria-label="Sınav saati" />
              <button type="button" className="btn btn-primary btn-kucuk" disabled={bekliyor} onClick={async () => { await calis(dsDersTarihIslemi(x.kod, d.ders, duzen.tarih, duzen.saat), `${d.ders} sınav tarihi kaydedildi.${d.tarihYayinda ? ' Öğrenciler yeni tarihi görür.' : ''}`); setDuzen(null); }}>Kaydet</button>
              <button type="button" className="btn btn-secondary btn-kucuk" onClick={() => setDuzen(null)}>Vazgeç</button>
            </div>
          )}
        </div>
        <div className="ds-puan-ozet">Puan: <b>{d.girilen}</b> / {d.n}{d.girmedi ? ` · ${d.girmedi} girmedi` : ''}{d.bos ? ` · ${d.bos} boş` : ''}{d.ort != null ? ` · ort. ${puanTr(d.ort)}` : ''}</div>
      </div>
      <GirisBelgesi x={x} d={d} calis={calis} />
      <ol className="ds-adimlar" aria-label={d.ders + ' yayın aşamaları'}>
        {ADIMLAR.map(([a, et], i) => {
          const acik = acikMi(d, a);
          return <li key={a} className={acik ? 'acik' : a === sonraki ? 'sirada' : ''}><span className="ds-adim-no">{acik ? '✓' : i + 1}</span>{et}<small>{acik ? 'yayında' : a === sonraki ? 'sırada' : 'bekliyor'}</small></li>;
        })}
      </ol>
      <div className="ds-eylem" style={{ marginTop: 8 }}>
        {sonraki && <button type="button" className="btn btn-primary btn-kucuk" disabled={bekliyor || !!engel} title={engel || undefined} onClick={() => yayinla(sonraki)}>
          {sonraki === 'tarih' ? 'Sınav tarihini yayınla' : sonraki === 'yer' ? 'Sınav giriş belgesini yayınla' : 'Puanları yayınla'}</button>}
        {!sonraki && <span className="ds-cip acik">Bütün aşamalar yayında</span>}
        {sonAcik && <button type="button" className="btn btn-secondary btn-kucuk" disabled={bekliyor} onClick={() => gizle(sonAcik)}>
          {sonAcik === 'tarih' ? 'Sınavı gizle' : sonAcik === 'yer' ? 'Sınav giriş belgesini gizle' : 'Puanları gizle'}</button>}
        {engel && <span className="hint" style={{ textAlign: 'left' }}>{engel}</span>}
      </div>
    </div>
  );
}

function SinavKarti({ x, rol, setVeri, mesaj, duzenle }: { x: Sinav; rol: DsDurum['rol']; setVeri: (d: DsDurum) => void; mesaj: (m: MesajDurumu) => void; duzenle: () => void }) {
  const cagir = useCagir();
  const [alan, setAlan] = useState<'' | 'tablo' | 'yukle'>('');
  const [bekliyor, setBekliyor] = useState(false);
  const admin = rol === 'admin';
  const say = (a: DsYayinAlani) => x.dersler.filter(d => acikMi(d, a)).length;

  async function calis(p: Promise<Sonuc<DsDurum>>, basari: string, onay?: string) {
    if (onay && !confirm(onay)) return;
    setBekliyor(true);
    const r = await cagir(p);
    setBekliyor(false);
    if (r.ok) { setVeri(r.veri); mesaj({ metin: basari }); } else mesaj({ metin: <span style={{ whiteSpace: 'pre-line' }}>{r.hata}</span>, hata: true });
  }
  const sinifSatir = x.dersler.flatMap(d => d.sinif.map(c => [d.ders, c.sinif, `${c.girilen} / ${c.n}`, puanTr(c.ort), c.min == null ? '—' : `${puanTr(c.min)} – ${puanTr(c.max)}`]));

  return (
    <div className={'ds-kart' + (x.arsiv ? ' arsiv' : '')}>
      <div className="ds-k-ust">
        <div>
          <div className="ds-k-ad">{x.ad}<span className="kod">{x.kod}</span></div>
          <div className="ds-k-meta">{x.siniflar.join(', ')} · {x.ogrenci} öğrenci</div>
        </div>
        <div className="dosya-satir" style={{ gap: 6 }}>
          {x.arsiv && <span className="ds-cip">Arşivde</span>}
          <span className={'ds-cip' + (say('tarih') ? ' acik' : '')}>Tarih: {say('tarih')} / {x.dersler.length}</span>
          <span className={'ds-cip' + (say('yer') ? ' acik' : '')}>Yer: {say('yer')} / {x.dersler.length}</span>
          <span className={'ds-cip' + (say('sonuc') ? ' acik' : '')}>Puan: {say('sonuc')} / {x.dersler.length}</span>
        </div>
      </div>
      {x.dersler.map(d => <DersSatiri key={d.ders} x={x} d={d} bekliyor={bekliyor} calis={calis} />)}
      <ListeTablosu baslik="Sınıf ortalamaları" sayi={sinifSatir.length} kolonlar={['Ders', 'Sınıf', 'Girilen', 'Ortalama', 'En düşük – en yüksek']} satirlar={sinifSatir} />
      <div className="ds-eylem">
        <button type="button" className="btn btn-secondary btn-kucuk" onClick={() => setAlan(a => (a === 'tablo' ? '' : 'tablo'))}>{alan === 'tablo' ? 'Puan tablosunu kapat' : 'Puanları gir / düzelt'}</button>
        <button type="button" className="btn btn-secondary btn-kucuk" onClick={() => setAlan(a => (a === 'yukle' ? '' : 'yukle'))}>Puan listesi yükle</button>
        {admin && <>
          <button type="button" className="btn btn-secondary btn-kucuk" disabled={bekliyor} onClick={async () => {
            setBekliyor(true); const r = await cagir(dsOgrenciGuncelleIslemi(x.kod)); setBekliyor(false);
            if (!r.ok) { mesaj({ metin: r.hata, hata: true }); return; }
            setVeri(r.veri.durum); mesaj({ metin: `${r.veri.eklenen} öğrenci eklendi${r.veri.sinifGuncel ? `, ${r.veri.sinifGuncel} öğrencinin sınıfı güncellendi` : ''}. Var olan puanlara dokunulmadı.` });
          }}>Öğrenci listesini güncelle</button>
          <button type="button" className="btn btn-secondary btn-kucuk" onClick={duzenle}>Düzenle</button>
          <button type="button" className="btn btn-secondary btn-kucuk" disabled={bekliyor} onClick={() => calis(dsArsivIslemi(x.kod, !x.arsiv), x.arsiv ? 'Sınav arşivden çıkarıldı.' : 'Sınav arşivlendi.',
            x.arsiv ? undefined : `${x.ad} arşivlensin mi? Öğrenciler bu sınavı ve sonuçlarını artık görmez; veriler silinmez.`)}>{x.arsiv ? 'Arşivden çıkar' : 'Arşivle'}</button>
        </>}
      </div>
      {alan === 'tablo' && <DonemPuanTablosu kod={x.kod} mesaj={mesaj} degisti={async () => { const r = await cagir(dsDurumIslemi()); if (r.ok) setVeri(r.veri); }} />}
      {alan === 'yukle' && <DonemPuanYukleme x={x} mesaj={mesaj} bitti={d => { setVeri(d); setAlan(''); }} />}
    </div>
  );
}

/** Dönem sınavları: yönetimde bütün sınavlar; hoca ekranında yalnızca öğretim elemanının kendi derslerine ait olanlar. */
export function DonemSekmesi() {
  const cagir = useCagir();
  const { veri: d, setVeri, hata } = useVeri(dsDurumIslemi);
  const [arsivGoster, setArsivGoster] = useState(false);
  const [form, setForm] = useState<{ x: Sinav | null } | null>(null);
  const [mesaj, setMesajHam] = useState<MesajDurumu>(null);
  const setMesaj = useCallback((m: MesajDurumu) => setMesajHam(m), []);

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!d) return <Yukleniyor />;
  const admin = d.rol === 'admin';
  const liste = d.sinavlar.filter(x => arsivGoster || !x.arsiv).slice().reverse();

  async function kaydet(v: { ad: string; siniflar?: string[]; dersler: FormDers[] }) {
    const r = form?.x ? await cagir(dsGuncelleIslemi({ kod: form.x.kod, ad: v.ad, dersler: v.dersler })) : await cagir(dsOlusturIslemi(v));
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return false; }
    setVeri(r.veri);
    setMesaj({ metin: form?.x ? 'Sınav güncellendi.' : 'Sınav oluşturuldu. Her ders için sırayla: sınav tarihini yayınlayın, kelebek listesini yükleyip sınav giriş belgesini yayınlayın, puanları girip en son puanları yayınlayın. Dersin öğretim elemanı da bu işlemleri kendi ekranından yapabilir.' });
    return true;
  }

  return (
    <section>
      <div className="adim">
        <div className="dosya-satir" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <div className="bolum-baslik" style={{ margin: 0 }}>{admin ? 'Dönem sınavları' : 'Sınavlarım'}</div>
          {admin && <div className="dosya-satir" style={{ gap: 12 }}>
            <label className="onay" style={{ margin: 0 }}><input type="checkbox" checked={arsivGoster} onChange={e => setArsivGoster(e.target.checked)} /><span>Arşivdekileri göster</span></label>
            <button className="btn btn-primary" type="button" onClick={() => setForm({ x: null })}>+ Yeni sınav</button>
          </div>}
        </div>
        <p className="aciklama">{admin ? 'Yıl içi sınavlar. Her dersin tarihi, saati ve puanı ayrıdır. ' : 'Derslerinizin sınavları. Sınavları yönetim oluşturur; tarih, sınav yeri, puanlar ve yayın sizdedir. '}
          Yayın her ders için sırayla yapılır: <strong>1) sınav tarihi</strong> duyurulur, <strong>2) sınav giriş belgesi</strong> (kelebek dağıtım listesi: her öğrencinin salonu ve sırası) yüklenip duyurulur, <strong>3) puanlar</strong> girildikten sonra en son yayınlanır. Bir aşama yayınlanmadan öğrenci onu görmez; sonraki aşama ancak öncekinden sonra açılır. Sınıf ortalaması en az {d.esik} puan girilmişse gösterilir.</p>
        {admin && form && <SinavFormu d={d} x={form.x} kapat={() => setForm(null)} kaydet={kaydet} />}
      </div>
      <Mesaj m={mesaj} />
      {!liste.length ? <div className="durum">{admin
        ? (d.sinavlar.length ? 'Aktif sınav yok (arşivdekileri görmek için kutuyu işaretleyin).' : 'Henüz dönem sınavı tanımlanmadı. "+ Yeni sınav" ile başlayın.')
        : 'Derslerinize ait bir sınav yok. Sınavlar yönetim tarafından oluşturulunca burada görünür.'}</div>
        : liste.map(x => <SinavKarti key={x.kod} x={x} rol={d.rol} setVeri={setVeri} mesaj={setMesaj} duzenle={() => { setForm({ x }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}
    </section>
  );
}
