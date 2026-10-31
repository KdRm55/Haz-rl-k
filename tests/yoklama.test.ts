import { describe, expect, it } from 'vitest';
import {
  devamsizlikHesapla, eksikOturumlar, EVRAK_ALFABE, evrakNoUret, gelmeyenSayisi, gunAdi, haftalikDersSaatleri, noListesi, oturumAnahtari, ozet, pazartesi,
  programdaVar, programOturumlari, sinirHesapla, trIso, yokAyarCoz, yoklamaBirlestir, type YoklamaKaydi
} from '@/lib/yoklama-kurallari';
import { homografi, uygula } from '@/lib/tarama/motor';
import { satirlariHazirla, YEDEK_TABLOLARI, yedekDogrula } from '@/lib/yedek-kurallari';
import * as s from '@/db/schema';

const siniflar = [{ ad: 'Hazırlık A', anahtar: 'A', derslik: 'Z-05' }, { ad: 'Hazırlık B', anahtar: 'B', derslik: 'Z-06' }];
const program = [
  { hoca: 'Ali Hoca', ders: 'Sarf', gun: 'Pazartesi', saat: '09.00-10.30', sube: 'A', derslik: '' },
  { hoca: 'Ali Hoca', ders: 'Sarf', gun: 'Çarşamba', saat: '09.00-10.30', sube: 'A Şubesi', derslik: 'Z-10' },
  { hoca: 'Veli Hoca', ders: 'Nahiv', gun: 'Salı', saat: '13.00', sube: 'Hazırlık B', derslik: '' },
  { hoca: 'Veli Hoca', ders: 'Nahiv', gun: 'Pazar', saat: '13.00', sube: 'C', derslik: '' }   // sınıfı yok
];
const kayit = (p: Partial<YoklamaKaydi>): YoklamaKaydi => ({
  anahtar: '', iso: '2026-11-02', saat: '09.00-10.30', ders: 'Sarf', sinif: 'Hazırlık A', hoca: 'Ali Hoca', tur: 'Program', durum: 'Yapıldı',
  liste: ['1', '2', '3'], yok1: [], yok2: [], izinli: [], kaynak: 'Manuel', aciklama: '', ...p
});

describe('yoklama yardımcıları', () => {
  it('oturum anahtarı Apps Script ile aynı: sınıf anahtarı, boşluksuz saat, ders', () => {
    expect(oturumAnahtari('2026-11-02', 'Hazırlık A', '09.00 - 10.30', 'sarf')).toBe('2026-11-02|A|0900-1030|SARF');
    expect(oturumAnahtari('2026-11-02', 'Hazırlık Özel', '10.00', 'Kıraat')).toBe('2026-11-02|OZEL|1000|KIRAAT');
  });
  it('numara listesi ve tarih', () => {
    expect(noListesi('1, 2;3 2  ')).toEqual(['1', '2', '3']);
    expect(noListesi(['5', ' 5', '6'])).toEqual(['5', '6']);
    expect(trIso('3.11.2026')).toBe('2026-11-03');
    expect(pazartesi('2026-11-05')).toBe('2026-11-02');
    expect(gunAdi('2026-11-05')).toBe('Perşembe');
  });
  it('evrak özeti kararlı; evrak no karışan harfleri içermez', () => {
    expect(ozet('abc')).toBe(ozet('abc'));
    expect(ozet('abc')).not.toBe(ozet('abd'));
    expect(ozet('abc')).toMatch(/^[0-9a-f]{16}$/);
    let i = 0;
    const sahte = () => [0, 0.99, 0.5, 0.25, 0.75, 0.1, 0.9, 0.3][i++ % 8];
    const no = evrakNoUret(new Set(), sahte);
    expect(no).toHaveLength(8);
    expect([...no].every(c => EVRAK_ALFABE.includes(c))).toBe(true);
    expect(no).not.toMatch(/[IO01]/);
  });
  it('ayarlar: varsayılan %20, 14 hafta; sınır aşağı yuvarlanır', () => {
    expect(yokAyarCoz({})).toEqual({ yuzde: 20, hafta: 14, baslangic: '' });
    expect(yokAyarCoz({ YOKLAMA_SINIR_YUZDE: '12,5', YOKLAMA_DONEM_HAFTA: '10', YOKLAMA_DONEM_BASLANGIC: '07.09.2026' })).toEqual({ yuzde: 12.5, hafta: 10, baslangic: '2026-09-07' });
    expect(sinirHesapla(4, { yuzde: 20, hafta: 14, baslangic: '' })).toBe(11);   // 56 × 0,2 = 11,2
    expect(sinirHesapla(4, { yuzde: 0, hafta: 14, baslangic: '' })).toBeNull();
  });
});

describe('program oturumları', () => {
  it('hafta oturumları: şube yazımı eşleşir, sınıfı olmayan atlanır, sıralı', () => {
    const o = programOturumlari('2026-11-02', program, siniflar);
    expect(o.map(x => [x.iso, x.sinif, x.ders, x.derslik])).toEqual([
      ['2026-11-02', 'Hazırlık A', 'Sarf', 'Z-05'], ['2026-11-03', 'Hazırlık B', 'Nahiv', 'Z-06'], ['2026-11-04', 'Hazırlık A', 'Sarf', 'Z-10']]);
    expect(programOturumlari('2026-11-02', program, siniflar, { hoca: 'ali hoca' })).toHaveLength(2);
  });
  it('programda var mı ve haftalık saat (oturum başına 2)', () => {
    expect(programdaVar('2026-11-02', siniflar[0], '09.00-10.30', 'SARF', program)).toBe(true);
    expect(programdaVar('2026-11-03', siniflar[0], '09.00-10.30', 'Sarf', program)).toBe(false);   // salı yok
    expect(haftalikDersSaatleri('Hazırlık A', program, siniflar)).toEqual({ SARF: 4 });
  });
  it('eksik yoklamalar: girilenler ve gelecek atlanır; başlangıç yoksa son 4 hafta', () => {
    const ayar = { yuzde: 20, hafta: 14, baslangic: '2026-11-02' };
    const girilen = new Set([oturumAnahtari('2026-11-02', 'Hazırlık A', '09.00-10.30', 'Sarf')]);
    const r = eksikOturumlar(program, siniflar, girilen, ayar, '2026-11-04');
    expect(r.eksik.map(x => x.iso)).toEqual(['2026-11-03', '2026-11-04']);
    expect(eksikOturumlar(program, siniflar, new Set(), { ...ayar, baslangic: '' }, '2026-11-04').baslangic).toBe('2026-10-05');
  });
});

describe('yoklama kaydı birleştirme', () => {
  const g = { liste: ['1', '2', '3'], yok1: ['1', '9'], yok2: ['1'], izinli: ['2'], durum: 'Yapıldı' as const, kaynak: 'Manuel' as const, aciklama: '', birlestir: false };
  it('listede olmayan numaralar atılır; izni yalnızca yönetim değiştirir', () => {
    expect(yoklamaBirlestir(g, null, true)).toMatchObject({ yok1: ['1'], yok2: ['1'], izinli: ['2'] });
    expect(yoklamaBirlestir(g, null, false).izinli).toEqual([]);
    expect(yoklamaBirlestir(g, kayit({ izinli: ['3'] }), false).izinli).toEqual(['3']);
    expect(() => yoklamaBirlestir({ ...g, liste: [] }, null, true)).toThrow('boş');
  });
  it('ders yapılmadı: devamsızlık ve izin temizlenir', () => {
    expect(yoklamaBirlestir({ ...g, durum: 'Yapılmadı' }, null, true)).toMatchObject({ yok1: [], yok2: [], izinli: [] });
  });
  it('tarama birleştirme: sayfadaki öğrenciler güncellenir, diğerleri korunur, kaynak Karma olur', () => {
    const mevcut = kayit({ liste: ['1', '2', '3', '4'], yok1: ['3', '4'], yok2: ['4'], izinli: ['4'], aciklama: 'eski' });
    const r = yoklamaBirlestir({ liste: ['1', '2', '3'], yok1: ['2'], yok2: [], izinli: [], durum: 'Yapıldı', kaynak: 'Tarama', aciklama: '', birlestir: true }, mevcut, false);
    expect(r).toEqual({ liste: ['1', '2', '3', '4'], yok1: ['4', '2'], yok2: ['4'], izinli: ['4'], kaynak: 'Karma', aciklama: 'eski' });
    const yapilmadi = yoklamaBirlestir({ liste: ['1'], yok1: ['1'], yok2: [], izinli: [], durum: 'Yapıldı', kaynak: 'Tarama', aciklama: '', birlestir: true }, kayit({ durum: 'Yapılmadı', yok1: ['3'] }), false);
    expect(yapilmadi.yok1).toEqual(['1']);
  });
  it('gelmeyen sayısı izinlileri saymaz', () => {
    expect(gelmeyenSayisi({ yok1: ['1', '2'], yok2: ['2', '3'], izinli: ['3'] })).toBe(2);
  });
});

describe('devamsızlık hesabı', () => {
  const ayar = { yuzde: 20, hafta: 14, baslangic: '2026-11-01' };
  const oturumlar = [
    kayit({ iso: '2026-10-26', yok1: ['1'], yok2: ['1'] }),               // dönem başlangıcından önce: sayılmaz
    kayit({ iso: '2026-11-02', yok1: ['1'], yok2: ['1'] }),
    kayit({ iso: '2026-11-04', yok1: ['1'] }),
    kayit({ iso: '2026-11-09', yok1: ['1'], yok2: ['1'], izinli: ['1'] }), // izinli: sayılmaz
    kayit({ iso: '2026-11-11', durum: 'Yapılmadı', yok1: [] }),
    kayit({ iso: '2026-11-16', ders: 'Nahiv', liste: ['2'] })              // öğrenci listede değil
  ];
  it('ders ders saat, izinli saat, oturum sayısı ve kayıtlar (yeniden eskiye)', () => {
    const [d] = devamsizlikHesapla('1', oturumlar, ayar, { SARF: 4 });
    expect(d).toMatchObject({ ders: 'Sarf', yokSaat: 3, izinliSaat: 2, oturum: 3, haftalikSaat: 4, toplamSaat: 56, sinir: 11, durum: '' });
    expect(d.kayitlar.map(k => [k.iso, k.durum, k.yokSaat])).toEqual([
      ['2026-11-11', 'yapilmadi', 0], ['2026-11-09', 'izinli', 2], ['2026-11-04', 'yok', 1], ['2026-11-02', 'yok', 2]]);
    expect(d.kayitlar.map(k => [k.y1, k.y2])).toEqual([[false, false], [true, true], [true, false], [true, true]]);
    expect(devamsizlikHesapla('1', oturumlar, ayar, { SARF: 4 })).toHaveLength(1);
  });
  it('sınıra yaklaşan (%75) ve aşan; sınır yoksa durum boş', () => {
    const cok = Array.from({ length: 6 }, (_, i) => kayit({ iso: `2026-11-${String(2 + i).padStart(2, '0')}`, yok1: ['1'], yok2: ['1'] }));
    expect(devamsizlikHesapla('1', cok.slice(0, 5), ayar, { SARF: 4 })[0].durum).toBe('yakin');   // 10 ≥ ceil(8,25)
    expect(devamsizlikHesapla('1', cok, ayar, { SARF: 4 })[0].durum).toBe('asti');                // 12 > 11
    expect(devamsizlikHesapla('1', cok, ayar, null)[0]).toMatchObject({ sinir: null, durum: '' });
  });
});

describe('tarama motoru: sayfa düzeltme', () => {
  it('dört noktadan perspektif dönüşümü noktaları doğru eşler', () => {
    const H0 = [2.1, 0.05, 30, -0.04, 2.0, 12, 0.0001, 0.00005, 1];
    const mm: [number, number][] = [[5, 5], [205, 5], [5, 292], [205, 292], [100, 20]];
    const px = mm.map(p => uygula(H0, p[0], p[1]));
    const H = homografi(mm, px)!;
    for (const p of [[50, 100], [150, 250]] as const) {
      const a = uygula(H, p[0], p[1]), b = uygula(H0, p[0], p[1]);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-6);
    }
  });
});

describe('tam yedek', () => {
  it('bütün tablolar (giriş denemeleri hariç) yedeğe girer; zaman damgaları geri dönüştürülür', () => {
    const adlar = YEDEK_TABLOLARI.map(t => t.ad);
    expect(adlar).toContain('yoklamalar');
    expect(adlar).not.toContain('giris_denemeleri');
    expect(adlar.indexOf('siniflar')).toBeLessThan(adlar.indexOf('ogrenciler'));
    const [r] = satirlariHazirla(s.islemKaydi, [{ id: 3, zaman: '2026-10-29T10:00:00.000Z', kullanici: 'x', islem: 'y', ayrinti: '', bilinmeyen: 1 }]);
    expect(r.zaman).toBeInstanceOf(Date);
    expect(r).not.toHaveProperty('bilinmeyen');
    expect(() => yedekDogrula({ uygulama: 'baska' })).toThrow('yedeği değil');
  });
});

describe('öğrenciye göre yoklama düzeltme', () => {
  it('yalnızca o öğrenciyi değiştirir, listede yoksa ekler', async () => {
    const { ogrenciYoklamaDegistir } = await import('@/lib/yoklama-kurallari');
    const k = { liste: ['1', '2'], yok1: ['2'], yok2: ['1', '2'] };
    expect(ogrenciYoklamaDegistir(k, '1', true, false)).toEqual({ liste: ['1', '2'], yok1: ['2', '1'], yok2: ['2'] });
    expect(ogrenciYoklamaDegistir(k, '2', false, false)).toEqual({ liste: ['1', '2'], yok1: [], yok2: ['1'] });
    expect(ogrenciYoklamaDegistir(k, '3', true, true)).toEqual({ liste: ['1', '2', '3'], yok1: ['2', '3'], yok2: ['1', '2', '3'] });
    expect(ogrenciYoklamaDegistir(k, '2', true, true)).toEqual(k);
  });
});

describe('sınıf değiştiren öğrencinin yoklaması', () => {
  it('aynı haftanın aynı sıradaki dersine eşlenir', async () => {
    const { tasinanKayit } = await import('@/lib/yoklama-kurallari');
    // Eski sınıf (A): Pazartesi ve Perşembe · Yeni sınıf (B): Pazartesi ve Salı
    const a1 = { iso: '2026-09-21', saat: '13.00-15.00' }, a2 = { iso: '2026-09-24', saat: '13.00-15.00' }, a3 = { iso: '2026-09-28', saat: '13.00-15.00' };
    const b1 = { iso: '2026-09-21', saat: '15.00-17.00' }, b2 = { iso: '2026-09-22', saat: '13.00-15.00' }, b3 = { iso: '2026-09-28', saat: '15.00-17.00' }, b4 = { iso: '2026-09-29', saat: '13.00-15.00' };
    const yeni = [b1, b2, b3, b4], eski = [a1, a2, a3];
    expect(tasinanKayit(b1, yeni, eski)).toBe(a1);
    expect(tasinanKayit(b2, yeni, eski)).toBe(a2);   // Salı ↔ Perşembe: haftanın 2. dersi
    expect(tasinanKayit(b3, yeni, eski)).toBe(a3);
    expect(tasinanKayit(b4, yeni, eski)).toBeNull(); // o hafta eski sınıfta 2. ders yok (öğrenci taşınmış)
  });
});
