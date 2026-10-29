import type { DevamsizlikOzeti } from '@/lib/tipler';

const ET = { geldi: 'Geldin', yapilmadi: 'Ders yapılmadı', izinli: 'İzinli' };
const AGIRLIK: Record<string, number> = { asti: 0, yakin: 1 };

/** "Devamsızlığım": ders ders devamsızlık saati, sınır ve yoklaması girilen dersler (Index.html devamsizlikHtml karşılığı). */
export function Devamsizlik({ d }: { d: DevamsizlikOzeti | null | undefined }) {
  if (!d?.dersler.length) return <><div className="bl-baslik">Devamsızlığım</div><div className="bl-bos">Henüz yoklaması girilen bir dersin yok. Yoklamalar girildikçe burada göreceksin.</div></>;
  // sınırı aşan ve yaklaşan dersler önce
  const dersler = d.dersler.slice().sort((a, b) => (AGIRLIK[a.durum] ?? 2) - (AGIRLIK[b.durum] ?? 2) || a.ders.localeCompare(b.ders, 'tr'));
  return (
    <>
      <div className="bl-baslik">Devamsızlığım</div>
      <div className="dv-ust">Son işlenen yoklama: <b>{d.sonTarih || '-'}</b>
        {d.sinirVar && <> · Devamsızlık sınırı her ders için ders saatinin %{String(d.sinirYuzde).replace('.', ',')}’idir.</>}
        <br />Yalnızca yoklaması girilen dersler sayılır; izinli olduğun saatler devamsızlığa eklenmez.</div>
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
            <details>
              <summary>Yoklaması girilen dersler ({x.kayitlar.length})</summary>
              <ul className="dv-liste">{x.kayitlar.map((k, i) => (
                <li key={i}><span>{k.tarih} · {k.saat}{k.tur === 'Telafi' ? ' · Telafi' : ''}</span>
                  {k.durum === 'yok' ? <span className="d-yok">{k.yokSaat} saat yok</span> : k.durum === 'izinli' ? <span className="d-izin">{ET.izinli}</span>
                    : k.durum === 'yapilmadi' ? <span className="d-yap">{ET.yapilmadi}</span> : <span>{ET.geldi}</span>}</li>
              ))}</ul>
            </details>
          </div>
        );
      })}
    </>
  );
}
