'use client';

/** Yönetim paneli · "Kullanıcılar": hoca onayı, hesap ekleme, geçici şifre, hesabı kapatma / silme. */
import { useCallback, useMemo, useState } from 'react';
import {
  hesapDurumuIslemi, hesapEkleIslemi, hesapGuncelleIslemi, hesapListesiIslemi, hesapSilIslemi, hocaOnaylaIslemi, sifreSifirlaIslemi
} from '@/app/yonetim/islemler';
import type { HesapListesi } from '@/lib/hesaplar';
import { DURUM_ETIKET, TUR_ETIKET, type HesapTuru } from '@/lib/hesap-kurallari';
import { basNorm } from '@/lib/metin';
import { Mesaj, OzetKutu, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

type Hesap = HesapListesi['hesaplar'][number];

function GeciciSifre({ kim, sifre, kapat }: { kim: string; sifre: string; kapat: () => void }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  return (
    <div className="sonuc-kutu" role="status">
      <b>{kim}</b> için geçici şifre: <code style={{ fontSize: 17, fontWeight: 700, letterSpacing: 1, background: '#f4f6fd', padding: '2px 8px', borderRadius: 6 }}>{sifre}</code>
      <div className="aciklama" style={{ margin: '8px 0' }}>Bu şifre yalnızca şimdi gösterilir; kişiye güvenli bir yoldan iletin. İlk girişte kendi şifresini belirlemesi istenir.</div>
      <div className="actions" style={{ marginBottom: 0 }}>
        <button type="button" className={'btn btn-secondary btn-kucuk' + (kopyalandi ? ' copied' : '')}
          onClick={() => navigator.clipboard?.writeText(sifre).then(() => setKopyalandi(true))}>{kopyalandi ? 'Kopyalandı' : 'Kopyala'}</button>
        <button type="button" className="btn btn-secondary btn-kucuk" onClick={kapat}>Tamam</button>
      </div>
    </div>
  );
}

function HocaAdiSec({ deger, adlar, degisti, id }: { deger: string; adlar: string[]; degisti: (v: string) => void; id?: string }) {
  const listeDisi = deger && !adlar.includes(deger);
  return (
    <select id={id} value={deger} onChange={e => degisti(e.target.value)} aria-label="Ders programındaki adı">
      <option value="">— Ders programındaki adı —</option>
      {listeDisi && <option value={deger}>{deger} (programda yok)</option>}
      {adlar.map(a => <option key={a} value={a}>{a}</option>)}
    </select>
  );
}

/** Kayıt sırasında yazılan ad, ders programındaki bir adla eşleşiyorsa onu önerir. */
function oneri(h: Hesap, adlar: string[]) {
  if (h.hocaAdi) return adlar.find(a => basNorm(a) === basNorm(h.hocaAdi)) ?? h.hocaAdi;
  const ad = basNorm(h.adSoyad).split(' ').filter(x => x.length > 2);
  return adlar.find(a => { const n = basNorm(a); return ad.length > 1 && ad.every(p => n.includes(p)); }) ?? '';
}

function Bekleyen({ h, adlar, bitti, mesaj }: { h: Hesap; adlar: string[]; bitti: () => void; mesaj: (m: MesajDurumu) => void }) {
  const cagir = useCagir();
  const [ad, setAd] = useState(() => oneri(h, adlar));
  const [bekliyor, setBekliyor] = useState(false);
  async function onayla() {
    setBekliyor(true);
    const r = await cagir(hocaOnaylaIslemi(h.id, ad));
    setBekliyor(false);
    if (!r.ok) { mesaj({ metin: r.hata, hata: true }); return; }
    mesaj({ metin: `${h.adSoyad} onaylandı; "${ad}" adıyla giriş yapabilir.` }); bitti();
  }
  async function reddet() {
    if (!confirm(`${h.adSoyad} (${h.eposta}) hesap isteği silinecek. Devam edilsin mi?`)) return;
    const r = await cagir(hesapSilIslemi(h.id));
    if (!r.ok) { mesaj({ metin: r.hata, hata: true }); return; }
    mesaj({ metin: `${h.adSoyad} hesap isteği silindi.` }); bitti();
  }
  return (
    <div className="asama">
      <div className="asama-metin"><strong>{h.adSoyad}</strong>{h.eposta} · {h.olusturma}{h.hocaAdi && <> · yazdığı ad: {h.hocaAdi}</>}</div>
      <div className="actions" style={{ marginBottom: 0, alignItems: 'center' }}>
        <HocaAdiSec deger={ad} adlar={adlar} degisti={setAd} />
        <button type="button" className="btn btn-primary btn-kucuk" disabled={!ad || bekliyor} onClick={onayla}>Onayla</button>
        <button type="button" className="btn btn-tehlike btn-kucuk" onClick={reddet}>Reddet</button>
      </div>
    </div>
  );
}

function HesapEkle({ adlar, bitti }: { adlar: string[]; bitti: (kim: string, sifre: string) => void }) {
  const cagir = useCagir();
  const [tur, setTur] = useState<'hoca' | 'admin'>('hoca');
  const [adSoyad, setAdSoyad] = useState('');
  const [eposta, setEposta] = useState('');
  const [hocaAdi, setHocaAdi] = useState('');
  const [m, setM] = useState<MesajDurumu>(null);
  const [bekliyor, setBekliyor] = useState(false);
  async function ekle() {
    setBekliyor(true); setM(null);
    const r = await cagir(hesapEkleIslemi({ tur, adSoyad, eposta, hocaAdi }));
    setBekliyor(false);
    if (!r.ok) { setM({ metin: r.hata, hata: true }); return; }
    bitti(adSoyad, r.veri.geciciSifre);
    setAdSoyad(''); setEposta(''); setHocaAdi('');
  }
  return (
    <details className="kural-form">
      <summary>+ Yönetici ya da öğretim elemanı hesabı ekle</summary>
      <div className="form-izgara">
        <label className="alan">Tür
          <select value={tur} onChange={e => setTur(e.target.value as 'hoca' | 'admin')}><option value="hoca">Öğretim elemanı</option><option value="admin">Yönetici</option></select></label>
        <label className="alan">Ad soyad<input type="text" value={adSoyad} onChange={e => setAdSoyad(e.target.value)} /></label>
        <label className="alan">E-posta<input type="text" inputMode="email" value={eposta} onChange={e => setEposta(e.target.value)} /></label>
        {tur === 'hoca' && <label className="alan">Ders programındaki adı<HocaAdiSec deger={hocaAdi} adlar={adlar} degisti={setHocaAdi} /></label>}
      </div>
      <button type="button" className="btn btn-primary" disabled={bekliyor} onClick={ekle}>{bekliyor ? 'Ekleniyor…' : 'Hesabı oluştur'}</button>
      <p className="hint" style={{ textAlign: 'left' }}>Hesap etkin olarak açılır ve geçici bir şifre üretilir; kişi ilk girişte kendi şifresini belirler.</p>
      <Mesaj m={m} />
    </details>
  );
}

function Satir({ h, benId, adlar, degisti, mesaj, sifreGoster }: {
  h: Hesap; benId: number; adlar: string[]; degisti: () => void; mesaj: (m: MesajDurumu) => void; sifreGoster: (kim: string, s: string) => void;
}) {
  const cagir = useCagir();
  const ben = h.id === benId, kim = h.adSoyad || h.ogrenciNo || h.eposta;
  const sonuc = async (p: Promise<{ ok: boolean; hata?: string }>, tamam: string) => {
    const r = await p as { ok: boolean; hata?: string };
    if (!r.ok) { mesaj({ metin: r.hata ?? 'İşlem yapılamadı.', hata: true }); return; }
    mesaj({ metin: tamam }); degisti();
  };
  async function sifre() {
    if (!confirm(`${kim} için geçici şifre üretilecek; mevcut şifresi ve açık oturumları geçersiz olur. Devam edilsin mi?`)) return;
    const r = await cagir(sifreSifirlaIslemi(h.id));
    if (!r.ok) { mesaj({ metin: r.hata, hata: true }); return; }
    sifreGoster(kim, r.veri.geciciSifre); degisti();
  }
  const durumDegistir = () => {
    const kapat = h.durum === 'aktif';
    if (kapat && !confirm(`${kim} hesabı kapatılacak; açık oturumları sonlanır. Devam edilsin mi?`)) return;
    sonuc(cagir(hesapDurumuIslemi(h.id, kapat ? 'pasif' : 'aktif')), `${kim} hesabı ${kapat ? 'kapatıldı' : 'açıldı'}.`);
  };
  const sil = () => {
    if (!confirm(h.tur === 'ogrenci'
      ? `${kim} öğrenci hesabı silinecek. Öğrenci, numarası ve TC son 6 hanesiyle yeniden hesap açabilir. Devam edilsin mi?`
      : `${kim} hesabı kalıcı olarak silinecek. Devam edilsin mi?`)) return;
    sonuc(cagir(hesapSilIslemi(h.id)), `${kim} hesabı silindi.`);
  };
  return (
    <tr>
      <td>{h.adSoyad || '—'}{ben && <span className="rozet-durum" style={{ marginLeft: 6 }}>siz</span>}{h.sifreDegistirmeli && <span className="rozet-durum listede-yok" style={{ marginLeft: 6 }}>geçici şifre</span>}
        {h.kvkk === '' && <span className="rozet-durum listede-yok" style={{ marginLeft: 6 }} title="Öğrenci güncel KVKK metnini henüz onaylamadı; ilk girişinde onay ekranı açılır">KVKK onayı yok</span>}
        {h.kvkk && <span className="rozet-durum" style={{ marginLeft: 6 }} title={'KVKK onayı: ' + h.kvkk}>KVKK ✓</span>}</td>
      <td className="no">{h.tur === 'ogrenci' ? h.ogrenciNo : h.eposta}</td>
      {h.tur === 'hoca' && <td><HocaAdiSec deger={h.hocaAdi} adlar={adlar} degisti={v => sonuc(cagir(hesapGuncelleIslemi(h.id, { hocaAdi: v })), `${kim}: ders programı adı "${v}" olarak kaydedildi.`)} /></td>}
      <td><span className={'rozet-durum' + (h.durum === 'pasif' ? ' silindi' : h.durum === 'bekliyor' ? ' listede-yok' : '')}>{DURUM_ETIKET[h.durum]}</span></td>
      <td className="wrap-cell">{h.sonGiris || 'hiç girmedi'}</td>
      <td>
        {!ben && (
          <div className="actions" style={{ marginBottom: 0, flexWrap: 'nowrap' }}>
            <button type="button" className="btn btn-secondary btn-kucuk" onClick={sifre}>Geçici şifre</button>
            {h.durum !== 'bekliyor' && <button type="button" className="btn btn-secondary btn-kucuk" onClick={durumDegistir}>{h.durum === 'aktif' ? 'Kapat' : 'Aç'}</button>}
            {h.tur !== 'ogrenci' && <button type="button" className="btn btn-secondary btn-kucuk" title="Yönetici ↔ öğretim elemanı"
              onClick={() => { const yeni = h.tur === 'admin' ? 'hoca' : 'admin'; if (confirm(`${kim} ${yeni === 'admin' ? 'yönetici yapılacak' : 'öğretim elemanı yapılacak (yönetim paneline giremez)'}. Devam edilsin mi?`)) sonuc(cagir(hesapGuncelleIslemi(h.id, { tur: yeni })), `${kim} artık ${TUR_ETIKET[yeni].toLocaleLowerCase('tr-TR')}.`); }}>
              {h.tur === 'admin' ? 'Hoca yap' : 'Yönetici yap'}</button>}
            <button type="button" className="btn btn-tehlike btn-kucuk" onClick={sil}>Sil</button>
          </div>
        )}
      </td>
    </tr>
  );
}

export function HesaplarSekmesi() {
  const yukle = useCallback(() => hesapListesiIslemi(), []);
  const { veri, hata, yenile } = useVeri(yukle);
  const [m, setM] = useState<MesajDurumu>(null);
  const [gecici, setGecici] = useState<{ kim: string; sifre: string } | null>(null);
  const [tur, setTur] = useState<HesapTuru>('hoca');
  const [ara, setAra] = useState('');
  const liste = useMemo(() => {
    const q = basNorm(ara);
    return (veri?.hesaplar ?? []).filter(h => h.tur === tur && h.durum !== 'bekliyor' && (!q || basNorm(h.adSoyad + ' ' + h.eposta + ' ' + h.ogrenciNo + ' ' + h.hocaAdi).includes(q)));
  }, [veri, tur, ara]);
  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!veri) return <Yukleniyor metin="Hesaplar okunuyor…" />;
  const bekleyen = veri.hesaplar.filter(h => h.durum === 'bekliyor');
  const say = (t: HesapTuru) => veri.hesaplar.filter(h => h.tur === t && h.durum !== 'bekliyor').length;
  const sifreGoster = (kim: string, sifre: string) => { setM(null); setGecici({ kim, sifre }); };
  return (
    <section>
      <div className="ozet">
        <OzetKutu deger={say('admin')} etiket="yönetici" />
        <OzetKutu deger={say('hoca')} etiket="öğretim elemanı" />
        <OzetKutu deger={`${say('ogrenci')} / ${veri.ogrenci.aktif}`} etiket="öğrenci hesap açtı" />
        <OzetKutu deger={bekleyen.length} etiket="onay bekleyen" tur={bekleyen.length ? 'uyari' : 'temiz'} />
      </div>
      {gecici && <GeciciSifre kim={gecici.kim} sifre={gecici.sifre} kapat={() => setGecici(null)} />}
      <Mesaj m={m} />

      {bekleyen.length > 0 && (
        <div className="adim">
          <div className="bolum-baslik">Onay bekleyen öğretim elemanları ({bekleyen.length})</div>
          <p className="aciklama">Kişinin ders programındaki adını seçip onaylayın. Hoca yalnızca bu adla eşleşen derslerin sirküsünü ve yoklamasını görür.</p>
          {bekleyen.map(h => <Bekleyen key={h.id} h={h} adlar={veri.hocaAdlari} bitti={yenile} mesaj={setM} />)}
        </div>
      )}

      <div className="adim">
        <HesapEkle adlar={veri.hocaAdlari} bitti={(kim, s) => { sifreGoster(kim, s); yenile(); }} />
      </div>

      <div className="tabs" role="tablist" style={{ marginTop: 6 }}>
        {(['hoca', 'admin', 'ogrenci'] as HesapTuru[]).map(t => (
          <button key={t} type="button" role="tab" className={'tab' + (tur === t ? ' active' : '')} aria-selected={tur === t} onClick={() => setTur(t)}>{TUR_ETIKET[t]} ({say(t)})</button>
        ))}
      </div>
      <div className="filtre"><input type="search" placeholder="Ad, e-posta ya da numara ile ara" value={ara} onChange={e => setAra(e.target.value)} aria-label="Hesaplarda ara" /></div>
      {liste.length ? (
        <div className="table-card"><div className="scroller">
          <table className="duzen-tablo">
            <thead><tr><th>Ad soyad</th><th>{tur === 'ogrenci' ? 'Öğrenci no' : 'E-posta'}</th>{tur === 'hoca' && <th>Ders programındaki adı</th>}<th>Durum</th><th>Son giriş</th><th></th></tr></thead>
            <tbody>{liste.map(h => <Satir key={h.id} h={h} benId={veri.benId} adlar={veri.hocaAdlari} degisti={yenile} mesaj={x => { setGecici(null); setM(x); }} sifreGoster={sifreGoster} />)}</tbody>
          </table>
        </div></div>
      ) : <div className="durum">{ara ? 'Aramaya uyan hesap yok.' : tur === 'ogrenci' ? 'Henüz hesap açan öğrenci yok. Öğrenciler öğrenci ekranından numaraları ve TC son 6 haneleriyle hesap açar.' : 'Bu türde hesap yok.'}</div>}
    </section>
  );
}
