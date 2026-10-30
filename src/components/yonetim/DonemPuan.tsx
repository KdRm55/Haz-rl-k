'use client';

import { useEffect, useMemo, useState } from 'react';
import { dsPuanFarkIslemi, dsPuanKaydetIslemi, dsPuanOnizleIslemi, dsPuanTablosuIslemi, dsPuanUygulaIslemi } from '@/app/yonetim/islemler';
import type { DsDurum, DsPuanFarki, DsPuanTablosu } from '@/lib/donem-sinav';
import { csvIndir, dosyaOku, xlsxIndir } from '@/lib/dosya-oku';
import { basNorm } from '@/lib/metin';
import { ListeTablosu, Mesaj, OzetKutu, useCagir, type MesajDurumu } from './ortak';

const ekran = (v: string | undefined) => (v ? v.replace('.', ',') : '');

/** Panelde puan tablosu: e-tablodaki "DS …" sayfasının yerine. Değişen hücreler toplu kaydedilir. */
export function DonemPuanTablosu({ kod, mesaj, degisti }: { kod: string; mesaj: (m: MesajDurumu) => void; degisti: () => void }) {
  const cagir = useCagir();
  const [t, setT] = useState<DsPuanTablosu | null>(null);
  const [duzen, setDuzen] = useState<Record<string, string>>({});
  const [ara, setAra] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [yerel, setYerel] = useState<MesajDurumu | null>(null);   // sayfanın üstündeki mesaj tablodan görünmeyebilir
  useEffect(() => { cagir(dsPuanTablosuIslemi(kod)).then(r => (r.ok ? setT(r.veri) : mesaj({ metin: r.hata, hata: true }))); }, [kod, cagir, mesaj]);
  const anahtar = (no: string, d: string) => no + '\u0000' + d;
  const deger = (no: string, d: string, eski?: string) => duzen[anahtar(no, d)] ?? ekran(eski);
  const degisen = t ? Object.entries(duzen).filter(([k, v]) => { const [no, d] = k.split('\u0000'); return v !== ekran(t.ogrenciler.find(o => o.no === no)?.p[d]); }) : [];
  const liste = useMemo(() => {
    const q = basNorm(ara);
    return (t?.ogrenciler ?? []).filter(o => !q || o.no.includes(q.replace(/\s/g, '')) || basNorm(o.adi + ' ' + o.soyadi + ' ' + o.sinif).includes(q));
  }, [t, ara]);

  async function kaydet() {
    setBekliyor(true);
    const r = await cagir(dsPuanKaydetIslemi(kod, degisen.map(([k, v]) => { const [no, ders] = k.split('\u0000'); return { no, ders, puan: v }; })));
    setBekliyor(false);
    if (!r.ok) { const m: MesajDurumu = { metin: <span style={{ whiteSpace: 'pre-line' }}>{r.hata}</span>, hata: true }; mesaj(m); setYerel(m); return; }
    setT(r.veri.tablo); setDuzen({});
    const m: MesajDurumu = { metin: `${r.veri.yazilan} puan kaydedildi (${r.veri.kaynak}). Her değişiklik öğrencinin geçmişine yazıldı.` };
    mesaj(m); setYerel(m);
    degisti();
  }

  if (!t) return <div className="durum">Puan tablosu yükleniyor…</div>;
  return (
    <div className="ds-alt-bolum">
      <h4>Puanlar — {t.ad}</h4>
      <p className="aciklama" style={{ margin: '0 0 8px' }}>0–100 arası sayı, sınava girmeyen için <strong>G</strong>, boş = henüz girilmedi. Değiştirdiğiniz hücreler sarı görünür; &quot;Kaydet&quot;e basınca hepsi birlikte denetlenip yazılır.</p>
      <div className="filtre">
        <input type="search" placeholder="Numara, ad ya da sınıf ile ara" value={ara} onChange={e => setAra(e.target.value)} aria-label="Puan tablosunda ara" />
        <button className="btn btn-primary btn-kucuk" type="button" disabled={!degisen.length || bekliyor} onClick={kaydet}>{bekliyor ? 'Kaydediliyor…' : degisen.length ? `${degisen.length} değişikliği kaydet` : 'Değişiklik yok'}</button>
        {degisen.length > 0 && <button className="btn btn-secondary btn-kucuk" type="button" onClick={() => setDuzen({})}>Geri al</button>}
        <button className="btn btn-secondary btn-kucuk" type="button" onClick={() => csvIndir(`Donem_Sinavi_${t.kod}.csv`, ['Öğrenci No', 'Adı', 'Soyadı', 'Sınıf', ...t.dersler], t.ogrenciler.map(o => [o.no, o.adi, o.soyadi, o.sinif, ...t.dersler.map(d => ekran(o.p[d]))]))}>⬇️ CSV</button>
      </div>
      <Mesaj m={yerel} />
      <div className="table-card"><div className="scroller">
        <table className="duzen-tablo">
          <thead><tr><th>No</th><th>Adı Soyadı</th><th>Sınıf</th>{t.dersler.map(d => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>{liste.slice(0, 400).map(o => (
            <tr key={o.no}>
              <td className="no">{o.no}</td><td>{o.adi} {o.soyadi}</td><td>{o.sinif}</td>
              {t.dersler.map(d => {
                const v = deger(o.no, d, o.p[d]), farkli = v !== ekran(o.p[d]);
                return <td key={d} style={{ width: 80, background: farkli ? '#fdf8ee' : undefined }}>
                  <input type="text" inputMode="decimal" value={v} aria-label={`${o.no} ${d}`} onChange={e => setDuzen(x => ({ ...x, [anahtar(o.no, d)]: e.target.value }))} /></td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      </div></div>
      {liste.length > 400 && <div className="hint">İlk 400 öğrenci gösteriliyor; aramayı daraltın.</div>}
    </div>
  );
}

type Onizleme = Extract<Awaited<ReturnType<typeof dsPuanOnizleIslemi>>, { ok: true }>['veri'];

/** Puan listesi yükleme (Excel / CSV), numaraya göre eşleştirme. */
export function DonemPuanYukleme({ x, mesaj, bitti }: { x: DsDurum['sinavlar'][number]; mesaj: (m: MesajDurumu) => void; bitti: (d: DsDurum) => void }) {
  const cagir = useCagir();
  const [satirlar, setSatirlar] = useState<string[][]>([]);
  const [dosyaAdi, setDosyaAdi] = useState('');
  const [oniz, setOniz] = useState<Onizleme | null>(null);
  const [es, setEs] = useState<Record<string, number>>({});
  const [uzerine, setUzerine] = useState(false), [adYaz, setAdYaz] = useState(false);
  const [fark, setFark] = useState<DsPuanFarki | null>(null);
  const [durum, setDurum] = useState('');
  const [bekliyor, setBekliyor] = useState(false);

  async function dosya(f: File | undefined) {
    setOniz(null); setFark(null);
    if (!f) return;
    setDurum('Okunuyor…');
    try {
      const d = await dosyaOku(f);
      const s = d.sayfalar.map(ad => d.satirlar(ad)).find(r => r.some(x => x.some(v => v.trim())));
      if (!s) { setDurum('Dosyada veri bulunamadı.'); return; }
      setSatirlar(s); setDosyaAdi(f.name);
      const r = await cagir(dsPuanOnizleIslemi(x.kod, s, null));
      if (!r.ok) { setDurum(r.hata); return; }
      setDurum(''); setOniz(r.veri);
      setEs({ no: r.veri.eslesme.no, adi: r.veri.eslesme.adi, soyadi: r.veri.eslesme.soyadi, adSoyad: r.veri.eslesme.adSoyad,
        ...Object.fromEntries(Object.entries(r.veri.eslesme.dersKolon).map(([d, i]) => ['ders:' + d, i])) });
    } catch (e) { setDurum('Dosya okunamadı: ' + (e instanceof Error ? e.message : String(e))); }
  }
  async function sablonIndir() {
    setDurum('Şablon hazırlanıyor…');
    const r = await cagir(dsPuanTablosuIslemi(x.kod));
    if (!r.ok) { setDurum(r.hata); return; }
    const t = r.veri, puan = (v: string | undefined) => (v && /^\d+(\.\d+)?$/.test(v) ? Number(v) : v ?? '');
    const ad = `Donem_Sinavi_${t.kod}_Sablon.xlsx`;
    await xlsxIndir(ad, 'Puanlar', [['Öğrenci No', 'Adı', 'Soyadı', 'Sınıf', ...t.dersler], ...t.ogrenciler.map(o => [o.no, o.adi, o.soyadi, o.sinif, ...t.dersler.map(d => puan(o.p[d]))])],
      [14, 18, 18, 16, ...t.dersler.map(d => Math.max(10, d.length + 4))]);
    setDurum(`${ad} indirildi (${t.ogrenciler.length} öğrenci). Girilmiş puanlar dolu gelir; boş hücreleri doldurup buradan yükleyin.`);
  }
  const veri = (u = uzerine, a = adYaz) => ({
    sinavKod: x.kod, satirlar, basSatir: oniz!.basSatir, dosyaAdi, uzerineYaz: u, adUyusmazYaz: a,
    eslesme: { no: es.no, adi: es.adi, soyadi: es.soyadi, adSoyad: es.adSoyad, dersKolon: Object.fromEntries(oniz!.dersler.map(d => [d, es['ders:' + d] ?? -1])) }
  });
  async function farkHesapla(u = uzerine, a = adYaz) {
    setUzerine(u); setAdYaz(a); setBekliyor(true);
    const r = await cagir(dsPuanFarkIslemi(veri(u, a)));
    setBekliyor(false);
    if (r.ok) setFark(r.veri); else { setFark(null); mesaj({ metin: r.hata, hata: true }); }
  }
  async function uygula() {
    if (!fark || !confirm(`${fark.sayilar.yazilacak} puan yazılsın mı?`)) return;
    setBekliyor(true);
    const r = await cagir(dsPuanUygulaIslemi({ ...veri(), imza: fark.imza }));
    setBekliyor(false);
    if (!r.ok) { mesaj({ metin: r.hata, hata: true }); return; }
    mesaj({ metin: `${r.veri.yazilan} puan yazıldı. Tüm değişiklikler öğrenci geçmişinde (${r.veri.kaynak}).` });
    bitti(r.veri.durum);
  }
  const sec = (k: string, et: string) => (
    <label className="alan" key={k}>{et}<select value={es[k] ?? -1} onChange={e => { setEs(v => ({ ...v, [k]: Number(e.target.value) })); setFark(null); }}>
      <option value={-1}>— yok —</option>{oniz!.sutunlar.map(c => <option key={c.i} value={c.i}>{c.ad}</option>)}</select></label>
  );
  const s = fark?.sayilar, r = (y: DsPuanFarki['yeni'][number]) => [y.no, y.ad, y.alan, y.eski || '(boş)', y.yeni];

  return (
    <div className="ds-alt-bolum">
      <h4>Puan listesi yükle — {x.ad}</h4>
      <p className="aciklama" style={{ margin: '0 0 8px' }}>Excel ya da CSV; sınavın öğrenci listesiyle hazırlanmış şablonu da indirebilirsiniz. Numaraya göre eşleştirilir; ad uyuşmazlığı, hatalı puan ve dolu puanın üzerine yazma ayrıca onay ister. Sınava girmeyene G yazın.</p>
      <div className="dosya-satir">
        <input type="file" accept=".xlsx,.csv" onChange={e => dosya(e.target.files?.[0])} />
        <button className="btn btn-secondary" type="button" onClick={sablonIndir}>📄 Puan şablonu indir</button>
      </div>
      {durum && <div className="hint" style={{ textAlign: 'left', marginTop: 8 }}>{durum}</div>}
      {oniz && (
        <>
          <div className="form-izgara" style={{ marginTop: 10 }}>
            {sec('no', 'Öğrenci No')}{sec('adi', 'Adı')}{sec('soyadi', 'Soyadı')}{sec('adSoyad', 'Adı Soyadı (tek sütun)')}
            {oniz.dersler.map(d => sec('ders:' + d, d + ' puanı'))}
          </div>
          <label className="onay"><input type="checkbox" checked={uzerine} onChange={e => farkHesapla(e.target.checked, adYaz)} /><span>Dolu puanların üzerine yaz</span></label>
          <label className="onay"><input type="checkbox" checked={adYaz} onChange={e => farkHesapla(uzerine, e.target.checked)} /><span>Adı uyuşmayanlara da yaz (numaradan eminseniz)</span></label>
          <button type="button" className="btn btn-primary" disabled={bekliyor} onClick={() => farkHesapla()}>{bekliyor ? 'Hesaplanıyor…' : 'Farkları hesapla'}</button>
        </>
      )}
      {fark && s && (
        <>
          <div className="ozet" style={{ marginTop: 12 }}>
            <OzetKutu deger={s.yazilacak} etiket="yazılacak puan" tur="yeni" />
            <OzetKutu deger={s.ayni} etiket="zaten aynı" />
            <OzetKutu deger={s.degisen} etiket="dolu puandan farklı" tur={s.degisen ? 'uyari' : ''} />
            <OzetKutu deger={s.adUyusmaz} etiket="adı uyuşmayan" tur={s.adUyusmaz ? 'uyari' : ''} />
            <OzetKutu deger={s.bulunamadi + s.hatali} etiket="bulunamayan / hatalı" tur={s.bulunamadi + s.hatali ? 'uyari' : ''} />
          </div>
          <ListeTablosu baslik="Yeni puanlar" sayi={s.yeni} kolonlar={['No', 'Adı Soyadı', 'Ders', 'Eski', 'Yeni']} satirlar={fark.yeni.map(r)} />
          <ListeTablosu baslik={'Dolu puandan farklı olanlar' + (uzerine ? ' (üzerine yazılacak)' : ' (yazılmayacak)')} sayi={s.degisen} kolonlar={['No', 'Adı Soyadı', 'Ders', 'Eski', 'Yeni']} satirlar={fark.degisen.map(r)} />
          <ListeTablosu baslik="Adı uyuşmayanlar (yanlış numara olabilir)" sayi={s.adUyusmaz} kolonlar={['Dosya satırı', 'No', 'Dosyadaki ad', 'Listedeki ad']} satirlar={fark.adUyusmaz.map(y => [y.satir, y.no, y.dosyaAd, y.listeAd])} />
          <ListeTablosu baslik="Bulunamayanlar" sayi={s.bulunamadi} kolonlar={['Dosya satırı', 'No', 'Ad', 'Neden']} satirlar={fark.bulunamadi.map(y => [y.satir, y.no, y.ad, y.neden])} />
          <ListeTablosu baslik="Hatalı satırlar" sayi={s.hatali} kolonlar={['Dosya satırı', 'No', 'Ad', 'Neden']} satirlar={fark.hatali.map(y => [y.satir, y.no, y.ad, y.neden])} />
          {s.yazilacak > 0 && <button type="button" className="btn btn-primary" style={{ marginTop: 10 }} disabled={bekliyor} onClick={uygula}>{s.yazilacak} puanı yaz</button>}
        </>
      )}
    </div>
  );
}
