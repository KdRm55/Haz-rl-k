'use client';

import { useState } from 'react';
import type { DevamsizlikOzeti } from '@/lib/tipler';

const ET = { geldi: 'Geldin', yapilmadi: 'Ders yapılmadı', izinli: 'İzinli' };
const AGIRLIK: Record<string, number> = { asti: 0, yakin: 1 };
const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const GUN = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

type Kayit = DevamsizlikOzeti['dersler'][number]['kayitlar'][number];
const tarihi = (iso: string) => new Date(iso + 'T00:00:00Z');
const pazartesi = (iso: string) => { const d = tarihi(iso); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };

/** Bir dersin iki saati için kare durumu: G geldi, Y yok, I izinli, X ders yapılmadı. Eski önbellekte y1/y2 yoksa saat sayısından. */
function kareler(k: Kayit): [string, string] {
  if (k.durum === 'yapilmadi') return ['X', 'X'];
  const y1 = k.y1 ?? k.yokSaat >= 1, y2 = k.y2 ?? k.yokSaat >= 2;
  const yok = k.durum === 'izinli' ? 'I' : 'Y';
  return [y1 ? yok : 'G', y2 ? yok : 'G'];
}

/** Yoklaması girilen dersler haftalara göre: her ders günü üst üste iki kare (1. ve 2. ders). Haftaya dokununca ayrıntı açılır. */
function HaftaIzgarasi({ kayitlar, ders }: { kayitlar: Kayit[]; ders: string }) {
  const [secili, setSecili] = useState<string | null>(null);
  const haftalar = new Map<string, Kayit[]>();
  [...kayitlar].sort((a, b) => a.iso.localeCompare(b.iso) || a.saat.localeCompare(b.saat, 'tr'))
    .forEach(k => { const h = pazartesi(k.iso); haftalar.set(h, [...(haftalar.get(h) ?? []), k]); });
  const acik = secili ? haftalar.get(secili) : null;
  return (
    <>
      <div className="dv-haftalar" role="group" aria-label={ders + ' yoklamaları, haftalara göre'}>
        {[...haftalar].map(([h, l]) => {
          const d = tarihi(h), yok = l.reduce((t, k) => t + (k.durum === 'yok' ? k.yokSaat : 0), 0);
          return (
            <button key={h} type="button" className={'dv-hafta' + (secili === h ? ' secili' : '')} aria-pressed={secili === h}
              aria-label={`${d.getUTCDate()} ${AY[d.getUTCMonth()]} haftası: ${l.length} ders, ${yok ? yok + ' saat yok' : 'devamsızlık yok'}`}
              onClick={() => setSecili(secili === h ? null : h)}>
              <span className="dv-gunler">{l.map((k, i) => { const [a, b] = kareler(k); return <span key={i} className="dv-gun"><i className={'k-' + a} /><i className={'k-' + b} /></span>; })}</span>
              <small>{d.getUTCDate()} {AY[d.getUTCMonth()]}</small>
            </button>
          );
        })}
      </div>
      {acik && (
        <ul className="dv-liste">{acik.map((k, i) => (
          <li key={i}><span>{GUN[(tarihi(k.iso).getUTCDay() + 6) % 7]} {k.tarih.slice(0, 5)} · {k.saat}{k.tur === 'Telafi' ? ' · Telafi' : ''}</span>
            {k.durum === 'yok' ? <span className="d-yok">{k.yokSaat === 2 ? 'İki saat de yok' : (k.y2 && !k.y1 ? '2.' : '1.') + ' ders yok'}</span>
              : k.durum === 'izinli' ? <span className="d-izin">{ET.izinli}</span> : k.durum === 'yapilmadi' ? <span className="d-yap">{ET.yapilmadi}</span> : <span className="d-geldi">{ET.geldi}</span>}</li>
        ))}</ul>
      )}
    </>
  );
}

/** "Devamsızlığım": ders ders devamsızlık saati, sınır ve yoklaması girilen derslerin haftalık görünümü. */
export function Devamsizlik({ d }: { d: DevamsizlikOzeti | null | undefined }) {
  if (!d?.dersler.length) return <><div className="bl-baslik">Devamsızlığım</div><div className="bl-bos">Henüz yoklaması girilen bir dersin yok. Yoklamalar girildikçe burada göreceksin.</div></>;
  // sınırı aşan ve yaklaşan dersler önce
  const dersler = d.dersler.slice().sort((a, b) => (AGIRLIK[a.durum] ?? 2) - (AGIRLIK[b.durum] ?? 2) || a.ders.localeCompare(b.ders, 'tr'));
  const toplam = d.dersler.reduce((t, x) => t + x.yokSaat, 0);
  const asan = d.dersler.filter(x => x.durum === 'asti').length, yakin = d.dersler.filter(x => x.durum === 'yakin').length;
  const ozetDurum = asan ? 'asti' : yakin ? 'yakin' : '';
  return (
    <>
      <div className="bl-baslik">Devamsızlığım</div>
      <div className={'dv-ozet' + (ozetDurum ? ' ' + ozetDurum : '')}>
        <div className="dv-halka"><b>{toplam}</b><span>saat</span></div>
        <div><div className="dv-ozet-baslik">Toplam {toplam} saat devamsızlık</div>
          <div className="dv-ozet-alt">{asan ? `${asan} derste sınırı aştın` : yakin ? `${yakin} derste sınıra yaklaştın` : toplam ? 'Bütün derslerde sınırın altındasın' : 'Tam katılım, böyle devam'}</div></div>
      </div>
      <div className="dv-ust">Son işlenen yoklama: <b>{d.sonTarih || '-'}</b>
        {d.sinirVar && <> · Devamsızlık sınırı her ders için ders saatinin %{String(d.sinirYuzde).replace('.', ',')}’idir.</>}
        <br />Yalnızca yoklaması girilen dersler sayılır; izinli olduğun saatler devamsızlığa eklenmez.</div>
      <div className="dv-lejant" aria-hidden="true"><span><i className="k-G" />Geldin</span><span><i className="k-Y" />Gelmedin</span><span><i className="k-I" />İzinli</span><span><i className="k-X" />Ders yapılmadı</span>
        <em>Her gün iki kare: üstteki 1. ders, alttaki 2. ders. Ayrıntı için haftaya dokun.</em></div>
      {dersler.map(x => {
        const sinirli = x.sinir != null;
        const oran = sinirli ? Math.min(100, x.sinir ? Math.round(x.yokSaat / x.sinir! * 100) : x.yokSaat ? 100 : 0) : 0;
        return (
          <div key={x.ders} className={'dv-ders' + (x.durum ? ' ' + x.durum : '')}>
            <div className="dv-satir"><span className="dv-ad">{x.ders}</span><span className="dv-sayi">{x.yokSaat}{sinirli ? ' / ' + x.sinir : ''} saat</span></div>
            {sinirli && <div className="dv-cubuk" role="img" aria-label={`Sınırın yüzde ${oran}’i`}><i style={{ width: oran + '%' }} /></div>}
            <div className="dv-alt">{x.oturum} dersin yoklaması girildi{x.izinliSaat ? ` · ${x.izinliSaat} saat izinli` : ''}{sinirli ? ` · kalan hakkın ${Math.max(0, x.sinir! - x.yokSaat)} saat` : ''}</div>
            {x.durum === 'asti' && <div className="dv-uyari">Devamsızlık sınırını aştın. Lütfen danışmanınla görüş.</div>}
            {x.durum === 'yakin' && <div className="dv-uyari">Devamsızlık sınırına yaklaştın.</div>}
            <HaftaIzgarasi kayitlar={x.kayitlar} ders={x.ders} />
          </div>
        );
      })}
    </>
  );
}
