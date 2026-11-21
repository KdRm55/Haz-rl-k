'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  optikAnahtarKaydetIslemi, optikDurumIslemi, optikElleKaydetIslemi, optikEslestirIslemi, optikGorselEkleIslemi, optikKaydetIslemi, optikPuanYazIslemi,
  optikSetOlusturIslemi, optikSetSilIslemi, optikSonuclarIslemi, optikYayinIslemi
} from '@/app/yonetim/islemler';
import { dosyaOku, xlsxIndir } from '@/lib/dosya-oku';
import { anahtarSablonSatirlari, optikNotu } from '@/lib/optik/kurallar';
import { optikDosyasiOku, optikGorseliHazirla, type DosyaOkumasi } from '@/lib/optik/tarayici';
import type { OptikDurumu, OptikSonuclari } from '@/lib/optik-yonetim';
import { ListeTablosu, Mesaj, OzetKutu, useCagir, useVeri, Yukleniyor, type MesajDurumu } from './ortak';

type Set = OptikDurumu['setler'][number];
type Eslesen = { no: string; ad: string; kitapcik: string; salon: string; sira: string };
type Satir = DosyaOkumasi & { eslesen: Eslesen | null; tekrar: boolean; elleNo?: string; elleKit?: string };

const sira = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });
const bekle = () => new Promise<void>(r => setTimeout(r, 0));

/* ---------- Cevap anahtarı ---------- */
function AnahtarBolumu({ s, mesaj, yenile }: { s: Set; mesaj: (m: MesajDurumu) => void; yenile: () => void }) {
  const cagir = useCagir();
  const [soru, setSoru] = useState(s.soruSayisi || 20);
  const [ceza, setCeza] = useState(s.yanlisCezasi === '0' ? '' : s.yanlisCezasi);
  const [bekliyor, setBekliyor] = useState(false);
  const kitapciklar = Object.keys(s.anahtar).sort();

  async function sec(f: File | undefined) {
    if (!f) return;
    setBekliyor(true); mesaj(null);
    try {
      const k = await dosyaOku(f);
      const satirlar = k.sayfalar.map(ad => k.satirlar(ad)).find(r => r.some(x => x.some(v => v.trim())));
      if (!satirlar) { mesaj({ metin: 'Dosyada veri bulunamadı.', hata: true }); return; }
      const r = await cagir(optikAnahtarKaydetIslemi(s.kod, satirlar, ceza.trim() || '0'));
      if (!r.ok) { mesaj({ metin: <span style={{ whiteSpace: 'pre-wrap' }}>{r.hata}</span>, hata: true }); return; }
      mesaj({ metin: r.veri.mesaj }); yenile();
    } catch (e) { mesaj({ metin: 'Dosya okunamadı: ' + (e instanceof Error ? e.message : String(e)), hata: true }); }
    finally { setBekliyor(false); }
  }

  return (
    <div className="adim">
      <div className="bolum-baslik">1. Cevap anahtarı</div>
      <p className="aciklama">Şablonu indirin; her kitapçık (A, B, C, D) satırına her sorunun doğru cevabını ayrı sütuna yazın. İptal edilen soruya <b>-</b> yazın (herkese doğru sayılır). Doldurup buraya yükleyin; anahtarı değiştirmek için yeniden yükleyin.</p>
      <div className="dosya-satir">
        <label>Soru sayısı <input type="number" min={1} max={50} value={soru} style={{ width: 70 }} onChange={e => setSoru(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></label>
        <button className="btn btn-secondary" type="button" onClick={() => xlsxIndir('Cevap_Anahtari_Sablonu.xlsx', 'Cevap anahtarı', anahtarSablonSatirlari(soru), [14, ...Array.from({ length: soru }, () => 5)])}>📄 Şablon indir</button>
        <label>Yanlış cezası <input type="text" inputMode="decimal" placeholder="yok" value={ceza} style={{ width: 70 }} onChange={e => setCeza(e.target.value)} /></label>
        <input type="file" accept=".xlsx,.csv" disabled={bekliyor} onChange={e => { sec(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <div className="hint" style={{ textAlign: 'left' }}>Yanlış cezası boşsa ceza yoktur: puan = doğru ÷ soru sayısı × 100. Örn. 0,25 yazarsanız her yanlış çeyrek doğruyu götürür.</div>
      {kitapciklar.length > 0 && (
        <div className="table-card" style={{ marginTop: 10 }}><div className="scroller">
          <table>
            <thead><tr><th>Kitapçık</th>{Array.from({ length: s.soruSayisi }, (_, i) => <th key={i}>{i + 1}</th>)}</tr></thead>
            <tbody>{kitapciklar.map(k => <tr key={k}><td><b>{k}</b></td>{s.anahtar[k].split('').map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
          </table>
        </div></div>
      )}
    </div>
  );
}

/* ---------- Toplu optik yükleme ---------- */
function YuklemeBolumu({ s, mesaj, kaydedildi }: { s: Set; mesaj: (m: MesajDurumu) => void; kaydedildi: () => void }) {
  const cagir = useCagir();
  const [satirlar, setSatirlar] = useState<Satir[]>([]);
  const [is, setIs] = useState('');
  const [acik, setAcik] = useState<number | null>(null);
  const [karekodluKayit, setKarekodluKayit] = useState<number | null>(null);
  const anahtarVar = Object.keys(s.anahtar).length > 0;

  async function sec(dosyalar: File[]) {
    if (!dosyalar.length) return;
    mesaj(null); setSatirlar([]); setAcik(null);
    const okunan: DosyaOkumasi[] = [];
    for (let i = 0; i < dosyalar.length; i++) {
      setIs(`Optikler okunuyor… ${i + 1} / ${dosyalar.length}`);
      await bekle();
      try { okunan.push(await optikDosyasiOku(dosyalar[i])); }
      catch { okunan.push({ dosya: dosyalar[i].name, karekod: '', okuma: { ok: false, neden: 'Görüntü açılamadı.' }, gorsel: '', uyari: '' }); }
    }
    setIs('Karekodlar öğrencilerle eşleştiriliyor…');
    const harita: Record<string, Eslesen> = {};
    const kodlar = [...new Set(okunan.map(o => o.karekod).filter(Boolean))];
    for (let i = 0; i < kodlar.length; i += 300) {
      const r = await cagir(optikEslestirIslemi(kodlar.slice(i, i + 300)));
      if (!r.ok) { mesaj({ metin: r.hata, hata: true }); setIs(''); return; }
      Object.assign(harita, r.veri.eslesen); setKarekodluKayit(r.veri.karekodluKayit);
    }
    const goruldu = new Set<string>();
    setSatirlar(okunan.map(o => {
      const e = harita[o.karekod] ?? null;
      const tekrar = !!e && goruldu.has(e.no);
      if (e) goruldu.add(e.no);
      return { ...o, eslesen: e, tekrar };
    }));
    setIs('');
  }

  /** Karekodu okunamayan (ya da listede olmayan) ama cevapları okunan optik: öğrenci numarası ve kitapçık elle verilirse kaydedilebilir. */
  const elleGerekli = (x: Satir) => x.okuma.ok && !x.eslesen;
  const elleGecerli = (x: Satir) => /^\d{6,12}$/.test(x.elleNo ?? '') && !!x.elleKit && !!s.anahtar[x.elleKit];
  const guncelle = (i: number, y: Partial<Satir>) => setSatirlar(l => l.map((x, j) => (j === i ? { ...x, ...y } : x)));
  const durum = (x: Satir): { etiket: string; tur: 'ok' | 'uyari' | 'hata'; kaydedilir: boolean } => {
    if (elleGerekli(x) && elleGecerli(x)) return { etiket: 'Elle eşleştirildi' + (x.uyari ? ' · ' + x.uyari : ''), tur: 'uyari', kaydedilir: true };
    if (elleGerekli(x)) return { etiket: (x.karekod ? 'Karekod listede yok' : 'QR okunamadı') + ' — görüntüye bakıp öğrenci no ve kitapçığı yazın', tur: 'hata', kaydedilir: false };
    if (!x.okuma.ok) return { etiket: x.karekod ? 'Cevaplar okunamadı — elle kayıt gerekir' : 'QR ve cevaplar okunamadı — elle kayıt gerekir', tur: 'hata', kaydedilir: false };
    if (!x.karekod) return { etiket: 'QR okunamadı — elle kayıt gerekir', tur: 'hata', kaydedilir: false };
    if (!x.eslesen) return { etiket: 'Karekod sınav yeri listesinde yok', tur: 'hata', kaydedilir: false };
    if (!s.anahtar[x.eslesen.kitapcik]) return { etiket: `${x.eslesen.kitapcik} kitapçığının anahtarı yok`, tur: 'hata', kaydedilir: false };
    if (x.tekrar) return { etiket: 'Aynı öğrenci birden fazla optikte (ilki alınır)', tur: 'uyari', kaydedilir: false };
    if (x.uyari) return { etiket: x.uyari, tur: 'uyari', kaydedilir: true };
    return { etiket: 'Hazır', tur: 'ok', kaydedilir: true };
  };
  const hazir = satirlar.filter(x => durum(x).kaydedilir);

  async function kaydet() {
    if (!hazir.length) return;
    if (!confirm(`${hazir.length} optik kaydedilecek. Bu öğrencilerin daha önce yüklenmiş optikleri varsa yenisiyle değiştirilir.\n\nDevam edilsin mi?`)) return;
    const hatalar: string[] = [];
    let yazilan = 0;
    for (let i = 0; i < hazir.length; i++) {
      const x = hazir[i];
      setIs(`Kaydediliyor… ${i + 1} / ${hazir.length}`);
      const o = x.okuma as Extract<DosyaOkumasi['okuma'], { ok: true }>;
      const r = await cagir(optikKaydetIslemi(x.eslesen
        ? { setKod: s.kod, karekod: x.karekod, cevaplar: o.cevaplar, uyari: x.uyari, gorsel: x.gorsel, kaynak: 'QR' }
        : { setKod: s.kod, no: x.elleNo, kitapcik: x.elleKit, cevaplar: o.cevaplar, uyari: ('Karekod elle eşleştirildi. ' + x.uyari).trim(), gorsel: x.gorsel, kaynak: 'QR' }));
      if (r.ok) yazilan++; else hatalar.push(`${x.dosya}: ${r.hata}`);
    }
    setIs('');
    mesaj({ metin: <>{yazilan} optik kaydedildi.{hatalar.length > 0 && <> {hatalar.length} kayıt yazılamadı:<br />{hatalar.slice(0, 8).map((h, i) => <div key={i}>{h}</div>)}</>}</>, hata: hatalar.length > 0 });
    if (!hatalar.length) setSatirlar([]);
    kaydedildi();
  }

  const sayi = (t: string) => satirlar.filter(x => durum(x).tur === t).length;
  return (
    <div className="adim">
      <div className="bolum-baslik">2. Optikleri yükle</div>
      <p className="aciklama">Taranmış optik görüntülerini (JPG) topluca seçin. Her optiğin karekodu okunur ve sınav yeri listesindeki <b>KAREKOD</b> sütunuyla eşleştirilir; işaretlenen cevaplar otomatik okunur. Okuma bu bilgisayarda yapılır, tam boyutlu taramalar sunucuya gönderilmez. Hiçbir şey siz onaylamadan kaydedilmez.</p>
      {!anahtarVar && <p className="aciklama uyari-metin">Önce cevap anahtarını yükleyin.</p>}
      <div className="dosya-satir">
        <input type="file" accept="image/jpeg,image/png" multiple disabled={!anahtarVar || !!is} onChange={e => { sec(Array.from(e.target.files ?? []).sort((a, b) => sira(a.name, b.name))); e.target.value = ''; }} />
      </div>
      {is && <Yukleniyor metin={is} />}
      {karekodluKayit === 0 && <p className="aciklama uyari-metin">Sınav yeri listelerinde karekod kaydı yok. Kelebek sistemin öğrenci listesini (KAREKOD sütunlu) &quot;Sınav yerleri&quot; sekmesinden yeniden yükleyin.</p>}
      {satirlar.length > 0 && (
        <>
          <div className="ozet" style={{ marginTop: 12 }}>
            <OzetKutu deger={satirlar.length} etiket="optik okundu" />
            <OzetKutu deger={sayi('ok')} etiket="hazır" tur="yeni" />
            <OzetKutu deger={sayi('uyari')} etiket="uyarılı" tur={sayi('uyari') ? 'uyari' : ''} />
            <OzetKutu deger={sayi('hata')} etiket="elle kayıt gerekir" tur={sayi('hata') ? 'hata' : ''} />
          </div>
          <div className="table-card"><div className="scroller">
            <table>
              <thead><tr><th>Dosya</th><th>Öğrenci</th><th>Kit.</th><th>Cevaplar</th><th>D / Y / B</th><th>Puan</th><th>Durum</th></tr></thead>
              <tbody>{satirlar.map((x, i) => {
                const d = durum(x), o = x.okuma.ok ? x.okuma : null;
                const kit = x.eslesen?.kitapcik ?? x.elleKit ?? '';
                const n = o && kit && s.anahtar[kit] && (x.eslesen || elleGecerli(x)) ? optikNotu(o.cevaplar, s.anahtar[kit], Number(s.yanlisCezasi)) : null;
                return (
                  <tr key={i} style={d.tur === 'hata' ? { background: 'rgba(180,35,24,.08)' } : d.tur === 'uyari' ? { background: 'rgba(200,140,0,.10)' } : undefined}>
                    <td>{x.dosya}</td>
                    <td>{x.eslesen ? <>{x.eslesen.no}<br /><small>{x.eslesen.ad}</small></> : elleGerekli(x)
                      ? <input type="text" inputMode="numeric" placeholder="Öğrenci no" aria-label="Öğrenci numarası" style={{ width: 110 }} value={x.elleNo ?? ''} onChange={e => guncelle(i, { elleNo: e.target.value.replace(/\D/g, '') })} /> : '—'}</td>
                    <td>{x.eslesen ? x.eslesen.kitapcik : elleGerekli(x)
                      ? <select aria-label="Kitapçık" value={x.elleKit ?? ''} onChange={e => guncelle(i, { elleKit: e.target.value })}><option value="">—</option>{Object.keys(s.anahtar).sort().map(k => <option key={k} value={k}>{k}</option>)}</select> : ''}</td>
                    <td style={{ fontFamily: 'monospace' }}>{o ? o.cevaplar.slice(0, s.soruSayisi) : ''}</td>
                    <td>{n ? `${n.dogru} / ${n.yanlis} / ${n.bos}` : ''}</td>
                    <td><b>{n ? String(n.puan).replace('.', ',') : ''}</b></td>
                    <td>{d.etiket}{x.gorsel && <> · <button type="button" className="btn-link" onClick={() => setAcik(acik === i ? null : i)}>{acik === i ? 'gizle' : 'görüntü'}</button></>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div></div>
          {acik != null && satirlar[acik]?.gorsel && <img src={satirlar[acik].gorsel} alt="Optik" style={{ maxWidth: 'min(100%, 760px)', border: '1px solid #ccd', borderRadius: 8, marginTop: 8 }} />}
          <button className="btn btn-primary" type="button" disabled={!hazir.length || !!is} onClick={kaydet}>{hazir.length ? `${hazir.length} optiği kaydet` : 'Kaydedilecek optik yok'}</button>
        </>
      )}
    </div>
  );
}

/* ---------- Elle kayıt ---------- */
function ElleBolumu({ s, mesaj, kaydedildi }: { s: Set; mesaj: (m: MesajDurumu) => void; kaydedildi: () => void }) {
  const cagir = useCagir();
  const [metin, setMetin] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  async function kaydet() {
    setBekliyor(true);
    const r = await cagir(optikElleKaydetIslemi(s.kod, metin));
    setBekliyor(false);
    if (!r.ok) { mesaj({ metin: <span style={{ whiteSpace: 'pre-wrap' }}>{r.hata}</span>, hata: true }); return; }
    mesaj({ metin: `${r.veri.yazilan.length} optik elle kaydedildi: ` + r.veri.yazilan.map(x => `${x.no} ${x.ad} (${String(x.puan).replace('.', ',')})`).join(', ') });
    setMetin(''); kaydedildi();
  }
  return (
    <div className="adim">
      <div className="bolum-baslik">3. Elle kayıt (karekodsuz / farklı formlu optikler)</div>
      <p className="aciklama">Karekodu olmayan ya da okunamayan optikleri buraya yazın: her satıra <b>öğrenci no, kitapçık, cevaplar</b>. Cevaplar bitişik ya da aralıklı yazılabilir; boş bırakılan soru için <b>-</b> kullanın ({s.soruSayisi || '…'} soru).</p>
      <textarea rows={5} style={{ width: '100%', fontFamily: 'monospace' }} value={metin} onChange={e => setMetin(e.target.value)} placeholder={'268303308 A ECEBBCDBEEEAAAECBDAE\n268303036 A ECEABCCDAEEECBDCBAAE'} />
      <button className="btn btn-primary" type="button" disabled={!metin.trim() || bekliyor || !s.soruSayisi} onClick={kaydet}>{bekliyor ? 'Kaydediliyor…' : 'Elle kaydet'}</button>
    </div>
  );
}

/* ---------- Sonuçlar, puan yazma, yayın ---------- */
function SonucBolumu({ s, v, mesaj, yenile }: { s: Set; v: OptikSonuclari | null; mesaj: (m: MesajDurumu) => void; yenile: () => void }) {
  const cagir = useCagir();
  const [uzerine, setUzerine] = useState(false);
  const [bekliyor, setBekliyor] = useState('');
  const [acik, setAcik] = useState<string | null>(null);
  const [yuklenen, setYuklenen] = useState('');

  /** Elle girilen (ya da görüntüsü olmayan) kayda optik fotoğrafını/taramasını ekler. */
  async function gorselEkle(no: string, f: File | undefined) {
    if (!f) return;
    setYuklenen(no); mesaj(null);
    try {
      const gorsel = await optikGorseliHazirla(f);
      const r = await cagir(optikGorselEkleIslemi({ setKod: s.kod, no, gorsel }));
      if (!r.ok) { mesaj({ metin: r.hata, hata: true }); return; }
      mesaj({ metin: `${r.veri.no} ${r.veri.ad} için optik görüntüsü eklendi.${s.yayinda ? ' Optikler yayında olduğu için öğrenci hemen görebilir.' : ''}` });
      setAcik(null); yenile();
    } catch (e) { mesaj({ metin: 'Görüntü eklenemedi: ' + (e instanceof Error ? e.message : String(e)), hata: true }); }
    finally { setYuklenen(''); }
  }

  async function puanYaz() {
    if (!v?.satirlar.length) return;
    if (!confirm(`${v.satirlar.length} öğrencinin puanı ${s.donemKod} sınavının "${s.ders}" dersine yazılacak.${uzerine ? '\nFarklı mevcut puanların ÜZERİNE yazılacak.' : '\nFarklı mevcut puanlar korunacak.'}\n\nDevam edilsin mi?`)) return;
    setBekliyor('puan');
    const r = await cagir(optikPuanYazIslemi(s.kod, uzerine));
    setBekliyor('');
    if (!r.ok) { mesaj({ metin: r.hata, hata: true }); return; }
    const o = r.veri;
    mesaj({ metin: `${o.yazilan} puan yazıldı (${o.yeni} yeni, ${o.yazilan - o.yeni} değiştirilen).` + (o.ayni ? ` ${o.ayni} puan zaten aynıydı.` : '') + (o.atlanan ? ` Farklı puanı olan ${o.atlanan} öğrencinin mevcut puanı korundu (üzerine yazmayı işaretleyin).` : '') + (o.sinavdaYok ? ` ${o.sinavdaYok} öğrenci bu sınavın listesinde olmadığı için atlandı.` : '') });
    yenile();
  }
  async function yayin(ac: boolean) {
    if (ac && !confirm('Optikler ve cevap anahtarı öğrencilere açılacak. Her öğrenci yalnızca kendi optiğini ve kendi kitapçığının anahtarını görür.\n\nYayınlansın mı?')) return;
    setBekliyor('yayin');
    const r = await cagir(optikYayinIslemi(s.kod, ac));
    setBekliyor('');
    if (!r.ok) { mesaj({ metin: r.hata, hata: true }); return; }
    mesaj({ metin: r.veri.mesaj }); yenile();
  }

  if (!v) return <Yukleniyor />;
  const fmt = (x: number) => String(x).replace('.', ',');
  return (
    <div className="adim">
      <div className="bolum-baslik">4. Sonuçlar, puan ve yayın</div>
      <div className="ozet">
        <OzetKutu deger={v.ozet.n} etiket="optik yüklü" />
        <OzetKutu deger={fmt(v.ozet.ortalama)} etiket="ortalama" />
        <OzetKutu deger={fmt(v.ozet.enYuksek)} etiket="en yüksek" />
        <OzetKutu deger={fmt(v.ozet.enDusuk)} etiket="en düşük" />
        <OzetKutu deger={v.optiksizSayi} etiket="optiği olmayan" tur={v.optiksizSayi ? 'uyari' : ''} />
      </div>
      <div className="table-card"><div className="scroller">
        <table>
          <thead><tr><th>Öğrenci No</th><th>Adı Soyadı</th><th>Kit.</th><th>Doğru</th><th>Yanlış</th><th>Boş</th><th>Puan</th><th>Dönem puanı</th><th>Not</th></tr></thead>
          <tbody>{v.satirlar.map(x => (
            <tr key={x.no}>
              <td>{x.no}</td><td>{x.ad}</td><td>{x.kitapcik}</td><td>{x.dogru}</td><td>{x.yanlis}</td><td>{x.bos}</td><td><b>{fmt(x.puan)}</b></td>
              <td style={x.donemPuani && x.donemPuani !== String(x.puan) ? { color: '#B42318', fontWeight: 700 } : undefined}>{x.donemPuani ? String(x.donemPuani).replace('.', ',') : '—'}</td>
              <td>{x.kaynak === 'Elle' ? 'Elle girildi' : x.uyari}{x.gorsel && <> {x.kaynak === 'Elle' || x.uyari ? '· ' : ''}<button type="button" className="btn-link" onClick={() => setAcik(acik === x.no ? null : x.no)}>{acik === x.no ? 'gizle' : 'optik'}</button></>}
                {(x.kaynak === 'Elle' || !x.gorsel) && <> {x.gorsel || x.kaynak === 'Elle' ? '· ' : ''}<label className="btn-link" style={{ cursor: 'pointer' }}>{yuklenen === x.no ? 'yükleniyor…' : x.gorsel ? 'görüntüyü değiştir' : 'görüntü ekle'}
                  <input type="file" accept="image/jpeg,image/png" hidden disabled={!!yuklenen} onChange={e => { gorselEkle(x.no, e.target.files?.[0]); e.target.value = ''; }} /></label></>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div></div>
      {acik && <img src={`/optik-gorsel/${s.kod}/${acik}`} alt={`${acik} optiği`} style={{ maxWidth: 'min(100%, 760px)', border: '1px solid #ccd', borderRadius: 8, marginTop: 8 }} />}
      <ListeTablosu baslik="Optiği olmayan öğrenciler (sınava girmemiş ya da henüz yüklenmemiş)" sayi={v.optiksizSayi} kolonlar={['Öğrenci No', 'Adı Soyadı', 'Sınıf']} satirlar={v.optiksiz.map(x => [x.no, x.ad, x.sinif])} />
      <ListeTablosu baslik="Bu sınavın listesinde olmayan optikler (puanı yazılmaz)" sayi={v.sinavdaYok.length} kolonlar={['Öğrenci No', 'Adı Soyadı']} satirlar={v.sinavdaYok.map(x => [x.no, x.ad])} />
      <div className="dosya-satir" style={{ marginTop: 12 }}>
        <label className="onay"><input type="checkbox" checked={uzerine} onChange={e => setUzerine(e.target.checked)} /><span>Dönem sınavında zaten farklı bir puanı olanların üzerine yaz (işaretlemezseniz mevcut puanlar korunur)</span></label>
      </div>
      <div className="dosya-satir">
        <button className="btn btn-primary" type="button" disabled={!v.satirlar.length || !!bekliyor} onClick={puanYaz}>{bekliyor === 'puan' ? 'Yazılıyor…' : `Puanları ${s.donemKod} · ${s.ders} dersine yaz`}</button>
        <button className={'btn ' + (s.yayinda ? 'btn-secondary' : 'btn-primary')} type="button" disabled={!!bekliyor || (!s.yayinda && !v.satirlar.length)} onClick={() => yayin(!s.yayinda)}>{s.yayinda ? 'Optik yayınını kapat' : 'Optikleri öğrencilere yayınla'}</button>
      </div>
      <div className="hint" style={{ textAlign: 'left' }}>Puanı dönem sınavına yazmak ile optiği yayınlamak ayrı işlemlerdir. Yayınlayınca öğrenci kendi optiğini, işaretlerini ve cevap anahtarını &quot;Sınavlarım&quot; bölümünde görür.{s.yayinda ? ' Şu an yayında.' : ''}</div>
    </div>
  );
}

/* ---------- Sekme ---------- */
export function OptikSekmesi() {
  const yukle = useCallback(() => optikDurumIslemi(), []);
  const { veri, setVeri, hata, yenile } = useVeri(yukle);
  const cagir = useCagir();
  const [kod, setKod] = useState('');
  const [mesaj, setMesaj] = useState<MesajDurumu>(null);
  const [sonuc, setSonuc] = useState<OptikSonuclari | null>(null);
  const [yeni, setYeni] = useState({ ad: '', donemKod: '', ders: '' });
  const [bekliyor, setBekliyor] = useState(false);

  const secili = veri?.setler.find(x => x.kod === kod) ?? null;
  useEffect(() => { if (veri && !secili && veri.setler.length) setKod(veri.setler[veri.setler.length - 1].kod); }, [veri, secili]);

  const sonuclariYukle = useCallback(async () => {
    if (!kod) { setSonuc(null); return; }
    const r = await cagir(optikSonuclarIslemi(kod));
    if (r.ok) setSonuc(r.veri); else setMesaj({ metin: r.hata, hata: true });
  }, [kod, cagir]);
  useEffect(() => { setSonuc(null); sonuclariYukle(); }, [sonuclariYukle]);
  const hepsiniYenile = useCallback(() => { yenile(); sonuclariYukle(); }, [yenile, sonuclariYukle]);

  if (hata) return <div className="hata-kutu" role="alert">{hata}</div>;
  if (!veri) return <Yukleniyor />;
  const donem = veri.donemler.find(d => d.kod === yeni.donemKod);

  async function olustur() {
    setBekliyor(true);
    const r = await cagir(optikSetOlusturIslemi(yeni));
    setBekliyor(false);
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setVeri(r.veri.durum); setKod(r.veri.kod); setYeni({ ad: '', donemKod: '', ders: '' }); setMesaj({ metin: 'Optik seti oluşturuldu. Şimdi cevap anahtarını yükleyin.' });
  }
  async function sil() {
    if (!secili || !confirm(`"${secili.ad}" seti, içindeki ${secili.kayit} optik ve görüntüleri kalıcı olarak silinecek. Dönem sınavındaki puanlara dokunulmaz.\n\nSilinsin mi?`)) return;
    const r = await cagir(optikSetSilIslemi(secili.kod));
    if (!r.ok) { setMesaj({ metin: r.hata, hata: true }); return; }
    setVeri(r.veri); setKod(''); setMesaj({ metin: 'Set silindi.' });
  }

  return (
    <div>
      <div className="adim">
        <div className="bolum-baslik">Optik cevap kâğıtları</div>
        <p className="aciklama">Bir dönem sınavı dersi için taranmış optikleri okur, cevap anahtarıyla notlar, puanları dönem sınavına yazar ve öğrencilere kendi optiklerini ve cevap anahtarını gösterir.</p>
        {veri.setler.length > 0 && (
          <div className="dosya-satir">
            <label>Optik seti <select value={kod} onChange={e => { setKod(e.target.value); setMesaj(null); }}>{veri.setler.map(x => <option key={x.kod} value={x.kod}>{x.kod} · {x.ad} ({x.donemKod} · {x.ders}){x.yayinda ? ' — yayında' : ''}</option>)}</select></label>
            {secili && <button className="btn btn-secondary" type="button" onClick={sil}>Seti sil</button>}
          </div>
        )}
        <details className="liste" open={!veri.setler.length}>
          <summary>Yeni optik seti oluştur</summary>
          <div className="dosya-satir" style={{ marginTop: 8 }}>
            <label>Ad <input type="text" maxLength={100} placeholder="Kıraat vize" value={yeni.ad} onChange={e => setYeni({ ...yeni, ad: e.target.value })} /></label>
            <label>Dönem sınavı <select value={yeni.donemKod} onChange={e => setYeni({ ...yeni, donemKod: e.target.value, ders: '' })}><option value="">— seçin —</option>{veri.donemler.map(d => <option key={d.kod} value={d.kod}>{d.kod} · {d.ad}</option>)}</select></label>
            <label>Ders <select value={yeni.ders} disabled={!donem} onChange={e => setYeni({ ...yeni, ders: e.target.value })}><option value="">— seçin —</option>{donem?.dersler.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
            <button className="btn btn-primary" type="button" disabled={bekliyor || !yeni.ad.trim() || !yeni.donemKod || !yeni.ders} onClick={olustur}>Oluştur</button>
          </div>
        </details>
      </div>
      <Mesaj m={mesaj} />
      {secili && (
        <>
          <AnahtarBolumu key={secili.kod + secili.soruSayisi} s={secili} mesaj={setMesaj} yenile={hepsiniYenile} />
          <YuklemeBolumu key={'y' + secili.kod} s={secili} mesaj={setMesaj} kaydedildi={hepsiniYenile} />
          <ElleBolumu key={'e' + secili.kod} s={secili} mesaj={setMesaj} kaydedildi={hepsiniYenile} />
          <SonucBolumu s={secili} v={sonuc} mesaj={setMesaj} yenile={hepsiniYenile} />
        </>
      )}
    </div>
  );
}
