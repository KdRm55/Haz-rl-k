'use client';

import { useMemo, useRef, useState } from 'react';
import { sinifDegisimVerisiIslemi, sinifDegistirIslemi } from '@/app/yonetim/islemler';
import type { DegisimDurumu } from '@/lib/siniflandirma';
import { Mesaj, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

type Kuyruk = { no: string; ad: string; eski: string; yeni: string };
const trNorm = (s: string) => String(s || '').toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G')
  .replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/Ç/g, 'C').replace(/\s+/g, ' ').trim();
const bos = (v: string) => (v === '(sınıfsız)' ? '' : v);

export function SinifDegisimSekmesi({ degisti }: { degisti: () => void }) {
  const cagir = useCagir();
  const { veri: d, setVeri, hata } = useVeri(sinifDegisimVerisiIslemi);
  const [ara, setAra] = useState('');
  const [secili, setSecili] = useState<string | null>(null);
  const [kuyruk, setKuyruk] = useState<Kuyruk[]>([]);
  const [neden, setNeden] = useState('');
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [bekliyor, setBekliyor] = useState(false);
  const araRef = useRef<HTMLInputElement>(null);

  const ogr = useMemo(() => new Map((d?.ogrenciler ?? []).map(o => [o.no, { ...o, aranan: trNorm(o.no + ' ' + o.ad) }])), [d]);
  const kuyrukta = (no: string) => kuyruk.find(k => k.no === no);
  const sayim = useMemo(() => {
    const s = new Map((d?.siniflar ?? []).map(x => [x.ad, { once: x.n, sonra: x.n, tur: x.tur }]));
    kuyruk.forEach(k => { if (k.eski && s.has(k.eski)) s.get(k.eski)!.sonra--; if (k.yeni && s.has(k.yeni)) s.get(k.yeni)!.sonra++; });
    return s;
  }, [d, kuyruk]);

  const q = trNorm(ara);
  const bulunan = q.length >= 2 ? [...ogr.values()].filter(o => q.split(' ').every(p => o.aranan.includes(p))).slice(0, 8) : [];
  const o = secili ? ogr.get(secili) : undefined;

  function sec(sinif: string | null) {
    if (!o) return;
    setKuyruk(l => [...l.filter(x => x.no !== o.no), ...(sinif === null ? [] : [{ no: o.no, ad: o.ad, eski: o.sinif, yeni: sinif }])]);
    setSecili(null); setAra(''); araRef.current?.focus();
  }

  async function uygula(liste: Kuyruk[], n: string) {
    setBekliyor(true); setMesaj(null);
    const r = await cagir(sinifDegistirIslemi({ degisiklikler: liste.map(({ no, eski, yeni }) => ({ no, eski, yeni })), neden: n }));
    setBekliyor(false);
    if (!r.ok) { setMesaj({ metin: <span style={{ whiteSpace: 'pre-line' }}>{r.hata}</span>, hata: true }); return; }
    setVeri(r.veri.durum as DegisimDurumu); setKuyruk([]); setNeden(''); degisti();
    setMesaj({ metin: `${r.veri.uygulanan} sınıf değişikliği uygulandı. Öğrenci sorgulama ve imza sirküleri güncel. Değiştirilen öğrenciler taslakta da sabitlendi; "Yeniden dağıt" yerlerini bozmaz.` });
  }

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!d) return <Yukleniyor />;

  const dengeUyari = (['K', 'E', 'Karma'] as const).flatMap(t => {
    const g = [...sayim.entries()].filter(([, x]) => x.tur === t);
    if (g.length < 2) return [];
    const v = g.map(([, x]) => x.sonra), fark = Math.max(...v) - Math.min(...v);
    return fark > 1 ? [`${t === 'K' ? 'Kız' : t === 'E' ? 'Erkek' : 'Karma'} sınıfları arasında mevcut farkı ${fark} olacak (${g.map(([ad, x]) => ad.replace('Hazırlık ', '') + ' ' + x.sonra).join(', ')}). Dengelemek için ters yönde bir değişiklik eklemeyi düşünün.`] : [];
  });
  // Bir öğrencinin yalnızca son değişikliği, sınıfı hâlâ o değişiklikteki yerdeyse geri alınabilir
  const geriAlinir = (x: DegisimDurumu['gecmis'][number], i: number) => {
    const s = ogr.get(x.no);
    return !!s && s.sinif === bos(x.yeni) && !d.gecmis.slice(0, i).some(y => y.no === x.no);
  };

  return (
    <section>
      {!d.siniflar.length && <div className="hata-kutu">Yayında sınıf listesi yok. Önce &quot;Sınıf oluşturma&quot; sekmesinden listeleri yayınlayın.</div>}
      <div className="adim">
        <div className="bolum-baslik">Öğrenci bul</div>
        <input ref={araRef} type="search" className="ara-kutu" placeholder="Öğrenci numarası ya da adından birkaç harf yazın" autoComplete="off" aria-label="Öğrenci ara"
          value={ara} onChange={e => setAra(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && bulunan[0]) setSecili(bulunan[0].no); }} />
        <div className="ara-sonuclar">
          {q && q.length < 2 && <div className="hint" style={{ textAlign: 'left' }}>En az 2 karakter yazın.</div>}
          {q.length >= 2 && !bulunan.length && <div className="hint" style={{ textAlign: 'left' }}>Eşleşen öğrenci yok. (Muaf öğrenciler ve kaydı silinenler burada görünmez.)</div>}
          {bulunan.map(x => {
            const k = kuyrukta(x.no);
            return (
              <button key={x.no} type="button" className="ara-satir" onClick={() => setSecili(x.no)}>
                <span className="no">{x.no}</span><span className="ad">{x.ad}</span>
                <span className="hint">{x.cinsiyet === 'K' ? 'Kız' : x.cinsiyet === 'E' ? 'Erkek' : ''}</span>
                <span className={'rozet-sinif' + (x.sinif ? '' : ' yok')}>{x.sinif || 'Sınıfsız'}</span>
                {k && <span className="rozet-sinif kuyrukta">→ {k.yeni || 'Sınıfsız'}</span>}
              </button>
            );
          })}
        </div>
        {o && (() => {
          const k = kuyrukta(o.no);
          return (
            <div className="secili">
              <div className="secili-ust"><strong>{o.ad}</strong> ({o.no}{o.cinsiyet ? ', ' + (o.cinsiyet === 'K' ? 'kız' : 'erkek') : ''}) — şu an <strong>{o.sinif || 'sınıfsız'}</strong>
                {k && <><br /><span style={{ color: 'var(--warn)' }}>Listede: {o.sinif || 'sınıfsız'} → {k.yeni || 'sınıfsız'}. Başka bir sınıf seçerseniz güncellenir.</span></>}</div>
              <div className="sinif-dugmeler">
                {d.siniflar.map(s => {
                  const uygun = s.tur === 'Karma' || !o.cinsiyet || s.tur === o.cinsiyet, ayni = s.ad === o.sinif, x = sayim.get(s.ad)!;
                  return (
                    <button key={s.ad} type="button" className="sinif-dugme" disabled={!uygun || ayni} title={ayni ? 'Şu anki sınıfı' : !uygun ? 'Cinsiyete uygun değil' : ''} onClick={() => sec(s.ad)}>
                      {s.ad}<span className="say">{ayni ? 'şu anki sınıfı' : !uygun ? (s.tur === 'K' ? 'kız sınıfı' : 'erkek sınıfı') : `${x.sonra} → ${x.sonra + (k?.yeni === s.ad ? 0 : 1)} öğrenci`}</span>
                    </button>
                  );
                })}
                {o.sinif && <button type="button" className="sinif-dugme cikar" onClick={() => sec('')}>Sınıftan çıkar<span className="say">listelerde görünmez</span></button>}
                {k && <button type="button" className="sinif-dugme" onClick={() => sec(null)}>Listeden kaldır<span className="say">değişiklik yapma</span></button>}
              </div>
            </div>
          );
        })()}
      </div>

      {kuyruk.length > 0 && (
        <div className="adim">
          <div className="bolum-baslik">Uygulanacak değişiklikler</div>
          <div className="table-card"><div className="scroller"><table>
            <thead><tr><th>Öğrenci No</th><th>Adı Soyadı</th><th>Şu anki sınıf</th><th>Yeni sınıf</th><th></th></tr></thead>
            <tbody>{kuyruk.map(k => (
              <tr key={k.no}><td className="no">{k.no}</td><td>{k.ad}</td><td>{k.eski || 'Sınıfsız'}</td><td><strong>{k.yeni || 'Sınıftan çıkar'}</strong></td>
                <td><button type="button" className="btn btn-secondary btn-kucuk" onClick={() => setKuyruk(l => l.filter(x => x.no !== k.no))}>Kaldır</button></td></tr>
            ))}</tbody>
          </table></div></div>
          <div className="mevcut">
            <div style={{ width: '100%', fontWeight: 600, color: '#334155' }}>Uygulandıktan sonra sınıf mevcutları:</div>
            {[...sayim.entries()].map(([ad, x]) => <span key={ad} className={x.once !== x.sonra ? 'degisti' : ''}>{ad}: {x.once !== x.sonra ? `${x.once} → ${x.sonra}` : x.sonra}</span>)}
            {dengeUyari.length > 0 && <div className="aciklama uyari-metin" style={{ width: '100%', margin: '6px 0 0' }}>{dengeUyari.map((u, i) => <div key={i}>{u}</div>)}</div>}
          </div>
          <label className="alan" style={{ maxWidth: 520, margin: '12px 0' }}>Değişiklik nedeni (isteğe bağlı, kayda geçer)
            <input type="text" maxLength={200} placeholder="Örn. veli isteği, seviye uyumsuzluğu" value={neden} onChange={e => setNeden(e.target.value)} />
          </label>
          <div className="actions" style={{ marginBottom: 0 }}>
            <button className="btn btn-primary" type="button" disabled={bekliyor} onClick={() => {
              if (confirm('Aşağıdaki değişiklikler hemen uygulanacak; öğrenciler ve hocalar yeni sınıfları görecek:\n\n' + kuyruk.map(k => `${k.ad}: ${k.eski || 'sınıfsız'} → ${k.yeni || 'sınıftan çıkar'}`).join('\n') + '\n\nDevam edilsin mi?')) uygula(kuyruk, neden);
            }}>{bekliyor ? 'Uygulanıyor…' : `${kuyruk.length} değişikliği uygula`}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setKuyruk([])}>Listeyi temizle</button>
          </div>
        </div>
      )}

      <Mesaj m={mesaj} />
      <div className="bolum-baslik">Son sınıf değişiklikleri</div>
      {!d.gecmis.length ? <div className="durum">Henüz sınıf değişikliği yapılmadı.</div> : (
        <div className="table-card"><div className="scroller"><table>
          <thead><tr><th>Tarih</th><th>Öğrenci No</th><th>Adı Soyadı</th><th>Eski</th><th>Yeni</th><th>Neden</th><th></th></tr></thead>
          <tbody>{d.gecmis.map((x, i) => (
            <tr key={x.id}><td>{x.tarih}</td><td className="no">{x.no}</td><td>{x.ad}</td><td>{x.eski}</td><td>{x.yeni}</td><td className="wrap-cell">{x.neden}</td>
              <td>{geriAlinir(x, i) && <button type="button" className="btn btn-secondary btn-kucuk" disabled={bekliyor} onClick={() => {
                if (confirm(`${x.ad} ${bos(x.yeni) || 'sınıfsız'} → ${bos(x.eski) || 'sınıfsız'} olarak geri alınsın mı?`)) uygula([{ no: x.no, ad: x.ad, eski: bos(x.yeni), yeni: bos(x.eski) }], 'Geri alma');
              }}>Geri al</button>}</td></tr>
          ))}</tbody>
        </table></div></div>
      )}
    </section>
  );
}
