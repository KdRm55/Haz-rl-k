'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { haftalikIslemi, programIslemi, telafiIslemi, topluIslemi } from '@/app/hoca/islemler';
import type { Sonuc } from '@/lib/islem-sonucu';
import { HesapCubugu } from '@/components/HesapFormlari';
import { ProgramA4Stil, ProgramCiktiDugmeleri, ProgramOnizleme, useProgramCikti, YonSecici } from '@/components/ProgramA4';
import type { HocaBaslangic, HocaProgramSatiri } from '@/lib/hoca';
import type { TelafiGirdisi } from '@/lib/sirku-kurallari';
import type { ProgramSecenek } from '@/lib/yazdirma/program-a4';
import { DonemSekmesi } from '@/components/yonetim/DonemSekmesi';
import { OturumDustu } from '@/components/yonetim/ortak';
import { kapsamliCss, YONETIM_CSS } from '@/components/yonetim/stil';
import { YoklamaHoca } from '@/components/yoklama/YoklamaHoca';
import { HocaKabuk } from './Kabuk';
import { SirkuSonuc, type SirkuVerisi } from './SirkuSonuc';

type Sekme = 'auto' | 'manual' | 'program' | 'yoklama' | 'sinav';
const TUMU = '__TUMU__';

/** Yerel saate göre bu haftanın pazartesisi. */
function pazartesiISO() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function HocaSecimi({ id, hocalar, deger, degisti, tumu }: { id: string; hocalar: string[]; deger: string; degisti: (v: string) => void; tumu?: boolean }) {
  return (
    <select id={id} value={deger} onChange={e => degisti(e.target.value)}>
      <option value="">— Seçin —</option>
      {tumu && hocalar.length > 1 && <option value={TUMU}>— Tüm öğretim elemanları —</option>}
      {hocalar.map(h => <option key={h} value={h}>{h}</option>)}
    </select>
  );
}

/* ---------- Telafi / manuel giriş ---------- */
type TelafiSatiri = { lesson: string; origDate: string; origTime: string; date: string; time: string };
const bosTelafi: TelafiSatiri = { lesson: '', origDate: '', origTime: '', date: '', time: '' };

/** Hoca hesabında tek ad vardır (kendi adı); seçili gelir. */
const ilkHoca = (hocalar: string[]) => (hocalar.length === 1 ? hocalar[0] : '');

function TelafiPaneli({ b, sonuc }: { b: HocaBaslangic; sonuc: (s: SirkuVerisi | string) => void }) {
  const [hoca, setHoca] = useState(ilkHoca(b.hocalar));
  const [secili, setSecili] = useState<string[]>(b.subeler[0] ? [b.subeler[0].key] : []);
  const [satirlar, setSatirlar] = useState<Record<string, TelafiSatiri>>({});
  const [bekliyor, setBekliyor] = useState(false);
  const alan = (k: string) => satirlar[k] ?? bosTelafi;
  const yaz = (k: string, f: keyof TelafiSatiri, v: string) => setSatirlar(s => ({ ...s, [k]: { ...alan(k), [f]: v } }));

  async function olustur() {
    if (!hoca) { alert('Öğretim elemanı seçin.'); return; }
    if (!secili.length) { alert('En az bir şube seçin.'); return; }
    const veri: Record<string, TelafiGirdisi> = {};
    for (const k of secili) {
      const a = alan(k), ad = b.subeler.find(x => x.key === k)?.name ?? k;
      if (!a.lesson || !a.date) { alert(`${ad} için "Ders" ve "Telafi tarihi" alanlarını doldurun.`); return; }
      veri[k] = { lesson: a.lesson, date: a.date, origDate: a.origDate, origTime: a.origTime.trim(), time: a.time.trim() };
    }
    setBekliyor(true);
    const r = await telafiIslemi(hoca, veri);
    setBekliyor(false);
    sonuc(r.ok ? { tur: 'tek', veri: r.veri } : r.hata);
  }

  return (
    <>
      <h2 className="panel-title">Telafi veya özel ders evrakı</h2>
      <p className="panel-desc">Telafi yapılacak şubeleri işaretleyin; her şube için ders ve tarih bilgilerini girin.</p>
      <div className="field" style={{ marginBottom: 20 }}>
        <label htmlFor="manTeacher">Öğretim elemanı</label>
        <HocaSecimi id="manTeacher" hocalar={b.hocalar} deger={hoca} degisti={setHoca} />
      </div>
      <div className="field" style={{ marginBottom: 20 }}>
        <label>Şubeler</label>
        <div className="sube-picker">
          {b.subeler.length ? b.subeler.map(s => (
            <label key={s.key} className="sube-chip">
              <input type="checkbox" checked={secili.includes(s.key)}
                onChange={e => setSecili(l => e.target.checked ? [...l, s.key] : l.filter(x => x !== s.key))} />
              {s.name}
            </label>
          )) : <span className="error-note">Hiç aktif sınıf yok. Yönetim panelinden sınıfları kontrol edin.</span>}
        </div>
      </div>
      <datalist id="timeOptions">{b.saatler.map(s => <option key={s} value={s} />)}</datalist>
      {b.subeler.filter(s => secili.includes(s.key)).map(s => {
        const a = alan(s.key), id = (f: string) => `${f}-${s.key}`;
        return (
          <div key={s.key} className="sube-block">
            <h4>{s.name}</h4>
            <div className="grid">
              <div className="field"><label htmlFor={id('ders')}>Ders</label>
                <select id={id('ders')} value={a.lesson} onChange={e => yaz(s.key, 'lesson', e.target.value)}>
                  <option value="">— Seçin —</option>{b.dersler.map(d => <option key={d} value={d}>{d}</option>)}
                </select></div>
              <div className="field"><label htmlFor={id('asilTarih')}>Asıl ders tarihi</label><input type="date" id={id('asilTarih')} value={a.origDate} onChange={e => yaz(s.key, 'origDate', e.target.value)} /></div>
              <div className="field"><label htmlFor={id('asilSaat')}>Asıl ders saati</label><input type="text" id={id('asilSaat')} list="timeOptions" placeholder="Örn: 09:00 - 10:30" value={a.origTime} onChange={e => yaz(s.key, 'origTime', e.target.value)} /></div>
              <div className="field"><label htmlFor={id('tarih')}>Telafi tarihi</label><input type="date" id={id('tarih')} value={a.date} onChange={e => yaz(s.key, 'date', e.target.value)} /></div>
              <div className="field"><label htmlFor={id('saat')}>Telafi saati</label><input type="text" id={id('saat')} list="timeOptions" placeholder="Örn: 13:00 - 14:30" value={a.time} onChange={e => yaz(s.key, 'time', e.target.value)} /></div>
            </div>
          </div>
        );
      })}
      <div className="field actions">
        <button className="btn btn-primary" type="button" onClick={olustur} disabled={bekliyor}>{bekliyor ? 'Oluşturuluyor…' : 'Seçilen şubeler için oluştur'}</button>
      </div>
    </>
  );
}

/* ---------- Ders programım ---------- */
function ProgramPaneli({ hocalar, yetkiHatasi }: { hocalar: string[]; yetkiHatasi: (r: Sonuc<unknown>) => boolean }) {
  const [hoca, setHoca] = useState(ilkHoca(hocalar));
  const [bekliyor, setBekliyor] = useState(false);
  const [veri, setVeri] = useState<{ teacher: string; program: HocaProgramSatiri[] } | string | null>(null);
  const { yon, setYon, logo } = useProgramCikti();

  async function goster(h = hoca) {
    if (!h) { alert('Öğretim elemanı seçin.'); return; }
    setBekliyor(true);
    const r = await programIslemi(h);
    setBekliyor(false);
    if (yetkiHatasi(r)) return;
    setVeri(r.ok ? r.veri : r.hata);
  }

  const o = useMemo<ProgramSecenek | null>(() => {
    if (!veri || typeof veri === 'string') return null;
    const subeler = [...new Set(veri.program.map(x => x.sube).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    const gun = new Set(veri.program.map(x => x.gun)).size;
    return { tur: 'hoca', yon, kim: veri.teacher, alt: subeler.join(' · '), program: veri.program, logo,
      ozet: [veri.program.length + ' ders', gun + ' gün', subeler.length + ' şube'] };
  }, [veri, yon, logo]);

  return (
    <>
      <h2 className="panel-title">Haftalık ders programı</h2>
      <p className="panel-desc">Öğretim elemanını seçin. Program ekranda görünür; A4 yatay olarak yazdırabilir ya da PDF indirebilirsiniz.</p>
      <div className="grid">
        <div className="field"><label htmlFor="prgHoca">Öğretim elemanı</label>
          <HocaSecimi id="prgHoca" hocalar={hocalar} deger={hoca} degisti={v => { setHoca(v); if (v) goster(v); }} /></div>
        <div className="field"><button className="btn btn-primary" type="button" onClick={() => goster()} disabled={bekliyor}>{bekliyor ? 'Yükleniyor…' : 'Programı göster'}</button></div>
      </div>
      <div style={{ marginTop: 22 }}>
        {typeof veri === 'string' && <div className="empty-note">{veri}</div>}
        {veri && typeof veri !== 'string' && !veri.program.length &&
          <div className="empty-note">{veri.teacher} için programda ders bulunamadı. Ders programındaki ad yazımını kontrol edin.</div>}
        {o && o.program.length > 0 && (
          <>
            <ProgramA4Stil />
            <div className="prg-eylem">
              <div><strong>{o.kim}</strong><div className="muted-note">A4 {yon === 'dikey' ? 'dikey' : 'yatay'} · yazdırmaya ve PDF&apos;e hazır</div></div>
              <div className="pab-dugmeler" style={{ alignItems: 'center' }}>
                <YonSecici yon={yon} degisti={setYon} />
                <ProgramCiktiDugmeleri o={o} ad={'Ders Programı - ' + o.kim} dugmeSinifi="btn btn-primary" ikincilSinif="btn btn-secondary" durumSinifi="pdf-durum" />
              </div>
            </div>
            <div style={{ margin: '0 auto', maxWidth: yon === 'dikey' ? 560 : undefined }}><ProgramOnizleme o={o} /></div>
          </>
        )}
      </div>
    </>
  );
}

/* ---------- Sınavlarım: yönetimin dönem sınavı ekranı, öğretim elemanının dersleriyle sınırlı (yetki sunucuda) ---------- */
// Hoca sayfasının düğmeleri tam genişlik; yönetim kartında içerik genişliğinde kalır
const SINAV_CSS = kapsamliCss(YONETIM_CSS, '.ykap') + '.ykap{color:#1e293b;} .ykap .btn{width:auto; margin:0;}';

/* ---------- Ana ekran ---------- */
export function HocaEkrani({ b, kim }: { b: HocaBaslangic; kim: string }) {
  const router = useRouter();
  const [sekme, setSekme] = useState<Sekme>('auto');
  const [hoca, setHoca] = useState(ilkHoca(b.hocalar));
  const [hafta, setHafta] = useState(pazartesiISO);
  const [bekliyor, setBekliyor] = useState(false);
  const [sonuc, setSonucHam] = useState<SirkuVerisi | string | null>(null);
  const [surum, setSurum] = useState(0);   // her yeni sonuçta sirkü alanı baştan kurulur
  const setSonuc = (s: SirkuVerisi | string | null) => { setSonucHam(s); setSurum(n => n + 1); };

  /** Oturum düştüyse sayfa yenilenir ve giriş ekranı açılır. */
  const yetkiHatasi = (r: Sonuc<unknown>) => {
    if (!r.ok && r.yetkisiz) { router.refresh(); return true; }
    return false;
  };

  async function olustur() {
    if (!hoca || !hafta) { alert('Öğretim elemanı ve hafta başı seçin.'); return; }
    setBekliyor(true);
    const r = hoca === TUMU ? await topluIslemi(hafta) : await haftalikIslemi(hoca, hafta);
    setBekliyor(false);
    if (yetkiHatasi(r)) return;
    if (!r.ok) { setSonuc(r.hata); return; }
    setSonuc('hocalar' in r.veri ? { tur: 'toplu', veri: r.veri } : { tur: 'tek', veri: r.veri });
  }

  const sekmeSec = (s: Sekme) => { setSekme(s); setSonuc(null); };
  const SEKMELER: [Sekme, string][] = [['auto', 'Haftalık programdan'], ['manual', 'Telafi / manuel giriş'], ['program', 'Ders programım'], ['yoklama', 'Yoklama'], ['sinav', 'Sınavlarım']];

  return (
    <HocaKabuk>
      <div className="workspace">
        {b.rol === 'admin' && (
          <div className="yonetici-modu" role="note">
            <strong>Yönetici modu.</strong> Yönetici hesabıyla girdiğiniz için bütün öğretim elemanlarının derslerini, yoklamalarını ve sınavlarını görür ve değiştirebilirsiniz.
            Bir hocanın yalnızca kendi derslerini gördüğü ekran için o hocanın hesabıyla girin; hocanın dersleri yönetim panelindeki &quot;Kullanıcılar&quot; sekmesinden atanır.
          </div>
        )}
        <div className="tabs-wrapper" role="tablist">
          {SEKMELER.map(([k, et]) => (
            <button key={k} type="button" role="tab" aria-selected={sekme === k} className={'tab-btn' + (sekme === k ? ' active' : '')} onClick={() => sekmeSec(k)}>{et}</button>
          ))}
        </div>

        {sekme === 'auto' && (
          <div className="panel active">
            <h2 className="panel-title">Haftalık yoklama evrakı oluştur</h2>
            <p className="panel-desc">Öğretim elemanını ve haftayı seçin. Seçtiğiniz gün pazartesi değilse o haftanın pazartesisi esas alınır. Programdaki her şube için ayrı bir A4 evrak hazırlanır.</p>
            {!b.hocalar.length && <div className="empty-note" style={{ marginBottom: 16 }}>{b.rol === 'hoca' ? 'Hesabınız ders programındaki bir adla eşleştirilmemiş. Yöneticiden hesabınızı düzenlemesini isteyin.' : 'Ders programında hiç öğretim elemanı bulunamadı. Yönetim panelinden ders programını kontrol edin.'}</div>}
            <div className="grid">
              <div className="field"><label htmlFor="selHoca">Öğretim elemanı</label><HocaSecimi id="selHoca" hocalar={b.hocalar} deger={hoca} degisti={setHoca} tumu /></div>
              <div className="field"><label htmlFor="inpDate">Hafta başı (pazartesi)</label><input type="date" id="inpDate" value={hafta} onChange={e => setHafta(e.target.value)} /></div>
              <div className="field"><button className="btn btn-primary" type="button" onClick={olustur} disabled={bekliyor}>{bekliyor ? 'Oluşturuluyor…' : 'Sirküleri oluştur'}</button></div>
            </div>
          </div>
        )}
        {sekme === 'manual' && <div className="panel active"><TelafiPaneli b={b} sonuc={setSonuc} /></div>}
        {sekme === 'program' && <div className="panel active"><ProgramPaneli hocalar={b.hocalar} yetkiHatasi={yetkiHatasi} /></div>}
        {sekme === 'sinav' && (
          <div className="panel active">
            <OturumDustu.Provider value={() => router.refresh()}>
              <div className="ykap"><style>{SINAV_CSS}</style><DonemSekmesi hocaSecimi={b.rol === 'admin' ? b.hocalar : undefined} /></div>
            </OturumDustu.Provider>
          </div>
        )}
        {sekme === 'yoklama' && (
          <div className="panel active">
            <OturumDustu.Provider value={() => router.refresh()}><YoklamaHoca b={b} yetkiHatasi={yetkiHatasi} /></OturumDustu.Provider>
          </div>
        )}
      </div>

      <div className="sections">
        {typeof sonuc === 'string' && <div className="empty-note">{sonuc}</div>}
        {sonuc && typeof sonuc !== 'string' && <SirkuSonuc key={surum} s={sonuc} rol={b.rol} />}
      </div>

      <HesapCubugu sayfa="hoca" kim={kim} butonSinifi="btn btn-secondary" />
    </HocaKabuk>
  );
}
