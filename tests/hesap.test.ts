import { describe, expect, it } from 'vitest';
import { adSoyadNorm, epostaNorm, geciciSifre, sifreDenetle, tc6Eslesir, tcKayitlaUyumlu, tcSon6 } from '@/lib/hesap-kurallari';
import { tcOzetHesapla } from '@/lib/tc-ozeti';
import { kodDogru, kodOzeti } from '@/lib/kod';

describe('hesap kuralları', () => {
  it('şifre: en az 8 karakter, yalnızca rakam olamaz, tekrarla aynı olmalı', () => {
    expect(() => sifreDenetle('kisa1')).toThrow('en az 8');
    expect(() => sifreDenetle('12345678')).toThrow('rakam');
    expect(() => sifreDenetle('guzelSifre1', 'guzelSifre2')).toThrow('tutmuyor');
    expect(sifreDenetle('guzelSifre1', 'guzelSifre1')).toBe('guzelSifre1');
  });
  it('e-posta küçük harfe çevrilir ve denetlenir; ad soyad boşlukları sadeleşir', () => {
    expect(epostaNorm('  Hoca@Sinop.EDU.tr ')).toBe('hoca@sinop.edu.tr');
    expect(() => epostaNorm('hoca@')).toThrow('e-posta');
    expect(adSoyadNorm('  Ali   Yılmaz ')).toBe('Ali Yılmaz');
    expect(() => adSoyadNorm('A')).toThrow();
  });
  it('TC: yalnızca son 6 hane alınır ve eşleştirilir', () => {
    expect(tcSon6('123 456 78901')).toBe('678901');
    expect(tcSon6('12345')).toBe('');
    const ozetle = (s: string) => tcOzetHesapla(s, 'x'.repeat(32));
    expect(tc6Eslesir('678901', '678 901', ozetle)).toBe(true);   // eski, açık yazılmış kayıt
    expect(tc6Eslesir('678901', '78901', ozetle)).toBe(false);
    expect(tc6Eslesir('', '', ozetle)).toBe(false);
    const ozet = ozetle('678901');
    expect(ozet).toMatch(/^h1:/);
    expect(ozet).not.toContain('678901');
    expect(tc6Eslesir(ozet, '678901', ozetle)).toBe(true);
    expect(tc6Eslesir(ozet, '678902', ozetle)).toBe(false);
    // farklı anahtarla alınan özet tutmaz
    expect(tc6Eslesir(tcOzetHesapla('678901', 'y'.repeat(32)), '678901', ozetle)).toBe(false);
    expect(tcKayitlaUyumlu({ tc6: ozet, tc4: '8901' }, '678901', ozetle)).toBe(true);
    expect(tcKayitlaUyumlu({ tc6: '', tc4: '8901' }, '558901', ozetle)).toBe(true);
    expect(tcKayitlaUyumlu({ tc6: '', tc4: '8901' }, '558902', ozetle)).toBe(false);
  });
  it('geçici şifre: 10 karakter, harf ve rakam içerir, karışan karakter yok', () => {
    let i = 0;
    const s = geciciSifre(n => (i++ * 7) % n);
    expect(s).toHaveLength(10);
    expect(s).toMatch(/\d/);
    expect(s).toMatch(/[A-Za-z]/);
    expect(s).not.toMatch(/[IOl01]/);
    expect(() => sifreDenetle(s)).not.toThrow();
  });
  it('şifre özeti: aynı şifre farklı tuzla saklanır, doğrulanır', () => {
    const a = kodOzeti('guzelSifre1'), b = kodOzeti('guzelSifre1');
    expect(a).not.toBe(b);
    expect(kodDogru('guzelSifre1', a)).toBe(true);
    expect(kodDogru('guzelSifre2', a)).toBe(false);
  });
});
