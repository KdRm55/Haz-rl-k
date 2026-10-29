/** Öğrenci sorgusunun saf kuralları (veritabanına dokunmaz, test edilebilir). Kaynak: Code.gs, Duyuru.gs, OgrenciGorunum.gs */
import { OG_BOLUM_TANIMLARI } from './ayar-tanimlari';
import { basNorm, subeEslestir, TR_GUN_SIRA } from './metin';
import type { Gorunum, OgrenciAyarlari, ProgramSatiri, SorguSonucu } from './tipler';

export function ogrenciAyarlari(a: Record<string, string>): OgrenciAyarlari {
  const proliz = basNorm(a.OGRENCI_DOGRULAMA) === 'EVET';
  const hane = parseInt(a.DOGRULAMA_HANE ?? '', 10);
  return {
    dogrulama: proliz || !!a.DOGRULAMA_SUTUNU,
    kaynak: proliz ? 'proliz' : 'sayfa',
    etiket: a.DOGRULAMA_ETIKETI || (proliz ? 'TC kimlik numaranızın son 4 hanesi' : 'Doğrulama bilgisi'),
    hane: proliz ? 4 : isNaN(hane) || hane < 0 ? 0 : hane
  };
}

export function dogrulamaEslesir(kayit: string, girilen: string, hane: number): boolean {
  const k = basNorm(kayit).replace(/\s+/g, '');
  const g = basNorm(girilen).replace(/\s+/g, '');
  if (!k || !g) return false;
  if (hane > 0) return g.length === hane && k.length >= hane && k.slice(-hane) === g;
  return k === g;
}

export const HEDEF = { HERKES: 'Herkes', HAZIRLIK: 'Hazırlık öğrencileri', MUAF: 'Muaf öğrenciler', BELIRSIZ: 'Sınıfı henüz belli olmayanlar' };

/** Duyuru bugün yayında mı? Tarihler 'YYYY-MM-DD'; bitiş günü dahil. */
export function duyuruGecerli(d: { aktif: boolean; baslangic: string | null; bitis: string | null }, bugun: string): boolean {
  if (!d.aktif) return false;
  if (d.baslangic && bugun < d.baslangic) return false;
  if (d.bitis && bugun > d.bitis) return false;
  return true;
}

/** Öğrenci türüne göre hedef eşleşmesi. */
export function duyuruHedefUyar(kime: string, tur: 'sinif' | 'muaf' | 'bekliyor', sinif: string): boolean {
  const k = basNorm(kime);
  if (k === basNorm(HEDEF.HAZIRLIK)) return tur === 'sinif' || tur === 'bekliyor';
  if (k === basNorm(HEDEF.MUAF)) return tur === 'muaf';
  if (k === basNorm(HEDEF.BELIRSIZ)) return tur === 'bekliyor';
  return tur === 'sinif' && !!sinif && k === basNorm(sinif);
}

type Sinif = { ad: string; anahtar: string; derslik: string };
type ProgramKaydi = { hoca: string; ders: string; gun: string; saat: string; sube: string; derslik: string };

/** Bir sınıfın haftalık ders programı, gün ve saat sırasıyla. */
export function sinifProgrami(sinifAd: string, siniflar: Sinif[], program: ProgramKaydi[]): ProgramSatiri[] {
  return program
    .map(p => ({ p, s: subeEslestir(p.sube, siniflar), sira: TR_GUN_SIRA[basNorm(p.gun)] }))
    .filter(x => x.s && x.s.ad === sinifAd && x.sira != null)
    .sort((a, b) => a.sira - b.sira || a.p.saat.localeCompare(b.p.saat, 'tr'))
    .map(({ p, s }) => ({ gun: p.gun, saat: p.saat, ders: p.ders, hoca: p.hoca, derslik: p.derslik || s!.derslik || '' }));
}

/** Yalnızca "Hayır" yazılan bölüm kapanır; anahtar yoksa açık sayılır. */
export function gorunum(a: Record<string, string>): Gorunum {
  const g = {} as Gorunum;
  for (const b of OG_BOLUM_TANIMLARI) g[b.ad] = basNorm(a[b.anahtar] ?? '') !== 'HAYIR';
  return g;
}

/** Kapalı bölümlerin verisi yanıttan çıkarılır; öğrencinin tarayıcısına hiç gönderilmez. */
export function gorunumUygula(r: SorguSonucu): SorguSonucu {
  if (!r.bulundu) return r;
  const g = r.gorunum;
  const o = { ...r };
  if (o.tur === 'sinif') {
    if (!g.sinif) o.sinif = '';
    if (!g.derslik) { o.derslik = ''; o.program = o.program.map(x => ({ ...x, derslik: '' })); }
    if (!g.program) o.program = [];
    if (!g.devamsizlik) o.devamsizlik = null;
  }
  if (!g.sinavlar) {
    // Muafiyet sonucu kendi ayarıyla yönetilir: yalnızca durum mesajı için sonuç kalır; sınav yerleri ve dönem sınavları gönderilmez
    o.sinav = r.sinav?.sonuc ? { yer: '', sonuc: r.sinav.sonuc, yayinda: r.sinav.yayinda } : null;
    o.sinavYerleri = [];
    if (o.tur === 'sinif') o.donemSinavlari = null;
  }
  if (!g.duyurular) o.duyurular = [];
  return o;
}
