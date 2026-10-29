import { describe, expect, it } from 'vitest';
import {
  dersleriDogrula, dsBaslikBul, dsOrtalama, dsPuanFarkHesapla, syBaslikEslestir, syGorunurluk, syKayitlariCikar, syMetaDogrula, syTarih, trGun,
  type DsHedef
} from '@/lib/donem-kurallari';
import { sinavListesi } from '@/components/ogrenci/sinav-listesi';
import type { SorguSonucu } from '@/lib/tipler';

describe('dönem sınavı kuralları', () => {
  it('ders doğrulama: tarih biçimi, tekrar eden ders', () => {
    expect(dersleriDogrula([{ ders: ' Sarf ', tarih: '2026-11-03', saat: '10.00' }, { ders: '' }])).toEqual([{ ders: 'Sarf', tarih: '03.11.2026', saat: '10.00' }]);
    expect(() => dersleriDogrula([{ ders: 'Sarf' }, { ders: 'SARF' }])).toThrow('iki kez');
    expect(() => dersleriDogrula([])).toThrow('En az bir ders');
    expect(() => dersleriDogrula([{ ders: 'Nahiv', tarih: 'yarın' }])).toThrow('tarih anlaşılamadı');
  });
  it('sınıf ortalaması eşiğin altında gösterilmez; G ve boş sayılmaz', () => {
    expect(dsOrtalama(['80', '70', 'G', '', '60'], 3)).toBe(70);
    expect(dsOrtalama(['80', '70', 'G'])).toBeNull();
    expect(dsOrtalama(['72.5', '67.5'], 1)).toBe(70);
  });
  it('tek dersli sınavda genel "Puan" sütunu derse eşlenir', () => {
    const b = dsBaslikBul([['No', 'Ad', 'Soyad', 'Puan']], ['Sarf']);
    expect(b.eslesme).toMatchObject({ no: 0, adi: 1, soyadi: 2, dersKolon: { Sarf: 3 } });
    expect(dsBaslikBul([['No', 'Sarf', 'Nahiv']], ['Sarf', 'Nahiv']).eslesme?.dersKolon).toEqual({ Sarf: 1, Nahiv: 2 });
  });
  it('çok dersli puan farkı', () => {
    const hedef: DsHedef[] = [{ no: '1', adi: 'Ayşe', soyadi: 'Y', p: { Sarf: '60' } }, { no: '2', adi: 'Ali', soyadi: 'V', p: {} }];
    const dosya = [['No', 'Ad', 'Soyad', 'Sarf', 'Nahiv'], ['1', 'Ayşe', 'Y', '60', '75'], ['2', 'Veli', 'V', 'G', ''], ['3', 'X', 'Y', '50', ''], ['4', 'Z', 'Q', '7O', '']];
    const e = { no: 0, adi: 1, soyadi: 2, adSoyad: -1, dersKolon: { Sarf: 3, Nahiv: 4 } };
    const f = dsPuanFarkHesapla(dosya, 0, e, hedef, new Map());
    expect(f.ayni).toBe(1);
    expect(f.yeni.map(x => [x.no, x.alan, x.deger])).toEqual([['1', 'Nahiv', '75'], ['2', 'Sarf', 'G']]);
    expect(f.adUyusmaz.map(x => x.no)).toEqual(['2']);
    expect(f.yazilacak.map(x => x.no)).toEqual(['1']);
    expect(f.bulunamadi.map(x => x.no)).toEqual(['3']);
    expect(f.hatali.map(x => x.satir)).toEqual([5]);
  });
});

describe('sınav yeri listesi', () => {
  it('başlık eşleştirme ve tarih biçimleri', () => {
    expect(syBaslikEslestir(['Öğr No', 'Adı Soyadı', 'Sınav Salonu', 'Sıra No', 'Kitapçık Türü', 'Sınav Tarihi'])).toMatchObject({ no: 0, adSoyad: 1, salon: 2, sira: 3, kitapcik: 4, tarih: 5, saat: -1 });
    expect(['23-9-2026', '23.09.2026', '2026-09-23', 'bilinmiyor'].map(syTarih)).toEqual(['23.09.2026', '23.09.2026', '23.09.2026', 'bilinmiyor']);
    expect(trGun('03.11.2026')).toBe(Date.UTC(2026, 10, 3));
  });
  it('kayıtlar, tekrar eden numara ve sıra, kayıtsız öğrenciler', () => {
    const e = syBaslikEslestir(['No', 'Ad', 'Soyad', 'Salon', 'Sıra No', 'Sınav Adı', 'Tarih']);
    const dosya = [['No', 'Ad', 'Soyad', 'Salon', 'Sıra No', 'Sınav Adı', 'Tarih'],
      ['1', 'Ayşe', 'Y', 'A101', '1', 'Ara Sınav', '03.11.2026'], ['2', 'Ali', 'V', 'A101', '1', 'Ara Sınav', '03.11.2026'],
      ['3', 'X', 'Y', 'A102', '5', '', ''], ['3', 'X', 'Y', 'A103', '5', '', ''], ['4', 'Z', 'Q', '', '2', '', ''], ['1', 'Ayşe', 'Y', 'A101', '1', '', '']];
    const og = new Map([['1', { adi: 'Ayşe', soyadi: 'Y', durum: 'aktif' }], ['9', { adi: 'Dokuz', soyadi: 'D', durum: 'aktif' }]]);
    const r = syKayitlariCikar(dosya, 0, e, og);
    expect(r.kayit.map(k => k.no)).toEqual(['1', '2']);
    expect(r.hatali.map(h => h.satir)).toEqual([4, 5, 6]);   // 3 farklı salonda iki kez, 4 salonsuz
    expect(r.siraTekrar).toEqual([{ salon: 'A101', sira: '1', nolar: '1, 2' }]);
    expect(r.kayitsiz.map(k => k.no)).toEqual(['2']);
    expect(r.listedeYok.map(k => k.no)).toEqual(['9']);
    expect(r.meta.sinavAdi).toEqual(['Ara Sınav']);
  });
  it('meta doğrulama ve görünürlük (tarihi 3 günden eski liste gösterilmez)', () => {
    expect(() => syMetaDogrula({ ad: '' })).toThrow('adını');
    expect(syMetaDogrula({ ad: ' Final ', tarih: '2026-11-03' })).toMatchObject({ ad: 'Final', tarih: '03.11.2026' });
    const bugun = Date.UTC(2026, 10, 10);
    expect(syGorunurluk({ yayinda: false, tarih: '10.11.2026' }, bugun)).toBe('gizli');
    expect(syGorunurluk({ yayinda: true, tarih: '07.11.2026' }, bugun)).toBe('gorunur');
    expect(syGorunurluk({ yayinda: true, tarih: '06.11.2026' }, bugun)).toBe('eski');
  });
});

describe('öğrenci ekranı sınav listesi', () => {
  const temel = { bulundu: true as const, numara: '1', adSoyad: 'A', maskeli: false, duyurular: [],
    gorunum: { sinif: true, derslik: true, program: true, sinavlar: true, duyurular: true, devamsizlik: true } };
  const yer = (ad: string, tarih: string, donemKod = '', gecti = false) => ({ ad, tarih, saat: '', yer: '', aciklama: '', salon: 'A1', sira: '3', donemKod, gecti });
  it('dönem sınavı bağlı yerle birleşir; muafiyet sonucu "muafiyet" listesine eklenir; tamamlananlar sona', () => {
    const r: SorguSonucu = { ...temel, tur: 'sinif', sinif: 'Hazırlık A', derslik: 'Z-05', program: [],
      sinav: { yer: '', yayinda: true, sonuc: 'Muaf', yazili: '90', sozlu: '95' },
      sinavYerleri: [yer('Ara Sınav Yerleri', '20.11.2026', 'S1'), yer('Muafiyet Sınavı', '01.09.2026', '', true), yer('Bağımsız', '10.11.2026')],
      donemSinavlari: { sonucVar: false, sinavlar: [{ kod: 'S1', ad: 'Ara Sınav', sinif: 'Hazırlık A', yerYayinda: true, sonucVar: false, dersler: [{ ders: 'Sarf', tarih: '20.11.2026', saat: '', yer: 'Z-05', gecti: false }] }] } };
    const l = sinavListesi(r as Extract<SorguSonucu, { bulundu: true }>);
    expect(l.map(x => [x.tip, x.ad])).toEqual([['yer', 'Bağımsız'], ['donem', 'Ara Sınav'], ['yer', 'Muafiyet Sınavı']]);
    expect(l[1].tip === 'donem' && l[1].yer?.salon).toBe('A1');
    expect(l[2].tip === 'yer' && l[2].sv?.sonuc).toBe('Muaf');
  });
  it('"Sınavlarım" kapalıysa liste boş', () => {
    const r = { ...temel, tur: 'sinavyeri' as const, sinav: null, sinavYerleri: [yer('X', '20.11.2026')], gorunum: { ...temel.gorunum, sinavlar: false } };
    expect(sinavListesi(r)).toEqual([]);
  });
});
