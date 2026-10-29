'use client';

import { useState } from 'react';
import { duyuruAktiflikIslemi, duyuruDurumuIslemi, duyuruEkleIslemi, duyuruSilIslemi } from '@/app/yonetim/islemler';
import { Mesaj, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

const KIME_ACIKLAMA: Record<string, string> = {
  'Herkes': 'Sorgulama ekranını açan herkes, numara girmeden önce görür.',
  'Hazırlık öğrencileri': 'Muaf olmayan tüm kayıtlı öğrenciler, numaralarıyla sorgulayınca görür.',
  'Muaf öğrenciler': 'Muafiyet sınavını geçen öğrenciler, numaralarıyla sorgulayınca görür (sonuçlar yayındayken).',
  'Sınıfı henüz belli olmayanlar': 'Kayıtlı ama henüz bir sınıfa yerleşmemiş öğrenciler görür (ör. sınav yeri duyurusu).'
};
const bosForm = { baslik: '', metin: '', kime: 'Herkes', baslangic: '', bitis: '' };

export function DuyurularSekmesi() {
  const cagir = useCagir();
  const { veri, setVeri, hata } = useVeri(duyuruDurumuIslemi);
  const [f, setF] = useState(bosForm);
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [bekliyor, setBekliyor] = useState<number | 'ekle' | null>(null);

  async function ekle() {
    if (!f.baslik.trim()) return;
    setBekliyor('ekle'); setMesaj(null);
    const r = await cagir(duyuruEkleIslemi(f));
    setBekliyor(null);
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setVeri(r.veri);
    setMesaj({ metin: 'Duyuru yayınlandı' + (f.baslangic ? ' (başlangıç tarihinde görünmeye başlayacak)' : '') + '. Öğrenci ekranında hemen görünür.' });
    setF({ ...bosForm, kime: f.kime });
  }
  async function aktiflik(id: number, aktif: boolean) {
    setBekliyor(id); setMesaj(null);
    const r = await cagir(duyuruAktiflikIslemi(id, aktif));
    setBekliyor(null);
    if (r.ok) setVeri(r.veri); else setMesaj({ metin: r.hata, hata: true });
  }
  async function sil(id: number, baslik: string) {
    if (!confirm(`"${baslik}" duyurusu silinsin mi? Yalnızca geçici olarak gizlemek istiyorsanız "Yayından kaldır"ı kullanın.`)) return;
    setBekliyor(id);
    const r = await cagir(duyuruSilIslemi(id));
    setBekliyor(null);
    if (r.ok) { setVeri(r.veri); setMesaj({ metin: 'Duyuru silindi.' }); } else setMesaj({ metin: r.hata, hata: true });
  }

  if (hata) return <div className="hata-kutu">{hata}</div>;
  if (!veri) return <Yukleniyor />;
  return (
    <section>
      <div className="adim">
        <div className="bolum-baslik">Yeni duyuru</div>
        <div className="form-izgara">
          <label className="alan" style={{ gridColumn: '1/-1' }}>Başlık
            <input type="text" maxLength={120} value={f.baslik} onChange={e => setF({ ...f, baslik: e.target.value })} placeholder="Örn. Muafiyet sınavı sözlü programı açıklandı" /></label>
          <label className="alan" style={{ gridColumn: '1/-1' }}>Metin (isteğe bağlı; bağlantılar tıklanabilir olur)
            <textarea maxLength={2000} rows={4} value={f.metin} onChange={e => setF({ ...f, metin: e.target.value })} placeholder="Duyurunun ayrıntıları" /></label>
          <label className="alan">Kime gösterilsin
            <select value={f.kime} onChange={e => setF({ ...f, kime: e.target.value })}>{veri.hedefler.map(h => <option key={h}>{h}</option>)}</select></label>
          <label className="alan">Başlangıç (isteğe bağlı)<input type="date" value={f.baslangic} onChange={e => setF({ ...f, baslangic: e.target.value })} /></label>
          <label className="alan">Bitiş (isteğe bağlı, gün dahil)<input type="date" value={f.bitis} onChange={e => setF({ ...f, bitis: e.target.value })} /></label>
        </div>
        <p className="aciklama">{KIME_ACIKLAMA[f.kime] ?? `${f.kime} öğrencileri, numaralarıyla sorgulayınca görür.`}</p>
        <button className="btn btn-primary" type="button" onClick={ekle} disabled={bekliyor === 'ekle' || !f.baslik.trim()}>{bekliyor === 'ekle' ? 'Yayınlanıyor…' : 'Duyuruyu yayınla'}</button>
      </div>
      <Mesaj m={mesaj} />
      <div className="bolum-baslik">Duyurular</div>
      {!veri.duyurular.length ? <div className="durum">Henüz duyuru yok.</div> : veri.duyurular.map(x => {
        const tarih = [x.baslangic ? x.baslangic + ' tarihinden' : '', x.bitis ? x.bitis + ' tarihine kadar' : ''].filter(Boolean).join(' ');
        return (
          <div key={x.id} className={'du-kart' + (x.durum === 'Yayında' ? ' yayinda' : '')}>
            <div className="du-ust">
              <div><div className="du-baslik">{x.baslik}</div>
                <div className="du-meta">Kime: {x.kime}{tarih ? ' · ' + tarih : ''} · Oluşturma: {x.olusturma}</div></div>
              <span className="du-durum">{x.durum}</span>
            </div>
            {x.metin && <div className="du-metin">{x.metin}</div>}
            <div className="du-eylem">
              <button type="button" className="btn btn-secondary btn-kucuk" disabled={bekliyor === x.id} onClick={() => aktiflik(x.id, !x.aktif)}>{x.aktif ? 'Yayından kaldır' : 'Yeniden yayınla'}</button>
              <button type="button" className="btn btn-tehlike btn-kucuk" disabled={bekliyor === x.id} onClick={() => sil(x.id, x.baslik)}>Sil</button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
