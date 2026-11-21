'use client';

/** Hoca ekranı · haftanın bütün derslerinin yoklamasını tek ekranda girip tek seferde kaydetme. */
import { useEffect, useState } from 'react';
import { yoklamaGetirIslemi, yoklamaKaydetIslemi } from '@/app/hoca/islemler';
import type { Sonuc } from '@/lib/islem-sonucu';
import type { OturumGirdisi, YoklamaEditoru } from '@/lib/yoklama';

type Satir = { no: string; y1: boolean; y2: boolean; iz: boolean };
type Kart = { d: YoklamaEditoru; satirlar: Satir[]; yapilmadi: boolean; dahil: boolean; sonuc?: { ok: boolean; metin: string } };

export function HaftalikToplu({ oturumlar, hoca, admin, yetkiHatasi, kapat, bitti }: {
  oturumlar: OturumGirdisi[]; hoca: string; admin: boolean; yetkiHatasi: (r: Sonuc<unknown>) => boolean;
  kapat: () => void; bitti: () => void;
}) {
  const [kartlar, setKartlar] = useState<Kart[] | string>('Haftanın dersleri okunuyor…');
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
        return { d, satirlar: d.ogrenciler.map(s => ({ no: s.no, y1: s.yok1, y2: s.yok2, iz: s.izinli })), yapilmadi: d.durum === 'Yapılmadı', dahil: !d.kayitli };
      }));
    })();
    return () => { iptal = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guncelle = (i: number, f: (k: Kart) => Kart) => setKartlar(l => (typeof l === 'string' ? l : l.map((k, j) => (j === i ? f({ ...k, sonuc: undefined }) : k))));
  const degis = (i: number, no: string, alan: 'y1' | 'y2' | 'iz', v: boolean) =>
    guncelle(i, k => ({ ...k, dahil: true, satirlar: k.satirlar.map(s => (s.no === no ? { ...s, [alan]: v } : s)) }));

  async function hepsiniKaydet() {
    if (typeof kartlar === 'string') return;
    setBekliyor(true); setOzet('');
    const yeni = [...kartlar];
    let basarili = 0, hatali = 0;
    for (let i = 0; i < yeni.length; i++) {
      const k = yeni[i];
      if (!k.dahil || k.d.gelecek) continue;
      const o = k.d.oturum;
      const r = await yoklamaKaydetIslemi({
        iso: o.iso, sinif: o.sinif, saat: o.saat, ders: o.ders, hoca: o.hoca || hoca, tur: o.tur, durum: k.yapilmadi ? 'Yapılmadı' : 'Yapıldı',
        liste: k.satirlar.map(s => s.no), yok1: k.satirlar.filter(s => s.y1).map(s => s.no), yok2: k.satirlar.filter(s => s.y2).map(s => s.no),
        izinli: k.satirlar.filter(s => s.iz).map(s => s.no), aciklama: k.d.aciklama, oncekiSurum: k.d.kayitli ? k.d.surum : 0
      });
      if (yetkiHatasi(r)) { setBekliyor(false); return; }
      if (r.ok) {
        basarili++;
        // Aynı oturum tekrar kaydedilirse sürüm uyuşsun diye güncel hâl okunur
        const g = await yoklamaGetirIslemi(o);
        yeni[i] = g.ok ? { ...k, d: g.veri, dahil: false, sonuc: { ok: true, metin: `Kaydedildi (${r.veri.zaman}).` } } : { ...k, dahil: false, sonuc: { ok: true, metin: 'Kaydedildi.' } };
      } else { hatali++; yeni[i] = { ...k, sonuc: { ok: false, metin: r.hata } }; }
      setKartlar([...yeni]);
    }
    setBekliyor(false);
    setOzet(basarili || hatali ? `${basarili} ders kaydedildi${hatali ? `, ${hatali} derste hata var (aşağıda işaretli)` : ''}.` : 'Kaydedilecek ders seçilmedi.');
    bitti();
  }

  if (typeof kartlar === 'string') return <div className="yk-ozet" style={{ marginTop: 18 }}>{kartlar}</div>;
  const secili = kartlar.filter(k => k.dahil && !k.d.gelecek).length;

  return (
    <section className="yk-editor" aria-labelledby="ykTopluBaslik">
      <div className="yk-ed-bas">
        <h3 id="ykTopluBaslik">Haftalık toplu yoklama</h3>
        <div className="yk-alt">Gelmeyenlerin işaretini kaldırın. İşaretli dersler (kutucuk) aşağıdaki düğmeyle tek seferde kaydedilir. Henüz girilmemiş dersler &quot;herkes geldi&quot; olarak işaretlidir.</div>
      </div>
      {kartlar.map((k, i) => {
        const o = k.d.oturum;
        return (
          <details key={k.d.anahtar} open={!k.d.kayitli && !k.d.gelecek} style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              {o.gun} {o.tarih} · {o.saat} · {o.sinif} · {o.ders}{k.d.kayitli ? ' · (kayıtlı)' : ''}{k.d.gelecek ? ' · (ileri tarih)' : ''}
            </summary>
            <div className="yk-ed-durum">
              <label><input type="checkbox" checked={k.dahil && !k.d.gelecek} disabled={k.d.gelecek || bekliyor} onChange={e => guncelle(i, x => ({ ...x, dahil: e.target.checked }))} /> Bu dersi kaydet</label>
              <label><input type="checkbox" checked={k.yapilmadi} disabled={k.d.gelecek || bekliyor} onChange={e => guncelle(i, x => ({ ...x, dahil: true, yapilmadi: e.target.checked }))} /> Ders yapılmadı</label>
              <button type="button" className="btn btn-secondary" disabled={k.yapilmadi || k.d.gelecek || bekliyor}
                onClick={() => guncelle(i, x => ({ ...x, dahil: true, satirlar: x.satirlar.map(s => ({ ...s, y1: false, y2: false })) }))}>Herkes geldi</button>
            </div>
            {k.sonuc && <div className="yk-mesaj"><div className={k.sonuc.ok ? 'ok' : 'hata'}>{k.sonuc.metin}</div></div>}
            <div className="yk-tablo-kap" style={{ opacity: k.yapilmadi || k.d.gelecek ? 0.5 : undefined }}>
              <table className="yk-tablo">
                <thead><tr><th>No</th><th>Adı Soyadı</th><th className="c">1. ders</th><th className="c">2. ders</th>{admin && <th className="c">İzinli</th>}</tr></thead>
                <tbody>{k.satirlar.map(s => {
                  const b = k.d.ogrenciler.find(x => x.no === s.no)!, adi = (b.adi + ' ' + b.soyadi).trim() || '(adı bulunamadı)';
                  return (
                    <tr key={s.no} className={s.y1 || s.y2 ? (admin && s.iz ? 'izinli' : 'yok') : ''}>
                      <td className="no">{s.no}</td><td>{adi}</td>
                      {(['y1', 'y2'] as const).map((f, n) => (
                        <td key={f} className="c"><label className="yk-onay"><input type="checkbox" checked={!s[f]} disabled={k.yapilmadi || k.d.gelecek || bekliyor}
                          aria-label={`${adi} ${n + 1}. ders`} onChange={e => degis(i, s.no, f, !e.target.checked)} /><span>{s[f] ? 'Yok' : 'Geldi'}</span></label></td>
                      ))}
                      {admin && <td className="c"><label className="yk-onay izin"><input type="checkbox" checked={s.iz} disabled={k.yapilmadi || k.d.gelecek || bekliyor}
                        aria-label={adi + ' izinli'} onChange={e => degis(i, s.no, 'iz', e.target.checked)} /><span>{s.iz ? 'İzinli' : '—'}</span></label></td>}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </details>
        );
      })}
      <div className="yk-mesaj" role="status" aria-live="polite">{ozet && <div className="ok">{ozet}</div>}</div>
      <div className="yk-cubuk">
        <span className="yk-sayac">{kartlar.length} dersten {secili} tanesi kaydedilecek</span>
        <span className="yk-dug">
          <button type="button" className="btn btn-secondary" onClick={kapat} disabled={bekliyor}>Kapat</button>
          <button type="button" className="btn btn-primary" disabled={bekliyor || !secili} onClick={hepsiniKaydet}>{bekliyor ? 'Kaydediliyor…' : `Seçili ${secili} dersi kaydet`}</button>
        </span>
      </div>
    </section>
  );
}
