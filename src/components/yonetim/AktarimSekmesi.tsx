'use client';

import { useCallback, useRef, useState } from 'react';
import { aktarimFarkIslemi, aktarimGecmisiIslemi, aktarimOnizleIslemi, aktarimUygulaIslemi } from '@/app/yonetim/islemler';
import type { AktarimFarki } from '@/lib/aktarim';
import { dosyaOku, type OkunanDosya } from '@/lib/dosya-oku';
import { ListeTablosu, Mesaj, OzetKutu, useCagir, useVeri, type MesajDurumu } from './ortak';

type Onizleme = Extract<Awaited<ReturnType<typeof aktarimOnizleIslemi>>, { ok: true }>['veri'];

const degisiklikMetni = (d: { alan: string; eski: string; yeni: string }[], et: Record<string, string>) =>
  d.map(x => `${et[x.alan] ?? x.alan}: ${x.eski || '(boş)'} → ${x.yeni}`).join('; ');

function Gecmis({ surum }: { surum: number }) {
  // surum değişince yeniden yüklenir
  const yukle = useCallback(() => { void surum; return aktarimGecmisiIslemi(); }, [surum]);
  const { veri, hata } = useVeri(yukle);
  if (hata) return <div className="durum">{hata}</div>;
  if (!veri) return <div className="durum">Yükleniyor…</div>;
  if (!veri.length) return <div className="durum">Henüz aktarım yapılmadı.</div>;
  const tarih = (s: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s));
  return (
    <div className="table-card"><div className="scroller"><table>
      <thead><tr>{['No', 'Tarih', 'Dosya', 'Kayıt', 'Yeni', 'Değişen', 'Silinen', 'Geri dönen', 'Değişmeyen', 'Hatalı'].map(b => <th key={b}>{b}</th>)}</tr></thead>
      <tbody>{veri.map(r => (
        <tr key={r.id}><td>{r.no}</td><td>{tarih(r.tarih)}</td><td>{r.dosya}</td><td>{r.gecerli}</td><td>{r.yeni}</td><td>{r.degisen}</td>
          <td>{r.silinen}</td><td>{r.geriGelen}</td><td>{r.degismeyen}</td><td>{r.hatali}</td></tr>
      ))}</tbody>
    </table></div></div>
  );
}

export function AktarimSekmesi() {
  const cagir = useCagir();
  const dosyaRef = useRef<HTMLInputElement>(null);
  const [dosya, setDosya] = useState<OkunanDosya | null>(null);
  const [sayfa, setSayfa] = useState('');
  const [satirlar, setSatirlar] = useState<string[][]>([]);
  const [durum, setDurum] = useState('');
  const [oniz, setOniz] = useState<Onizleme | null>(null);
  const [eslesme, setEslesme] = useState<Record<string, number>>({});
  const [fark, setFark] = useState<AktarimFarki | null>(null);
  const [silinenIsle, setSilinenIsle] = useState(true);
  const [buyukOnay, setBuyukOnay] = useState(false);
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [bekliyor, setBekliyor] = useState<'' | 'oniz' | 'fark' | 'uygula'>('');
  const [gecmisSurum, setGecmisSurum] = useState(0);
  const farkRef = useRef<HTMLDivElement>(null);

  async function onizle(s: string[][], bas: number | null) {
    setFark(null); setOniz(null); setBekliyor('oniz');
    const r = await cagir(aktarimOnizleIslemi(s, bas));
    setBekliyor('');
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setOniz(r.veri); setEslesme({ ...r.veri.eslesme });
  }

  async function sayfaSec(d: OkunanDosya, ad: string) {
    setSayfa(ad);
    const s = d.satirlar(ad);
    setSatirlar(s);
    if (!s.length) { setDurum(`"${ad}" sayfası boş.`); setOniz(null); return; }
    setDurum(`${d.ad}${d.sayfalar.length > 1 ? ' / ' + ad : ''}: ${s.length} satır okundu.`);
    await onizle(s, null);
  }

  async function dosyaSecildi(f: File | undefined) {
    setMesaj(null); setOniz(null); setFark(null); setDosya(null);
    if (!f) return;
    setDurum('Dosya okunuyor…');
    try {
      const d = await dosyaOku(f);
      setDosya(d);
      await sayfaSec(d, d.sayfalar[0]);
    } catch (e) {
      setDurum('Bu dosya okunamadı: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  const veri = () => ({ satirlar, basSatir: oniz!.basSatir, eslesme, dosyaAdi: dosya?.ad });

  async function farkGoster() {
    setMesaj(null); setBekliyor('fark');
    const r = await cagir(aktarimFarkIslemi(veri()));
    setBekliyor('');
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setFark(r.veri); setSilinenIsle(true); setBuyukOnay(false);
    setTimeout(() => farkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function uygula() {
    if (!fark) return;
    const s = fark.sayilar;
    const silIsle = s.silinen > 0 && silinenIsle;
    const buyuk = silIsle && s.silinen > fark.esik;
    if (buyuk && !buyukOnay) { alert('Toplu kayıt silme işaretlemesi için kırmızı onay kutusunu işaretleyin ya da üstteki kutuyu kaldırın.'); return; }
    if (!confirm(`Öğrenci kayıtları güncellenecek:\n${s.yeni} yeni, ${s.degisen} değişen, ${silIsle ? s.silinen : 0} kaydı silinen, ${s.geriGelen} yeniden kaydolan.\n\nDevam edilsin mi?`)) return;
    setBekliyor('uygula');
    const r = await cagir(aktarimUygulaIslemi({ ...veri(), imza: fark.imza, silinenleriIsle: silIsle, silmeOnayi: buyuk ? s.silinen : 0 }));
    setBekliyor('');
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    const x = r.veri;
    setFark(null); setOniz(null); setDosya(null); setDurum('');
    if (dosyaRef.current) dosyaRef.current.value = '';
    setMesaj({ metin: <><strong>{x.aktarimNo} tamamlandı.</strong> {x.yeni} yeni kayıt eklendi, {x.degisen} kaydın bilgisi güncellendi, {x.silinen} kayıt &quot;Kaydı silindi&quot; olarak işaretlendi, {x.geriGelen} öğrenci yeniden aktif oldu. {x.ayni} kayıt değişmedi.{x.silinenAtlanan ? ` Dosyada olmayan ${x.silinenAtlanan} öğrenci sizin tercihinizle aktif bırakıldı.` : ''} Sınıflarla uyumu görmek için &quot;Sistem kontrolü&quot;nü çalıştırın.</> });
    setGecmisSurum(n => n + 1);
  }

  async function sablonIndir(dolu: boolean) {
    setDurum('Şablon hazırlanıyor…');
    const yanit = await fetch('/yonetim/sablon' + (dolu ? '?dolu=1' : ''));
    if (!yanit.ok) { setDurum(await yanit.text()); return; }
    const ad = /filename="([^"]+)"/.exec(yanit.headers.get('Content-Disposition') ?? '')?.[1] ?? 'Ogrenci_Listesi.xlsx';
    const url = URL.createObjectURL(await yanit.blob());
    const a = document.createElement('a'); a.href = url; a.download = ad; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setDurum(dolu ? `${ad} indirildi (${yanit.headers.get('X-Ogrenci-Sayisi')} aktif öğrenci). TC sütunu boş gelir; boş bırakırsanız kayıtlı son 4 hane korunur.` : `${ad} indirildi.`);
  }

  const ilk = oniz?.ornek[0] ?? [];
  const s = fark?.sayilar;
  const buyuk = !!fark && !!s && s.silinen > fark.esik;

  return (
    <section>
      <div className="adim">
        <div className="sablon-kutu">
          <div>
            <div className="sablon-baslik">Şablonu indir</div>
            <div className="sablon-not">Listeyi hazırlamak için şablonu indirip doldurun. &quot;Mevcut listeyle&quot; seçeneği sistemdeki aktif öğrencileri yazılı olarak verir; düzenleyip buraya geri yükleyebilirsiniz.</div>
          </div>
          <div className="sablon-dugmeler">
            <button className="btn btn-secondary" type="button" onClick={() => sablonIndir(false)}>Boş şablon</button>
            <button className="btn btn-secondary" type="button" onClick={() => sablonIndir(true)}>Mevcut listeyle</button>
          </div>
        </div>
        <div className="bolum-baslik">1. Öğrenci listesini seçin</div>
        <p className="aciklama">Doldurduğunuz öğrenci listesi şablonu (.xlsx) ya da aynı sütunlara sahip başka bir Excel veya CSV dosyası. Dosya bu bilgisayarda okunur; hiçbir değişiklik siz onaylamadan kaydedilmez.</p>
        <div className="dosya-satir">
          <input ref={dosyaRef} type="file" accept=".xlsx,.csv" onChange={e => dosyaSecildi(e.target.files?.[0])} />
          {dosya && dosya.sayfalar.length > 1 && (
            <select aria-label="Çalışma sayfası" value={sayfa} onChange={e => sayfaSec(dosya, e.target.value)}>
              {dosya.sayfalar.map(n => <option key={n}>{n}</option>)}
            </select>
          )}
        </div>
        <div className="hint" style={{ textAlign: 'left', marginTop: 10 }}>{bekliyor === 'oniz' ? 'Sütunlar tanınıyor…' : durum}</div>
      </div>

      {oniz && (
        <div className="adim">
          <div className="bolum-baslik">2. Sütunları kontrol edin</div>
          <p className={'aciklama' + (oniz.otomatikBulundu ? '' : ' uyari-metin')}>
            {oniz.otomatikBulundu
              ? `Başlık satırı ve sütunlar otomatik tanındı. ${oniz.veriSatiri} veri satırı var. Eşleştirmeyi kontrol edin; yanlış olan varsa düzeltin.`
              : 'Başlık satırı otomatik bulunamadı. Başlıkların bulunduğu satır numarasını yazın ve sütunları elle eşleştirin.'}
          </p>
          <div className="dosya-satir" style={{ marginBottom: 12 }}>
            <label htmlFor="basSatir">Başlık satırı</label>
            <input type="number" id="basSatir" min={1} style={{ width: 90 }} defaultValue={oniz.basSatir + 1} key={oniz.basSatir}
              onChange={e => { const n = parseInt(e.target.value, 10); if (n >= 1) onizle(satirlar, n - 1); }} />
          </div>
          <div className="table-card"><div className="scroller">
            <table className="esl-tablo">
              <thead><tr><th>Sistemdeki alan</th><th>Dosyadaki sütun</th><th>İlk kayıttaki değer</th></tr></thead>
              <tbody>{oniz.alanlar.map(a => (
                <tr key={a.alan}>
                  <td>{a.etiket}{a.alan === 'no' && <span className="zorunlu" title="Zorunlu"> *</span>}</td>
                  <td><select value={eslesme[a.alan] ?? -1} onChange={e => { setEslesme(x => ({ ...x, [a.alan]: Number(e.target.value) })); setFark(null); }}>
                    <option value={-1}>— Dosyada yok —</option>
                    {oniz.sutunlar.map(s => <option key={s.i} value={s.i}>{s.ad}</option>)}
                  </select></td>
                  <td className="ornek">{(eslesme[a.alan] ?? -1) > -1 ? ilk[eslesme[a.alan]] || '(boş)' : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div></div>
          <button className="btn btn-primary" type="button" onClick={farkGoster} disabled={!!bekliyor}>
            {bekliyor === 'fark' ? 'Hesaplanıyor…' : fark ? 'Farkları yeniden hesapla' : 'Farkları göster'}
          </button>
        </div>
      )}

      {fark && s && (
        <div className="adim" ref={farkRef}>
          <div className="bolum-baslik">3. Değişiklikleri inceleyin</div>
          <div className="ozet">
            <OzetKutu deger={fark.dosyaKayit} etiket="dosyadaki geçerli kayıt" />
            <OzetKutu deger={s.yeni} etiket="yeni kayıt" tur="yeni" />
            <OzetKutu deger={s.degisen} etiket="bilgisi değişen" tur="uyari" />
            <OzetKutu deger={s.silinen} etiket="dosyada yok (kaydı silinmiş)" tur="silinen" />
            <OzetKutu deger={s.geriGelen} etiket="yeniden kaydolan" />
            <OzetKutu deger={s.ayni} etiket="değişmeyen" />
          </div>
          {fark.ilkAktarim && <p className="aciklama">Bu ilk aktarım: dosyadaki tüm geçerli kayıtlar öğrenci listesine eklenecek.</p>}
          {!fark.tcVar && <p className="aciklama uyari-metin">TC kimlik numarası sütunu seçilmedi. Öğrenci sorgulamada TC doğrulaması kullanılacaksa TC sütununu eşleştirin.</p>}
          {s.hata > 0 && <p className="aciklama uyari-metin">{s.hata} satır hatalı olduğu için aktarılmayacak. Aşağıdaki &quot;Aktarılmayacak satırlar&quot; listesine bakın.</p>}
          <ListeTablosu baslik="Yeni kayıtlar" sayi={s.yeni} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Cinsiyet', 'Bölüm']} satirlar={fark.yeni.map(x => [x.no, x.ad, x.cinsiyet, x.bolum])} />
          <ListeTablosu baslik="Bilgisi değişenler" sayi={s.degisen} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Değişiklik']} satirlar={fark.degisen.map(x => [x.no, x.ad, degisiklikMetni(x.degisiklikler, fark.alanEtiket)])} />
          <ListeTablosu baslik="Dosyada olmayanlar (kaydı silinmiş)" sayi={s.silinen} kolonlar={['Öğrenci No', 'Adı Soyadı']} satirlar={fark.silinen.map(x => [x.no, x.ad])} />
          <ListeTablosu baslik="Yeniden kaydolanlar" sayi={s.geriGelen} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Değişiklik']} satirlar={fark.geriGelen.map(x => [x.no, x.ad, degisiklikMetni(x.degisiklikler, fark.alanEtiket) || '—'])} />
          <ListeTablosu baslik="Aktarılmayacak satırlar" sayi={s.hata} kolonlar={['Excel satırı', 'Öğrenci No', 'Adı Soyadı', 'Neden']} satirlar={fark.hatalar.map(x => [x.satir, x.no, x.ad, x.neden])} />
          <ListeTablosu baslik="Uyarılar (aktarılacak)" sayi={s.uyari} kolonlar={['Excel satırı', 'Öğrenci No', 'Adı Soyadı', 'Uyarı']} satirlar={fark.uyarilar.map(x => [x.satir, x.no, x.ad, x.neden])} />
          {s.silinen > 0 && (
            <label className="onay"><input type="checkbox" checked={silinenIsle} onChange={e => setSilinenIsle(e.target.checked)} />
              <span>Dosyada olmayan {s.silinen} öğrenciyi &quot;Kaydı silindi&quot; olarak işaretle. Kayıtları silinmez, yalnızca durumu değişir. Yüklediğiniz dosya tam liste değilse bu kutuyu kaldırın.</span></label>
          )}
          {buyuk && silinenIsle && (
            <label className="onay tehlike"><input type="checkbox" checked={buyukOnay} onChange={e => setBuyukOnay(e.target.checked)} />
              <span>{s.silinen} öğrenci (aktif kayıtların önemli bir kısmı) kaydı silindi olarak işaretlenecek. Dosyanın eksik ya da filtrelenmiş bir liste olmadığını kontrol ettim.</span></label>
          )}
          <button className="btn btn-primary" type="button" onClick={uygula} disabled={!!bekliyor}>
            {bekliyor === 'uygula' ? 'Uygulanıyor…' : !s.yeni && !s.degisen && !s.silinen && !s.geriGelen ? 'Aktarımı kaydet (değişiklik yok)' : 'Aktarımı uygula'}
          </button>
        </div>
      )}

      <Mesaj m={mesaj} />
      <div className="bolum-baslik">Son aktarımlar</div>
      <Gecmis surum={gecmisSurum} />
    </section>
  );
}
