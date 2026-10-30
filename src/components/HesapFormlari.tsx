'use client';

/** Kişisel hesap formları: giriş, öğrenci ve hoca hesabı oluşturma, şifre değiştirme, KVKK onayı (üç ekran ortak). */
import { startTransition, useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cikisIslemi, girisIslemi, hocaKayitIslemi, kvkkOnayIslemi, ogrenciKayitIslemi, sifreDegistirIslemi, type GirisDurumu } from '@/app/giris-islemleri';
import { KVKK_BASLIK, KVKK_BOLUMLER, KVKK_GIRIS, KVKK_ONAY_METNI } from '@/lib/kvkk';
import type { Sayfa } from '@/lib/oturum';

export const HF_CSS = `
.hf{display:flex; flex-direction:column; gap:12px; text-align:left;}
.hf label{display:block; font-size:13px; font-weight:600; margin:0 0 5px; color:inherit;}
.hf input, .hf select{width:100%; box-sizing:border-box; padding:11px 13px; border:1px solid #B4B8D0; border-radius:9px; font-size:15px; font-family:inherit; background:#fff; color:#1C1D3A;}
.hf input:focus, .hf select:focus{outline:none; border-color:#2F318D; box-shadow:0 0 0 3px rgba(47,49,141,.14);}
.hf .hf-not{font-size:12.5px; color:#5F6283; margin-top:4px; line-height:1.4;}
.hf button.hf-gonder{width:100%; border:0; border-radius:9px; padding:12px 18px; font-size:15px; font-weight:700; cursor:pointer; background:#2F318D; color:#fff; margin:4px 0 0; font-family:inherit;}
.hf button.hf-gonder:hover{background:#222470;}
.hf button.hf-gonder[disabled]{opacity:.65; cursor:progress;}
.hf-mesaj{min-height:18px; font-size:13.5px; color:#B42318;}
.hf-mesaj.ok{color:#1F6B43;}
.hf-sekme{display:flex; gap:6px; margin:0 0 16px; border-bottom:1px solid #D9DBE8;}
.hf-sekme button{flex:1; background:none; border:0; border-bottom:3px solid transparent; padding:10px 6px; font-size:14px; font-weight:600; color:#5F6283; cursor:pointer; font-family:inherit; margin:0; width:auto; box-shadow:none;}
.hf-sekme button[aria-selected=true]{color:#2F318D; border-bottom-color:#2F318D;}
.hf-baglanti{background:none; border:0; color:#2F318D; font-weight:600; cursor:pointer; padding:0; font-size:13px; text-decoration:underline; font-family:inherit; width:auto; margin:0; box-shadow:none;}
.hf-kutu{border:1px solid #D9DBE8; border-radius:12px; padding:16px; background:#fff; max-width:440px;}
.hf .hf-onay{display:flex; gap:10px; align-items:flex-start; font-size:13.5px; font-weight:500; line-height:1.45; cursor:pointer; margin:0;}
.hf .hf-onay input{width:18px; height:18px; flex:none; margin:1px 0 0; padding:0; accent-color:#2F318D; cursor:pointer;}
.kvkk{border:1px solid #D9DBE8; border-radius:12px; background:#F7F8FC; padding:14px 16px; text-align:left; color:#1C1D3A; font-size:13.5px; line-height:1.55;}
.kvkk.kaydir{max-height:340px; overflow-y:auto;}
.kvkk h2{font-size:16px; margin:0 0 6px; color:#2F318D;}
.kvkk h3{font-size:14px; margin:14px 0 4px; color:#2F318D;}
.kvkk p{margin:0 0 6px;}
.kvkk ul{margin:0 0 6px; padding-left:18px;}
.kvkk li{margin:0 0 5px;}
.kvkk-guven{display:flex; gap:10px; align-items:flex-start; background:#EEF7F1; border:1px solid #C6E3D0; border-radius:10px; padding:10px 12px; font-size:13px; line-height:1.45; color:#1F4D33; margin:0 0 10px; text-align:left;}
`;

/** Başarılı işlemden sonra sunucu sayfası yeniden çizilir (oturum açıldı / şifre değişti). */
function useYenile(d: GirisDurumu, sonra?: () => void) {
  const router = useRouter();
  useEffect(() => { if (d.ok) { router.refresh(); sonra?.(); } }, [d, router, sonra]);
}

/**
 * Form işlemle (action) gönderilince React formu sıfırlar; hatalı denemede kullanıcı her şeyi yeniden yazmak zorunda kalırdı.
 * Gönderim elle yapılır, yazılanlar korunur.
 */
const gonderici = (gonder: (f: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const f = new FormData(e.currentTarget);
  startTransition(() => gonder(f));
};

/** KVKK aydınlatma metni (kvkk.ts). */
export function KvkkMetni({ kaydir }: { kaydir?: boolean }) {
  return (
    <div className={'kvkk' + (kaydir ? ' kaydir' : '')} tabIndex={kaydir ? 0 : undefined} aria-label={KVKK_BASLIK}>
      <h2>{KVKK_BASLIK}</h2>
      <p>{KVKK_GIRIS}</p>
      {KVKK_BOLUMLER.map(b => (
        <section key={b.baslik}>
          <h3>{b.baslik}</h3>
          {b.paragraflar?.map((p, i) => <p key={i}>{p}</p>)}
          {b.maddeler && <ul>{b.maddeler.map((m, i) => <li key={i}>{m}</li>)}</ul>}
        </section>
      ))}
    </div>
  );
}

/** Şifre ve TC'nin nasıl korunduğunu tek bakışta anlatan kısa not. */
function GuvenNotu() {
  return (
    <div className="kvkk-guven">
      <span aria-hidden="true">🔒</span>
      <span>Şifren ve TC kimlik numaranın son haneleri geri çevrilemez biçimde şifrelenerek saklanır. Sunucular ele geçirilse bile kimse bunları okuyamaz; yöneticiler de göremez.</span>
    </div>
  );
}

function Mesaj({ d }: { d: GirisDurumu }) {
  return <div className={'hf-mesaj' + (d.ok ? ' ok' : '')} role={d.ok ? 'status' : 'alert'}>{d.mesaj}</div>;
}

export function GirisFormu({ sayfa, mesaj }: { sayfa: Sayfa; mesaj?: string }) {
  const [d, gonder, bekliyor] = useActionState<GirisDurumu, FormData>(girisIslemi.bind(null, sayfa), { mesaj: mesaj ?? '' });
  useYenile(d);
  const ogr = sayfa === 'ogrenci';
  return (
    <form onSubmit={gonderici(gonder)} className="hf">
      <div>
        <label htmlFor={'hfKimlik' + sayfa}>{ogr ? 'Öğrenci numarası' : 'E-posta'}</label>
        <input id={'hfKimlik' + sayfa} name="kimlik" type={ogr ? 'text' : 'email'} inputMode={ogr ? 'numeric' : 'email'} autoComplete="username" required autoFocus />
      </div>
      <div>
        <label htmlFor={'hfSifre' + sayfa}>Şifre</label>
        <input id={'hfSifre' + sayfa} name="sifre" type="password" autoComplete="current-password" required />
      </div>
      <button className="hf-gonder" type="submit" disabled={bekliyor}>{bekliyor ? 'Kontrol ediliyor…' : 'Giriş yap'}</button>
      <Mesaj d={d} />
    </form>
  );
}

export function OgrenciKayitFormu() {
  const [d, gonder, bekliyor] = useActionState<GirisDurumu, FormData>(ogrenciKayitIslemi, { mesaj: '' });
  const [metin, setMetin] = useState(false);
  useYenile(d);
  return (
    <form onSubmit={gonderici(gonder)} className="hf">
      <GuvenNotu />
      <div>
        <label htmlFor="okNo">Öğrenci numarası</label>
        <input id="okNo" name="no" type="text" inputMode="numeric" autoComplete="username" required autoFocus />
      </div>
      <div>
        <label htmlFor="okTc">TC kimlik numaranın son 6 hanesi</label>
        <input id="okTc" name="tc" type="text" inputMode="numeric" maxLength={6} placeholder="Örn: 123456" autoComplete="off" required />
        <div className="hf-not">TC kimlik numaranızın yalnızca son 6 rakamını yazın.</div>
      </div>
      <div>
        <label htmlFor="okSifre">Şifre belirle</label>
        <input id="okSifre" name="sifre" type="password" autoComplete="new-password" minLength={8} required />
        <div className="hf-not">En az 8 karakter; yalnızca rakam olmasın.</div>
      </div>
      <div>
        <label htmlFor="okTekrar">Şifre (tekrar)</label>
        <input id="okTekrar" name="tekrar" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <button type="button" className="hf-baglanti" aria-expanded={metin} onClick={() => setMetin(m => !m)}>{metin ? 'Metni gizle' : 'Kişisel verilerin hakkındaki metni oku'}</button>
        {metin && <div style={{ marginTop: 8 }}><KvkkMetni kaydir /></div>}
      </div>
      <label className="hf-onay"><input type="checkbox" name="kvkk" value="evet" required /><span>{KVKK_ONAY_METNI}</span></label>
      <button className="hf-gonder" type="submit" disabled={bekliyor}>{bekliyor ? 'Kontrol ediliyor…' : 'Hesabımı oluştur'}</button>
      <Mesaj d={d} />
    </form>
  );
}

export function HocaKayitFormu({ hocaAdlari }: { hocaAdlari: string[] }) {
  const [d, gonder, bekliyor] = useActionState<GirisDurumu, FormData>(hocaKayitIslemi, { mesaj: '' });
  if (d.ok) return <div className="hf"><div className="hf-mesaj ok" role="status">{d.mesaj}</div></div>;
  return (
    <form onSubmit={gonderici(gonder)} className="hf">
      <div><label htmlFor="hkAd">Adınız soyadınız</label><input id="hkAd" name="adSoyad" type="text" autoComplete="name" required autoFocus /></div>
      <div><label htmlFor="hkEposta">E-posta</label><input id="hkEposta" name="eposta" type="email" autoComplete="email" required /></div>
      <div>
        <label htmlFor="hkProgram">Ders programındaki adınız</label>
        <select id="hkProgram" name="hocaAdi" defaultValue="">
          <option value="">— Listede yok / bilmiyorum —</option>
          {hocaAdlari.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <div className="hf-not">Sirküleriniz ve yoklamalarınız bu adla eşleşir. Yönetici onaylarken kontrol eder.</div>
      </div>
      <div><label htmlFor="hkSifre">Şifre</label><input id="hkSifre" name="sifre" type="password" autoComplete="new-password" minLength={8} required /></div>
      <div><label htmlFor="hkTekrar">Şifre (tekrar)</label><input id="hkTekrar" name="tekrar" type="password" autoComplete="new-password" minLength={8} required /></div>
      <button className="hf-gonder" type="submit" disabled={bekliyor}>{bekliyor ? 'Gönderiliyor…' : 'Hesap oluştur'}</button>
      <Mesaj d={d} />
    </form>
  );
}

export function SifreDegistirFormu({ sayfa, zorunlu, kapat }: { sayfa: Sayfa; zorunlu?: boolean; kapat?: () => void }) {
  const [d, gonder, bekliyor] = useActionState<GirisDurumu, FormData>(sifreDegistirIslemi.bind(null, sayfa), { mesaj: '' });
  useYenile(d, kapat);
  return (
    <form onSubmit={gonderici(gonder)} className="hf">
      {zorunlu && <div className="hf-not" style={{ fontSize: 14 }}>Yöneticinin verdiği geçici şifreyle girdiniz. Devam etmek için kendi şifrenizi belirleyin.</div>}
      <div><label htmlFor={'sdEski' + sayfa}>{zorunlu ? 'Geçici şifre' : 'Mevcut şifre'}</label><input id={'sdEski' + sayfa} name="eski" type="password" autoComplete="current-password" required autoFocus={zorunlu} /></div>
      <div><label htmlFor={'sdYeni' + sayfa}>Yeni şifre</label><input id={'sdYeni' + sayfa} name="yeni" type="password" autoComplete="new-password" minLength={8} required /></div>
      <div><label htmlFor={'sdTekrar' + sayfa}>Yeni şifre (tekrar)</label><input id={'sdTekrar' + sayfa} name="tekrar" type="password" autoComplete="new-password" minLength={8} required /></div>
      <button className="hf-gonder" type="submit" disabled={bekliyor}>{bekliyor ? 'Kaydediliyor…' : 'Şifreyi değiştir'}</button>
      <Mesaj d={d} />
    </form>
  );
}

/** Hesabı olup güncel KVKK metnini onaylamamış öğrenci: onay vermeden sistemi kullanamaz. */
export function KvkkOnayFormu() {
  const [d, gonder, bekliyor] = useActionState<GirisDurumu, FormData>(kvkkOnayIslemi, { mesaj: '' });
  useYenile(d);
  return (
    <>
      <GuvenNotu />
      <KvkkMetni kaydir />
      <form onSubmit={gonderici(gonder)} className="hf" style={{ marginTop: 14 }}>
        <label className="hf-onay"><input type="checkbox" name="kvkk" value="evet" required /><span>{KVKK_ONAY_METNI}</span></label>
        <button className="hf-gonder" type="submit" disabled={bekliyor}>{bekliyor ? 'Kaydediliyor…' : 'Onaylıyorum, devam et'}</button>
        <Mesaj d={d} />
      </form>
      <form action={cikisIslemi.bind(null, 'ogrenci')} style={{ textAlign: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 13, color: '#5F6283' }}>Onay vermeden sistemi kullanamazsın. </span>
        <button type="submit" className="hf-baglanti">Çıkış yap</button>
      </form>
    </>
  );
}

/** Giriş ve hesap oluşturma sekmeleri. */
export function GirisVeKayit({ giris, kayit, kayitEtiket = 'Hesap oluştur' }: { giris: React.ReactNode; kayit: React.ReactNode; kayitEtiket?: string }) {
  const [sekme, setSekme] = useState<'giris' | 'kayit'>('giris');
  return (
    <>
      <style>{HF_CSS}</style>
      <div className="hf-sekme" role="tablist">
        <button type="button" role="tab" aria-selected={sekme === 'giris'} onClick={() => setSekme('giris')}>Giriş yap</button>
        <button type="button" role="tab" aria-selected={sekme === 'kayit'} onClick={() => setSekme('kayit')}>{kayitEtiket}</button>
      </div>
      {sekme === 'giris' ? giris : kayit}
    </>
  );
}

/** Oturum açıkken: kimin girdiği, "Şifremi değiştir" ve çıkış. */
export function HesapCubugu({ sayfa, kim, butonSinifi = '' }: { sayfa: Sayfa; kim: string; butonSinifi?: string }) {
  const [acik, setAcik] = useState(false);
  return (
    <div style={{ textAlign: 'center', marginTop: 14 }}>
      <style>{HF_CSS}</style>
      <div style={{ fontSize: 13, color: '#5F6283', marginBottom: 8 }}>{kim} olarak giriş yapıldı · <button type="button" className="hf-baglanti" onClick={() => setAcik(a => !a)}>{acik ? 'Vazgeç' : 'Şifremi değiştir'}</button></div>
      {acik && <div className="hf-kutu" style={{ margin: '0 auto 12px' }}><SifreDegistirFormu sayfa={sayfa} kapat={() => setAcik(false)} /></div>}
      <form action={cikisIslemi.bind(null, sayfa)}><button type="submit" className={butonSinifi} style={{ width: 'auto' }}>Çıkış yap</button></form>
    </div>
  );
}
