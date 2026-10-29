'use client';

/** Yönetim paneli · "Yoklama" sekmesi (Apps Script YoklamaPanel.html karşılığı). */
import { useCallback, useState } from 'react';
import {
  taramaArsiviIslemi, taramaArsiviSilIslemi, yoklamaAyarKaydetIslemi, yoklamaAyarlariIslemi, yoklamaEksiklerIslemi, yoklamaRaporuIslemi
} from '@/app/yonetim/islemler';
import { Tarama } from '@/components/yoklama/Tarama';
import { blobIndir } from '@/lib/yazdirma/ortak';
import type { TaramaArsivi, YoklamaAyarlari, YoklamaEksikleri, YoklamaRaporu } from '@/lib/yoklama';
import { Mesaj, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

const YP_CSS = `
.yp-form { display:flex; flex-wrap:wrap; gap:14px 18px; align-items:flex-end; }
.yp-alan label { display:block; font-size:12.5px; font-weight:700; color:#334155; margin-bottom:6px; }
.yp-alan input, .yp-alan select { padding:10px 12px; border:2px solid #e2e8f0; border-radius:10px; font-size:14px; min-width:120px; background:#fff; }
.yp-alan input:focus, .yp-alan select:focus { border-color:var(--brand); outline:none; }
.yp-alan input[type=number] { width:110px; min-width:0; }
.yp-not { font-size:12.5px; color:#64748b; margin-top:10px; line-height:1.5; }
.yp-uyari { background:#FFF7E8; border-left:4px solid #E9993F; border-radius:10px; padding:12px 14px; margin-bottom:14px; font-size:13.5px; line-height:1.5; color:#5b3a0b; }
.yp-tablo-kap { overflow:auto; max-height:70vh; border:1px solid #e2e8f0; border-radius:12px; margin-top:14px; }
table.yp-tablo { font-size:13px; }
.yp-tablo th { position:sticky; top:0; background:#f1f5f9; color:#1e293b; z-index:1; font-size:12px; font-weight:700; text-align:center; padding:8px 6px; white-space:nowrap; }
.yp-tablo th.sol, .yp-tablo td.sol { text-align:left; }
.yp-tablo td { text-align:center; padding:6px; border-top:1px solid #eef1f6; font-variant-numeric:tabular-nums; white-space:nowrap; }
.yp-tablo td.yakin { background:#FFF4E0; color:#9a5a12; font-weight:700; }
.yp-tablo td.asti { background:#FEE4E2; color:#b42318; font-weight:700; }
.yp-tablo tr.asti td.sol:first-child { box-shadow:inset 4px 0 0 #b42318; }
.yp-tablo tr.yakin td.sol:first-child { box-shadow:inset 4px 0 0 #E9993F; }
.yp-tablo th small { display:block; font-weight:500; color:#64748b; }
.yp-ozet { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.yp-cip { font-size:12.5px; font-weight:700; border-radius:999px; padding:4px 10px; background:#eef2ff; color:var(--brand); }
.yp-cip.k { background:#FEE4E2; color:#b42318; } .yp-cip.s { background:#FFF4E0; color:#9a5a12; }
.yp-liste { margin:10px 0 0; padding:0; list-style:none; font-size:13.5px; }
.yp-liste li { padding:6px 0; border-top:1px solid #eef1f6; display:flex; gap:10px; flex-wrap:wrap; }
.yp-liste li b { min-width:150px; }
.yp-filtre { display:inline-flex; gap:6px; align-items:center; font-size:13px; cursor:pointer; }
`;

const MB = (n: number) => (n / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' MB';

function Ayarlar({ a, degisti }: { a: YoklamaAyarlari; degisti: (a: YoklamaAyarlari) => void }) {
  const cagir = useCagir();
  const [yuzde, setYuzde] = useState(String(a.yuzde));
  const [hafta, setHafta] = useState(String(a.hafta));
  const [bas, setBas] = useState(a.baslangic);
  const [m, setM] = useState<MesajDurumu>(null);
  const [bekliyor, setBekliyor] = useState(false);
  async function kaydet() {
    setBekliyor(true);
    const r = await cagir(yoklamaAyarKaydetIslemi({ yuzde: Number(yuzde), hafta: Number(hafta), baslangic: bas }));
    setBekliyor(false);
    if (!r.ok) { setM({ metin: r.hata, hata: true }); return; }
    degisti(r.veri);
    setM({ metin: `Kaydedildi. Sınır %${r.veri.yuzde}, ${r.veri.hafta} hafta${r.veri.baslangic ? ', dönem başlangıcı ' + r.veri.baslangic.split('-').reverse().join('.') : ''}.` });
  }
  return (
    <div className="adim">
      <div className="bolum-baslik">Devamsızlık sınırı</div>
      <p className="aciklama">Sınır ders bazındadır: bir dersin haftalık saati × dönem hafta sayısı × sınır yüzdesi (aşağı yuvarlanır). Örnek: haftada 4 saatlik ders, 14 hafta, %20 → 11 saat. Dönem başlangıcından önceki yoklamalar sayılmaz.</p>
      <div className="yp-form">
        <div className="yp-alan"><label htmlFor="ypYuzde">Sınır (%)</label><input type="number" id="ypYuzde" min={0} max={100} step={1} value={yuzde} onChange={e => setYuzde(e.target.value)} /></div>
        <div className="yp-alan"><label htmlFor="ypHafta">Dönem hafta sayısı</label><input type="number" id="ypHafta" min={0} max={60} step={1} value={hafta} onChange={e => setHafta(e.target.value)} /></div>
        <div className="yp-alan"><label htmlFor="ypBas">Dönem başlangıcı</label><input type="date" id="ypBas" value={bas} onChange={e => setBas(e.target.value)} /></div>
        <button type="button" className="btn btn-primary" disabled={bekliyor} onClick={kaydet}>{bekliyor ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </div>
      <Mesaj m={m} />
      <div className="yp-not">Yoklama girişi ve &quot;izinli&quot; işareti hoca ekranının <b>Yoklama</b> sekmesinden yapılır (<a href="/hoca" target="_blank" rel="noopener">hoca ekranını aç</a>). Hoca ekranına yönetim erişim koduyla girerseniz izinli sütunu ve yoklama silme düğmesi de görünür. Sistemde {a.oturumSayisi} ders yoklaması kayıtlı.</div>
    </div>
  );
}

function Rapor({ siniflar }: { siniflar: string[] }) {
  const cagir = useCagir();
  const [sinif, setSinif] = useState(siniflar[0] ?? '');
  const [r, setR] = useState<YoklamaRaporu | string | null>(null);
  const [sadece, setSadece] = useState(false);
  async function getir() {
    setR('Devamsızlıklar hesaplanıyor…');
    const x = await cagir(yoklamaRaporuIslemi(sinif));
    setR(x.ok ? x.veri : x.hata);
  }
  async function excel() {
    if (!r || typeof r === 'string') return;
    const { xlsxYaz } = await import('@/lib/xlsx-yaz');
    const bas = ['No', 'Adı Soyadı', ...r.dersler.map(d => d.ad + (d.sinir != null ? ` (sınır ${d.sinir})` : '')), 'Toplam', 'Durum'];
    const satirlar = r.ogrenciler.map(o => [o.no, o.ad, ...r.dersler.map(d => o.dersler[d.anahtar]?.yok ?? 0), o.toplam,
      o.durum === 'asti' ? 'Sınırı aştı' : o.durum === 'yakin' ? 'Sınıra yaklaştı' : '']);
    const veri = await xlsxYaz('Devamsızlık', [bas, ...satirlar], bas.map((b, i) => (i === 1 ? 28 : Math.max(10, b.length + 2))));
    blobIndir(new Blob([veri as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Devamsizlik - ${r.sinif}.xlsx`);
  }
  const rr = r && typeof r === 'object' ? r : null;
  const asti = rr?.ogrenciler.filter(o => o.durum === 'asti').length ?? 0, yakin = rr?.ogrenciler.filter(o => o.durum === 'yakin').length ?? 0;
  const liste = rr ? (sadece ? rr.ogrenciler.filter(o => o.durum) : rr.ogrenciler) : [];
  return (
    <div className="adim">
      <div className="bolum-baslik">Sınıf devamsızlık tablosu</div>
      <div className="yp-form">
        <div className="yp-alan"><label htmlFor="ypSinif">Sınıf</label>
          <select id="ypSinif" value={sinif} onChange={e => setSinif(e.target.value)}>{siniflar.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <button type="button" className="btn btn-primary" onClick={getir} disabled={!sinif}>Tabloyu göster</button>
        <button type="button" className="btn btn-secondary" onClick={excel} disabled={!rr}>Excel indir</button>
        <label className="yp-filtre"><input type="checkbox" checked={sadece} onChange={e => setSadece(e.target.checked)} /> Yalnızca sınıra yaklaşan / aşan öğrenciler</label>
      </div>
      {typeof r === 'string' && <div className={r.endsWith('…') ? 'durum' : 'hata-kutu'}>{r}</div>}
      {rr && (
        <>
          <div className="yp-ozet">
            <span className="yp-cip">{rr.ogrenciler.length} öğrenci</span>
            {asti > 0 && <span className="yp-cip k">{asti} öğrenci sınırı aştı</span>}
            {yakin > 0 && <span className="yp-cip s">{yakin} öğrenci sınıra yaklaştı</span>}
            {!(rr.ayar.hafta && rr.ayar.yuzde) && <span className="yp-cip s">Sınır tanımlı değil</span>}
          </div>
          {!liste.length ? <p className="yp-not">Gösterilecek öğrenci yok.</p> : (
            <>
              <div className="yp-tablo-kap"><table className="yp-tablo">
                <thead><tr><th className="sol">No</th><th className="sol">Adı Soyadı</th>
                  {rr.dersler.map(d => <th key={d.anahtar}>{d.ad}<small>{d.sinir != null ? 'sınır ' + d.sinir : 'sınır yok'} · {d.oturum} ders</small></th>)}<th>Toplam</th></tr></thead>
                <tbody>{liste.map(o => (
                  <tr key={o.no} className={o.durum}>
                    <td className="sol">{o.no}</td><td className="sol">{o.ad}</td>
                    {rr.dersler.map(d => {
                      const x = o.dersler[d.anahtar];
                      if (!x) return <td key={d.anahtar}>—</td>;
                      return <td key={d.anahtar} className={x.durum} title={x.izinli ? x.izinli + ' saat izinli' : ''}>{x.yok}{x.izinli > 0 && <small style={{ color: '#9a5a12' }}> +{x.izinli}i</small>}</td>;
                    })}
                    <td><b>{o.toplam}</b></td>
                  </tr>
                ))}</tbody>
              </table></div>
              <p className="yp-not">Hücreler gelinmeyen ders saatini gösterir; &quot;+1i&quot; izinli saattir ve devamsızlığa sayılmaz. Turuncu: sınırın %75&apos;ine ulaştı. Kırmızı: sınırı aştı.</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Arsiv() {
  const cagir = useCagir();
  const [k, setK] = useState<TaramaArsivi | string | null>(null);
  const [m, setM] = useState<MesajDurumu>(null);
  async function getir() { setK('Arşiv okunuyor…'); const r = await cagir(taramaArsiviIslemi()); setK(r.ok ? r.veri : r.hata); }
  async function sil(n: number) {
    if (!confirm(`${n} tarama görüntüsü kalıcı olarak silinecek. Yoklama kayıtları silinmez. Önce "Tarama görüntüleriyle birlikte" tam yedek almak isteyebilirsiniz. Devam edilsin mi?`)) return;
    const r = await cagir(taramaArsiviSilIslemi());
    if (!r.ok) { setM({ metin: r.hata, hata: true }); return; }
    setM({ metin: r.veri.silinen + ' görüntü silindi.' }); getir();
  }
  const a = k && typeof k === 'object' ? k : null;
  return (
    <div className="adim">
      <div className="bolum-baslik">Taranan sayfa görüntüleri (arşiv)</div>
      <p className="aciklama">Kaydedilen taramaların düzeltilmiş sayfa görüntüleri itiraz durumunda kanıt olarak veritabanında saklanır; yalnızca yönetim görebilir. Kişisel veri içerdiği için dönem sonunda silmeniz önerilir.</p>
      {!k && <button type="button" className="btn btn-secondary" onClick={getir}>Arşiv bilgisini göster</button>}
      {typeof k === 'string' && <div className={k.endsWith('…') ? 'durum' : 'hata-kutu'}>{k}</div>}
      {a && (!a.sayi ? <p className="yp-not">Henüz arşivlenmiş tarama görüntüsü yok.</p> : (
        <>
          <div className="yp-ozet"><span className="yp-cip">{a.sayi} sayfa görüntüsü</span><span className="yp-cip">{MB(a.boyut)}</span></div>
          <details className="liste" style={{ marginTop: 10 }}>
            <summary>Son kaydedilenler ({Math.min(50, a.sayi)})</summary>
            <ul className="yp-liste">{a.son.map(x => <li key={x.id}><b>{x.evrakNo}</b><span>{x.zaman} · {Math.round(x.boyut / 1024)} KB · <a href={`/yonetim/tarama-gorseli/${x.id}`} target="_blank" rel="noopener">görüntüle</a></span></li>)}</ul>
          </details>
          <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
            <button type="button" className="btn btn-secondary" style={{ color: '#b42318' }} onClick={() => sil(a.sayi)}>Bütün tarama görüntülerini sil</button>
          </div>
        </>
      ))}
      <Mesaj m={m} />
    </div>
  );
}

function Eksikler() {
  const cagir = useCagir();
  const [e, setE] = useState<YoklamaEksikleri | string | null>(null);
  async function getir() { setE('Program taranıyor…'); const r = await cagir(yoklamaEksiklerIslemi()); setE(r.ok ? r.veri : r.hata); }
  const x = e && typeof e === 'object' ? e : null;
  return (
    <div className="adim">
      <div className="bolum-baslik">Yoklaması girilmemiş dersler</div>
      <p className="aciklama">Programda olup bugüne kadar yoklaması girilmemiş dersler.</p>
      <button type="button" className="btn btn-secondary" onClick={getir}>{x ? 'Yenile' : 'Listeyi getir'}</button>
      {typeof e === 'string' && <div className={e.endsWith('…') ? 'durum' : 'hata-kutu'}>{e}</div>}
      {x && (
        <>
          <div className="yp-ozet"><span className={'yp-cip' + (x.toplam ? ' s' : '')}>{x.toplam} ders</span>{x.hocalar.map(h => <span key={h.hoca} className="yp-cip">{h.hoca}: {h.sayi}</span>)}</div>
          <p className="yp-not">{x.baslangic} tarihinden bugüne{x.varsayilanAralik ? ' (dönem başlangıcı girilmediği için son 4 hafta)' : ''}.{x.liste.length < x.toplam ? ` İlk ${x.liste.length} kayıt gösteriliyor.` : ''}</p>
          {x.liste.length > 0 && <ul className="yp-liste">{x.liste.map((l, i) => <li key={i}><b>{l.gun} {l.tarih} {l.saat}</b><span>{l.sinif} · {l.ders} · {l.hoca}</span></li>)}</ul>}
        </>
      )}
    </div>
  );
}

export function YoklamaSekmesi() {
  const yukle = useCallback(() => yoklamaAyarlariIslemi(), []);
  const { veri: a, setVeri, hata } = useVeri(yukle);
  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!a) return <Yukleniyor metin="Yoklama ayarları okunuyor…" />;
  return (
    <section>
      <style>{YP_CSS}</style>
      <Ayarlar a={a} degisti={setVeri} />
      <Rapor siniflar={a.siniflar} />
      <div className="adim"><Tarama /></div>
      <Arsiv />
      <Eksikler />
    </section>
  );
}
