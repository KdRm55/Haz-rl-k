'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SIRKU_N_EN_AZ, SIRKU_SAYFA_BASI, type HaftalikSirku, type SirkuDuzen, type TopluSirku } from '@/lib/sirku-kurallari';
import { evrakKaydetIslemi } from '@/app/hoca/islemler';
import type { Rol } from '@/lib/oturum';
import type { EvrakSayfasi } from '@/lib/yoklama';
import { denemeTaramasi, evrakHazirlaSor } from '@/lib/yazdirma/evrak-qr';
import { evrakKartlari, hocaGruplari, hocaPdfleri, kartYerlesim, yazdir, type EvrakKarti } from '@/lib/yazdirma/sirku';
import { dosyaAdi, logoAdresi } from '@/lib/yazdirma/ortak';
import { HOCA_CSS } from './stil';

export type SirkuVerisi = { tur: 'tek'; veri: HaftalikSirku } | { tur: 'toplu'; veri: TopluSirku };

/** Evrak sayfalarını kaydedip numaralarını alır (hata mesajı kullanıcıya gösterilir). */
async function evrakNumaralari(s: EvrakSayfasi[]) {
  const r = await evrakKaydetIslemi(s);
  if (!r.ok) throw new Error(r.hata);
  return r.veri;
}

/* ---------- Sayfa düzeni (hocanın seçimi, tarayıcıda hatırlanır) ---------- */
const DUZEN_ANAHTAR = 'hz_sirku_duzen_v1';
function kayitliDuzen(): SirkuDuzen {
  try {
    const d = JSON.parse(localStorage.getItem(DUZEN_ANAHTAR) || 'null');
    const gecerli = (n: unknown) => typeof n === 'number' && n >= SIRKU_N_EN_AZ && n <= SIRKU_SAYFA_BASI;
    if (d?.mod === 'n' && gecerli(d.n)) return { mod: 'n', n: Math.round(d.n) };
    if (d?.mod === 'oto') return { mod: 'oto', n: gecerli(d.n) ? Math.round(d.n) : 30 };
  } catch { /* yok say */ }
  return { mod: 'oto', n: 30 };
}

function DuzenSecici({ duzen, degisti }: { duzen: SirkuDuzen; degisti: (d: SirkuDuzen) => void }) {
  const [metin, setMetin] = useState(String(duzen.n));
  const [hata, setHata] = useState('');
  const zaman = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sayiUygula = (v: string) => {
    clearTimeout(zaman.current);
    const n = Number(v.trim());
    if (!Number.isInteger(n) || n < SIRKU_N_EN_AZ || n > SIRKU_SAYFA_BASI) {
      setHata(`Sayfa başına öğrenci sayısı ${SIRKU_N_EN_AZ} ile ${SIRKU_SAYFA_BASI} arasında bir tam sayı olmalı.`);
      return;
    }
    setHata('');
    degisti({ mod: 'n', n });
  };
  return (
    <div className="sirku-duzen" role="group" aria-label="Sayfa düzeni">
      <span className="sd-baslik">Sayfa düzeni:</span>
      <label><input type="radio" name="sirkuDuzen" checked={duzen.mod === 'oto'} onChange={() => { setHata(''); degisti({ mod: 'oto', n: duzen.n }); }} /> Otomatik <span className="muted-note">(45 öğrenciye kadar tek sayfa)</span></label>
      <label><input type="radio" name="sirkuDuzen" checked={duzen.mod === 'n'} onChange={() => sayiUygula(metin)} /> Sayfa başına en çok{' '}
        <input type="number" min={SIRKU_N_EN_AZ} max={SIRKU_SAYFA_BASI} step={1} inputMode="numeric" value={metin} aria-label="Sayfa başına en çok öğrenci sayısı"
          onChange={e => { const v = e.target.value; setMetin(v); clearTimeout(zaman.current); zaman.current = setTimeout(() => sayiUygula(v), 700); }}
          onBlur={e => sayiUygula(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sayiUygula(metin); } }} /> öğrenci</label>
      {hata && <div className="sd-hata" role="alert">{hata}</div>}
    </div>
  );
}

function PdfOnay({ gruplar, aciklama, ornek, sec }: { gruplar: { hoca: string; sayi: number }[]; aciklama: string; ornek: string; sec: (m: 'ayri' | 'zip' | null) => void }) {
  const ilk = useRef<HTMLButtonElement>(null);
  useEffect(() => ilk.current?.focus(), []);
  return (
    <div className="pdf-onay-arka" onClick={e => { if (e.target === e.currentTarget) sec(null); }} onKeyDown={e => { if (e.key === 'Escape') sec(null); }}>
      <div className="pdf-onay" role="dialog" aria-modal="true" aria-labelledby="pdfOnayBaslik">
        <h3 id="pdfOnayBaslik">{gruplar.length} PDF dosyası oluşturulacak</h3>
        <p>{aciklama}</p>
        <p className="muted-note">Örnek dosya adı: <strong>{ornek}</strong></p>
        <ul className="pdf-liste">{gruplar.map(g => <li key={g.hoca}>{g.hoca} <span className="muted-note">({g.sayi} evrak)</span></li>)}</ul>
        <p className="muted-note">Tarayıcı, birden fazla dosya indirmek için bir kez izin isteyebilir; &quot;İzin ver&quot;i seçin. İzin verilemiyorsa &quot;Tek ZIP dosyası&quot; seçeneğini kullanın.</p>
        <div className="pdf-onay-dugmeler">
          <button ref={ilk} type="button" className="btn btn-primary" onClick={() => sec('ayri')}>Ayrı ayrı indir</button>
          <button type="button" className="btn btn-secondary" onClick={() => sec('zip')}>Tek ZIP dosyası</button>
          <button type="button" className="btn btn-secondary" onClick={() => sec(null)}>Vazgeç</button>
        </div>
      </div>
    </div>
  );
}

/** Tek bir şube evrakı: ekranda A4 önizleme ve kendi "Yazdır" düğmesi. */
function EvrakKartiGorunumu({ k, eksik, yazdirTek }: { k: EvrakKarti; eksik: number; yazdirTek: (el: HTMLElement) => void }) {
  const ref = useRef<HTMLElement>(null);
  return (
    <section className="sheet" ref={ref} data-hoca={k.hoca} data-anahtar={k.anahtar} data-sinif={k.sinif} data-tur={k.tur} data-hafta={k.hafta} data-sutunlar={JSON.stringify(k.sutunlar)}>
      <div className="sheet-bar">
        <div>
          <div className="sb-title">{k.sinif}</div>
          <div className="sb-sub">{k.hoca} | {k.dersler}{k.sayfaSayisi > 1 && <> · <strong>{k.sayfaSayisi} sayfa</strong> ({k.ogrenciSayisi} öğrenci)</>}</div>
          {eksik > 0 && <div className="sb-uyari">Uyarı: {eksik} öğrenci sayfaya sığmadı ve çıktıda görünmeyecek. Lütfen sistem yöneticisine bildirin.</div>}
        </div>
        <div className="print-here"><button type="button" title={'Yazdır: ' + k.sinif} onClick={() => ref.current && yazdirTek(ref.current)}>Yazdır</button></div>
      </div>
      <div dangerouslySetInnerHTML={{ __html: k.html }} />
    </section>
  );
}

export function SirkuSonuc({ s, rol }: { s: SirkuVerisi; rol?: Rol }) {
  const [duzen, setDuzen] = useState<SirkuDuzen>({ mod: 'oto', n: 30 });
  const [logo, setLogo] = useState('');
  const [eksikler, setEksikler] = useState<Record<string, number>>({});
  const [durum, setDurum] = useState('');
  const [pdfSuruyor, setPdfSuruyor] = useState(false);
  const [onay, setOnay] = useState(false);
  const kok = useRef<HTMLDivElement>(null);

  useEffect(() => { setDuzen(kayitliDuzen()); logoAdresi().then(setLogo); }, []);
  const duzenDegisti = (d: SirkuDuzen) => {
    setDuzen(d);
    try { localStorage.setItem(DUZEN_ANAHTAR, JSON.stringify(d)); } catch { /* yok say */ }
  };

  const telafi = s.tur === 'tek' && !!s.veri.isManual;
  const hafta = (telafi ? 'Telafi ' : '') + (s.veri.weekStart || '');
  const bloklar = useMemo(() => s.tur === 'tek'
    ? [{ hoca: s.veri.teacher, kartlar: evrakKartlari(s.veri.teacher, s.veri.weekStart, s.veri.sections, telafi, duzen, logo) }]
    : s.veri.hocalar.map(h => ({ hoca: h.teacher, kartlar: evrakKartlari(h.teacher, s.veri.weekStart, h.sections, false, duzen, logo) })).filter(b => b.kartlar.length),
  [s, duzen, logo, telafi]);
  const sayi = bloklar.reduce((t, b) => t + b.kartlar.length, 0);

  // Satır yükseklikleri sayfaya sığdırılır; yazı tipleri yüklenince ve pencere boyutu değişince yeniden
  useLayoutEffect(() => {
    const yerlestir = () => {
      const e: Record<string, number> = {};
      kok.current?.querySelectorAll<HTMLElement>('section.sheet').forEach(k => { e[k.dataset.anahtar!] = kartYerlesim(k); });
      setEksikler(onceki => JSON.stringify(onceki) === JSON.stringify(e) ? onceki : e);
    };
    yerlestir();
    document.fonts?.ready.then(() => requestAnimationFrame(yerlestir));
    window.addEventListener('resize', yerlestir, { passive: true });
    return () => window.removeEventListener('resize', yerlestir);
  }, [bloklar]);

  const kartlar = () => Array.from(kok.current?.querySelectorAll<HTMLElement>('section.sheet') ?? []);

  async function pdfIndir(mod: 'ayri' | 'zip') {
    if (pdfSuruyor) return;
    setPdfSuruyor(true);
    try {
      const k = kartlar();
      if (!await evrakHazirlaSor(k, evrakNumaralari, setDurum)) return;
      await hocaPdfleri(k, hafta, mod, setDurum);
    }
    catch (e) { console.error(e); setDurum('PDF oluşturulamadı. "Tümünü yazdır" → "PDF olarak kaydet"i kullanın.'); }
    finally { setPdfSuruyor(false); }
  }

  async function yazdirQr(k: HTMLElement[]) {
    if (!await evrakHazirlaSor(k, evrakNumaralari, setDurum)) return;
    yazdir(k, HOCA_CSS);
  }

  async function deneme() {
    if (pdfSuruyor) return;
    if (!confirm('Ekrandaki sirkülere rastgele imzalar atılmış, taranmış gibi görünen bir DENEME PDF’i indirilecek.\n\n' +
      'Bu PDF’i "Yoklama" sekmesinden yüklerseniz okuma sonucunu görürsünüz. Kaydederseniz deneme yoklamaları gerçek kayıt olur; denemeden sonra o yoklamaları silin.\n\n' +
      'Devam edilsin mi?')) return;
    setPdfSuruyor(true);
    try { await denemeTaramasi(kartlar(), evrakNumaralari, 'Deneme taramasi - ' + (hafta || 'sirku') + '.pdf', setDurum); }
    catch (e) { console.error(e); setDurum('Deneme PDF’i üretilemedi: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setPdfSuruyor(false); }
  }

  if (!sayi) {
    return <div className="empty-note">{s.tur === 'tek'
      ? `${s.veri.weekStart || ''} haftasında bu öğretim elemanına ait ders bulunamadı. Tarihi veya ders programındaki şube adlarını kontrol edin.`
      : `${s.veri.weekStart || ''} haftasında programda hiç ders bulunamadı.`}</div>;
  }

  const topluBar = !telafi || sayi > 1;
  const kim = s.tur === 'tek' ? '1 öğretim elemanı' : bloklar.length + ' öğretim elemanı';
  const gruplar = onay ? hocaGruplari(kartlar()).map(g => ({ hoca: g.hoca, sayi: g.kartlar.length })) : [];

  return (
    <div ref={kok}>
      {topluBar ? (
        <div className="print-all-bar">
          <div className="pab-metin"><strong>{sayi} evrak hazır</strong> <span className="muted-note">({kim})</span><br />
            <span className="muted-note">Tümünü tek seferde yazdırabilir ya da her öğretim elemanının evraklarını kendi adıyla ayrı bir PDF olarak indirebilirsiniz.</span>
            <div className="pdf-durum" role="status" aria-live="polite">{durum}</div>
          </div>
          <div className="pab-dugmeler">
            <button type="button" className="btn btn-primary" onClick={() => yazdirQr(kartlar())}>Tümünü yazdır</button>
            <button type="button" className="btn btn-secondary" disabled={pdfSuruyor} onClick={() => setOnay(true)}>Her hoca için ayrı PDF indir</button>
            {rol === 'admin' && <button type="button" className="btn btn-secondary" disabled={pdfSuruyor} onClick={deneme} title="Yalnızca yönetim: tarama okumasını denemek için">Deneme taraması üret</button>}
          </div>
          <DuzenSecici duzen={duzen} degisti={duzenDegisti} />
        </div>
      ) : (
        <div className="print-all-bar duzen-tek"><DuzenSecici duzen={duzen} degisti={duzenDegisti} /><div className="pdf-durum" role="status" aria-live="polite">{durum}</div></div>
      )}

      {bloklar.map(b => (
        <div key={b.hoca}>
          {s.tur === 'toplu' && <div className="teacher-divider">{b.hoca}</div>}
          {b.kartlar.map(k => <EvrakKartiGorunumu key={k.anahtar} k={k} eksik={eksikler[k.anahtar] ?? 0} yazdirTek={el => yazdirQr([el])} />)}
        </div>
      ))}

      {onay && (
        <PdfOnay gruplar={gruplar}
          aciklama={telafi ? 'Telafi evrakları tek bir PDF\'te birleştirilecek ve öğretim elemanının adıyla indirilecek.'
            : `Her öğretim elemanının ${hafta} haftasına ait bütün şube evrakları tek bir PDF'te birleştirilecek ve öğretim elemanının adıyla indirilecek.`}
          ornek={dosyaAdi(gruplar[0]?.hoca ?? '', 'Ogretim_Elemani') + ' - ' + hafta + '.pdf'}
          sec={m => { setOnay(false); if (m) pdfIndir(m); }} />
      )}
    </div>
  );
}
