'use client';

import { useEffect, useState } from 'react';
import { donemSonuclariIslemi } from '@/app/ogrenci-islemleri';
import type { DonemSinaviBilgisi, DonemSonucu, SinavBilgisi, SinavYeriBilgisi } from '@/lib/tipler';
import { type Bulunan, type SinavOgesi } from './sinav-listesi';
export { sinavListesi } from './sinav-listesi';

const puanYaz = (v: number | string | null) => (typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''));

/** Muafiyet sınavı kartı (Index.html sinavHtml karşılığı). */
export function MuafiyetKarti({ sv, tur }: { sv: SinavBilgisi; tur: Bulunan['tur'] }) {
  if (sv.sonuc && sv.sonuc !== 'Bekliyor') {
    return (
      <div className="sinav">
        <div className="sinav-baslik">Muafiyet sınavı sonucu</div>
        {sv.yazili && <div className="sinav-satir"><span>Yazılı</span><span>{sv.yazili}</span></div>}
        {sv.sozlu && <div className="sinav-satir"><span>Sözlü</span><span>{sv.sozlu}</span></div>}
        {sv.ortalama != null && <div className="sinav-satir"><span>Ortalama</span><span>{puanYaz(sv.ortalama)}</span></div>}
        <div className="sinav-satir"><span>Sonuç</span><span>{sv.sonuc === 'Muaf' ? 'Muaf' : 'Hazırlığa devam'}</span></div>
      </div>
    );
  }
  if (sv.yer && tur !== 'sinif') return <div className="sinav"><div className="sinav-baslik">Muafiyet sınavı</div><div className="sinav-yer">{sv.yer}</div></div>;
  if (sv.sonuc === 'Bekliyor') return <div className="sinav"><div className="sinav-baslik">Muafiyet sınavı</div><div className="sinav-yer">Sonucun henüz belli değil. Puanlar girildikçe burada görünecek.</div></div>;
  return null;
}
function YerKutulari({ y }: { y: SinavYeriBilgisi }) {
  return (
    <>
      <div className={'sy-bilgi' + (y.gecti ? ' gecti' : '')}>
        <div className="sy-kutu"><span>Salon</span><b>{y.salon}</b></div>
        {y.sira && <div className="sy-kutu"><span>Sıra no</span><b>{y.sira}</b></div>}
      </div>
      <div className="sy-meta">{[y.tarih, y.saat].filter(Boolean).join(' · ')}{y.yer ? ' · ' + y.yer : ''}{y.gecti ? ' · Tamamlandı' : ''}</div>
      {y.aciklama && <div className="sy-not">{y.aciklama}</div>}
    </>
  );
}

/** Dönem sınavı puanları: öğrenci kendi hesabıyla girdiği için doğrudan yüklenir (bu sorgudaki bütün sınavlar için bir kez). */
function DonemPuanlari({ s, sonuclar, setSonuclar }: { s: DonemSinaviBilgisi; sonuclar: Extract<DonemSonucu, { ok: true }> | null; setSonuclar: (x: Extract<DonemSonucu, { ok: true }>) => void }) {
  const [mesaj, setMesaj] = useState('');
  useEffect(() => {
    if (!s.sonucVar || sonuclar) return;
    let iptal = false;
    donemSonuclariIslemi().then(r => { if (iptal) return; if (r.ok) setSonuclar(r); else setMesaj(r.mesaj); });
    return () => { iptal = true; };
  }, [s.sonucVar, sonuclar, setSonuclar]);
  if (!s.sonucVar) return <div className="bl-bos">Bu sınavın sonuçları henüz açıklanmadı.</div>;
  if (!sonuclar) return <div className="bl-bos" role="status">{mesaj || 'Puanların yükleniyor…'}</div>;
  const r = sonuclar.sinavlar.find(x => x.kod === s.kod);
  if (!r?.dersler.length) return <div className="bl-bos">Bu sınavda sana ait açıklanmış puan yok.</div>;
  return (
    <>
      <table className="ds-tablo">
        <thead><tr><th>Ders</th><th>Puanın</th><th>Sınıf ort.</th></tr></thead>
        <tbody>{r.dersler.map(x => (
          <tr key={x.ders}><td>{x.ders}</td><td className={'ds-puan' + (typeof x.puan === 'number' ? '' : ' yok')}>{puanYaz(x.puan)}</td>
            <td>{x.sinifOrt == null ? <span className="ds-yok">—</span> : puanYaz(x.sinifOrt)}</td></tr>
        ))}</tbody>
      </table>
      <div className="ds-not">Sınıf ortalaması, o derste en az {sonuclar.esik} öğrencinin puanı girildiğinde gösterilir. Henüz açıklanmayan dersler listede yer almaz.</div>
    </>
  );
}

function SinavDetayi({ s, r, geri }: { s: SinavOgesi; r: Bulunan; geri: () => void }) {
  const [sonuclar, setSonuclar] = useState<Extract<DonemSonucu, { ok: true }> | null>(null);
  return (
    <>
      <button type="button" className="bl-geri" onClick={geri}>‹ Sınavlarım</button>
      <div className="bl-baslik">{s.ad}</div>
      {s.tip === 'muafiyet' ? <MuafiyetKarti sv={s.sv} tur={r.tur} /> : (
        <>
          <div className="sn-bolum">
            <div className="sn-bolum-baslik">Sınav giriş yeri</div>
            {s.yer && <YerKutulari y={s.yer} />}
            {s.tip === 'donem' && (
              <>
                <div className="ds-kutu" style={{ marginTop: s.yer ? 12 : 0 }}>{s.s.dersler.map(x => (
                  <div key={x.ders} className={'ds-satir' + (x.gecti ? ' gecti' : '')}>
                    <span className="ds-ders">{x.ders}</span>
                    <span className="ds-zaman">{[x.tarih, x.saat].filter(Boolean).join(' · ')}</span>
                    <span className="ds-yer">{x.gecti ? 'Tamamlandı' : s.s.yerYayinda ? (s.yer ? '' : x.yer || '-') : 'Açıklanmadı'}</span>
                  </div>
                ))}</div>
                {!s.s.yerYayinda && !s.yer && <p className="bl-ipucu">Sınav yeri henüz açıklanmadı.</p>}
              </>
            )}
          </div>
          {s.tip === 'donem' && <div className="sn-bolum"><div className="sn-bolum-baslik">Puanlarım</div><DonemPuanlari s={s.s} sonuclar={sonuclar} setSonuclar={setSonuclar} /></div>}
          {s.tip === 'yer' && s.sv && <div className="sn-bolum"><div className="sn-bolum-baslik">Puanlarım</div>{MuafiyetKarti({ sv: s.sv, tur: 'sinif' }) ?? <div className="bl-bos">Sonucun henüz açıklanmadı.</div>}</div>}
        </>
      )}
    </>
  );
}

export function Sinavlarim({ r, liste }: { r: Bulunan; liste: SinavOgesi[] }) {
  const [detay, setDetay] = useState<number | null>(null);
  if (detay != null && liste[detay]) return <SinavDetayi s={liste[detay]} r={r} geri={() => setDetay(null)} />;
  if (!liste.length) return <><div className="bl-baslik">Sınavlarım</div><div className="bl-bos">Henüz açıklanmış bir sınavın yok.</div></>;
  return (
    <>
      <div className="bl-baslik">Sınavlarım</div>
      <p className="bl-ipucu">Ayrıntıları görmek için sınava dokun.</p>
      <div className="sn-liste">{liste.map((s, i) => {
        const cip: React.ReactNode[] = [];
        let tarih = '';
        const yerCip = (y: SinavYeriBilgisi) => <span key="yer" className="sn-cip yer">{y.salon}{y.sira ? ' · Sıra ' + y.sira : ''}</span>;
        const sonucCip = <span key="sonuc" className="sn-cip sonuc">Sonuç açıklandı</span>;
        if (s.tip === 'donem') {
          const ilk = s.s.dersler[0];
          tarih = s.s.dersler.length > 1 ? `${s.s.dersler.length} ders · ${ilk?.tarih ?? ''}` : [ilk?.tarih, ilk?.saat].filter(Boolean).join(' · ');
          if (s.yer) cip.push(yerCip(s.yer));
          if (s.s.sonucVar) cip.push(sonucCip);
        } else if (s.tip === 'yer') {
          tarih = [s.yer.tarih, s.yer.saat].filter(Boolean).join(' · ');
          cip.push(yerCip(s.yer));
          if (s.sv?.sonuc && s.sv.sonuc !== 'Bekliyor') cip.push(sonucCip);
        } else if (s.sv.sonuc && s.sv.sonuc !== 'Bekliyor') cip.push(sonucCip);
        else tarih = 'Sınav bilgisi';
        if (s.gecti && s.tip !== 'muafiyet') cip.push(<span key="tamam" className="sn-cip">Tamamlandı</span>);
        return (
          <button key={i} type="button" className={'sn-kart' + (s.gecti ? ' gecti' : '')} onClick={() => setDetay(i)}>
            <div className="sn-sol"><div className="sn-ad">{s.ad}</div>{tarih && <div className="sn-tarih">{tarih}</div>}{cip.length > 0 && <div className="sn-cipler">{cip}</div>}</div>
            <span className="sn-ok" aria-hidden="true">›</span>
          </button>
        );
      })}</div>
    </>
  );
}
