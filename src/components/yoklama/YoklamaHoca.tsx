'use client';

/** Hoca ekranı · "Yoklama" sekmesi (Apps Script YoklamaHoca.html karşılığı). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { yoklamaGetirIslemi, yoklamaHaftasiIslemi, yoklamaKaydetIslemi, yoklamaSilIslemi } from '@/app/hoca/islemler';
import type { HocaBaslangic } from '@/lib/hoca';
import type { Sonuc } from '@/lib/islem-sonucu';
import type { OturumGirdisi, YoklamaEditoru, YoklamaHaftasi } from '@/lib/yoklama';
import { YOKLAMA_HOCA_CSS } from './stil';
import { OgrenciYoklamasi } from './OgrenciYoklamasi';
import { Tarama } from './Tarama';

const HOCA_ANAHTAR = 'hz_yok_hoca_v1';
const SIRA_ANAHTAR = 'hz_yok_sira_v1';

/** Yoklama tablosunun görünüm sırası; kaydedilen liste her zaman sınıf listesi sırasındadır. */
type Siralama = 'liste' | 'ad' | 'soyad' | 'no';
const SIRALAMALAR: [Siralama, string][] = [['liste', 'Sınıf listesi sırası'], ['ad', 'Ada göre (A–Z)'], ['soyad', 'Soyada göre (A–Z)'], ['no', 'Öğrenci numarasına göre']];

function pazartesiISO() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

type Oturum = YoklamaHaftasi['oturumlar'][number];

function Cip({ o, bugun }: { o: Oturum; bugun: string }) {
  if (o.kayitli && o.durum === 'Yapılmadı') return <span className="yk-cip yapilmadi">Ders yapılmadı</span>;
  if (o.kayitli) return <span className="yk-cip girildi">Girildi · {o.gelmeyen ? o.gelmeyen + ' gelmedi' : 'tam katılım'}{o.izinli ? ' · ' + o.izinli + ' izinli' : ''}</span>;
  if (o.iso > bugun) return <span className="yk-cip ileri">İleri tarih</span>;
  return <span className="yk-cip girilmedi">Girilmedi</span>;
}

type Satir = { no: string; y1: boolean; y2: boolean; iz: boolean };   // y = yok (işaret kaldırıldı)

function Editor({ d, admin, hoca, kapat, kaydedildi, kirli, setKirli }: {
  d: YoklamaEditoru; admin: boolean; hoca: string; kapat: () => void; kaydedildi: (yeni: YoklamaEditoru | null, mesaj: string) => void;
  kirli: boolean; setKirli: (v: boolean) => void;
}) {
  const [satirlar, setSatirlar] = useState<Satir[]>(() => d.ogrenciler.map(s => ({ no: s.no, y1: s.yok1, y2: s.yok2, iz: s.izinli })));
  const [durum, setDurum] = useState(d.durum);
  const [aciklama, setAciklama] = useState(d.aciklama);
  const [mesaj, setMesaj] = useState<{ ok: boolean; metin: string } | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const o = d.oturum, yapilmadi = durum === 'Yapılmadı';
  const isim = useMemo(() => new Map(d.ogrenciler.map(s => [s.no, s])), [d]);
  const [sira, setSira] = useState<Siralama>('liste');
  useEffect(() => { try { const v = localStorage.getItem(SIRA_ANAHTAR); if (SIRALAMALAR.some(([k]) => k === v)) setSira(v as Siralama); } catch { /* yok say */ } }, []);
  const siraSec = (v: Siralama) => { setSira(v); try { localStorage.setItem(SIRA_ANAHTAR, v); } catch { /* yok say */ } };
  const gorunen = useMemo(() => {
    if (sira === 'liste') return satirlar;
    const tr = (a: string, b: string) => a.localeCompare(b, 'tr', { sensitivity: 'base', numeric: true });
    const anahtar = (no: string) => { const b = isim.get(no); return sira === 'ad' ? [b?.adi ?? '', b?.soyadi ?? ''] : [b?.soyadi ?? '', b?.adi ?? '']; };
    return [...satirlar].sort((x, y) => {
      if (sira === 'no') return tr(x.no, y.no);
      const [a1, a2] = anahtar(x.no), [b1, b2] = anahtar(y.no);
      return tr(a1, b1) || tr(a2, b2) || tr(x.no, y.no);
    });
  }, [satirlar, sira, isim]);
  const degis = (no: string, f: 'y1' | 'y2' | 'iz', v: boolean) => { setSatirlar(l => l.map(s => (s.no === no ? { ...s, [f]: v } : s))); setKirli(true); };

  const sayac = (() => {
    if (yapilmadi) return <>Ders yapılmadı olarak kaydedilecek; devamsızlık yazılmaz.</>;
    const yok = new Set<string>(); let saat = 0, izin = 0;
    satirlar.forEach(s => { if (s.iz && admin) izin++; if (!(s.iz && admin)) { if (s.y1) { yok.add(s.no); saat++; } if (s.y2) { yok.add(s.no); saat++; } } });
    return <>{satirlar.length} öğrenci · {yok.size ? <><span className="k">{yok.size} gelmedi</span> · {saat} saat devamsızlık</> : 'herkes geldi'}{izin ? ` · ${izin} izinli` : ''}</>;
  })();

  async function kaydet() {
    setBekliyor(true); setMesaj(null);
    const r = await yoklamaKaydetIslemi({
      iso: o.iso, sinif: o.sinif, saat: o.saat, ders: o.ders, hoca: o.hoca || hoca, tur: o.tur, durum,
      liste: satirlar.map(s => s.no), yok1: satirlar.filter(s => s.y1).map(s => s.no), yok2: satirlar.filter(s => s.y2).map(s => s.no),
      izinli: satirlar.filter(s => s.iz).map(s => s.no), aciklama, oncekiSurum: d.kayitli ? d.surum : 0
    });
    if (!r.ok) { setBekliyor(false); setMesaj({ ok: false, metin: r.hata }); return; }
    // Kaydedilen hâli yeniden oku (izinliler sunucuda korunmuş olabilir)
    const yeni = await yoklamaGetirIslemi(o);
    setBekliyor(false);
    kaydedildi(yeni.ok ? yeni.veri : null, `Kaydedildi (${r.veri.zaman}). ` +
      (r.veri.durum === 'Yapılmadı' ? 'Ders yapılmadı olarak işlendi.' : r.veri.gelmeyen ? r.veri.gelmeyen + ' öğrenci gelmedi.' : 'Herkes geldi.'));
  }

  async function sil() {
    if (!confirm(`${o.sinif} · ${o.ders} · ${o.tarih} yoklaması silinecek. Bu işlem geri alınamaz. Devam edilsin mi?`)) return;
    const r = await yoklamaSilIslemi(d.anahtar);
    if (!r.ok) { setMesaj({ ok: false, metin: r.hata }); return; }
    kaydedildi(null, 'Yoklama silindi.');
  }

  return (
    <section className="yk-editor" aria-labelledby="ykBaslik">
      <div className="yk-ed-bas">
        <h3 id="ykBaslik">{o.sinif} · {o.ders}</h3>
        <div className="yk-alt">{o.gun} {o.tarih}{o.saat ? ' · ' + o.saat : ''} · {o.hoca || hoca}{o.tur === 'Telafi' && <> · <strong>Telafi</strong></>}<br />
          {d.kayitli ? `Son kayıt: ${d.zaman} (${d.kaydeden}${d.kaynak ? ', ' + d.kaynak : ''})` : <><strong>Henüz kaydedilmedi.</strong> Herkes &quot;geldi&quot; olarak işaretli.</>}</div>
      </div>
      <div className="yk-ed-durum">
        <label><input type="radio" name="ykDurum" checked={!yapilmadi} onChange={() => { setDurum('Yapıldı'); setKirli(true); }} /> Ders yapıldı</label>
        <label><input type="radio" name="ykDurum" checked={yapilmadi} onChange={() => { setDurum('Yapılmadı'); setKirli(true); }} /> Ders yapılmadı (tatil, iptal)</label>
        <button type="button" className="btn btn-secondary" disabled={yapilmadi} onClick={() => { setSatirlar(l => l.map(s => ({ ...s, y1: false, y2: false }))); setKirli(true); }}>Herkes geldi</button>
        <label className="yk-sirala">Sırala
          <select value={sira} onChange={e => siraSec(e.target.value as Siralama)} aria-label="Öğrenci sıralaması">
            {SIRALAMALAR.map(([k, et]) => <option key={k} value={k}>{et}</option>)}
          </select></label>
      </div>
      {d.gelecek && <div className="yk-mesaj"><div className="hata">Bu ders henüz yapılmadı; ileri tarihli yoklama kaydedilemez.</div></div>}
      <div className="yk-tablo-kap" style={{ opacity: yapilmadi ? 0.5 : undefined }}>
        <table className="yk-tablo">
          <thead><tr><th>#</th><th>No</th><th>Adı Soyadı</th><th className="c">1. ders</th><th className="c">2. ders</th>{admin && <th className="c">İzinli</th>}</tr></thead>
          <tbody>{gorunen.map((s, i) => {
            const b = isim.get(s.no)!, adi = (b.adi + ' ' + b.soyadi).trim() || '(adı bulunamadı)';
            const izinli = admin && s.iz, eksik = s.y1 || s.y2;
            return (
              <tr key={s.no} className={eksik ? (izinli ? 'izinli' : 'yok') : ''}>
                <td className="sira">{i + 1}</td><td className="no">{s.no}</td>
                <td>{adi}{!b.sinifta && <span className="etiket">sınıf listesinde değil</span>}</td>
                {(['y1', 'y2'] as const).map((f, k) => (
                  <td key={f} className="c"><label className="yk-onay"><input type="checkbox" checked={!s[f]} disabled={yapilmadi} aria-label={`${adi} ${k + 1}. ders`}
                    onChange={e => degis(s.no, f, !e.target.checked)} /><span>{s[f] ? 'Yok' : 'Geldi'}</span></label></td>
                ))}
                {admin && <td className="c"><label className="yk-onay izin"><input type="checkbox" checked={s.iz} disabled={yapilmadi} aria-label={adi + ' izinli'}
                  onChange={e => degis(s.no, 'iz', e.target.checked)} /><span>{s.iz ? 'İzinli' : '—'}</span></label></td>}
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div className="yk-aciklama"><label htmlFor="ykAciklama" className="muted-note">Açıklama (isteğe bağlı)</label>
        <textarea id="ykAciklama" maxLength={500} value={aciklama} onChange={e => { setAciklama(e.target.value); setKirli(true); }} /></div>
      <div className="yk-mesaj" role="status" aria-live="polite">{mesaj && <div className={mesaj.ok ? 'ok' : 'hata'}>{mesaj.metin}</div>}</div>
      <div className="yk-cubuk">
        <span className="yk-sayac">{sayac}</span>
        <span className="yk-dug">
          {admin && d.kayitli && <button type="button" className="btn btn-tehlike" onClick={sil}>Yoklamayı sil</button>}
          <button type="button" className="btn btn-secondary" onClick={() => { if (kirli && !confirm('Kaydedilmemiş değişiklikler silinecek. Kapatılsın mı?')) return; kapat(); }}>Kapat</button>
          <button type="button" className="btn btn-primary" disabled={d.gelecek || bekliyor} onClick={kaydet}>{bekliyor ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </span>
      </div>
    </section>
  );
}

export function YoklamaHoca({ b, yetkiHatasi }: { b: HocaBaslangic; yetkiHatasi: (r: Sonuc<unknown>) => boolean }) {
  const admin = b.rol === 'admin';
  const [hoca, setHoca] = useState(b.hocalar.length === 1 ? b.hocalar[0] : '');
  const [tarih, setTarih] = useState(pazartesiISO);
  const [hafta, setHafta] = useState<YoklamaHaftasi | string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const [ed, setEd] = useState<{ d: YoklamaEditoru; surum: number } | string | null>(null);
  const [edMesaj, setEdMesaj] = useState('');
  const [kirli, setKirli] = useState(false);
  const [telafi, setTelafi] = useState({ sinif: '', ders: '', iso: '', saat: '' });
  const edRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { const h = localStorage.getItem(HOCA_ANAHTAR) || ''; if (b.hocalar.includes(h)) setHoca(h); } catch { /* yok say */ } }, [b.hocalar]);
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (kirli) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [kirli]);

  const getir = useCallback(async (sessiz = false, h = hoca) => {
    if (!h || !tarih) { if (!sessiz) setHafta('Öğretim elemanını ve haftayı seçin.'); return; }
    if (!sessiz) setBekliyor(true);
    const r = await yoklamaHaftasiIslemi(h, tarih);
    setBekliyor(false);
    if (yetkiHatasi(r)) return;
    setHafta(r.ok ? r.veri : r.hata);
  }, [hoca, tarih, yetkiHatasi]);
  // Kayıtlı hoca seçimiyle açılışta haftanın dersleri gelir
  const ilk = useRef(true);
  useEffect(() => { if (ilk.current && hoca) { ilk.current = false; getir(true); } }, [hoca, getir]);

  async function ac(o: OturumGirdisi) {
    if (kirli && !confirm('Kaydedilmemiş değişiklikler var. Bu yoklamayı kaydetmeden kapatmak istiyor musunuz?')) return;
    setEd('Öğrenci listesi okunuyor…'); setEdMesaj('');
    const r = await yoklamaGetirIslemi(o);
    if (yetkiHatasi(r)) return;
    setKirli(false);
    setEd(r.ok ? { d: r.veri, surum: Date.now() } : r.hata);
    setTimeout(() => edRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  function telafiAc() {
    if (!hoca) { alert('Önce öğretim elemanını seçin.'); return; }
    if (!telafi.sinif || !telafi.ders || !telafi.iso) { alert('Şube, ders ve telafi tarihini seçin.'); return; }
    ac({ ...telafi, saat: telafi.saat.trim(), hoca, tur: 'Telafi' });
  }

  const h = typeof hafta === 'object' ? hafta : null;
  const gunler = useMemo(() => {
    const m = new Map<string, Oturum[]>();
    h?.oturumlar.forEach(o => { if (!m.has(o.iso)) m.set(o.iso, []); m.get(o.iso)!.push(o); });
    return [...m.values()];
  }, [h]);
  const secili = ed && typeof ed === 'object' ? ed.d.anahtar : '';
  const girilmedi = h ? h.oturumlar.filter(o => !o.kayitli && o.iso <= h.bugun).length : 0;

  return (
    <>
      <style>{YOKLAMA_HOCA_CSS}</style>
      <h2 className="panel-title">Yoklama</h2>
      <p className="panel-desc">Haftanın derslerini getirin, dersi seçip gelmeyenlerin işaretini kaldırın ve kaydedin. Her ders 2 saattir (sirküdeki 1. ve 2. ders).{admin ? ' Yönetim koduyla girdiğiniz için "İzinli" sütunu ve yoklama silme düğmesi görünür.' : ''}</p>
      <div className="yk-form">
        <div className="field"><label htmlFor="yokHoca">Öğretim elemanı</label>
          <select id="yokHoca" value={hoca} onChange={e => { setHoca(e.target.value); try { localStorage.setItem(HOCA_ANAHTAR, e.target.value); } catch { /* yok say */ } }}>
            <option value="">— Seçin —</option>{b.hocalar.map(x => <option key={x} value={x}>{x}</option>)}
          </select></div>
        <div className="field"><label htmlFor="yokTarih">Hafta (herhangi bir günü)</label><input type="date" id="yokTarih" value={tarih} onChange={e => setTarih(e.target.value)} /></div>
        <div className="field"><button className="btn btn-primary" type="button" disabled={bekliyor} onClick={() => getir()}>{bekliyor ? 'Getiriliyor…' : 'Haftanın derslerini getir'}</button></div>
      </div>

      <div aria-live="polite">
        {typeof hafta === 'string' && <div className={hafta.startsWith('Öğretim') ? 'yk-ozet' : 'empty-note'} style={{ marginTop: 18 }}>{hafta}</div>}
        {h && !h.oturumlar.length && <div className="empty-note" style={{ marginTop: 18 }}>{h.weekStart} haftasında programda bu öğretim elemanına ait ders yok.</div>}
        {h && h.oturumlar.length > 0 && (
          <>
            <div className="yk-ozet">{h.teacher} · {h.weekStart} haftası · {h.oturumlar.length} ders{girilmedi > 0 && <> · <strong style={{ color: '#8A5210' }}>{girilmedi} dersin yoklaması girilmedi</strong></>}</div>
            {gunler.map(l => (
              <div key={l[0].iso} className="yk-gun">
                <h3>{l[0].gun} {l[0].tarih}</h3>
                {l.map(o => (
                  <button key={o.anahtar} type="button" className={'yk-oturum' + (o.anahtar === secili ? ' secili' : '')}
                    disabled={o.iso > h.bugun && !o.kayitli} title={o.iso > h.bugun && !o.kayitli ? 'Ders günü gelmeden yoklama girilemez' : undefined}
                    onClick={() => ac({ iso: o.iso, sinif: o.sinif, saat: o.saat, ders: o.ders, hoca: o.hoca, tur: o.tur })}>
                    <span className="yo-saat">{o.saat}</span>
                    <span className="yo-ders">{o.sinif} · {o.ders}{o.kayitli && <small>Son kayıt: {o.zaman}</small>}</span>
                    {o.tur === 'Telafi' && <span className="yk-cip telafi">Telafi</span>}
                    <Cip o={o} bugun={h.bugun} />
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      <details className="yk-telafi">
        <summary>Program dışı (telafi) ders için yoklama</summary>
        <div className="yk-form">
          <div className="field"><label htmlFor="ytSinif">Şube</label>
            <select id="ytSinif" value={telafi.sinif} onChange={e => setTelafi(t => ({ ...t, sinif: e.target.value }))}>
              <option value="">— Seçin —</option>{b.subeler.map(s => <option key={s.key} value={s.name}>{s.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="ytDers">Ders</label>
            <select id="ytDers" value={telafi.ders} onChange={e => setTelafi(t => ({ ...t, ders: e.target.value }))}>
              <option value="">— Seçin —</option>{b.dersler.map(x => <option key={x} value={x}>{x}</option>)}
            </select></div>
          <div className="field"><label htmlFor="ytTarih">Telafi tarihi</label><input type="date" id="ytTarih" value={telafi.iso} onChange={e => setTelafi(t => ({ ...t, iso: e.target.value }))} /></div>
          <div className="field"><label htmlFor="ytSaat">Saat</label><input type="text" id="ytSaat" list="ykSaatler" placeholder="Örn: 10.00-12.00" value={telafi.saat} onChange={e => setTelafi(t => ({ ...t, saat: e.target.value }))} /></div>
          <div className="field"><button className="btn btn-primary" type="button" onClick={telafiAc}>Yoklamayı aç</button></div>
        </div>
        <datalist id="ykSaatler">{b.saatler.map(s => <option key={s} value={s} />)}</datalist>
      </details>

      <OgrenciYoklamasi yetkiHatasi={yetkiHatasi} />

      <div ref={edRef}>
        {edMesaj && !ed && <div className="yk-mesaj" style={{ padding: 0 }}><div className="ok">{edMesaj}</div></div>}
        {typeof ed === 'string' && <div className={ed.endsWith('…') ? 'yk-ozet' : 'empty-note'} style={{ marginTop: 18 }}>{ed}</div>}
        {ed && typeof ed === 'object' && (
          <>
            {edMesaj && <div className="yk-mesaj" style={{ padding: 0, marginTop: 18 }}><div className="ok">{edMesaj}</div></div>}
            <Editor key={ed.surum} d={ed.d} admin={admin} hoca={hoca} kirli={kirli} setKirli={setKirli}
              kapat={() => { setEd(null); setKirli(false); setEdMesaj(''); }}
              kaydedildi={(yeni, m) => { setKirli(false); setEdMesaj(m); setEd(yeni ? { d: yeni, surum: Date.now() } : null); getir(true); }} />
          </>
        )}
      </div>

      <div className="yk-tarama"><Tarama kaydedildi={() => getir(true)} /></div>
    </>
  );
}
