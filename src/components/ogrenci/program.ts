/** Ders programını günlere ve saat dilimlerine göre düzenler (Index.html programDuzenle karşılığı). */
import type { ProgramSatiri } from '@/lib/tipler';

export const GUN_SIRA = ['PAZARTESI', 'SALI', 'CARSAMBA', 'PERSEMBE', 'CUMA', 'CUMARTESI', 'PAZAR'];
export const GUN_KISA: Record<string, string> = { PAZARTESI: 'Pzt', SALI: 'Sal', CARSAMBA: 'Çar', PERSEMBE: 'Per', CUMA: 'Cum', CUMARTESI: 'Cmt', PAZAR: 'Paz' };
export const GUN_ADI: Record<string, string> = { PAZARTESI: 'Pazartesi', SALI: 'Salı', CARSAMBA: 'Çarşamba', PERSEMBE: 'Perşembe', CUMA: 'Cuma', CUMARTESI: 'Cumartesi', PAZAR: 'Pazar' };

export function trAnahtar(s: string) {
  return String(s || '').toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ç/g, 'C')
    .replace(/Ğ/g, 'G').replace(/Ü/g, 'U').replace(/Ö/g, 'O').replace(/\s+/g, ' ').trim();
}
const saatAnahtar = (s: string) => String(s || '').replace(/\s+/g, '').replace(/[–—−]/g, '-');
export function dakika(s: string) { const m = String(s || '').match(/(\d{1,2})[.:](\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : 9999; }
export function bitisDakika(s: string) { const m = String(s || '').match(/(\d{1,2})[.:](\d{2})\D+(\d{1,2})[.:](\d{2})/); return m ? Number(m[3]) * 60 + Number(m[4]) : dakika(s) + 45; }
export const bugunAnahtar = () => GUN_SIRA[(new Date().getDay() + 6) % 7];

export type DuzenliProgram = {
  gunler: string[];
  slotlar: string[];
  slotAd: Record<string, string>;
  hucre: Record<string, ProgramSatiri[]>;
  tekDerslik: string;
};

export function programDuzenle(p: ProgramSatiri[]): DuzenliProgram {
  const gunler: string[] = [], slotlar: string[] = [], slotAd: Record<string, string> = {}, hucre: Record<string, ProgramSatiri[]> = {};
  const derslikler = new Set<string>();
  for (const x of p) {
    const g = trAnahtar(x.gun), sl = saatAnahtar(x.saat);
    if (!GUN_SIRA.includes(g)) continue;
    if (!gunler.includes(g)) gunler.push(g);
    if (!(sl in slotAd)) { slotAd[sl] = x.saat; slotlar.push(sl); }
    (hucre[g + '|' + sl] ??= []).push(x);
    if (x.derslik) derslikler.add(x.derslik);
  }
  // Hafta içi günler ders olmasa da sütun olarak görünsün; hafta sonu yalnızca ders varsa
  GUN_SIRA.slice(0, 5).forEach(g => { if (!gunler.includes(g)) gunler.push(g); });
  gunler.sort((a, b) => GUN_SIRA.indexOf(a) - GUN_SIRA.indexOf(b));
  slotlar.sort((a, b) => dakika(a) - dakika(b) || a.localeCompare(b));
  return { gunler, slotlar, slotAd, hucre, tekDerslik: derslikler.size === 1 ? [...derslikler][0] : '' };
}
