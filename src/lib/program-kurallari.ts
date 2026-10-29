/** Ders programı tablosunu (Excel / e-tablo "Hoca Programları") okuma kuralları. Kaynak: Code.gs programOku_. */
import { basNorm } from './metin';

export const PROGRAM_ALIAS = {
  hoca: ['HOCA ADI', 'HOCA', 'OGRETIM ELEMANI', 'OGRETIM ELEMANI ADI', 'OGRETIM ELEMANI ADI SOYADI', 'AD SOYAD'],
  ders: ['DERS', 'DERS ADI'],
  gun: ['GUN'],
  saat: ['SAAT', 'DERS SAATI', 'ZAMAN'],
  sube: ['SUBE', 'SUBE ADI'],
  derslik: ['DERSLIK', 'DERSLIK KODU', 'DERSLIK / KOD', 'SINIF']
} as const;
const ETIKET = { hoca: 'Hoca Adı', ders: 'Ders', gun: 'Gün', saat: 'Saat', sube: 'Şube' } as const;

export type ProgramSatiri = { hoca: string; ders: string; gun: string; saat: string; sube: string; derslik: string };

const kolonBul = (satir: string[], aliaslar: readonly string[]) => { for (const a of aliaslar) { const i = satir.indexOf(a); if (i > -1) return i; } return -1; };

/** İlk 20 satırda başlık arar; bulursa altındaki dolu satırları döndürür. Bulamazsa eksik sütunları bildirir. */
export function programTablosuOku(vals: string[][]): { satirlar: ProgramSatiri[]; eksik?: string[] } {
  let ilkEksik: string[] | null = null;
  for (let r = 0; r < Math.min(vals.length, 20); r++) {
    const row = (vals[r] ?? []).map(basNorm);
    const i = Object.fromEntries(Object.entries(PROGRAM_ALIAS).map(([k, a]) => [k, kolonBul(row, a)])) as Record<keyof typeof PROGRAM_ALIAS, number>;
    if (i.hoca === -1) continue;
    const eksik = (['ders', 'gun', 'saat', 'sube'] as const).filter(k => i[k] === -1);
    if (eksik.length) { ilkEksik ??= eksik.map(k => ETIKET[k]); continue; }
    const satirlar: ProgramSatiri[] = [];
    for (let s = r + 1; s < vals.length; s++) {
      const v = vals[s] ?? [];
      const g = (k: keyof typeof PROGRAM_ALIAS) => (i[k] > -1 ? String(v[i[k]] ?? '').trim() : '');
      if (!g('hoca')) continue;
      satirlar.push({ hoca: g('hoca'), ders: g('ders'), gun: g('gun'), saat: g('saat'), sube: g('sube'), derslik: g('derslik') });
    }
    return { satirlar };
  }
  return { satirlar: [], eksik: ilkEksik ?? Object.values(ETIKET) };
}
