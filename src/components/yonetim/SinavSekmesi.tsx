'use client';

import { useEffect, useState } from 'react';
import { asamaIsaretleIslemi, kuralKaydetIslemi, kuralOnizleIslemi, sinavDurumuIslemi, sinavListesiniGuncelleIslemi, yayinlaIslemi } from '@/app/yonetim/islemler';
import type { KuralOnizleme, SinavDurumu } from '@/lib/sinav-yonetim';
import { ListeTablosu, Mesaj, OzetKutu, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';
import { PuanYukleme } from './PuanYukleme';
import { SinavListesi } from './SinavListesi';

type KuralFormu = { yontem: 'ORTALAMA' | 'AYRI'; yaziliGecme: string; yaziliAgirlik: string; muafiyetPuani: string; sozluAltSinir: string; sozluGecme: string };
const formdan = (k: SinavDurumu['ayar']): KuralFormu => ({ yontem: k.yontem, yaziliGecme: String(k.yaziliGecme), yaziliAgirlik: String(k.yaziliAgirlik),
  muafiyetPuani: String(k.muafiyetPuani), sozluAltSinir: String(k.sozluAltSinir), sozluGecme: String(k.sozluGecme) });

function KuralBolumu({ d, kaydedildi, mesaj }: { d: SinavDurumu; kaydedildi: (d: SinavDurumu) => void; mesaj: (m: MesajDurumu) => void }) {
  const cagir = useCagir();
  const [acik, setAcik] = useState(false);
  const [f, setF] = useState(formdan(d.ayar));
  const [deneme, setDeneme] = useState({ yazili: '', sozlu: '' });
  const [o, setO] = useState<KuralOnizleme | null>(null);
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  useEffect(() => { if (!acik) setF(formdan(d.ayar)); }, [d, acik]);
  const degistir = (p: Partial<KuralFormu>) => { setF(x => ({ ...x, ...p })); setO(null); };
  const ort = f.yontem === 'ORTALAMA';
  const w = parseFloat(f.yaziliAgirlik.replace(',', '.'));

  async function onizle() {
    setBekliyor(true); setHata('');
    const r = await cagir(kuralOnizleIslemi(f, deneme));
    setBekliyor(false);
    if (r.ok) setO(r.veri); else { setO(null); setHata(r.hata); }
  }
  async function kaydet() {
    if (!o) return;
    if (!confirm(`Yeni kural kaydedilsin mi?\n\n${o.kural}${o.yayinda && o.degisenSayi ? `\n\nDİKKAT: Sonuçlar şu an öğrencilere açık. ${o.degisenSayi} öğrencinin gördüğü sonuç hemen değişecek.` : ''}`)) return;
    setBekliyor(true);
    const r = await cagir(kuralKaydetIslemi(f));
    setBekliyor(false);
    if (!r.ok) { setHata(r.hata); return; }
    setAcik(false); setO(null);
    mesaj({ metin: 'Muafiyet kuralı kaydedildi ve tüm sonuçlar yeni kurala göre hesaplandı.' });
    kaydedildi(r.veri);
  }
  const sayi = (et: string, v: string, p: (x: string) => void, sinif?: string) => (
    <label className={'alan' + (sinif ? ' ' + sinif : '')}>{et}<input type="number" min={0} max={100} step={0.01} value={v} onChange={e => p(e.target.value)} /></label>
  );

  return (
    <div className="adim">
      <div className="bolum-baslik">Muafiyet kuralı</div>
      <p className="kural-metin">{d.kural}</p>
      <p className="aciklama" style={{ marginBottom: 0 }}>Puanlar aşağıdaki &quot;Sınav listesi&quot;nden tek tek ya da &quot;Puan listesi yükle&quot; ile toplu girilir: 0–100 arası sayı, sınava girmeyen için <strong>G</strong>. Sonuçlar her zaman güncel kurala göre hesaplanır.</p>
      <details className="kural-form" open={acik} onToggle={e => setAcik((e.target as HTMLDetailsElement).open)}>
        <summary>Kuralı değiştir</summary>
        <div className="form-izgara">
          <label className="alan">Muafiyet yöntemi
            <select value={f.yontem} onChange={e => degistir({ yontem: e.target.value as KuralFormu['yontem'] })}>
              <option value="ORTALAMA">Ağırlıklı ortalama</option><option value="AYRI">İki sınavı ayrı ayrı geçmek</option>
            </select></label>
          {sayi('Sözlüye girme puanı (yazılı, bu puan dahil)', f.yaziliGecme, v => degistir({ yaziliGecme: v }))}
          {ort && <>
            {sayi('Yazılının ağırlığı (%)', f.yaziliAgirlik, v => degistir({ yaziliAgirlik: v }))}
            <label className="alan">Sözlünün ağırlığı (%)<input type="number" disabled value={isNaN(w) ? '' : Math.round((100 - w) * 100) / 100} /></label>
            {sayi('Muafiyet için ortalama (bu puan dahil)', f.muafiyetPuani, v => degistir({ muafiyetPuani: v }))}
            {sayi('Sözlüde alt sınır (0 = yok)', f.sozluAltSinir, v => degistir({ sozluAltSinir: v }))}
          </>}
          {!ort && sayi('Sözlü geçme puanı (bu puan dahil)', f.sozluGecme, v => degistir({ sozluGecme: v }))}
        </div>
        <div className="deneme">
          <span>Deneme hesabı:</span>
          <label>Yazılı <input type="text" inputMode="decimal" placeholder="70" value={deneme.yazili} onChange={e => { setDeneme(x => ({ ...x, yazili: e.target.value })); setO(null); }} onKeyDown={e => { if (e.key === 'Enter') onizle(); }} /></label>
          <label>Sözlü <input type="text" inputMode="decimal" placeholder="55" value={deneme.sozlu} onChange={e => { setDeneme(x => ({ ...x, sozlu: e.target.value })); setO(null); }} onKeyDown={e => { if (e.key === 'Enter') onizle(); }} /></label>
        </div>
        <div className="actions" style={{ margin: '14px 0 0' }}>
          <button className="btn btn-secondary" type="button" onClick={onizle} disabled={bekliyor}>{bekliyor && !o ? 'Hesaplanıyor…' : 'Etkisini gör'}</button>
          <button className="btn btn-primary" type="button" onClick={kaydet} disabled={!o || o.ayni || bekliyor}>Kuralı kaydet</button>
        </div>
        {hata && <div className="hata-kutu">{hata}</div>}
        {o && (
          <>
            <div className="onizleme">
              <div><strong>Yeni kural:</strong> {o.kural}</div>
              {o.deneme && <div className="deneme-sonuc">Deneme: {o.deneme.sonuc} — {o.deneme.aciklama}</div>}
              {o.eski.muaf + o.eski.hazirlik + o.eski.bekliyor + o.eski.hata > 0 && (
                <>
                  <div className="karsilastir">
                    <span /><span className="b">Muaf</span><span className="b">Hazırlık</span><span className="b">Bekliyor</span>
                    <span>Şu anki kural</span><span>{o.eski.muaf}</span><span>{o.eski.hazirlik}</span><span>{o.eski.bekliyor}</span>
                    <span>Yeni kural</span><span className="b">{o.sonra.muaf}</span><span className="b">{o.sonra.hazirlik}</span><span className="b">{o.sonra.bekliyor}</span>
                  </div>
                  <div>{o.degisenSayi ? `${o.degisenSayi} öğrencinin sonucu değişecek.` : 'Hiçbir öğrencinin sonucu değişmiyor.'}</div>
                </>
              )}
            </div>
            <ListeTablosu baslik="Sonucu değişecek öğrenciler" sayi={o.degisenSayi} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Yazılı', 'Sözlü', 'Şimdi', 'Yeni kuralla']}
              satirlar={o.degisen.map(x => [x.no, x.ad, x.yazili, x.sozlu, x.eski, x.yeni])} />
            {o.ayni && <p className="aciklama">Bu kural zaten kullanılıyor; kaydedilecek bir değişiklik yok.</p>}
          </>
        )}
      </details>
    </div>
  );
}

function Asama({ ad, tamam, bekleyen, yayinda, isaretle }: { ad: string; tamam: boolean; bekleyen: number; yayinda: boolean; isaretle: (t: boolean) => void }) {
  const kucuk = ad.toLocaleLowerCase('tr-TR');
  return (
    <div className="asama">
      <div className="asama-metin">{tamam
        ? <><strong className="yayin-acik">{ad} sınav tamamlandı.</strong>Puanı boş olanlar &quot;sınava girmedi&quot; sayılıyor. Sonradan puan girerseniz o puan kullanılır.</>
        : <><strong>{ad} sınav sürüyor.</strong>{bekleyen ? `${bekleyen} öğrencinin ${kucuk} puanı henüz boş.` : 'Puanı boş öğrenci yok.'}</>}</div>
      <button className={'btn ' + (tamam ? 'btn-secondary' : 'btn-primary')} type="button" onClick={() => {
        const m = !tamam
          ? `${ad} sınav tamamlandı olarak işaretlensin mi?\n\n${bekleyen ? `${ad} puanı boş olan ${bekleyen} öğrenci "sınava girmedi" sayılacak ve hazırlığa kalacak.` : 'Şu an puanı boş öğrenci yok.'}\n\nSonradan girilen puanlar yine dikkate alınır; işareti istediğiniz zaman kaldırabilirsiniz.${yayinda && bekleyen ? '\n\nDİKKAT: Sonuçlar öğrencilere açık; bu öğrenciler "hazırlığa devam" sonucunu hemen görecek.' : ''}`
          : `${ad} sınavın tamamlandı işareti kaldırılsın mı?\n\nPuanı boş olanlar yeniden "bekliyor" sayılacak.`;
        if (confirm(m)) isaretle(!tamam);
      }}>{tamam ? 'İşareti kaldır' : `${ad} sınav tamamlandı`}</button>
    </div>
  );
}

export function SinavSekmesi() {
  const cagir = useCagir();
  const { veri: d, setVeri, hata } = useVeri(sinavDurumuIslemi);
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [listeSurum, setListeSurum] = useState(0);
  const [bekliyor, setBekliyor] = useState('');

  const guncelle = (x: SinavDurumu) => { setVeri(x); setListeSurum(n => n + 1); };
  async function islem<T>(ad: string, p: Promise<import('@/lib/islem-sonucu').Sonuc<T>>, bitti: (v: T) => void) {
    setBekliyor(ad); setMesaj(null);
    const r = await cagir(p);
    setBekliyor('');
    if (r.ok) bitti(r.veri); else setMesaj({ metin: r.hata, hata: true });
  }

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!d) return <Yukleniyor />;
  const s = d.sayilar;
  return (
    <section>
      <KuralBolumu d={d} kaydedildi={guncelle} mesaj={setMesaj} />
      <div className="actions">
        <button className="btn btn-primary" type="button" disabled={!!bekliyor} onClick={() => islem('liste', sinavListesiniGuncelleIslemi(), r => {
          guncelle(r.durum); setMesaj({ metin: `Sınav listesi güncellendi: ${r.eklenen} öğrenci eklendi, ${r.adGuncel} öğrencinin adı güncellendi.` });
        })}>{bekliyor === 'liste' ? 'Güncelleniyor…' : 'Sınav listesini güncelle'}</button>
      </div>
      <Mesaj m={mesaj} />
      {!s.toplam
        ? <div className="temiz-not">Sınav listesi henüz boş. &quot;Sınav listesini güncelle&quot;ye basın; aktif öğrenciler sınav listesine eklenir.</div>
        : d.eksikOgrenci > 0 && <p className="aciklama uyari-metin">{d.eksikOgrenci} aktif öğrenci sınav listesinde yok. &quot;Sınav listesini güncelle&quot; ile ekleyin.</p>}
      {s.toplam > 0 && (
        <>
          <PuanYukleme yayinda={d.yayinda} bitti={guncelle} mesaj={setMesaj} />
          <div className="ozet">
            <OzetKutu deger={s.toplam} etiket="sınav listesinde" />
            <OzetKutu deger={s.bekliyor} etiket="yazılı puanı bekleniyor" />
            <OzetKutu deger={s.sozluBekliyor} etiket="sözlü puanı bekleniyor" />
            <OzetKutu deger={s.muaf} etiket="muaf" tur="temiz" />
            <OzetKutu deger={s.hazirlik} etiket="hazırlığa devam" tur="yeni" />
            <OzetKutu deger={s.hata} etiket="hatalı puan" tur={s.hata ? 'hata' : 'temiz'} />
          </div>
          <ListeTablosu baslik="Hatalı puanlar" sayi={s.hata} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Sorun']} satirlar={d.hatalar.map(x => [x.no, x.ad, x.neden])} />
          <ListeTablosu baslik="Sözlüye girecekler (sözlü puanı bekleniyor)" sayi={s.sozluBekliyor} kolonlar={['Öğrenci No', 'Adı Soyadı']} satirlar={d.bekleyenSozlu.map(x => [x.no, x.ad])} />
          <div className="adim">
            <div className="bolum-baslik">Sınav aşamaları</div>
            <p className="aciklama">Sınav sürerken puanı boş olan öğrenci &quot;bekliyor&quot; sayılır. Sınav bittiğinde aşağıdan işaretleyin: puanı boş kalan herkes &quot;sınava girmedi&quot; sayılır ve hazırlığa kalır.</p>
            <Asama ad="Yazılı" tamam={d.yaziliTamam} bekleyen={s.bekliyor} yayinda={d.yayinda} isaretle={t => islem('asama', asamaIsaretleIslemi('yazili', t), x => {
              guncelle(x); setMesaj({ metin: t ? `Yazılı sınav tamamlandı olarak işaretlendi${s.bekliyor ? `; ${s.bekliyor} öğrenci "sınava girmedi" sayıldı.` : '.'}` : 'Yazılı sınavın tamamlandı işareti kaldırıldı.' });
            })} />
            <Asama ad="Sözlü" tamam={d.sozluTamam} bekleyen={s.sozluBekliyor} yayinda={d.yayinda} isaretle={t => islem('asama', asamaIsaretleIslemi('sozlu', t), x => {
              guncelle(x); setMesaj({ metin: t ? `Sözlü sınav tamamlandı olarak işaretlendi${s.sozluBekliyor ? `; ${s.sozluBekliyor} öğrenci "sınava girmedi" sayıldı.` : '.'}` : 'Sözlü sınavın tamamlandı işareti kaldırıldı.' });
            })} />
          </div>
          <div className="adim">
            <div className="bolum-baslik">Öğrencilere yayın</div>
            <p className="aciklama">{d.yayinda
              ? <><span className="yayin-acik">Sonuçlar öğrencilere açık.</span> Öğrenciler numarasıyla puanını ve sonucunu görebiliyor. Sonradan girilen ya da düzeltilen puanlar da anında görünür.</>
              : <><span className="yayin-kapali">Sonuçlar öğrencilere kapalı.</span> Öğrenciler yalnızca sınav yerini görür.{s.hata ? ' Hatalı puanlar düzeltilmeden yayınlanamaz.' : ''}</>}</p>
            <button className={'btn ' + (d.yayinda ? 'btn-tehlike' : 'btn-primary')} type="button" disabled={!!bekliyor || (!d.yayinda && s.hata > 0)}
              onClick={() => {
                if (!confirm(d.yayinda ? 'Sonuçlar öğrencilerden gizlensin mi?' : `Sonuçlar öğrencilere açılsın mı?\n\n${s.muaf} muaf, ${s.hazirlik} hazırlığa devam, ${s.bekliyor + s.sozluBekliyor} bekliyor.`)) return;
                islem('yayin', yayinlaIslemi(!d.yayinda), x => { setVeri(x); setMesaj({ metin: x.yayinda ? 'Sonuçlar öğrencilere açıldı.' : 'Sonuçlar öğrencilerden gizlendi.' }); });
              }}>{d.yayinda ? 'Sonuçları öğrencilerden gizle' : 'Sonuçları öğrencilere yayınla'}</button>
          </div>
        </>
      )}
      <SinavListesi surum={listeSurum} degisti={async () => { const r = await cagir(sinavDurumuIslemi()); if (r.ok) setVeri(r.veri); }} />
    </section>
  );
}
