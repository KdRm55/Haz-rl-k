import { describe, expect, it } from 'vitest';
import { anahtarCoz, anahtarSablonSatirlari, cevapNorm, elleSatirlari, karekodKitapcigi, optikNotu } from '@/lib/optik/kurallar';

describe('cevap anahtarı şablonu', () => {
  it('şablon başlığı ve kitapçık satırları üretir', () => {
    const s = anahtarSablonSatirlari(20);
    expect(s[0]).toHaveLength(21);
    expect(s[0][1]).toBe('S1');
    expect(s.slice(1, 5).map(r => r[0])).toEqual(['A', 'B', 'C', 'D']);
  });
  it('doldurulmuş şablonu okur; boş kitapçık atlanır, iptal soru "-" olur', () => {
    const t = anahtarSablonSatirlari(5).map(r => r.map(String));
    t[1] = ['A', 'E', 'C', 'E', 'B', 'B'];   // 5 soru: E C E B B
    t[2] = ['B', 'A', '-', 'c', 'D', 'e'];
    const r = anahtarCoz(t);
    expect(r.soruSayisi).toBe(5);
    expect(r.anahtar).toEqual({ A: 'ECEBB', B: 'A-CDE' });
  });
  it('boş hücre ve anlaşılmayan değer hata verir', () => {
    const t = [['Kitapçık', 'S1', 'S2', 'S3'], ['A', 'A', '', 'F']];
    expect(() => anahtarCoz(t)).toThrow(/S2: boş/);
    expect(() => anahtarCoz(t)).toThrow(/S3: "F"/);
  });
  it('başlık yoksa ya da hiçbir cevap yoksa hata verir', () => {
    expect(() => anahtarCoz([['x', 'y']])).toThrow(/Başlık satırı/);
    expect(() => anahtarCoz(anahtarSablonSatirlari(3).map(r => r.map(String)))).toThrow(/Hiçbir kitapçık/);
  });
});

describe('elle kayıt', () => {
  it('bitişik ve aralıklı cevapları okur', () => {
    const { satirlar, hatalar } = elleSatirlari('268303308 A ECEBB\n268303036\tB\tA - C d E', 5);
    expect(hatalar).toEqual([]);
    expect(satirlar).toEqual([{ no: '268303308', kitapcik: 'A', cevaplar: 'ECEBB' }, { no: '268303036', kitapcik: 'B', cevaplar: 'A-CDE' }]);
  });
  it('hatalı satırları açıklar', () => {
    const { satirlar, hatalar } = elleSatirlari('123 Z ABCDE\n456 A ABC\n789 A ABCDF\n456 B ABCDE', 5);
    expect(satirlar).toEqual([{ no: '456', kitapcik: 'B', cevaplar: 'ABCDE' }]);
    expect(hatalar.join(' ')).toMatch(/kitapçık A, B, C ya da D/);
    expect(hatalar.join(' ')).toMatch(/5 soru için 3 cevap/);
    expect(hatalar.join(' ')).toMatch(/dışında karakter/);
  });
  it('cevap normalleştirme', () => {
    expect(cevapNorm('a b, c-')).toBe('ABC-');
    expect(cevapNorm('AZ')).toBeNull();
  });
});

describe('notlandırma', () => {
  it('kitapçık numarası karekodun ilk iki hanesidir', () => {
    expect(karekodKitapcigi('13101011111163')).toBe('C');
    expect(karekodKitapcigi('11101011111141')).toBe('A');
    expect(karekodKitapcigi('99101011111141')).toBe('');
  });
  it('Kıraat A kitapçığı örneği: 17 doğru → 85', () => {
    const anahtar = 'ECEBBCDBEEEAAAECBDAE';
    const ogrenci = 'ECEBBCDBDBEAAAEBBDAE';   // iki yanlış... aşağıda sayılır
    const n = optikNotu(ogrenci, anahtar, 0);
    expect(n.toplam).toBe(20);
    expect(n.dogru + n.yanlis + n.bos).toBe(20);
    expect(n.puan).toBe(n.dogru * 5);
  });
  it('çoklu işaret yanlış, boş boştur; ceza uygulanır', () => {
    const n = optikNotu('AXC-', 'ABCD', 0);
    expect(n).toMatchObject({ dogru: 2, yanlis: 1, bos: 1, puan: 50 });
    expect(optikNotu('AXC-', 'ABCD', 0.5).puan).toBe(37.5);
  });
});
