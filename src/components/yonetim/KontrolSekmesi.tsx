'use client';

import { useState } from 'react';
import { sistemKontroluIslemi, yedekOzetiIslemi } from '@/app/yonetim/islemler';
import type { KontrolRaporu } from '@/lib/kontrol';
import { OzetKutu, useCagir } from './ortak';

const ETIKET = { hata: 'Hata', uyari: 'Uyarı', bilgi: 'Bilgi' } as const;

/** Tam yedek (Apps Script "Tam yedek al" karşılığı): bütün kayıtlar tek JSON dosyası. */
function YedekBolumu() {
  const cagir = useCagir();
  const [ozet, setOzet] = useState<{ ad: string; sayi: number }[] | string | null>(null);
  async function goster() {
    setOzet('Sayılıyor…');
    const r = await cagir(yedekOzetiIslemi());
    setOzet(r.ok ? r.veri : r.hata);
  }
  return (
    <div className="adim" style={{ marginTop: 28 }}>
      <div className="bolum-baslik">Tam yedek</div>
      <p className="aciklama">Bütün kayıtlar (öğrenciler, sınıflar, program, sınavlar, yoklamalar, ayarlar, işlem kaydı) tek bir dosyaya indirilir. Dönem başında, büyük bir liste yüklemesinden ya da sınıf yayınından önce yedek almanız önerilir. Dosya kişisel veri içerir; güvenli bir yerde saklayın.</p>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <a className="btn btn-primary" href="/yonetim/yedek" download>Tam yedek indir</a>
        <a className="btn btn-secondary" href="/yonetim/yedek?gorsel=1" download>Tarama görüntüleriyle birlikte indir</a>
        <button className="btn btn-secondary" type="button" onClick={goster}>Kayıt sayılarını göster</button>
      </div>
      {typeof ozet === 'string' && <div className="durum">{ozet}</div>}
      {Array.isArray(ozet) && (
        <div className="table-card"><div className="scroller"><table>
          <thead><tr><th>Tablo</th><th>Kayıt</th></tr></thead>
          <tbody>{ozet.map(t => <tr key={t.ad}><td>{t.ad}</td><td>{t.sayi}</td></tr>)}</tbody>
        </table></div></div>
      )}
      <p className="hint">Geri yükleme bilgisayarınızdan yapılır: <code>npm run geri-yukle -- &quot;yedek.json&quot;</code> önce rapor verir, sonuna <code>--yaz</code> eklenince veritabanındaki kayıtları yedektekilerle değiştirir (tek işlemde; hata olursa hiçbir şey değişmez). Ayrıca veritabanı sağlayıcısının (Supabase, Neon) kendi yedekleri de kullanılabilir.</p>
    </div>
  );
}

export function KontrolSekmesi() {
  const cagir = useCagir();
  const [r, setR] = useState<KontrolRaporu | null>(null);
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);

  async function calistir() {
    setBekliyor(true); setHata('');
    const x = await cagir(sistemKontroluIslemi());
    setBekliyor(false);
    if (x.ok) setR(x.veri); else setHata(x.hata);
  }

  return (
    <section>
      <div className="actions">
        <button className="btn btn-primary" type="button" onClick={calistir} disabled={bekliyor}>{bekliyor ? 'Kontrol ediliyor…' : 'Kontrolü çalıştır'}</button>
        {r && <span className="hint" style={{ alignSelf: 'center' }}>Son kontrol: {r.zaman}</span>}
      </div>
      {hata && <div className="hata-kutu">{hata}</div>}
      {!r && !hata && <div className="durum">Kayıtlardaki tutarsızlıkları görmek için &quot;Kontrolü çalıştır&quot;a basın.</div>}
      {r && (
        <>
          <div className="ozet">
            <OzetKutu deger={r.ozet.sinif} etiket="aktif sınıf" />
            <OzetKutu deger={r.ozet.ogrenci} etiket="sınıflardaki öğrenci" />
            <OzetKutu deger={r.ozet.hata} etiket="hata" tur={r.ozet.hata ? 'hata' : 'temiz'} />
            <OzetKutu deger={r.ozet.uyari} etiket="uyarı" tur={r.ozet.uyari ? 'uyari' : 'temiz'} />
          </div>
          <div className="bolum-baslik">Bulunan sorunlar</div>
          {r.sorunlar.length ? (
            <ul className="sorun-listesi">
              {r.sorunlar.map((s, i) => <li key={i} className={'sorun ' + s.seviye}><span className="rozet">{ETIKET[s.seviye]}</span><div><span className="konu">{s.konu}:</span> {s.ayrinti}</div></li>)}
            </ul>
          ) : <div className="temiz-not">Sorun bulunmadı.</div>}
          <div className="bolum-baslik">Sınıflar</div>
          <div className="table-card"><div className="scroller"><table>
            <thead><tr><th>Sınıf</th><th>Derslik</th><th>Tür</th><th>Kapasite</th><th>Öğrenci</th><th>Durum</th></tr></thead>
            <tbody>{r.siniflar.map(s => <tr key={s.ad}><td>{s.ad}</td><td>{s.derslik}</td><td>{s.tur}</td><td>{s.kapasite}</td><td>{s.sayi}</td><td>{s.aktif ? 'Aktif' : 'Pasif'}</td></tr>)}</tbody>
          </table></div></div>
        </>
      )}
      <YedekBolumu />
    </section>
  );
}
