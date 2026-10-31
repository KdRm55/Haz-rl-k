'use client';

import { useCallback, useState } from 'react';
import { dsArsivIslemi, dsDurumIslemi, dsGuncelleIslemi, dsOgrenciGuncelleIslemi, dsOlusturIslemi, dsYayinIslemi, dsYerKaydetIslemi } from '@/app/yonetim/islemler';
import type { DsDurum } from '@/lib/donem-sinav';
import type { Sonuc } from '@/lib/islem-sonucu';
import { DonemPuanTablosu, DonemPuanYukleme } from './DonemPuan';
import { ListeTablosu, Mesaj, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

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

function SinavKarti({ x, setVeri, mesaj, duzenle }: { x: Sinav; setVeri: (d: DsDurum) => void; mesaj: (m: MesajDurumu) => void; duzenle: () => void }) {
  const cagir = useCagir();
  const [yerler, setYerler] = useState<Record<string, string>>(Object.fromEntries(x.yerler.map(y => [y.sinif, y.ozel])));
  const [alan, setAlan] = useState<'' | 'tablo' | 'yukle'>('');
  const [bekliyor, setBekliyor] = useState(false);
  const sonucAcik = x.dersler.filter(d => d.sonucYayinda).length;

  async function calis(p: Promise<Sonuc<DsDurum>>, basari: string, onay?: string) {
    if (onay && !confirm(onay)) return;
    setBekliyor(true);
    const r = await cagir(p);
    setBekliyor(false);
    if (r.ok) { setVeri(r.veri); mesaj({ metin: basari }); } else mesaj({ metin: r.hata, hata: true });
  }
  // Kartın yayın çubuğu: bütün derslerin puanlarını tek seferde açar ya da kapatır
  async function tumunu(ac: boolean) {
    const hedef = x.dersler.filter(d => d.sonucYayinda !== ac);
    const bos = hedef.reduce((t, d) => t + d.bos, 0);
    if (!confirm(ac ? `${x.ad} · ${hedef.map(d => d.ders).join(', ')} puanları öğrencilere yayınlansın mı?` + (bos ? `\n\nDİKKAT: ${bos} puan henüz girilmemiş; bu öğrenciler "Girilmedi" görür.` : '')
      : `${x.ad} puanları öğrencilerden gizlensin mi?`)) return;
    setBekliyor(true);
    let son: Sonuc<DsDurum> | null = null;
    for (const d of hedef) { son = await cagir(dsYayinIslemi(x.kod, 'sonuc', d.ders, ac)); if (!son.ok) break; }
    setBekliyor(false);
    if (!son) return;
    if (son.ok) { setVeri(son.veri); mesaj({ metin: ac ? 'Puanlar yayınlandı. Öğrenciler kendi hesaplarından görebilir.' : 'Puanlar öğrencilerden gizlendi.' }); }
    else mesaj({ metin: son.hata, hata: true });
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
          <span className={'ds-cip' + (x.yerYayinda ? ' acik' : '')}>Sınav yerleri {x.yerYayinda ? 'yayında' : 'gizli'}</span>
          <span className={'ds-cip' + (sonucAcik ? ' acik' : '')}>Puanlar: {sonucAcik} / {x.dersler.length} ders yayında</span>
        </div>
      </div>
      <div className="table-card"><div className="scroller"><table>
        <thead><tr><th>Ders</th><th>Tarih · Saat</th><th>Girilen</th><th>Girmedi</th><th>Boş</th><th>Ortalama</th><th>Puanlar</th></tr></thead>
        <tbody>{x.dersler.map(d => (
          <tr key={d.ders}>
            <td><strong>{d.ders}</strong></td><td>{[d.tarih, d.saat].filter(Boolean).join(' · ') || '—'}</td>
            <td className="no">{d.girilen} / {d.n}</td><td className="no">{d.girmedi}</td><td className="no">{d.bos}</td><td className="no">{puanTr(d.ort)}</td>
            <td><button type="button" className={'btn btn-kucuk ' + (d.sonucYayinda ? 'btn-secondary' : 'btn-primary')} disabled={bekliyor} onClick={() => d.sonucYayinda
              ? calis(dsYayinIslemi(x.kod, 'sonuc', d.ders, false), `${d.ders} sonuçları öğrencilerden gizlendi.`)
              : calis(dsYayinIslemi(x.kod, 'sonuc', d.ders, true), `${d.ders} puanları yayınlandı. Öğrenciler kendi hesaplarından görebilir.`,
                `${x.ad} · ${d.ders} puanları öğrencilere yayınlansın mı?\n\nGirilen: ${d.girilen} / ${d.n}, girmedi: ${d.girmedi}, boş: ${d.bos}` +
                (d.bos ? `\n\nDİKKAT: ${d.bos} öğrencinin puanı henüz girilmemiş; bu öğrenciler "Girilmedi" görür.` : ''))}>
              {d.sonucYayinda ? 'Gizle' : 'Yayınla'}</button></td>
          </tr>
        ))}</tbody>
      </table></div></div>
      <div className={'ds-yayin' + (sonucAcik === x.dersler.length && sonucAcik ? ' acik' : '')}>
        <span>{!sonucAcik ? 'Puanlar öğrencilere kapalı. Yayınlamadan hiçbir öğrenci puanını göremez.'
          : sonucAcik < x.dersler.length ? `${sonucAcik} dersin puanları öğrencilere açık; diğerleri kapalı.` : 'Bütün derslerin puanları öğrencilere açık.'}</span>
        {sonucAcik < x.dersler.length
          ? <button type="button" className="btn btn-primary btn-kucuk" disabled={bekliyor} onClick={() => tumunu(true)}>{x.dersler.length > 1 ? 'Tüm puanları yayınla' : 'Puanları yayınla'}</button>
          : <button type="button" className="btn btn-secondary btn-kucuk" disabled={bekliyor} onClick={() => tumunu(false)}>Puanları gizle</button>}
      </div>
      <ListeTablosu baslik="Sınıf ortalamaları" sayi={sinifSatir.length} kolonlar={['Ders', 'Sınıf', 'Girilen', 'Ortalama', 'En düşük – en yüksek']} satirlar={sinifSatir} />
      <div className="ds-alt-bolum">
        <h4>Sınav yerleri</h4>
        <p className="aciklama" style={{ margin: 0 }}>Boş bırakılan sınıf kendi dersliğinde sınava girer. Bu sınava bağlı yayındaki bir sınav yeri listesi varsa öğrenci salon ve sırasını görür.</p>
        <div className="ds-yer-izgara">{x.yerler.map(y => (
          <label key={y.sinif}>{y.sinif}<input type="text" maxLength={60} value={yerler[y.sinif] ?? ''} placeholder={y.derslik ? `${y.derslik} (dersliği)` : 'Derslik tanımlı değil'} onChange={e => setYerler(v => ({ ...v, [y.sinif]: e.target.value }))} /></label>
        ))}</div>
        <div className="ds-eylem" style={{ marginTop: 4 }}>
          <button type="button" className="btn btn-secondary btn-kucuk" disabled={bekliyor} onClick={() => calis(dsYerKaydetIslemi(x.kod, yerler), 'Sınav yerleri kaydedildi.')}>Yerleri kaydet</button>
          <button type="button" className={'btn btn-kucuk ' + (x.yerYayinda ? 'btn-secondary' : 'btn-primary')} disabled={bekliyor}
            onClick={() => calis(dsYayinIslemi(x.kod, 'yer', null, !x.yerYayinda), x.yerYayinda ? 'Sınav yerleri gizlendi.' : 'Sınav yerleri yayınlandı.', x.yerYayinda ? undefined : `${x.ad} için sınav tarihleri ve yerleri öğrencilere gösterilsin mi?`)}>
            {x.yerYayinda ? 'Sınav yerlerini gizle' : 'Sınav yerlerini yayınla'}</button>
        </div>
      </div>
      <div className="ds-eylem">
        <button type="button" className="btn btn-secondary btn-kucuk" onClick={() => setAlan(a => (a === 'tablo' ? '' : 'tablo'))}>{alan === 'tablo' ? 'Puan tablosunu kapat' : 'Puanları gir / düzelt'}</button>
        <button type="button" className="btn btn-secondary btn-kucuk" onClick={() => setAlan(a => (a === 'yukle' ? '' : 'yukle'))}>Puan listesi yükle</button>
        <button type="button" className="btn btn-secondary btn-kucuk" disabled={bekliyor} onClick={async () => {
          setBekliyor(true); const r = await cagir(dsOgrenciGuncelleIslemi(x.kod)); setBekliyor(false);
          if (!r.ok) { mesaj({ metin: r.hata, hata: true }); return; }
          setVeri(r.veri.durum); mesaj({ metin: `${r.veri.eklenen} öğrenci eklendi${r.veri.sinifGuncel ? `, ${r.veri.sinifGuncel} öğrencinin sınıfı güncellendi` : ''}. Var olan puanlara dokunulmadı.` });
        }}>Öğrenci listesini güncelle</button>
        <button type="button" className="btn btn-secondary btn-kucuk" onClick={duzenle}>Düzenle</button>
        <button type="button" className="btn btn-secondary btn-kucuk" disabled={bekliyor} onClick={() => calis(dsArsivIslemi(x.kod, !x.arsiv), x.arsiv ? 'Sınav arşivden çıkarıldı.' : 'Sınav arşivlendi.',
          x.arsiv ? undefined : `${x.ad} arşivlensin mi? Öğrenciler bu sınavı ve sonuçlarını artık görmez; veriler silinmez.`)}>{x.arsiv ? 'Arşivden çıkar' : 'Arşivle'}</button>
      </div>
      {alan === 'tablo' && <DonemPuanTablosu kod={x.kod} mesaj={mesaj} degisti={async () => { const r = await cagir(dsDurumIslemi()); if (r.ok) setVeri(r.veri); }} />}
      {alan === 'yukle' && <DonemPuanYukleme x={x} mesaj={mesaj} bitti={d => { setVeri(d); setAlan(''); }} />}
    </div>
  );
}

export function DonemSekmesi() {
  const cagir = useCagir();
  const { veri: d, setVeri, hata } = useVeri(dsDurumIslemi);
  const [arsivGoster, setArsivGoster] = useState(false);
  const [form, setForm] = useState<{ x: Sinav | null } | null>(null);
  const [mesaj, setMesajHam] = useState<MesajDurumu>(null);
  const setMesaj = useCallback((m: MesajDurumu) => setMesajHam(m), []);

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!d) return <Yukleniyor />;
  const liste = d.sinavlar.filter(x => arsivGoster || !x.arsiv).slice().reverse();

  async function kaydet(v: { ad: string; siniflar?: string[]; dersler: FormDers[] }) {
    const r = form?.x ? await cagir(dsGuncelleIslemi({ kod: form.x.kod, ad: v.ad, dersler: v.dersler })) : await cagir(dsOlusturIslemi(v));
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return false; }
    setVeri(r.veri);
    setMesaj({ metin: form?.x ? 'Sınav güncellendi.' : 'Sınav oluşturuldu. Sınav yerlerini kontrol edip yayınlayın; puanları "Puanları gir / düzelt" ya da "Puan listesi yükle" ile girin.' });
    return true;
  }

  return (
    <section>
      <div className="adim">
        <div className="dosya-satir" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <div className="bolum-baslik" style={{ margin: 0 }}>Dönem sınavları</div>
          <div className="dosya-satir" style={{ gap: 12 }}>
            <label className="onay" style={{ margin: 0 }}><input type="checkbox" checked={arsivGoster} onChange={e => setArsivGoster(e.target.checked)} /><span>Arşivdekileri göster</span></label>
            <button className="btn btn-primary" type="button" onClick={() => setForm({ x: null })}>+ Yeni sınav</button>
          </div>
        </div>
        <p className="aciklama">Yıl içi sınavlar. Her dersin tarihi, saati ve puanı ayrıdır. Öğrenciler sınava kendi dersliklerinde girer (bir sınav için sınıf bazında değiştirilebilir). Sınav yerleri sınav bazında, puanlar <strong>ders ders</strong> ya da &quot;Tüm puanları yayınla&quot; ile birlikte yayınlanır. Yayınlanmayan puanları hiçbir öğrenci göremez; yayınlananları öğrenci kendi hesabından görür. Sınıf ortalaması en az {d.esik} puan girilmişse gösterilir.</p>
        {form && <SinavFormu d={d} x={form.x} kapat={() => setForm(null)} kaydet={kaydet} />}
      </div>
      <Mesaj m={mesaj} />
      {!liste.length ? <div className="durum">{d.sinavlar.length ? 'Aktif sınav yok (arşivdekileri görmek için kutuyu işaretleyin).' : 'Henüz dönem sınavı tanımlanmadı. "+ Yeni sınav" ile başlayın.'}</div>
        : liste.map(x => <SinavKarti key={x.kod + JSON.stringify(x.yerler)} x={x} setVeri={setVeri} mesaj={setMesaj} duzenle={() => { setForm({ x }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />)}
    </section>
  );
}
