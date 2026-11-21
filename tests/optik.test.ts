import { describe, expect, it } from 'vitest';
import { baloncukOlc, cerceveBul, cevapCoz, griYap, notla, optikOku, type Gri } from '@/lib/optik/okuyucu';

/** Gerçek optiğin düzenini taklit eden sentetik görüntü: beyaz zemin, kalın siyah çerçeve, işaretli baloncuklar gri. */
function sentetik(isaretler: Record<number, number>, w = 1820, h = 2400): Gri {
  const g = new Uint8Array(w * h).fill(250);
  const x0 = 136, x1 = 1582, y0 = 1232, y1 = 1768, kalin = 8;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x < x0 + kalin || x > x1 - kalin || y < y0 + kalin || y > y1 - kalin) g[y * w + x] = 20;
  const ic = { x0: x0 + kalin, x1: x1 - kalin, y0: y0 + kalin, y1: y1 - kalin };
  const fw = ic.x1 - ic.x0, fh = ic.y1 - ic.y0, rad = fw * 0.0095;
  for (const [soru, sec] of Object.entries(isaretler)) {
    const q = Number(soru) - 1, s = Math.floor(q / 10), sat = q % 10;
    const cx = ic.x0 + fw * (0.050 + sec * 0.0325 + s * 0.1965), cy = ic.y0 + fh * (0.075 + sat * 0.09);
    for (let y = Math.round(cy - rad); y <= cy + rad; y++) for (let x = Math.round(cx - rad); x <= cx + rad; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) g[y * w + x] = 125;
  }
  return { g, w, h };
}

describe('optik okuyucu', () => {
  it('çerçeveyi bulur ve işaretli baloncukları okur', () => {
    const o = optikOku(sentetik({ 1: 1, 2: 3, 3: 4, 10: 0, 11: 2, 50: 4 }));
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.cevaplar.slice(0, 3)).toBe('BDE');
    expect(o.cevaplar[9]).toBe('A');
    expect(o.cevaplar[10]).toBe('C');
    expect(o.cevaplar[49]).toBe('E');
    expect(o.cevaplar[4]).toBe('-');
    expect(o.coklu).toEqual([]);
  });
  it('çerçeve yoksa hata verir', () => {
    expect(optikOku({ g: new Uint8Array(500 * 700).fill(250), w: 500, h: 700 }).ok).toBe(false);
  });
  it('aynı soruda iki işaret X olur', () => {
    const olcum = Array.from({ length: 50 }, () => [245, 245, 245, 245, 245]);
    olcum[4] = [130, 245, 128, 245, 245];
    const c = cevapCoz(olcum);
    expect(c.cevaplar[4]).toBe('X');
    expect(c.coklu).toEqual([5]);
  });
  it('silik işareti okur ve kontrol için işaretler; boş baloncuktaki harf gölgesini işaret saymaz', () => {
    const olcum = Array.from({ length: 50 }, () => [245, 245, 245, 245, 245]);
    olcum[0] = [245, 245, 198, 245, 245];   // silik C (fark 47)
    olcum[1] = [245, 215, 245, 245, 245];   // harf gölgesi (fark 30): boş
    const c = cevapCoz(olcum);
    expect(c.cevaplar.slice(0, 2)).toBe('C-');
    expect(c.zayif).toEqual([1]);
    expect(c.coklu).toEqual([]);
  });
  it('silinmiş leke ile belirgin işaret birlikteyse belirgin olan seçilir ve satır kontrol edilir', () => {
    const olcum = Array.from({ length: 50 }, () => [245, 245, 245, 245, 245]);
    olcum[10] = [248, 247, 198, 130, 246];   // silinmiş C lekesi + belirgin D
    const c = cevapCoz(olcum);
    expect(c.cevaplar[10]).toBe('D');
    expect(c.zayif).toEqual([11]);
    expect(c.coklu).toEqual([]);
  });
  it('griYap RGBA’yı griye çevirir', () => {
    expect(Array.from(griYap([255, 255, 255, 255, 0, 0, 0, 255], 2, 1).g)).toEqual([255, 0]);
    expect(cerceveBul).toBeTypeOf('function');
    expect(baloncukOlc).toBeTypeOf('function');
  });
});

describe('notlandırma', () => {
  it('doğru/yanlış/boş sayar, puanı yüzdeye çevirir', () => {
    const n = notla('ABC--', 'ABCDE');
    expect(n).toMatchObject({ dogru: 3, yanlis: 0, bos: 2, toplam: 5, puan: 60 });
  });
  it('iptal soru herkese doğru sayılır; yanlış cezası uygulanır', () => {
    const n = notla('BAAA', 'A-AA', 0);
    expect(n.dogru).toBe(3);
    const c = notla('BBAA', 'AAAA', 0.25);
    expect(c.puan).toBe(Math.round((2 - 0.5) / 4 * 10000) / 100);
  });
});
