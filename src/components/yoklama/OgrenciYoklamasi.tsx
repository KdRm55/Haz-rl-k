'use client';

/** Hoca ekranı · Yoklama: öğrenciyi numara ya da adla bulup sınıfına ait yoklama günlerini görme ve düzeltme. */
import { useState } from 'react';
import { yoklamaOgrenciAraIslemi, yoklamaOgrenciGuncelleIslemi, yoklamaOgrenciKayitlariIslemi } from '@/app/hoca/islemler';
import type { Sonuc } from '@/lib/islem-sonucu';
import type { YoklamaOgrenciBulunan, YoklamaOgrenciKayitlari } from '@/lib/yoklama';

type Gun = YoklamaOgrenciKayitlari['gunler'][number];

function GunSatiri({ g, no, guncellendi, yetkiHatasi }: { g: Gun; no: string; guncellendi: (g: Gun, mesaj: string) => void; yetkiHatasi: (r: Sonuc<unknown>) => boolean }) {
  const [y1, setY1] = useState(g.yok1), [y2, setY2] = useState(g.yok2);
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState('');
  const degisti = y1 !== g.yok1 || y2 !== g.yok2;

  async function kaydet() {
    setBekliyor(true); setHata('');
    const r = await yoklamaOgrenciGuncelleIslemi({ anahtar: g.anahtar, no, yok1: y1, yok2: y2, surum: g.surum });
    setBekliyor(false);
    if (yetkiHatasi(r)) return;
    if (!r.ok) { setHata(r.hata); return; }
    guncellendi({ ...g, yok1: y1, yok2: y2, listede: true, surum: r.veri.surum, zaman: r.veri.zaman, kaydeden: r.veri.kaydeden }, `${g.tarih} · ${g.ders} kaydedildi.`);
  }

  const kutu = (v: boolean, set: (v: boolean) => void, et: string) => g.duzenlenebilir
    ? <label className="yk-onay"><input type="checkbox" checked={!v} onChange={e => set(!e.target.checked)} aria-label={`${g.tarih} ${g.ders} ${et}`} /><span>{v ? 'Yok' : 'Geldi'}</span></label>
    : <span className={v ? 'yo-yok' : 'yo-geldi'}>{g.durum === 'Yapılmadı' ? '—' : v ? 'Yok' : 'Geldi'}</span>;

  const izinli = g.izinli && (g.yok1 || g.yok2);
  return (
    <tr className={(y1 || y2) ? (izinli ? 'izinli' : 'yok') : ''}>
      <td><strong>{g.tarih}</strong><div className="yo-alt">{g.gun}{g.saat ? ' · ' + g.saat : ''}</div></td>
      <td>{g.sinif} · {g.ders}{g.tur === 'Telafi' && <span className="yk-cip telafi" style={{ marginLeft: 6 }}>Telafi</span>}<div className="yo-alt">{g.hoca}</div></td>
      <td className="c">{kutu(y1, setY1, '1. ders')}</td>
      <td className="c">{kutu(y2, setY2, '2. ders')}</td>
      <td>
        {g.durum === 'Yapılmadı' ? <span className="yk-cip yapilmadi">Ders yapılmadı</span>
          : !g.duzenlenebilir ? <span className="yo-alt">Başka öğretim elemanının dersi</span>
          : degisti ? <button type="button" className="btn btn-primary btn-kucuk" disabled={bekliyor} onClick={kaydet}>{bekliyor ? 'Kaydediliyor…' : 'Kaydet'}</button>
          : <span className="yo-alt">Son kayıt: {g.zaman}</span>}
        {izinli && <span className="yk-cip girildi" style={{ marginLeft: 6 }}>İzinli</span>}
        {!g.listede && <div className="yo-alt">O gün listede değildi{g.duzenlenebilir ? '; kaydederseniz eklenir' : ''}</div>}
        {hata && <div className="yo-hata" role="alert">{hata}</div>}
      </td>
    </tr>
  );
}

export function OgrenciYoklamasi({ yetkiHatasi }: { yetkiHatasi: (r: Sonuc<unknown>) => boolean }) {
  const [q, setQ] = useState('');
  const [bulunan, setBulunan] = useState<YoklamaOgrenciBulunan[] | string | null>(null);
  const [k, setK] = useState<YoklamaOgrenciKayitlari | string | null>(null);
  const [mesaj, setMesaj] = useState('');

  async function ara(e?: React.FormEvent) {
    e?.preventDefault();
    setBulunan('Aranıyor…'); setK(null); setMesaj('');
    const r = await yoklamaOgrenciAraIslemi(q);
    if (yetkiHatasi(r)) return;
    if (!r.ok) { setBulunan(r.hata); return; }
    setBulunan(r.veri.length ? r.veri : 'Bu aramayla eşleşen öğrenci bulunamadı.');
    if (r.veri.length === 1) ac(r.veri[0].no);
  }
  async function ac(no: string) {
    setK('Yoklama kayıtları okunuyor…'); setMesaj('');
    const r = await yoklamaOgrenciKayitlariIslemi(no);
    if (yetkiHatasi(r)) return;
    setK(r.ok ? r.veri : r.hata);
  }

  const liste = Array.isArray(bulunan) ? bulunan : null, kk = k && typeof k === 'object' ? k : null;
  const devamsizlik = kk ? kk.gunler.reduce((t, g) => t + (g.durum === 'Yapıldı' && !g.izinli ? Number(g.yok1) + Number(g.yok2) : 0), 0) : 0;
  return (
    <details className="yk-telafi yk-ogrenci">
      <summary>Öğrenciye göre yoklama (numara ya da ad soyadla ara)</summary>
      <form className="yk-form" onSubmit={ara}>
        <div className="field" style={{ flex: '1 1 260px' }}><label htmlFor="yoAra">Öğrenci numarası ya da adı soyadı</label>
          <input type="search" id="yoAra" value={q} onChange={e => setQ(e.target.value)} placeholder="Örn: 2026001 ya da Ayşe Yılmaz" /></div>
        <div className="field"><button className="btn btn-primary" type="submit" disabled={q.trim().length < 2}>Ara</button></div>
      </form>
      {typeof bulunan === 'string' && <div className="empty-note" style={{ marginTop: 12 }}>{bulunan}</div>}
      {liste && liste.length > 1 && (
        <div className="yo-bulunan">{liste.map(o => (
          <button key={o.no} type="button" className={'yo-kisi' + (kk?.no === o.no ? ' secili' : '')} onClick={() => ac(o.no)}>
            <strong>{o.ad}</strong><span>{o.no}{o.sinif ? ' · ' + o.sinif : ' · sınıfı yok'}</span>
          </button>
        ))}</div>
      )}
      {typeof k === 'string' && <div className="empty-note" style={{ marginTop: 12 }}>{k}</div>}
      {kk && (
        <div style={{ marginTop: 14 }}>
          <div className="yk-ozet">{kk.ad} · {kk.no}{kk.sinif ? ' · ' + kk.sinif : ''} · {kk.gunler.length} yoklama günü{kk.gunler.length ? ` · ${devamsizlik} saat devamsızlık` : ''}</div>
          {mesaj && <div className="yk-mesaj" style={{ padding: 0 }}><div className="ok">{mesaj}</div></div>}
          {!kk.gunler.length ? <div className="empty-note" style={{ marginTop: 12 }}>Bu öğrencinin sınıfına ait yoklama kaydı yok.</div> : (
            <div className="yk-tablo-kap" style={{ marginTop: 10 }}>
              <table className="yk-tablo">
                <thead><tr><th>Tarih</th><th>Ders</th><th className="c">1. ders</th><th className="c">2. ders</th><th></th></tr></thead>
                <tbody>{kk.gunler.map(g => (
                  <GunSatiri key={g.anahtar + ':' + g.surum} g={g} no={kk.no} yetkiHatasi={yetkiHatasi}
                    guncellendi={(yeni, m) => { setMesaj(m); setK({ ...kk, gunler: kk.gunler.map(x => (x.anahtar === yeni.anahtar ? yeni : x)) }); }} />
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </details>
  );
}
