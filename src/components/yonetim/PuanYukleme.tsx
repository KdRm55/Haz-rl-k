'use client';

import { useState } from 'react';
import { puanFarkIslemi, puanOnizleIslemi, puanUygulaIslemi } from '@/app/yonetim/islemler';
import { dosyaOku, type OkunanDosya } from '@/lib/dosya-oku';
import type { PuanFarkOzeti, SinavDurumu } from '@/lib/sinav-yonetim';
import { ListeTablosu, OzetKutu, useCagir, type MesajDurumu } from './ortak';

type Onizleme = Extract<Awaited<ReturnType<typeof puanOnizleIslemi>>, { ok: true }>['veri'];
type Sinav = 'yazili' | 'sozlu' | 'ikisi';
const ALANLAR = [
  { k: 'no', et: 'Öğrenci No', zorunlu: true }, { k: 'adi', et: 'Adı' }, { k: 'soyadi', et: 'Soyadı' },
  { k: 'adSoyad', et: 'Adı Soyadı (tek sütun)' }, { k: 'yazili', et: 'Yazılı puanı' }, { k: 'sozlu', et: 'Sözlü puanı' }
] as const;

export function PuanYukleme({ yayinda, bitti, mesaj }: { yayinda: boolean; bitti: (d: SinavDurumu) => void; mesaj: (m: MesajDurumu) => void }) {
  const cagir = useCagir();
  const [dosya, setDosya] = useState<OkunanDosya | null>(null);
  const [sayfa, setSayfa] = useState('');
  const [satirlar, setSatirlar] = useState<string[][]>([]);
  const [durum, setDurum] = useState('');
  const [oniz, setOniz] = useState<Onizleme | null>(null);
  const [esl, setEsl] = useState<Record<string, number>>({});
  const [sinav, setSinav] = useState<Sinav>('yazili');
  const [fark, setFark] = useState<PuanFarkOzeti | null>(null);
  const [uzerine, setUzerine] = useState(false);
  const [adYaz, setAdYaz] = useState(false);
  const [bekliyor, setBekliyor] = useState('');
  const [dosyaSurum, setDosyaSurum] = useState(0);

  async function onizle(s: string[][], bas: number | null) {
    setFark(null); setOniz(null); setBekliyor('oniz');
    const r = await cagir(puanOnizleIslemi(s, bas));
    setBekliyor('');
    if (!r.ok) { setDurum(r.hata); return; }
    const e = r.veri.eslesme, sec: Record<string, number> = {};
    ALANLAR.forEach(a => { sec[a.k] = e[a.k]; });
    if (sec.yazili === -1 && sec.sozlu === -1 && e.genel > -1) sec.yazili = e.genel;   // "Puan", "HBN" gibi genel sütun
    setSinav(sec.yazili > -1 && sec.sozlu > -1 ? 'ikisi' : sec.sozlu > -1 ? 'sozlu' : 'yazili');
    setEsl(sec); setOniz(r.veri);
  }
  async function sayfaSec(d: OkunanDosya, ad: string) {
    setSayfa(ad);
    const s = d.satirlar(ad);
    setSatirlar(s);
    setDurum(`${d.ad}${d.sayfalar.length > 1 ? ' / ' + ad : ''}: ${s.length} satır okundu.`);
    if (s.length) await onizle(s, null);
  }
  async function dosyaSecildi(f: File | undefined) {
    setOniz(null); setFark(null); setDosya(null); mesaj(null);
    if (!f) return;
    setDurum('Dosya okunuyor…');
    try { const d = await dosyaOku(f); setDosya(d); await sayfaSec(d, d.sayfalar[0]); }
    catch (e) { setDurum('Bu dosya okunamadı: ' + (e instanceof Error ? e.message : String(e))); }
  }

  const eslesme = (): Record<string, number> => ({ ...esl, ...(sinav === 'yazili' ? { sozlu: -1 } : sinav === 'sozlu' ? { yazili: -1 } : {}) });
  const veri = (u = uzerine, a = adYaz) => ({ satirlar, basSatir: oniz!.basSatir, eslesme: eslesme(), dosyaAdi: dosya?.ad, uzerineYaz: u, adUyusmazYaz: a });

  async function farkGoster(u = false, a = false) {
    setUzerine(u); setAdYaz(a); setBekliyor('fark');
    const r = await cagir(puanFarkIslemi(veri(u, a)));
    setBekliyor('');
    if (!r.ok) { mesaj({ metin: r.hata, hata: true }); setFark(null); return; }
    setFark(r.veri);
  }
  function sinavDegisti(v: Sinav) {
    setFark(null);
    setEsl(e => {
      const x = { ...e };
      if (v === 'sozlu' && x.sozlu === -1 && x.yazili !== -1) { x.sozlu = x.yazili; x.yazili = -1; }
      if (v === 'yazili' && x.yazili === -1 && x.sozlu !== -1) { x.yazili = x.sozlu; x.sozlu = -1; }
      return x;
    });
    setSinav(v);
  }

  async function uygula() {
    if (!fark?.sayilar.yazilacak) return;
    if (!confirm(`${fark.sayilar.yazilacak} puan sınav listesine yazılacak.${uzerine ? '\nMevcut farklı puanlar değiştirilecek.' : ''}${adYaz ? '\nAdı uyuşmayan satırlar da yazılacak.' : ''}${yayinda ? '\n\nDİKKAT: Sonuçlar öğrencilere açık; öğrenciler yeni puanları hemen görecek.' : ''}\n\nDevam edilsin mi?`)) return;
    setBekliyor('uygula');
    const r = await cagir(puanUygulaIslemi({ ...veri(), imza: fark.imza }));
    setBekliyor('');
    if (!r.ok) { mesaj({ metin: r.hata, hata: true }); return; }
    const o = r.veri.ozet;
    setFark(null); setOniz(null); setDosya(null); setDurum(''); setDosyaSurum(n => n + 1);
    mesaj({ metin: `${o.islemNo}: ${o.yazilan} puan yazıldı (${o.yeni} yeni, ${o.degistirilen} değiştirildi).` +
      (o.atlananDegisen ? ` Farklı puanı olan ${o.atlananDegisen} öğrencinin mevcut puanı korundu.` : '') +
      (o.bulunamadi ? ` Listede bulunamayan ${o.bulunamadi} satır atlandı.` : '') + (o.hatali ? ` Hatalı ${o.hatali} satır yazılmadı.` : '') +
      ' Her değişiklik öğrencinin geçmişine yazıldı.' });
    bitti(r.veri.durum);
  }

  async function sablonIndir() {
    setDurum('Şablon hazırlanıyor…');
    const y = await fetch('/yonetim/puan-sablonu');
    if (!y.ok) { setDurum(await y.text()); return; }
    const url = URL.createObjectURL(await y.blob());
    const a = document.createElement('a'); a.href = url; a.download = 'Sinav_Puanlari.xlsx'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setDurum(`Sinav_Puanlari.xlsx indirildi (${y.headers.get('X-Ogrenci-Sayisi')} öğrenci). Yazılı/Sözlü sütunlarını doldurup buradan yükleyin; boş bırakılan puanlar atlanır.`);
  }

  const ilk = oniz?.ornek[0] ?? [];
  const e = eslesme();
  const notlar = oniz ? [
    !oniz.otomatikBulundu && 'Başlık satırı otomatik bulunamadı; başlık satırı numarasını ve sütunları kontrol edin.',
    e.adi === -1 && e.soyadi === -1 && e.adSoyad === -1 && 'Ad sütunu seçilmedi: numarası yanlış yazılmış satırlar yakalanamaz. Dosyada ad varsa mutlaka eşleştirin.'
  ].filter(Boolean).join(' ') : '';
  const s = fark?.sayilar;

  return (
    <div className="adim">
      <div className="bolum-baslik">Puan listesi yükle</div>
      <p className="aciklama">Sınava girenlerin listesini yükleyin: Proliz&apos;den indirilen ders listesi ya da kendi Excel dosyanız. Puanlar öğrenci numarasına göre eşleştirilir; listenin sırası önemli değildir. Hiçbir şey siz onaylamadan yazılmaz.</p>
      <div className="dosya-satir">
        <input key={dosyaSurum} type="file" accept=".xlsx,.csv" onChange={ev => dosyaSecildi(ev.target.files?.[0])} />
        {dosya && dosya.sayfalar.length > 1 && <select aria-label="Çalışma sayfası" value={sayfa} onChange={ev => sayfaSec(dosya, ev.target.value)}>{dosya.sayfalar.map(n => <option key={n}>{n}</option>)}</select>}
        <button className="btn btn-secondary" type="button" onClick={sablonIndir}>Puan şablonu indir</button>
      </div>
      <div className="hint" style={{ textAlign: 'left', marginTop: 10 }}>{bekliyor === 'oniz' ? 'Sütunlar tanınıyor…' : durum}</div>

      {oniz && (
        <>
          <div className="dosya-satir" style={{ margin: '16px 0 12px' }}>
            <label htmlFor="pSinav">Bu dosyadaki puanlar</label>
            <select id="pSinav" value={sinav} onChange={ev => sinavDegisti(ev.target.value as Sinav)}>
              <option value="yazili">Yazılı sınav</option><option value="sozlu">Sözlü sınav</option><option value="ikisi">Yazılı ve sözlü (ayrı sütunlarda)</option>
            </select>
            <label htmlFor="pBas">Başlık satırı</label>
            <input type="number" id="pBas" min={1} style={{ width: 80 }} defaultValue={oniz.basSatir + 1} key={oniz.basSatir}
              onChange={ev => { const n = parseInt(ev.target.value, 10); if (n >= 1) onizle(satirlar, n - 1); }} />
          </div>
          {notlar && <p className="aciklama uyari-metin">{notlar}</p>}
          <div className="table-card"><div className="scroller">
            <table className="esl-tablo"><thead><tr><th>Alan</th><th>Dosyadaki sütun</th><th>İlk satırdaki değer</th></tr></thead>
              <tbody>{ALANLAR.filter(a => !(a.k === 'yazili' && sinav === 'sozlu') && !(a.k === 'sozlu' && sinav === 'yazili')).map(a => (
                <tr key={a.k}>
                  <td>{a.et}{'zorunlu' in a && <span className="zorunlu"> *</span>}</td>
                  <td><select value={esl[a.k] ?? -1} onChange={ev => { setEsl(x => ({ ...x, [a.k]: Number(ev.target.value) })); setFark(null); }}>
                    <option value={-1}>— Dosyada yok —</option>{oniz.sutunlar.map(c => <option key={c.i} value={c.i}>{c.ad}</option>)}</select></td>
                  <td className="ornek">{(esl[a.k] ?? -1) > -1 ? ilk[esl[a.k]] || '(boş)' : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div></div>
          <button className="btn btn-primary" type="button" disabled={!!bekliyor} onClick={() => farkGoster()}>{bekliyor === 'fark' ? 'Hesaplanıyor…' : fark ? 'Farkları yeniden hesapla' : 'Farkları göster'}</button>
        </>
      )}

      {fark && s && (
        <div style={{ marginTop: 16 }}>
          <div className="ozet">
            <OzetKutu deger={s.yazilacak} etiket="puan yazılacak" tur="yeni" />
            <OzetKutu deger={s.ayni} etiket="zaten aynı" />
            <OzetKutu deger={s.degisen} etiket="mevcut puandan farklı" tur={s.degisen ? 'uyari' : ''} />
            <OzetKutu deger={s.adUyusmaz} etiket="adı uyuşmayan" tur={s.adUyusmaz ? 'hata' : ''} />
            <OzetKutu deger={s.bulunamadi} etiket="listede bulunamayan" tur={s.bulunamadi ? 'uyari' : ''} />
            <OzetKutu deger={s.hatali} etiket="hatalı satır" tur={s.hatali ? 'hata' : ''} />
          </div>
          {s.bosSatir > 0 && <p className="aciklama">{s.bosSatir} satırda puan yok (sınava girmemiş olabilir); bu satırlar atlandı. Sınava girmeyenler için &quot;Sınav aşamaları&quot; bölümünü kullanın.</p>}
          <div className="onizleme"><div className="karsilastir">
            <span /><span className="b">Muaf</span><span className="b">Hazırlık</span><span className="b">Bekliyor</span>
            <span>Şu an</span><span>{fark.sonuc.once.muaf}</span><span>{fark.sonuc.once.hazirlik}</span><span>{fark.sonuc.once.bekliyor}</span>
            <span>Yüklemeden sonra</span><span className="b">{fark.sonuc.sonra.muaf}</span><span className="b">{fark.sonuc.sonra.hazirlik}</span><span className="b">{fark.sonuc.sonra.bekliyor}</span>
          </div></div>
          <ListeTablosu baslik="Hatalı satırlar (yazılmayacak)" sayi={s.hatali} kolonlar={['Dosya satırı', 'Öğrenci No', 'Adı Soyadı', 'Sorun']} satirlar={fark.hatali.map(x => [x.satir, x.no, x.ad, x.neden])} />
          <ListeTablosu baslik="Adı uyuşmayanlar — numara yanlış yazılmış olabilir" sayi={s.adUyusmaz} kolonlar={['Dosya satırı', 'Öğrenci No', 'Dosyadaki ad', 'Bu numaradaki öğrenci']} satirlar={fark.adUyusmaz.map(x => [x.satir, x.no, x.dosyaAd, x.listeAd])} />
          <ListeTablosu baslik="Listede bulunamayanlar" sayi={s.bulunamadi} kolonlar={['Dosya satırı', 'Öğrenci No', 'Adı Soyadı', 'Neden']} satirlar={fark.bulunamadi.map(x => [x.satir, x.no, x.ad, x.neden])} />
          <ListeTablosu baslik="Mevcut puandan farklı olanlar" sayi={s.degisen} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Sınav', 'Şu anki', 'Dosyadaki']} satirlar={fark.degisen.map(x => [x.no, x.ad, x.alan, x.eski, x.yeni])} />
          <ListeTablosu baslik="Yeni yazılacak puanlar" sayi={s.yeni} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Sınav', 'Puan']} satirlar={fark.yeni.map(x => [x.no, x.ad + (x.adUyusmaz ? ' (ad uyuşmuyor)' : ''), x.alan, x.yeni])} />
          {s.degisen > 0 && <label className="onay"><input type="checkbox" checked={uzerine} onChange={ev => farkGoster(ev.target.checked, adYaz)} />
            <span>Sınav listesinde zaten farklı bir puanı olan {s.degisen} öğrencinin puanını dosyadakiyle değiştir. İşaretlemezseniz mevcut puanlar korunur.</span></label>}
          {s.adUyusmaz > 0 && <label className="onay tehlike"><input type="checkbox" checked={adYaz} onChange={ev => farkGoster(uzerine, ev.target.checked)} />
            <span>Adı uyuşmayan {s.adUyusmaz} satırın puanını da yaz. Yalnızca adın farklı yazıldığından (ör. yazım hatası) ve numaranın doğru olduğundan eminseniz işaretleyin.</span></label>}
          <button className="btn btn-primary" type="button" disabled={!s.yazilacak || !!bekliyor} onClick={uygula}>
            {bekliyor === 'uygula' ? 'Yazılıyor…' : s.yazilacak ? `${s.yazilacak} puanı yaz` : 'Yazılacak puan yok'}</button>
        </div>
      )}
    </div>
  );
}
