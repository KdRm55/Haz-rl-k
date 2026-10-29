import { describe, expect, it } from 'vitest';
import { haftaBasi, haftalikSirku, sirkuBol, tarihSirala, tarihTR, telafiSirkusu } from '@/lib/sirku-kurallari';

const siniflar = [
  { ad: 'Hazırlık A', anahtar: 'A', derslik: 'Z-05', ogrenciler: [{ no: '1', adi: 'Ayşe', soyadi: 'Y' }] },
  { ad: 'Hazırlık Özel', anahtar: 'OZEL', derslik: '', ogrenciler: [] }
];
const program = [
  { hoca: 'Dr. Ahmet', ders: 'Okuma', gun: 'Çarşamba', saat: '10:00 - 10:45', sube: 'A', derslik: '' },
  { hoca: 'Dr. Ahmet', ders: 'Okuma', gun: 'Çarşamba', saat: '09:00 - 09:45', sube: 'Hazırlık A', derslik: '' },
  { hoca: 'Dr. Ahmet', ders: 'Yazma', gun: 'Pazartesi', saat: '09:00 - 09:45', sube: 'Özel', derslik: '' },
  { hoca: 'Dr. Selma', ders: 'Dinleme', gun: 'Salı', saat: '09:00 - 09:45', sube: 'A', derslik: '' },
  { hoca: 'DR. AHMET', ders: 'Konuşma', gun: 'Bilinmeyen', saat: '09:00', sube: 'A', derslik: '' }
];

describe('hafta başı', () => {
  it('pazartesi değilse o haftanın pazartesisi alınır', () => {
    expect(tarihTR(haftaBasi('2026-10-29'))).toBe('26.10.2026');   // perşembe
    expect(tarihTR(haftaBasi('2026-10-26'))).toBe('26.10.2026');   // pazartesi
    expect(tarihTR(haftaBasi('2026-11-01'))).toBe('26.10.2026');   // pazar
  });
  it('geçersiz tarih anlaşılır hata verir', () => {
    expect(() => haftaBasi('')).toThrow('Hafta başı tarihi seçilmedi.');
  });
});

describe('haftalık sirkü', () => {
  const s = haftalikSirku('dr. ahmet', haftaBasi('2026-10-26'), siniflar, program);
  it('hoca adı büyük/küçük harf ve Türkçe karakterden bağımsız eşleşir; şube yazımları tanınır', () => {
    expect(Object.keys(s.A.dates)).toEqual(['28.10.2026']);
    expect(Object.keys(s.OZEL.dates)).toEqual(['26.10.2026']);
  });
  it('aynı günün dersleri saate göre sıralanır, ders adları tekilleşir', () => {
    expect(s.A.dates['28.10.2026'].map(x => x.saat)).toEqual(['09:00 - 09:45', '10:00 - 10:45']);
    expect(s.A.lessonNames).toEqual(['Okuma']);
  });
  it('başka hocanın ve tanınmayan günün dersleri alınmaz', () => {
    expect(Object.values(s).flatMap(x => Object.values(x.dates).flat()).map(x => x.ders)).not.toContain('Dinleme');
    expect(Object.values(s).flatMap(x => x.lessonNames)).not.toContain('Konuşma');
  });
});

describe('telafi sirküsü', () => {
  it('tarihleri biçimler, bilinmeyen şubeyi atlar', () => {
    const t = telafiSirkusu(' Dr. Ahmet ', { A: { lesson: 'Okuma', date: '2026-11-03', origDate: '2026-10-28', time: '13:00' }, X: { lesson: 'L', date: '2026-11-03' } }, siniflar);
    expect(t).toMatchObject({ teacher: 'Dr. Ahmet', weekStart: '03.11.2026', isManual: true });
    expect(t.sections.A).toMatchObject({ origDate: '28.10.2026', manualDate: '03.11.2026', manualTime: '13:00' });
    expect(t.sections.X).toBeUndefined();
  });
  it('geçerli şube yoksa hata', () => {
    expect(() => telafiSirkusu('H', { X: { lesson: 'L', date: '2026-11-03' } }, siniflar)).toThrow('Seçilen şubeler bulunamadı');
  });
});

describe('çok sayfalı sirkü', () => {
  const liste = (n: number) => Array.from({ length: n }, (_, i) => i);
  const oto = { mod: 'oto' as const, n: 30 };
  it('otomatik: 45\'e kadar tek sayfa, en az 20 satır', () => {
    expect(sirkuBol(liste(12), oto).map(p => [p.ogrenciler.length, p.satir])).toEqual([[12, 20]]);
    expect(sirkuBol(liste(45), oto).map(p => p.ogrenciler.length)).toEqual([45]);
  });
  it('otomatik: sayfalara eşit böler', () => {
    expect(sirkuBol(liste(46), oto).map(p => [p.ogrenciler.length, p.satir])).toEqual([[23, 23], [23, 23]]);
    expect(sirkuBol(liste(91), oto).map(p => p.ogrenciler.length)).toEqual([31, 30, 30]);
  });
  it('"en çok N": önce doldurur, bütün sayfalar N satır', () => {
    expect(sirkuBol(liste(45), { mod: 'n', n: 30 }).map(p => [p.ogrenciler.length, p.satir])).toEqual([[30, 30], [15, 30]]);
    expect(sirkuBol(liste(20), { mod: 'n', n: 30 }).map(p => p.satir)).toEqual([20]);
  });
  it('hiçbir öğrenci kaybolmaz', () => {
    for (const n of [0, 1, 44, 45, 46, 89, 90, 91, 200]) {
      expect(sirkuBol(liste(n), oto).flatMap(p => p.ogrenciler)).toEqual(liste(n));
      expect(sirkuBol(liste(n), { mod: 'n', n: 17 }).flatMap(p => p.ogrenciler)).toEqual(liste(n));
    }
  });
  it('tarihler kronolojik sıralanır', () => {
    expect(tarihSirala(['02.11.2026', '30.10.2026', '01.11.2026'])).toEqual(['30.10.2026', '01.11.2026', '02.11.2026']);
  });
});
