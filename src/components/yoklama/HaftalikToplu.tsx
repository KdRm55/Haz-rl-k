'use client';

/**
 * Hoca ekranı · aynı şube ve dersin haftadaki bütün oturumlarını (ör. 2 + 2 saat) tek tabloda açıp tek seferde kaydetme.
 * Her oturum iki sütun (1. ders, 2. ders) olarak yan yana gelir.
 */
import { useEffect, useMemo, useState } from 'react';
import { yoklamaGetirIslemi, yoklamaKaydetIslemi } from '@/app/hoca/islemler';
import type { Sonuc } from '@/lib/islem-sonucu';
import type { OturumGirdisi, YoklamaEditoru } from '@/lib/yoklama';

type Isaret = { y1: boolean; y2: boolean; iz: boolean };
type Kart = { d: YoklamaEditoru; isaret: Map<string, Isaret>; yapilmadi: boolean; degisti: boolean; sonuc?: { ok: boolean; metin: string } };

export function HaftalikToplu({ oturumlar, hoca, admin, yetkiHatasi, kapat, bitti, setKirli }: {
  oturumlar: OturumGirdisi[]; hoca: string; admin: boolean; yetkiHatasi: (r: Sonuc<unknown>) => boolean;
  kapat: () => void; bitti: () => void; setKirli: (v: boolean) => void;
}) {
  const [kartlar, setKartlar] = useState<Kart[] | string>('Dersin haftadaki oturumları okunuyor…');
  const [bekliyor, setBekliyor] = useState(false);
  const [ozet, setOzet] = useState('');

  useEffect(() => {
    let iptal = false;
    (async () => {
      const sonuclar = await Promise.all(oturumlar.map(o => yoklamaGetirIslemi(o)));
      if (iptal) return;
      if (sonuclar.some(r => yetkiHatasi(r))) return;
      const hata = sonuclar.find(r => !r.ok);
      if (hata && !hata.ok) { setKartlar(hata.hata); return; }
      setKartlar(sonuclar.map(r => {
        const d = (r as { ok: true; veri: YoklamaEditoru }).veri;
        return { d, isaret: new Map(d.ogrenciler.map(s => [s.no, { y1: s.yok1, y2: s.yok2, iz: s.izinli }])), yapilmadi: d.durum === 'Yapılmadı', degisti: false };
      }));
    })();
    return () => { iptal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Öğrenci listesi: bütün oturumlardaki öğrencilerin birleşimi (ilk oturumun sırası korunur)
  const ogrenciler = useMemo(() => {
    if (typeof kartlar === 'string') return [];
    const m = new Map<string, { no: string; adi: string; soyadi: string; sinifta: boolean }>();
    kartlar.forEach(k => k.d.ogrenciler.forEach(s => { if (!m.has(s.no)) m.set(s.no, s); }));
    return [...m.values()];
  }, [kartlar]);

  const guncelle = (i: number, f: (k: Kart) => Kart) => { setKartlar(l => (typeof l === 'string' ? l : l.map((k, j) => (j === i ? f({ ...k, degisti: true, sonuc: undefined }) : k)))); setKirli(true); };
  const degis = (i: number, no: string, alan: keyof Isaret, v: boolean) =>
    guncelle(i, k => ({ ...k, isaret: new Map(k.isaret).set(no, { ...(k.isaret.get(no) ?? { y1: false, y2: false, iz: false }), [alan]: v }) }));

  async function hepsiniKaydet() {
    if (typeof kartlar === 'string') return;
    setBekliyor(true); setOzet('');
    const yeni = [...kartlar];
    let basarili = 0, hatali = 0;
    for (let i = 0; i < yeni.length; i++) {
      const k = yeni[i];
      if (k.d.gelecek || (k.d.kayitli && !k.degisti)) continue;
      const o = k.d.oturum;
      const no = [...k.isaret.keys()];
      const r = await yoklamaKaydetIslemi({
        iso: o.iso, sinif: o.sinif, saat: o.saat, ders: o.ders, hoca: o.hoca || hoca, tur: o.tur, durum: k.yapilmadi ? 'Yapılmadı' : 'Yapıldı',
        liste: no, yok1: no.filter(n => k.isaret.get(n)!.y1), yok2: no.filter(n => k.isaret.get(n)!.y2),
        izinli: no.filter(n => k.isaret.get(n)!.iz), aciklama: k.d.aciklama, oncekiSurum: k.d.kayitli ? k.d.surum : 0
      });
      if (yetkiHatasi(r)) { setBekliyor(false); return; }
      if (r.ok) {
        basarili++;
        const g = await yoklamaGetirIslemi(o);   // güncel sürüm
        yeni[i] = g.ok ? { ...k, d: g.veri, degisti: false, sonuc: { ok: true, metin: `Kaydedildi (${r.veri.zaman}).` } } : { ...k, degisti: false, sonuc: { ok: true, metin: 'Kaydedildi.' } };
      } else { hatali++; yeni[i] = { ...k, sonuc: { ok: false, metin: r.hata } }; }
      setKartlar([...yeni]);
    }
    setBekliyor(false);
    if (!hatali) setKirli(false);
    setOzet(basarili || hatali ? `${basarili} oturum kaydedildi${hatali ? `, ${hatali} oturumda hata var (üstte işaretli)` : ''}.` : 'Kaydedilecek değişiklik yok.');
    bitti();
  }

  if (typeof kartlar === 'string') return <div className="yk-ozet" style={{ marginTop: 18 }}>{kartlar}</div>;
  const ilk = kartlar[0]?.d.oturum;
  const kaydedilecek = kartlar.filter(k => !k.d.gelecek && (!k.d.kayitli || k.degisti)).length;
  const kilit = (k: Kart) => k.yapilmadi || k.d.gelecek || bekliyor;

  return (
    <section className="yk-editor" aria-labelledby="ykTopluBaslik">
      <div className="yk-ed-bas">
        <h3 id="ykTopluBaslik">{ilk?.sinif} · {ilk?.ders}</h3>
        <div className="yk-alt">Haftadaki {kartlar.length} oturum ({kartlar.length * 2} ders saati) yan yana. Gelmeyenlerin işaretini kaldırın, tek düğmeyle hepsi kaydedilir. Girilmemiş oturumlar &quot;herkes geldi&quot; olarak işaretlidir.</div>
      </div>
      {kartlar.map((k, i) => k.sonuc && (
        <div key={k.d.anahtar} className="yk-mesaj"><div className={k.sonuc.ok ? 'ok' : 'hata'}>{k.d.oturum.gun} {k.d.oturum.tarih} {k.d.oturum.saat}: {k.sonuc.metin}</div></div>
      ))}
      <div className="yk-tablo-kap">
        <table className="yk-tablo">
          <thead>
            <tr><th rowSpan={2}>No</th><th rowSpan={2}>Adı Soyadı</th>
              {kartlar.map(k => <th key={k.d.anahtar} colSpan={admin ? 3 : 2} className="c">{k.d.oturum.gun} {k.d.oturum.tarih}<br /><small>{k.d.oturum.saat}{k.d.kayitli ? ' · kayıtlı' : ''}{k.d.gelecek ? ' · ileri tarih' : ''}</small></th>)}</tr>
            <tr>{kartlar.map((k, i) => (
              <ThDers key={k.d.anahtar} k={k} admin={admin} kilit={bekliyor} yapilmadiDegis={v => guncelle(i, x => ({ ...x, yapilmadi: v }))}
                herkesGeldi={() => guncelle(i, x => ({ ...x, isaret: new Map([...x.isaret].map(([n, v]) => [n, { ...v, y1: false, y2: false }])) }))} />
            ))}</tr>
          </thead>
          <tbody>{ogrenciler.map(b => {
            const adi = (b.adi + ' ' + b.soyadi).trim() || '(adı bulunamadı)';
            const eksik = kartlar.some(k => { const v = k.isaret.get(b.no); return v && (v.y1 || v.y2); });
            return (
              <tr key={b.no} className={eksik ? 'yok' : ''}>
                <td className="no">{b.no}</td><td>{adi}</td>
                {kartlar.map((k, i) => {
                  const v = k.isaret.get(b.no);
                  if (!v) return <td key={k.d.anahtar} colSpan={admin ? 3 : 2} className="c">—</td>;
                  return (
                    <FragmentHucre key={k.d.anahtar}>
                      {(['y1', 'y2'] as const).map((f, n) => (
                        <td key={f} className="c"><label className="yk-onay"><input type="checkbox" checked={!v[f]} disabled={kilit(k)}
                          aria-label={`${adi} ${k.d.oturum.tarih} ${n + 1}. ders`} onChange={e => degis(i, b.no, f, !e.target.checked)} /><span>{v[f] ? 'Yok' : 'Geldi'}</span></label></td>
                      ))}
                      {admin && <td className="c"><label className="yk-onay izin"><input type="checkbox" checked={v.iz} disabled={kilit(k)}
                        aria-label={adi + ' izinli'} onChange={e => degis(i, b.no, 'iz', e.target.checked)} /><span>{v.iz ? 'İzinli' : '—'}</span></label></td>}
                    </FragmentHucre>
                  );
                })}
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <div className="yk-mesaj" role="status" aria-live="polite">{ozet && <div className="ok">{ozet}</div>}</div>
      <div className="yk-cubuk">
        <span className="yk-sayac">{kartlar.length} oturumdan {kaydedilecek} tanesi kaydedilecek</span>
        <span className="yk-dug">
          <button type="button" className="btn btn-secondary" onClick={() => { if (kartlar.some(k => k.degisti) && !confirm('Kaydedilmemiş değişiklikler silinecek. Kapatılsın mı?')) return; setKirli(false); kapat(); }} disabled={bekliyor}>Kapat</button>
          <button type="button" className="btn btn-primary" disabled={bekliyor || !kaydedilecek} onClick={hepsiniKaydet}>{bekliyor ? 'Kaydediliyor…' : `${kaydedilecek} oturumu kaydet`}</button>
        </span>
      </div>
    </section>
  );
}

/** Tablo satırında bir oturumun hücrelerini (<td>) gruplamak için. */
function FragmentHucre({ children }: { children: React.ReactNode }) { return <>{children}</>; }

/** Alt başlık: oturumun "ders yapılmadı" ve "herkes geldi" denetimleri. */
function ThDers({ k, admin, kilit, yapilmadiDegis, herkesGeldi }: { k: Kart; admin: boolean; kilit: boolean; yapilmadiDegis: (v: boolean) => void; herkesGeldi: () => void }) {
  return (
    <th colSpan={admin ? 3 : 2} className="c">
      <label style={{ fontWeight: 400 }}><input type="checkbox" checked={k.yapilmadi} disabled={k.d.gelecek || kilit} onChange={e => yapilmadiDegis(e.target.checked)} /> Ders yapılmadı</label>{' '}
      <button type="button" className="btn btn-secondary" disabled={k.yapilmadi || k.d.gelecek || kilit} onClick={herkesGeldi}>Herkes geldi</button>
    </th>
  );
}
