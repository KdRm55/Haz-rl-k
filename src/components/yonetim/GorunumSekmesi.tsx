'use client';

import { useState } from 'react';
import { gorunumDurumuIslemi, gorunumKaydetIslemi, gorunumOnizleIslemi } from '@/app/yonetim/islemler';
import type { SorguSonucu } from '@/lib/tipler';
import { Mesaj, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

function Anahtar({ baslik, aciklama, acik, kilitli, degistir }: { baslik: string; aciklama: string; acik: boolean; kilitli: boolean; degistir: () => void }) {
  return (
    <div className="og-satir">
      <div className="og-metin"><div className="og-ad">{baslik}</div><div className="og-aciklama">{aciklama}</div></div>
      <span className={'og-durum ' + (acik ? 'acik' : 'kapali')}>{acik ? 'Öğrenci görür' : 'Gizli'}</span>
      <button type="button" className="og-anahtar" role="switch" aria-checked={acik} aria-label={baslik} disabled={kilitli} onClick={degistir} />
    </div>
  );
}

/** Önizleme: öğrencinin şu anki ayarlarla göreceği bölümler. */
function OnizlemeListesi({ r }: { r: SorguSonucu }) {
  if (!r.bulundu) return <div className="hata-kutu" style={{ marginTop: 12 }}>{r.mesaj}</div>;
  const g = r.gorunum;
  const satir = (et: string, deger: string | null) => <li key={et}>{et}: {deger ? <strong>{deger}</strong> : <span className="yok">gösterilmiyor</span>}</li>;
  const sv = r.sinav;
  return (
    <div className="onizleme">
      <strong>{r.adSoyad}</strong> · {r.tur === 'sinif' ? 'sınıfa yerleşmiş' : r.tur === 'muaf' ? 'muaf' : 'sınıfı henüz belli değil'}
      <ul className="og-liste">
        {r.tur === 'sinif' && satir('Sınıf', g.sinif ? r.sinif : null)}
        {r.tur === 'sinif' && satir('Derslik', g.derslik ? r.derslik : null)}
        {r.tur === 'sinif' && satir('Ders programı', g.program ? (r.program.length ? r.program.length + ' ders' : 'program yok') : null)}
        {satir('Muafiyet sınavı', sv ? (sv.sonuc ? sv.sonuc + (sv.yazili ? ` (yazılı ${sv.yazili}${sv.sozlu ? ', sözlü ' + sv.sozlu : ''})` : '') : sv.yer || 'sonuç yayında değil') : null)}
        {satir('Özel duyurular', g.duyurular ? r.duyurular.length + ' duyuru' : null)}
      </ul>
    </div>
  );
}

export function GorunumSekmesi() {
  const cagir = useCagir();
  const { veri, setVeri, hata } = useVeri(gorunumDurumuIslemi);
  const [kilitli, setKilitli] = useState(false);
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [no, setNo] = useState('');
  const [oniz, setOniz] = useState<SorguSonucu | null>(null);

  async function onizle(numara = no) {
    if (!numara.trim()) return;
    const r = await cagir(gorunumOnizleIslemi(numara.replace(/\s+/g, '')));
    if (r.ok) setOniz(r.veri); else setMesaj({ metin: r.hata, hata: true });
  }
  async function degistir(ad: string, baslik: string, yeni: boolean) {
    setKilitli(true); setMesaj(null);
    const r = await cagir(gorunumKaydetIslemi(ad, yeni));
    setKilitli(false);
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setVeri(r.veri);
    setMesaj({ metin: <><strong>{baslik}</strong> {yeni ? 'öğrencilere açıldı.' : 'öğrencilerden gizlendi.'}</> });
    if (oniz) onizle();   // ayar değişince önizleme kendini yeniler
  }

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!veri) return <Yukleniyor />;
  return (
    <section>
      <div className="adim">
        <div className="bolum-baslik">Öğrencinin göreceği bölümler</div>
        <p className="aciklama">Kapattığınız bölüm öğrenci ekranında hiç görünmez; bilgisi öğrencinin tarayıcısına da gönderilmez. Değişiklik hemen geçerli olur.</p>
        {veri.bolumler.map(b => <Anahtar key={b.ad} baslik={b.baslik} aciklama={b.aciklama} acik={b.acik} kilitli={kilitli} degistir={() => degistir(b.ad, b.baslik, !b.acik)} />)}
        <Anahtar baslik="Muafiyet sınavı sonucu" aciklama="Öğrencinin muafiyet sınavı puanları ve sonucu (muaf / hazırlığa devam). Ayarlardaki SINAV_SONUCLARI_YAYINDA ile aynıdır."
          acik={veri.muafiyet} kilitli={kilitli} degistir={() => degistir('__muafiyet', 'Muafiyet sınavı sonucu', !veri.muafiyet)} />
        <div className="og-not">Bütün bölümler kapalıysa öğrenci yalnızca adını ve &quot;Şu an gösterilecek bilgi bulunmuyor&quot; mesajını görür.</div>
      </div>
      <Mesaj m={mesaj} />
      <div className="adim">
        <div className="bolum-baslik">Önizleme: öğrenci ne görüyor?</div>
        <p className="aciklama">Bir öğrenci numarası yazın; bu öğrencinin şu anki ayarlarla kendi hesabıyla girdiğinde göreceği bölümler listelenir.</p>
        <div className="og-onizle-satir">
          <input type="text" inputMode="numeric" autoComplete="off" placeholder="Öğrenci numarası" aria-label="Öğrenci numarası"
            value={no} onChange={e => setNo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onizle(); }} />
          <button type="button" className="btn btn-secondary" onClick={() => onizle()}>Önizle</button>
        </div>
        {oniz && <OnizlemeListesi r={oniz} />}
      </div>
    </section>
  );
}
