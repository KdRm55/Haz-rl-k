import { describe, expect, it } from 'vitest';
import {
  alfabetik, dagitDengeli, dagitSeviyeli, degisiklikleriDenetle, duzenDogrula, plandanSiniflar, sinifMetrik, taslakDenetle,
  type DagitimSinifi, type YerlestirmeBilgisi
} from '@/lib/siniflandirma-kurallari';

const ogr = (no: string, cinsiyet: string, puan: number | null) => ({ no, cinsiyet, puan });
const siniflar: DagitimSinifi[] = [{ ad: 'Hazırlık A', tur: 'K' }, { ad: 'Hazırlık B', tur: 'K' }, { ad: 'Hazırlık C', tur: 'E' }];

describe('sınıf düzeni', () => {
  it('önce kız sonra erkek sınıfları, harfler sırayla', () => {
    expect(plandanSiniflar({ duzen: 'AYRI', kiz: 2, erkek: 1, karma: 0, yontem: 'SEVIYELI' })).toEqual([
      { ad: 'Hazırlık A', tur: 'K' }, { ad: 'Hazırlık B', tur: 'K' }, { ad: 'Hazırlık C', tur: 'E' }]);
    expect(plandanSiniflar({ duzen: 'KARMA', kiz: 0, erkek: 0, karma: 2, yontem: 'DENGELI' }).map(s => s.tur)).toEqual(['Karma', 'Karma']);
  });
  it('doğrulama', () => {
    expect(() => duzenDogrula({ duzen: 'AYRI', kiz: 0, erkek: 0 })).toThrow('En az bir kız ya da erkek');
    expect(() => duzenDogrula({ duzen: 'KARMA', karma: '1.5' })).toThrow('tam sayı');
    expect(duzenDogrula({ duzen: 'KARMA', karma: '3', yontem: 'DENGELI' })).toMatchObject({ duzen: 'KARMA', karma: 3, kiz: 0, yontem: 'DENGELI' });
  });
});

describe('seviyeli dağıtım', () => {
  const kizlar = [90, 80, 70, 60, null].map((p, i) => ogr('K' + i, 'K', p));
  it('puan sırasıyla doldurur, artan ilk sınıfa; sınava girmeyen son sınıfa', () => {
    const d = dagitSeviyeli([...kizlar, ogr('E1', 'E', 50)], siniflar);
    expect(d.atama).toEqual({ K0: 'Hazırlık A', K1: 'Hazırlık A', K2: 'Hazırlık A', K3: 'Hazırlık B', K4: 'Hazırlık B', E1: 'Hazırlık C' });
  });
  it('sabit öğrenci payından düşülür', () => {
    const d = dagitSeviyeli(kizlar, siniflar, { K4: 'Hazırlık A' });
    expect(Object.values(d.atama).filter(s => s === 'Hazırlık A')).toHaveLength(3);
    expect(d.atama.K4).toBe('Hazırlık A');
  });
  it('uygun sınıf yoksa yerleştirilemez; cinsiyetsiz karma yoksa', () => {
    const d = dagitSeviyeli([ogr('X', '', 70)], siniflar);
    expect(d.yerlesemeyen).toEqual([{ no: 'X', neden: 'Cinsiyet bilgisi yok ve karma sınıf tanımlı değil' }]);
    expect(dagitSeviyeli([ogr('X', '', 70)], [...siniflar, { ad: 'Hazırlık D', tur: 'Karma' }]).atama.X).toBe('Hazırlık D');
  });
});

describe('dengeli dağıtım', () => {
  it('mevcutlar en fazla 1 farklı, puanlar dağılır, sınava girmeyenler eşit', () => {
    const kizlar = [95, 90, 85, 80, 75, 70, null, null].map((p, i) => ogr('K' + i, 'K', p));
    const d = dagitDengeli(kizlar, siniflar);
    const bilgi = Object.fromEntries(kizlar.map(o => [o.no, o]));
    const m = sinifMetrik(d.atama, bilgi, siniflar);
    expect(m.siniflar.map(x => [x.ad, x.n, x.puansiz])).toEqual([['Hazırlık A', 4, 1], ['Hazırlık B', 4, 1], ['Hazırlık C', 0, 0]]);
    expect(Math.abs(m.siniflar[0].ort! - m.siniflar[1].ort!)).toBeLessThanOrEqual(2.5);
    expect(m.denge).toEqual([{ tur: 'K', sinif: 2, sayiFark: 0, ortFark: m.denge[0].ortFark, puansizFark: 0 }]);
  });
});

describe('taslak denetimi', () => {
  const b = (no: string, cinsiyet: string, sonuc = 'Hazırlık'): YerlestirmeBilgisi => ({ no, adi: 'Ad' + no, soyadi: 'S', cinsiyet, puan: 60, yazili: '60', sozlu: '', sonuc, sinavdaVar: true });
  const bilgi = { 1: b('1', 'K'), 2: b('2', 'E'), 3: b('3', 'K', 'Muaf'), 4: b('4', 'K', 'Bekliyor'), 5: b('5', '') };
  const d = taslakDenetle([{ no: '1', sinif: 'Hazırlık B' }, { no: '2', sinif: 'Hazırlık A' }, { no: '3', sinif: 'Hazırlık A' }, { no: '4', sinif: 'Hazırlık A' },
    { no: '9', sinif: 'Hazırlık A' }, { no: '1', sinif: 'Hazırlık A' }, { no: '5', sinif: 'Hazırlık A' }], bilgi, siniflar, { 1: 'Hazırlık A', 7: 'Hazırlık C' });
  it('hata ve uyarıları ayırır', () => {
    expect(d.hata).toBe(4);   // erkek kız sınıfında, muaf, aktif değil, tekrar
    expect(d.sorunlar.filter(s => s.seviye === 'uyari').map(s => s.ayrinti.slice(0, 20))).toEqual(['Cinsiyet bilgisi yok', '1 öğrencinin sınav s']);
  });
  it('yayındaki listeyle karşılaştırır', () => {
    expect(d.degisim.tasinan).toEqual([{ no: '1', ad: 'Ad1 S', eski: 'Hazırlık A', yeni: 'Hazırlık B' }]);
    expect(d.degisim.yeniSayi).toBe(3);   // 2, 4, 5
    expect(d.degisim.cikan).toEqual([{ no: '7', ad: '', eski: 'Hazırlık C', neden: 'kaydı aktif değil' }]);
  });
});

describe('tek tek sınıf değişikliği', () => {
  const ogrenci = new Map([
    ['1', { adi: 'Ayşe', soyadi: 'Y', cinsiyet: 'K', durum: 'aktif', muaf: false }],
    ['2', { adi: 'Ali', soyadi: 'V', cinsiyet: 'E', durum: 'aktif', muaf: false }],
    ['3', { adi: 'Zeynep', soyadi: 'A', cinsiyet: 'K', durum: 'aktif', muaf: true }]
  ]);
  const s = new Map([['Hazırlık A', { tur: 'K' }], ['Hazırlık C', { tur: 'E' }]]);
  it('geçerli değişiklik hatasız geçer', () => {
    expect(degisiklikleriDenetle([{ no: '1', eski: 'Hazırlık A', yeni: '' }], ogrenci, { 1: 'Hazırlık A' }, s)).toEqual([]);
  });
  it('hatalar toplanır', () => {
    const h = degisiklikleriDenetle([
      { no: '2', eski: '', yeni: 'Hazırlık A' }, { no: '3', eski: '', yeni: 'Hazırlık A' }, { no: '1', eski: '', yeni: 'Hazırlık A' }, { no: '9', eski: '', yeni: '' }
    ], ogrenci, { 1: 'Hazırlık A' }, s);
    expect(h).toEqual([
      'Ali V: erkek öğrenci kız sınıfına (Hazırlık A) alınamaz.',
      'Zeynep A: muafiyet sınavını geçmiş, sınıfa alınamaz.',
      'Ayşe Y: sınıfı siz bakarken değişmiş (şu an Hazırlık A). Paneli yenileyin.',
      '9: aktif bir öğrenci değil.'
    ]);
  });
  it('sınıf listeleri Türkçe alfabeye göre sıralanır', () => {
    const l = [{ no: '3', adi: 'Çağla', soyadi: 'A' }, { no: '2', adi: 'Ceren', soyadi: 'B' }, { no: '1', adi: 'Ömer', soyadi: 'C' }, { no: '4', adi: 'Oya', soyadi: 'D' }];
    expect(l.sort(alfabetik).map(x => x.adi)).toEqual(['Ceren', 'Çağla', 'Oya', 'Ömer']);
  });
});
