import type { Duyuru } from '@/lib/tipler';

/** Duyuru metni: satır sonları korunur, bağlantılar tıklanabilir olur (HTML yorumlanmaz). */
function Metin({ t }: { t: string }) {
  return (
    <>
      {t.split('\n').map((satir, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {satir.split(/(https?:\/\/[^\s<]+)/g).map((p, j) =>
            /^https?:\/\//.test(p) ? <a key={j} href={p} target="_blank" rel="noopener">{p}</a> : p
          )}
        </span>
      ))}
    </>
  );
}

export function DuyuruListesi({ liste, baslik }: { liste: Duyuru[]; baslik: string }) {
  if (!liste.length) return null;
  return (
    <div className="duyurular" role="region" aria-label={baslik}>
      {liste.map((d, i) => (
        <div className="duyuru" key={i}>
          <div className="duyuru-baslik">{d.baslik}</div>
          {d.metin && <div className="duyuru-metin"><Metin t={d.metin} /></div>}
          {d.tarih && <div className="duyuru-tarih">{d.tarih}</div>}
        </div>
      ))}
    </div>
  );
}
