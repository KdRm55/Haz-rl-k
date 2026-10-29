import { describe, expect, it } from 'vitest';
import { basNorm, sinifAnahtari, soyadMaskele, subeEslestir } from '@/lib/metin';
import { puanOku, SONUC, sinavKurali, sinavSonucu } from '@/lib/sinav';
import { dogrulamaEslesir, duyuruGecerli, duyuruHedefUyar, gorunum, gorunumUygula, sinifProgrami } from '@/lib/ogrenci-kurallari';
import type { SorguSonucu } from '@/lib/tipler';

describe('metin', () => {
  it('Türkçe karakterleri ve noktalamayı normalleştirir', () => {
    expect(basNorm('  Öğr. No ')).toBe('OGR NO');
    expect(sinifAnahtari('Hazırlık Özel')).toBe('OZEL');
    expect(soyadMaskele('Yılmaz Demir')).toBe('Y*** D***');
  });
  it('program hücresindeki şube yazımlarını eşleştirir', () => {
    const s = [{ ad: 'Hazırlık A', anahtar: 'A' }, { ad: 'Hazırlık Özel', anahtar: 'OZEL' }];
    expect(subeEslestir('A', s)?.ad).toBe('Hazırlık A');
    expect(subeEslestir('A Şubesi', s)?.ad).toBe('Hazırlık A');
    expect(subeEslestir('Hazırlık Özel', s)?.ad).toBe('Hazırlık Özel');
    expect(subeEslestir('Özel', s)?.ad).toBe('Hazırlık Özel');
    expect(subeEslestir('B', s)).toBeNull();
  });
});

describe('muafiyet hesabı (varsayılan kural: yazılı ≥ 50, ortalama ≥ 60)', () => {
  const k = sinavKurali({});
  it('sınır puanlar dahildir', () => {
    expect(sinavSonucu(50, 70, k).sonuc).toBe(SONUC.MUAF);
    expect(sinavSonucu(60, 60, k)).toMatchObject({ sonuc: SONUC.MUAF, ortalama: 60 });
  });
  it('ortalama iki ondalığa yuvarlanır', () => {
    expect(sinavSonucu(55, 64, k)).toMatchObject({ sonuc: SONUC.HAZIRLIK, ortalama: 59.5 });
  });
  it('yazılı barajın altı sözlüye girmez', () => {
    expect(sinavSonucu(49, 100, k).sonuc).toBe(SONUC.HAZIRLIK);
  });
  it('boş puan bekliyor, tamamlandı işaretliyse hazırlık', () => {
    expect(sinavSonucu('', '', k).sonuc).toBe(SONUC.BEKLIYOR);
    expect(sinavSonucu('', '', sinavKurali({ YAZILI_TAMAMLANDI: 'Evet' })).sonuc).toBe(SONUC.HAZIRLIK);
    expect(sinavSonucu(70, '', k).sonuc).toBe(SONUC.BEKLIYOR);
  });
  it('G girmedi, hatalı yazım hata', () => {
    expect(sinavSonucu('G', '', k).sonuc).toBe(SONUC.HAZIRLIK);
    expect(sinavSonucu('7O', '', k).sonuc).toBe(SONUC.HATA);
    expect(puanOku('72,5')).toBe(72.5);
    expect(puanOku(101)).toEqual({ hata: 'Puan 0–100 arasında olmalı: 101' });
  });
  it('"ayrı ayrı" yöntemi', () => {
    const a = sinavKurali({ MUAFIYET_YONTEMI: 'Ayrı ayrı', SOZLU_GECME_PUANI: '60' });
    expect(sinavSonucu(50, 60, a).sonuc).toBe(SONUC.MUAF);
    expect(sinavSonucu(90, 59, a).sonuc).toBe(SONUC.HAZIRLIK);
  });
});

describe('öğrenci sorgusu kuralları', () => {
  it('son hane doğrulaması', () => {
    expect(dogrulamaEslesir('12345678901', '8901', 4)).toBe(true);
    expect(dogrulamaEslesir('12345678901', '901', 4)).toBe(false);
    expect(dogrulamaEslesir('', '8901', 4)).toBe(false);
    expect(dogrulamaEslesir('abc', 'ABC', 0)).toBe(true);
  });
  it('duyuru tarihleri (bitiş günü dahil)', () => {
    const d = { aktif: true, baslangic: '2026-10-01', bitis: '2026-10-29' };
    expect(duyuruGecerli(d, '2026-10-29')).toBe(true);
    expect(duyuruGecerli(d, '2026-10-30')).toBe(false);
    expect(duyuruGecerli(d, '2026-09-30')).toBe(false);
    expect(duyuruGecerli({ ...d, aktif: false }, '2026-10-15')).toBe(false);
  });
  it('duyuru hedefleri', () => {
    expect(duyuruHedefUyar('Hazırlık öğrencileri', 'bekliyor', '')).toBe(true);
    expect(duyuruHedefUyar('Muaf öğrenciler', 'sinif', 'Hazırlık A')).toBe(false);
    expect(duyuruHedefUyar('Hazırlık A', 'sinif', 'Hazırlık A')).toBe(true);
  });
  it('sınıf programı gün ve saat sırasıyla, derslik sınıftan tamamlanır', () => {
    const siniflar = [{ ad: 'Hazırlık A', anahtar: 'A', derslik: 'Z-05' }];
    const p = sinifProgrami('Hazırlık A', siniflar, [
      { hoca: 'H1', ders: 'Okuma', gun: 'Salı', saat: '09:00 - 09:45', sube: 'A', derslik: '' },
      { hoca: 'H2', ders: 'Dinleme', gun: 'Pazartesi', saat: '10:00 - 10:45', sube: 'Hazırlık A', derslik: 'Z-10' },
      { hoca: 'H3', ders: 'Yazma', gun: 'Pazartesi', saat: '09:00 - 09:45', sube: 'B', derslik: '' }
    ]);
    expect(p.map(x => x.ders)).toEqual(['Dinleme', 'Okuma']);
    expect(p[1].derslik).toBe('Z-05');
  });
  it('kapalı bölümlerin verisi gönderilmez', () => {
    const g = gorunum({ OGRENCI_GOSTER_DERSLIK: 'Hayır', OGRENCI_GOSTER_PROGRAM: 'Hayır' });
    const r: SorguSonucu = {
      bulundu: true, tur: 'sinif', numara: '1', adSoyad: 'A', maskeli: true, sinav: null, duyurular: [], gorunum: g,
      sinif: 'Hazırlık A', derslik: 'Z-05', sinavYerleri: [], donemSinavlari: null, program: [{ gun: 'Pazartesi', saat: '9', ders: 'D', hoca: 'H', derslik: 'Z-05' }]
    };
    const o = gorunumUygula(r);
    expect(o.bulundu && o.tur === 'sinif' && [o.derslik, o.program.length]).toEqual(['', 0]);
  });
});
