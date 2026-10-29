/**
 * İmza sirküsü kuralları (saf, test edilebilir). Kaynak: Code.gs haftalikSirku_, getManualAttendance, Hoca.html sirkuBol.
 * Hem sunucu hem tarayıcı kullanır.
 */
import { KullaniciHatasi } from './hata';
import { basNorm, subeEslestir, TR_GUN_SIRA } from './metin';

export type OgrenciSatiri = { no: string; adi: string; soyadi: string };
export type SirkuDersi = { saat: string; ders: string; derslik: string; gun: string };
export type SirkuSubesi = {
  name: string;
  students: OgrenciSatiri[];
  dates: Record<string, SirkuDersi[]>;   // "dd.MM.yyyy" → o günün dersleri
  lessonNames: string[];
  origDate?: string; origTime?: string; manualDate?: string; manualTime?: string;
};
export type HaftalikSirku = { teacher: string; weekStart: string; sections: Record<string, SirkuSubesi>; isManual?: boolean };
export type TopluSirku = { weekStart: string; hocalar: { teacher: string; sections: Record<string, SirkuSubesi> }[] };
export type ProgramKaydi = { hoca: string; ders: string; gun: string; saat: string; sube: string; derslik: string };
export type SinifOgrencili = { ad: string; anahtar: string; derslik: string; ogrenciler: OgrenciSatiri[] };

const iki = (n: number) => String(n).padStart(2, '0');
/** Takvim günleri UTC üzerinden hesaplanır; saat dilimi kayması olmaz. */
export const tarihTR = (d: Date) => iki(d.getUTCDate()) + '.' + iki(d.getUTCMonth() + 1) + '.' + d.getUTCFullYear();
export const isoTarih = (iso: string) => { const [y, m, g] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, g)); };
const gunEkle = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
export const isoMu = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s ?? ''));

/** Seçilen gün pazartesi değilse o haftanın pazartesisi. */
export function haftaBasi(iso: string): Date {
  if (!isoMu(iso)) throw new KullaniciHatasi('Hafta başı tarihi seçilmedi.');
  const d = isoTarih(iso);
  return gunEkle(d, -((d.getUTCDay() + 6) % 7));
}

export function benzersiz(dizi: string[]): string[] {
  return [...new Set(dizi.filter(Boolean))];
}

/** Bir hocanın verilen haftadaki derslerini şubelere göre toplar (tek hoca ve toplu sirkü ortak çekirdeği). */
export function haftalikSirku(teacher: string, weekStart: Date, siniflar: SinifOgrencili[], program: ProgramKaydi[]): Record<string, SirkuSubesi> {
  const tarihler: Record<string, Record<string, SirkuDersi[]>> = {};
  const dersler: Record<string, Set<string>> = {};
  siniflar.forEach(s => { tarihler[s.anahtar] = {}; dersler[s.anahtar] = new Set(); });
  const hn = basNorm(teacher);
  for (const p of program) {
    if (basNorm(p.hoca) !== hn) continue;
    const off = TR_GUN_SIRA[basNorm(p.gun)];
    if (off == null) continue;
    const s = subeEslestir(p.sube, siniflar);
    if (!s) continue;
    const g = tarihTR(gunEkle(weekStart, off));
    (tarihler[s.anahtar][g] ??= []).push({ saat: p.saat, ders: p.ders, derslik: p.derslik, gun: p.gun });
    if (p.ders) dersler[s.anahtar].add(p.ders);
  }
  const out: Record<string, SirkuSubesi> = {};
  for (const s of siniflar) {
    Object.values(tarihler[s.anahtar]).forEach(l => l.sort((a, b) => a.saat.localeCompare(b.saat, 'tr')));
    out[s.anahtar] = { name: s.ad, students: s.ogrenciler, dates: tarihler[s.anahtar], lessonNames: [...dersler[s.anahtar]] };
  }
  return out;
}

export type TelafiGirdisi = { lesson: string; date: string; origDate?: string; origTime?: string; time?: string };

/** Telafi / manuel sirkü: her şube için tek tarihli evrak. */
export function telafiSirkusu(teacher: string, veri: Record<string, TelafiGirdisi>, siniflar: SinifOgrencili[]): HaftalikSirku {
  const harita = new Map(siniflar.map(s => [s.anahtar, s]));
  const sections: Record<string, SirkuSubesi> = {};
  let ilkTarih = '';
  for (const [k, d] of Object.entries(veri)) {
    const s = harita.get(k);
    if (!s || !d || !isoMu(d.date)) continue;
    const g = tarihTR(isoTarih(d.date));
    if (!ilkTarih) ilkTarih = g;
    sections[k] = {
      name: s.ad, students: s.ogrenciler,
      dates: { [g]: [{ saat: d.time || '', ders: d.lesson || 'Telafi', derslik: 'Telafi/Manuel', gun: '' }] },
      lessonNames: [d.lesson || 'Telafi'],
      origDate: isoMu(d.origDate) ? tarihTR(isoTarih(d.origDate!)) : '',
      origTime: d.origTime || '', manualDate: g, manualTime: d.time || ''
    };
  }
  if (!Object.keys(sections).length) throw new KullaniciHatasi('Seçilen şubeler bulunamadı. Sayfayı yenileyip tekrar deneyin.');
  return { teacher: teacher.trim(), weekStart: ilkTarih, sections, isManual: true };
}

/* ---------- Çok sayfalı sirkü ---------- */
export const SIRKU_SAYFA_BASI = 45;    // bir A4 sayfadaki en çok öğrenci (90 öğrenci = ön + arka)
export const SIRKU_EN_AZ_SATIR = 20;   // tek sayfalık evrakta en az satır (küçük sınıflarda geniş imza alanı)
export const SIRKU_N_EN_AZ = 10;
export type SirkuDuzen = { mod: 'oto' | 'n'; n: number };

/** Öğrencileri sayfalara böler: otomatikte eşit (46 → 23+23), "en çok N" seçiminde önce doldurarak (45, N=30 → 30+15). */
export function sirkuBol<T>(ogr: T[], duzen: SirkuDuzen): { ogrenciler: T[]; satir: number }[] {
  const n = ogr.length;
  if (duzen.mod === 'n' && n > duzen.n) {
    const out = [];
    for (let i = 0; i < n; i += duzen.n) out.push({ ogrenciler: ogr.slice(i, i + duzen.n), satir: duzen.n });
    return out;
  }
  const sayfa = Math.max(1, Math.ceil(n / SIRKU_SAYFA_BASI));
  if (sayfa === 1) return [{ ogrenciler: ogr.slice(), satir: Math.max(n, SIRKU_EN_AZ_SATIR) }];
  const taban = Math.floor(n / sayfa), artan = n % sayfa, enCok = taban + (artan ? 1 : 0);
  const out = [];
  let i = 0;
  for (let k = 0; k < sayfa; k++) {
    const m = taban + (k < artan ? 1 : 0);
    out.push({ ogrenciler: ogr.slice(i, i + m), satir: enCok });
    i += m;
  }
  return out;
}

/** "dd.MM.yyyy" tarihlerini kronolojik sıralar. */
export const tarihSirala = (arr: string[]) =>
  arr.slice().sort((a, b) => a.split('.').reverse().join('').localeCompare(b.split('.').reverse().join('')));
