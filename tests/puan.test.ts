import { describe, expect, it } from 'vitest';
import { adUyumlu, kuralDogrula, kuralMetni, puanBaslikBul, puanFarkHesapla, puanMetni, puanSonrasiSayim } from '@/lib/puan-kurallari';
import { sinavKurali } from '@/lib/sinav';
import { xlsxOku } from '@/lib/xlsx-oku';
import { xlsxYaz } from '@/lib/xlsx-yaz';

const k = sinavKurali({});

describe('muafiyet kuralı', () => {
  it('varsayılan kuralın metni', () => {
    expect(kuralMetni(k)).toBe('Yazılıdan en az 50 alan sözlüye girer. Muafiyet için (yazılı × %50) + (sözlü × %50) en az 60 olmalıdır.');
  });
  it('doğrulama: ortalama yönteminde ayrı ayrı alanı korunur, hatalı sayı reddedilir', () => {
    const y = kuralDogrula({ yontem: 'ORTALAMA', yaziliGecme: '40', yaziliAgirlik: '40', muafiyetPuani: '65', sozluAltSinir: '', sozluGecme: '99' }, k);
    expect(y).toMatchObject({ yaziliGecme: 40, yaziliAgirlik: 40, muafiyetPuani: 65, sozluAltSinir: 0, sozluGecme: 60 });
    expect(kuralMetni(y)).toContain('(sözlü × %60) en az 65');
    expect(() => kuralDogrula({ yontem: 'ORTALAMA', yaziliGecme: '120' }, k)).toThrow('Sözlüye girme puanı');
    expect(() => kuralDogrula({ yontem: 'X' }, k)).toThrow('yöntemi');
    expect(kuralMetni(kuralDogrula({ yontem: 'AYRI', yaziliGecme: 0, sozluGecme: 70 }, k))).toBe('Herkes sözlüye girer. Muafiyet için sözlüden de en az 70 alınmalıdır.');
  });
  it('puan metni', () => {
    expect(['72,5', ' g ', '', '7O'].map(puanMetni)).toEqual(['72.5', 'G', '', null]);
  });
});

describe('puan listesi yükleme', () => {
  const sinav = [
    { no: '1', adi: 'Mehmet Can', soyadi: 'Demir', yazili: '', sozlu: '' },
    { no: '2', adi: 'Ayşe', soyadi: 'Yılmaz', yazili: '60', sozlu: '' },
    { no: '3', adi: 'Ali', soyadi: 'Veli', yazili: '', sozlu: '' },
    { no: '4', adi: 'Zeynep', soyadi: 'Ak', yazili: '', sozlu: '' }
  ];
  const og = new Map([['9', { durum: 'silindi' }]]);
  const dosya = [
    ['Sıra_X', 'Öğrenci No_X', 'Adı_X', 'Soyadı_X', 'HBN_X'],
    ['1', '1', 'MEHMET', 'DEMİR', '72,5'],   // ikinci ad eksik: uyumlu
    ['2', '2', 'Ayşe', 'Yılmaz', '65'],      // mevcut 60'tan farklı
    ['3', '3', 'Ahmet', 'Kaya', '80'],       // ad uyuşmuyor
    ['4', '4', 'Zeynep', 'Ak', '50'],
    ['5', '4', 'Zeynep', 'Ak', '55'],        // aynı numara farklı puan
    ['6', '9', 'Silik', 'Kayıt', '40'],
    ['7', '8', 'Hiç', 'Yok', 'G'],
    ['8', '5', 'Boş', 'Puan', ''],
    ['9', '6', 'Hatalı', 'Puan', '101']
  ];
  const b = puanBaslikBul(dosya);
  it('genel puan sütununu (HBN) ve ekli başlıkları tanır', () => {
    expect(b.basSatir).toBe(0);
    expect(b.eslesme).toMatchObject({ no: 1, adi: 2, soyadi: 3, genel: 4, yazili: -1 });
  });
  const e = { ...b.eslesme!, yazili: 4 };
  const f = puanFarkHesapla(dosya, 0, e, sinav, og);
  it('yeni, farklı, ad uyuşmayan, bulunamayan ve hatalı satırlar ayrılır', () => {
    expect(f.yeni.map(x => [x.no, x.deger])).toEqual([['1', '72.5'], ['3', '80']]);
    expect(f.degisen.map(x => [x.no, x.eski, x.yeni])).toEqual([['2', '60', '65']]);
    expect(f.adUyusmaz.map(x => x.no)).toEqual(['3']);
    expect(f.bulunamadi.map(x => [x.no, x.neden])).toEqual([['9', 'Kaydı silinmiş öğrenci'], ['8', 'Öğrenci listesinde yok']]);
    expect(f.hatali.map(x => x.satir)).toEqual([5, 6, 10]);
    expect(f.bosSatir).toBe(1);
  });
  it('varsayılanda yalnızca boş ve adı uyumlu olanlar yazılır; seçeneklerle genişler', () => {
    expect(f.yazilacak.map(x => x.no)).toEqual(['1']);
    const g = puanFarkHesapla(dosya, 0, e, sinav, og, { uzerineYaz: true, adUyusmazYaz: true });
    expect(g.yazilacak.map(x => x.no)).toEqual(['1', '2', '3']);
  });
  it('yükleme sonrası sonuç dağılımı', () => {
    const s = puanSonrasiSayim(sinav, f.yazilacak, k);
    expect(s.once.bekliyor).toBe(4);
    expect(s.sonra).toEqual({ muaf: 0, hazirlik: 0, bekliyor: 4, hata: 0 });   // 1 numara artık sözlü bekliyor
  });
  it('ad uyumu', () => {
    expect(adUyumlu('', '', 'Ali', 'Veli')).toBe(true);
    expect(adUyumlu('mehmet', 'demir', 'Mehmet Can', 'Demir')).toBe(true);
    expect(adUyumlu('Ahmet', 'Demir', 'Mehmet', 'Demir')).toBe(false);
  });
});

describe('xlsx yazıcı', () => {
  it('yazılan dosya okuyucuyla geri okunur (metin numaralar ve sayılar)', async () => {
    const veri = await xlsxYaz('Puanlar', [['Öğrenci No', 'Adı', 'Yazılı'], ['0123', 'A & B', 72.5], ['2024001', '<x>', 'G']], [14, 20, 10]);
    const kitap = await xlsxOku(veri);
    expect(kitap.sayfalar).toEqual(['Puanlar']);
    expect(kitap.satirlar('Puanlar')).toEqual([['Öğrenci No', 'Adı', 'Yazılı'], ['0123', 'A & B', '72.5'], ['2024001', '<x>', 'G']]);
  });
});
