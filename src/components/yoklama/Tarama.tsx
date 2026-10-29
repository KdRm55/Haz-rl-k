'use client';

/**
 * Taranmış imza sirkülerini yükleme ve onay ekranı (hoca ekranı "Yoklama" sekmesi ve yönetim paneli).
 * Apps Script YoklamaTarama.html karşılığı. Sayfalar bu bilgisayarda okunur; hocanın onayı olmadan hiçbir şey kaydedilmez.
 */
import { useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { taramaGorselIslemi, taramaHazirlaIslemi, taramaKaydetIslemi } from '@/app/hoca/islemler';
import type { Sonuc } from '@/lib/islem-sonucu';
import type { EvrakKaydi, SayfaSonucu } from '@/lib/tarama/motor';
import type { TaramaHazirligi, YoklamaEditoru } from '@/lib/yoklama';
import { OturumDustu } from '@/components/yonetim/ortak';
import { TARAMA_CSS } from './stil';

type Sayfa = SayfaSonucu & { etiket: string; kaynak?: HTMLCanvasElement; gorselAdres?: string; gorselGonderildi?: boolean; gorselHata?: string; neden?: string };
type Tamam = Extract<SayfaSonucu, { durum: 'tamam' }> & { etiket: string; gorselAdres?: string; gorselGonderildi?: boolean; gorselHata?: string };
type Oturum = YoklamaEditoru | { hata: string };
type Ders = {
  anahtar: string; o: Oturum; evrak: EvrakKaydi; sayfalar: Tamam[];
  hucre: Record<string, 'P' | 'A' | ''>; oneri: Record<string, string>; neden: Record<string, string>; resim: Record<string, { sayfa: Tamam; kutu: number[] }>;
  sira: string[]; ekSatirlar: { sayfa: Tamam; kutu: number[] }[]; filtre: boolean; kaydedildi?: string; hata?: string; gorselDurum?: string;
};
type Durum = { sayfalar: Sayfa[]; evraklar: Record<string, EvrakKaydi | null>; oturumlar: Record<string, Oturum>; isimler: Record<string, string>; dersler: Record<string, Ders>; sira: string[] };
const bos = (): Durum => ({ sayfalar: [], evraklar: {}, oturumlar: {}, isimler: {}, dersler: {}, sira: [] });

const hataYazi = (e: unknown) => (e instanceof Error ? e.message : String(e || 'Bilinmeyen hata'));
const editor = (o: Oturum): YoklamaEditoru | null => ('hata' in o ? null : o);

function kopyala(kaynak: CanvasImageSource & { width: number; height: number }) {
  const w = kaynak.width, h = kaynak.height, k = Math.min(1, 2400 / Math.max(w, h)), c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d')!.drawImage(kaynak, 0, 0, c.width, c.height); return c;
}
/** data: URL → blob: URL (sayfa görüntüsü bir kez bellekte tutulur; HTML'e gömülmez). */
function blobAdresi(dataUrl: string) {
  const p = dataUrl.split(','), ikili = atob(p[1]), u = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) u[i] = ikili.charCodeAt(i);
  return URL.createObjectURL(new Blob([u], { type: (p[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg' }));
}

function sayilar(d: Ders) {
  const n = { ogr: d.sira.length, yok: 0, bel: 0, fark: 0 };
  const e = editor(d.o), onceki = new Map(e?.kayitli ? e.ogrenciler.map(x => [x.no, x]) : []);
  const yokOgr = new Set<string>();
  for (const no of d.sira) for (const k of [1, 2] as const) {
    const v = d.hucre[no + '|' + k];
    if (v === '') n.bel++; else if (v === 'A') yokOgr.add(no);
    const o = onceki.get(no);
    if (o && v) { const eski = (k === 1 ? o.yok1 : o.yok2) ? 'A' : 'P'; if (eski !== v) n.fark++; }
  }
  n.yok = yokOgr.size;
  return n;
}
const kaydedilebilir = (d: Ders) => { const e = editor(d.o); return !!e && !e.gelecek && sayilar(d).bel === 0 && d.sira.length > 0; };
function eksikSayfalar(d: Ders) {
  const var_ = new Set(d.sayfalar.map(s => s.evrak.sayfa));
  const eksik: number[] = [];
  for (let i = 1; i <= (d.evrak.toplam || 1); i++) if (!var_.has(i)) eksik.push(i);
  return eksik;
}

function Resim({ kayit, en }: { kayit?: { sayfa: Tamam; kutu: number[] }; en: number }) {
  if (!kayit?.sayfa.gorselAdres) return null;
  const k = kayit.kutu, pay = 1.2, w = (k[2] - k[0]) + pay * 2, h = (k[3] - k[1]) + pay * 2, olc = en / w;
  return <span className="yt-resim" role="img" aria-label="Taranmış hücre" style={{
    width: Math.round(w * olc), height: Math.round(h * olc), backgroundImage: `url(${kayit.sayfa.gorselAdres})`,
    backgroundSize: `${Math.round(210 * olc)}px auto`, backgroundPosition: `${-Math.round((k[0] - pay) * olc)}px ${-Math.round((k[1] - pay) * olc)}px`
  }} />;
}

export function Tarama({ kaydedildi }: { kaydedildi?: () => void }) {
  const dustu = useContext(OturumDustu);
  const Y = useRef<Durum>(bos());
  const [, ciz] = useReducer((n: number) => n + 1, 0);
  const [calisiyor, setCalisiyor] = useState(false);
  const [ilerleme, setIlerleme] = useState<{ oran: number; metin: string } | null>(null);
  const [genelHata, setGenelHata] = useState('');
  const [uzerinde, setUzerinde] = useState(false);
  const giris = useRef<HTMLInputElement>(null);

  const kaydedilmemisVar = () => Object.values(Y.current.dersler).some(d => !d.kaydedildi && Object.keys(d.hucre).length);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (kaydedilmemisVar()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, []);

  const sonuc = useCallback(async <T,>(p: Promise<Sonuc<T>>): Promise<T> => {
    const r = await p;
    if (!r.ok) { if (r.yetkisiz) dustu(); throw new Error(r.hata); }
    return r.veri;
  }, [dustu]);

  /* ---------- Okuma ---------- */
  const evrakAl = useCallback(async (no: string) => {
    const y = Y.current;
    if (no in y.evraklar) return y.evraklar[no];
    const r: TaramaHazirligi = await sonuc(taramaHazirlaIslemi([no]));
    Object.assign(y.evraklar, r.evraklar); Object.assign(y.oturumlar, r.oturumlar); Object.assign(y.isimler, r.isimler);
    return y.evraklar[no] ?? null;
  }, [sonuc]);

  /** Okunan sayfayı derslere dağıtır. */
  function sayfaEkle(r: Sayfa) {
    const y = Y.current;
    if (r.durum === 'tamam' && !r.gorselAdres) r.gorselAdres = blobAdresi(r.gorsel);
    if (r.durum === 'tamam' && y.sayfalar.some(s => s.durum === 'tamam' && s.no === r.no)) { y.sayfalar.push({ ...r, durum: 'tekrar' } as unknown as Sayfa); return; }
    y.sayfalar.push(r);
    if (r.durum !== 'tamam') return;
    const t = r as Tamam, e = t.evrak;
    e.oturumlar.forEach((anahtar, d) => {
      if (!anahtar) return;
      const o = y.oturumlar[anahtar] ?? { hata: 'Ders bilgisi okunamadı.' };
      let ders = y.dersler[anahtar];
      if (!ders) { ders = y.dersler[anahtar] = { anahtar, o, evrak: e, sayfalar: [], hucre: {}, oneri: {}, neden: {}, resim: {}, sira: [], ekSatirlar: [], filtre: true }; y.sira.push(anahtar); }
      ders.sayfalar.push(t);
      t.ekSatirlar.forEach(x => ders.ekSatirlar.push({ sayfa: t, kutu: x.kutu }));
      for (const h of t.hucreler) {
        if (h.d !== d) continue;
        if (!ders.sira.includes(h.no)) ders.sira.push(h.no);
        const an = h.no + '|' + h.k;
        ders.oneri[an] = h.s; ders.neden[an] = h.neden;
        ders.hucre[an] = h.s === '?' ? '' : h.s;   // '' = hocanın seçmesi gerekiyor
        ders.resim[an] = { sayfa: t, kutu: h.kutu };
      }
    });
  }

  async function basla(dosyalar: File[]) {
    if (calisiyor) return;
    if (kaydedilmemisVar() && !confirm('Önceki taramanın kaydedilmemiş dersleri var. Yeni dosyalar eklenince onlar da listede kalır. Devam edilsin mi?')) return;
    setCalisiyor(true); setGenelHata('');
    let toplam = 0, sayac = 0;
    setIlerleme({ oran: 0, metin: 'Dosyalar açılıyor…' });
    try {
      const motor = await import('@/lib/tarama/motor');
      await motor.dosyalariGez(dosyalar, async (kaynak, etiket) => {
        sayac++;
        setIlerleme({ oran: Math.min(0.97, sayac / Math.max(sayac + 1, dosyalar.length)), metin: etiket + ' okunuyor…' });
        let r: Sayfa;
        try { r = { ...(await motor.sayfaOku(kaynak, evrakAl)), etiket }; }
        catch (e) { r = { durum: 'hata', neden: hataYazi(e), etiket } as unknown as Sayfa; }
        if (['qr', 'isaret', 'evrak'].includes(r.durum)) r.kaynak = kopyala(kaynak);   // elle numara ile yeniden okumak için
        sayfaEkle(r);
        toplam++;
        ciz();
      });
      setIlerleme({ oran: 1, metin: toplam + ' sayfa okundu.' });
      setTimeout(() => setIlerleme(null), 1200);
    } catch (e) {
      setIlerleme(null);
      setGenelHata('Dosya okunamadı: ' + hataYazi(e));
    } finally {
      setCalisiyor(false);
      ciz();
    }
  }

  async function elleOku(i: number, ham: string) {
    const y = Y.current, x = y.sayfalar[i];
    const no = ham.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (no.length !== 8) { alert('Evrak numarası 8 karakter olmalı (QR kodunun altında yazar).'); return; }
    if (!x?.kaynak) return;
    const motor = await import('@/lib/tarama/motor');
    let r: Sayfa;
    try { r = { ...(await motor.sayfaOku(x.kaynak, evrakAl, no)), etiket: x.etiket }; }
    catch (e) { r = { durum: 'hata', neden: hataYazi(e), etiket: x.etiket } as unknown as Sayfa; }
    if (r.durum !== 'tamam') { r.kaynak = x.kaynak; if ('onizleme' in x && !('onizleme' in r && r.onizleme)) Object.assign(r, { onizleme: x.onizleme }); }
    y.sayfalar.splice(i, 1);
    sayfaEkle(r);
    ciz();
  }

  /* ---------- Kaydetme ---------- */
  async function kaydet(dersler: Ders[]) {
    if (!dersler.length) return;
    setCalisiyor(true);
    setIlerleme({ oran: 0.05, metin: dersler.length + ' ders kaydediliyor…' });
    const yuk = dersler.map(d => {
      const e = editor(d.o)!, o = e.oturum, liste = d.sira.slice();
      const izinli = e.ogrenciler.filter(x => x.izinli && liste.includes(x.no)).map(x => x.no);
      return { iso: o.iso, sinif: o.sinif, saat: o.saat, ders: o.ders, hoca: d.evrak.hoca || o.hoca, tur: d.evrak.tur, liste,
        yok1: liste.filter(no => d.hucre[no + '|1'] === 'A'), yok2: liste.filter(no => d.hucre[no + '|2'] === 'A'),
        izinli, oncekiSurum: e.kayitli ? e.surum : 0, evraklar: d.sayfalar.map(s => s.no) };
    });
    let sonuclar: Awaited<ReturnType<typeof taramaKaydetIslemi>> extends Sonuc<infer T> ? T : never;
    try { sonuclar = await sonuc(taramaKaydetIslemi(yuk)); }
    catch (e) { setIlerleme(null); dersler.forEach(d => { d.hata = 'Kaydedilemedi: ' + hataYazi(e); }); setCalisiyor(false); ciz(); return; }
    const kaydedilenSayfa: Tamam[] = [];
    dersler.forEach((d, j) => {
      const r = sonuclar[j];
      if (r?.ok) { d.kaydedildi = r.zaman; d.hata = ''; d.filtre = true; d.sayfalar.forEach(s => { if (!kaydedilenSayfa.includes(s)) kaydedilenSayfa.push(s); }); }
      else d.hata = 'Kaydedilemedi: ' + (r && !r.ok ? r.hata : 'bilinmeyen hata');
    });
    ciz();
    // sayfa görüntülerini arşive gönder (her sayfa bir kez)
    const gonderilecek = kaydedilenSayfa.filter(s => !s.gorselGonderildi);
    for (let i = 0; i < gonderilecek.length; i++) {
      const s = gonderilecek[i];
      setIlerleme({ oran: 0.3 + 0.7 * i / gonderilecek.length, metin: `Sayfa görüntüleri arşive kaydediliyor (${i + 1}/${gonderilecek.length})…` });
      try { await sonuc(taramaGorselIslemi(s.no, s.gorsel)); s.gorselGonderildi = true; }
      catch (e) { s.gorselHata = hataYazi(e); }
    }
    dersler.forEach(d => {
      if (!d.kaydedildi) return;
      const h = d.sayfalar.find(s => s.gorselHata);
      d.gorselDurum = h ? 'sayfa görüntüsü arşive kaydedilemedi (' + h.gorselHata + ')' : 'sayfa görüntüsü arşivlendi';
    });
    setIlerleme({ oran: 1, metin: 'Kaydedildi.' }); setTimeout(() => setIlerleme(null), 1200);
    setCalisiyor(false);
    ciz();
    kaydedildi?.();
  }

  function temizle() {
    if (kaydedilmemisVar() && !confirm('Kaydedilmemiş dersler silinecek. Devam edilsin mi?')) return;
    Y.current.sayfalar.forEach(x => { if (x.gorselAdres) URL.revokeObjectURL(x.gorselAdres); });
    Y.current = bos(); setGenelHata(''); ciz();
  }

  /* ---------- Çizim ---------- */
  const y = Y.current;
  const s = y.sayfalar, tamam = s.filter(x => x.durum === 'tamam').length, bosSayfa = s.filter(x => x.durum === 'bos').length;
  const sorunlu = s.map((x, i) => ({ x, i })).filter(({ x }) => ['qr', 'isaret', 'evrak', 'hata'].includes(x.durum));
  const tekrar = s.filter(x => (x.durum as string) === 'tekrar').length;
  const dersler = y.sira.map(k => y.dersler[k]);
  const bekleyen = dersler.filter(d => !d.kaydedildi && kaydedilebilir(d));

  return (
    <div className="yt">
      <style>{TARAMA_CSS}</style>
      <div className="yt-kart">
        <div className="yt-baslik">Taranmış sirküleri yükle</div>
        <p className="yt-aciklama">Doldurulmuş imza sirkülerini tarayıcıdan PDF olarak ya da telefonla fotoğraf çekip yükleyin. Sayfalar bu bilgisayarda okunur: QR kodundan hangi ders ve sınıf olduğu bulunur, imzalı hücreler &quot;geldi&quot;, boş hücreler &quot;gelmedi&quot; sayılır. Emin olunamayan hücreler sarıyla işaretlenir; siz onaylamadan hiçbir şey kaydedilmez.</p>
        <label className={'yt-birak' + (uzerinde ? ' uzerinde' : '')}
          onDragEnter={e => { e.preventDefault(); setUzerinde(true); }} onDragOver={e => { e.preventDefault(); setUzerinde(true); }}
          onDragLeave={e => { e.preventDefault(); setUzerinde(false); }}
          onDrop={e => { e.preventDefault(); setUzerinde(false); const f = Array.from(e.dataTransfer.files || []); if (f.length) basla(f); }}>
          <input ref={giris} type="file" multiple accept="application/pdf,.pdf,image/*" disabled={calisiyor}
            onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) basla(f); }} />
          <strong>Dosya seçin ya da buraya sürükleyin</strong>
          <span>PDF, JPG ya da PNG · birden fazla dosya seçebilirsiniz · çift taraflı taramadaki boş sayfalar atlanır</span>
        </label>
        {ilerleme && (
          <div className="yt-ilerleme">
            <div className="yt-cubuk"><i style={{ width: Math.round(ilerleme.oran * 100) + '%' }} /></div>
            <div className="yt-ilerleme-metin" role="status" aria-live="polite">{ilerleme.metin}</div>
          </div>
        )}
        <div className="yt-ipucu">İpucu: Fotoğrafı sayfa düz ve tamamı görünecek şekilde, gölge düşürmeden çekin; dört köşedeki siyah kareler ve sağ üstteki QR kodu görünmeli. Gelmeyen öğrencinin hücresini boş bırakın, çizgi veya işaret koymayın.</div>
      </div>

      {s.length > 0 && (
        <div className="yt-ozet">
          <span className="yt-cip ok">{tamam} sayfa okundu</span><span className="yt-cip">{dersler.length} ders</span>
          {bosSayfa > 0 && <span className="yt-cip">{bosSayfa} boş sayfa atlandı</span>}
          {tekrar > 0 && <span className="yt-cip uyari">{tekrar} sayfa iki kez yüklendi (biri kullanıldı)</span>}
          {sorunlu.length > 0 && <span className="yt-cip hata">{sorunlu.length} sayfa okunamadı</span>}
        </div>
      )}
      {genelHata && <div className="yt-sorun"><div className="yt-s-metin"><b>Dosya okunamadı</b>{genelHata}</div></div>}
      {sorunlu.map(({ x, i }) => <SorunKarti key={i + x.etiket} x={x} oku={no => elleOku(i, no)} />)}
      {dersler.map((d, i) => <DersKarti key={d.anahtar} d={d} isimler={y.isimler} degisti={ciz} kaydet={() => kaydet([d])} calisiyor={calisiyor} i={i} />)}
      {dersler.length > 1 && (
        <div className="yt-tumu">
          <button type="button" className="yt-btn birincil" disabled={!bekleyen.length || calisiyor} onClick={() => kaydet(bekleyen)}>Hazır olan {bekleyen.length} dersi kaydet</button>
          <span className="yt-ipucu" style={{ margin: 0 }}>Sarı (belirsiz) hücresi kalmayan dersler kaydedilir.</span>
        </div>
      )}
      {s.length > 0 && <div className="yt-tumu"><button type="button" className="yt-btn ikincil" onClick={temizle} disabled={calisiyor}>Listeyi temizle</button></div>}
    </div>
  );
}

function SorunKarti({ x, oku }: { x: Sayfa; oku: (no: string) => Promise<void> }) {
  const [no, setNo] = useState(x.no ?? '');
  const [bekliyor, setBekliyor] = useState(false);
  const baslik = ({ qr: 'QR kodu okunamadı', isaret: 'Sayfanın köşeleri bulunamadı', evrak: 'Bu evrak sistemde kayıtlı değil', hata: 'Sayfa okunamadı' } as Record<string, string>)[x.durum];
  const acik = ({
    qr: 'Sayfa bulanık, eğik ya da QR kodu kapanmış olabilir. QR kodunun altındaki 8 karakterlik evrak numarasını yazıp yeniden okutabilir ya da sayfayı yeniden tarayabilirsiniz.',
    isaret: 'Dört köşedeki siyah karelerin en az üçü görünmeli. Sayfayı düz ve tamamı görünecek şekilde yeniden tarayın ya da fotoğraflayın.',
    evrak: `Evrak no ${x.no || ''} bulunamadı. Sirkü başka bir dönemden olabilir ya da QR'sız basılmış olabilir. Numarayı kontrol edip yeniden deneyin ya da yoklamayı elle girin.` + (x.neden ? ` (${x.neden})` : ''),
    hata: x.neden || ''
  } as Record<string, string>)[x.durum];
  const onizleme = 'onizleme' in x ? x.onizleme : '';
  return (
    <div className="yt-sorun">
      {onizleme && <img alt="" src={onizleme} />}
      <div className="yt-s-metin"><b>{baslik} · {x.etiket}</b>{acik}
        {x.kaynak && (
          <form onSubmit={async e => { e.preventDefault(); setBekliyor(true); await oku(no); setBekliyor(false); }}>
            <input maxLength={8} placeholder="Evrak no" aria-label="Evrak numarası" value={no} onChange={e => setNo(e.target.value)} />
            <button type="submit" className="yt-btn ikincil" disabled={bekliyor}>Bu numarayla oku</button>
          </form>
        )}
      </div>
    </div>
  );
}

function DersKarti({ d, isimler, degisti, kaydet, calisiyor, i }: { d: Ders; isimler: Record<string, string>; degisti: () => void; kaydet: () => void; calisiyor: boolean; i: number }) {
  const e = editor(d.o), n = sayilar(d), eksik = eksikSayfalar(d);
  const onceki = new Map(e?.kayitli ? e.ogrenciler.map(x => [x.no, x]) : []);
  const ad = { ad: (e?.oturum.sinif || d.evrak.sinif) + ' · ' + (e?.oturum.ders || ''),
    alt: [e ? `${e.oturum.gun} ${e.oturum.tarih}` : '', e?.oturum.saat, e?.oturum.hoca || d.evrak.hoca, d.evrak.tur === 'Telafi' ? 'Telafi' : ''].filter(Boolean).join(' · ') };
  const hazir = kaydedilebilir(d);
  let gizli = 0;
  const satirlar = d.sira.map(no => {
    const v1 = d.hucre[no + '|1'], v2 = d.hucre[no + '|2'], bel = v1 === '' || v2 === '', yok = v1 === 'A' || v2 === 'A';
    if (d.filtre && !bel && !yok) { gizli++; return null; }
    const ogr = e?.ogrenciler.find(x => x.no === no);
    const hucre = (k: 1 | 2) => {
      const an = no + '|' + k, v = d.hucre[an], ne = d.neden[an], o = onceki.get(no);
      const eski = o ? ((k === 1 ? o.yok1 : o.yok2) ? 'A' : 'P') : null;
      const sec = (deger: 'P' | 'A') => { d.hucre[an] = deger; degisti(); };
      return (
        <td><div className={'yt-hucre' + (d.oneri[an] === '?' && !d.kaydedildi ? ' belirsiz' : '')}>
          <Resim kayit={d.resim[an]} en={110} />
          <span>
            <span className="yt-sec" role="group" aria-label={`${no} ${k}. ders`}>
              <button type="button" className={'g' + (v === 'P' ? ' secili' : '')} disabled={!!d.kaydedildi} aria-pressed={v === 'P'} onClick={() => sec('P')}>Geldi</button>
              <button type="button" className={'y' + (v === 'A' ? ' secili' : '')} disabled={!!d.kaydedildi} aria-pressed={v === 'A'} onClick={() => sec('A')}>Yok</button>
            </span>
            {ne && v === '' && <div className="yt-neden">{ne}</div>}
            {eski && v && eski !== v && !d.kaydedildi && <div className="yt-onceki">önceki kayıt: {eski === 'A' ? 'yok' : 'geldi'}</div>}
          </span>
        </div></td>
      );
    };
    return (
      <tr key={no} className={bel ? 'belirsiz' : yok ? 'yok' : ''}>
        <td className="no">{no}</td>
        <td>{isimler[no] || (ogr ? ogr.adi + ' ' + ogr.soyadi : '')}{ogr && !ogr.sinifta && <span className="yt-onceki"> (sınıf listesinde değil)</span>}</td>
        {hucre(1)}{hucre(2)}
      </tr>
    );
  });
  return (
    <section className={'yt-ders' + (d.kaydedildi ? ' kaydedildi' : n.bel || eksik.length || !e ? ' sorunlu' : '')} aria-label={ad.ad}>
      <div className="yt-d-bas">
        <div><div className="yt-d-ad">{ad.ad}</div><div className="yt-d-alt">{ad.alt}</div></div>
        <div className="yt-d-cipler">
          <span className="yt-cip">{n.ogr} öğrenci</span>
          {n.yok ? <span className="yt-cip hata">{n.yok} gelmedi</span> : <span className="yt-cip ok">herkes geldi</span>}
          {n.bel > 0 && <span className="yt-cip uyari">{n.bel} belirsiz</span>}
          {d.sayfalar.some(s => s.guven === 'dusuk') && <span className="yt-cip uyari">hizalama zayıf</span>}
        </div>
      </div>
      {'hata' in d.o && <div className="yt-d-not hata">{d.o.hata}</div>}
      {e?.gelecek && <div className="yt-d-not hata">Bu dersin tarihi henüz gelmedi; yoklama kaydedilemez.</div>}
      {eksik.length > 0 && <div className="yt-d-not">Bu sirkünün {eksik.map(x => x + '/' + d.evrak.toplam).join(', ')}. sayfası taranmadı. Yalnızca taranan sayfadaki {d.sira.length} öğrencinin yoklaması kaydedilir; diğer öğrencilerin kaydına dokunulmaz.</div>}
      {e?.kayitli && !d.kaydedildi && (
        <div className="yt-d-not">Bu dersin yoklaması daha önce girilmiş ({e.kaydeden}, {e.zaman}{e.kaynak ? ', ' + e.kaynak : ''}).{' '}
          {n.fark ? <><b>{n.fark} hücre</b> önceki kayıttan farklı okundu.</> : 'Tarama önceki kayıtla aynı.'}{' '}
          Kaydederseniz taranan öğrencilerin durumu taramadaki gibi olur{e.durum === 'Yapılmadı' ? ' ve ders "yapıldı" sayılır' : ''}.</div>
      )}
      {d.ekSatirlar.map((x, j) => (
        <div key={j} className="yt-d-not">Sirkünün boş satırına elle bir şey yazılmış: <Resim kayit={x} en={260} /><br />
          Listede olmayan bir öğrenci olabilir; otomatik işlenmedi. Gerekirse öğrenciyi sınıf listesine ekleyip yoklamayı elle düzenleyin.</div>
      ))}
      {d.kaydedildi && <div className="yt-d-not ok">Kaydedildi ({d.kaydedildi}){d.gorselDurum ? ' · ' + d.gorselDurum : ''}</div>}
      {d.hata && <div className="yt-d-not hata">{d.hata}</div>}
      {!d.kaydedildi && (
        <label className="yt-filtre"><input type="checkbox" checked={d.filtre} onChange={ev => { d.filtre = ev.target.checked; degisti(); }} /> Yalnızca gelmeyenleri ve belirsizleri göster</label>
      )}
      <div className="yt-tablo-kap">
        <table className="yt-tablo" data-ders={i}>
          <thead><tr><th>No</th><th>Adı Soyadı</th><th>1. ders</th><th>2. ders</th></tr></thead>
          <tbody>{satirlar}</tbody>
        </table>
      </div>
      {gizli > 0 && <div className="yt-gizli-satir">{gizli} öğrenci iki derse de geldi olarak okundu. <button type="button" onClick={() => { d.filtre = false; degisti(); }}>Hepsini göster</button></div>}
      {!d.kaydedildi && (
        <div className="yt-d-cubuk">
          <span className="yt-say">{n.bel ? `${n.bel} belirsiz hücre için "Geldi" ya da "Yok" seçin.` : e?.gelecek || !e ? 'Kaydedilemez.' : 'Kaydetmeye hazır.'}</span>
          <button type="button" className="yt-btn birincil" disabled={!hazir || calisiyor} onClick={kaydet}>Bu dersi kaydet</button>
        </div>
      )}
    </section>
  );
}
