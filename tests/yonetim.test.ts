import { describe, expect, it } from 'vitest';
import {
  baslikBul, dosyaKayitlari, eslesmeDogrula, eslesmeKaydi, farkHesapla, ortakEkiTemizle, satirEslesmesi, silmeEsigi, sutunHarfi, tcGecerli
} from '@/lib/aktarim-kurallari';
import { csvAyristir } from '@/lib/dosya-oku';
import { programTablosuOku } from '@/lib/program-kurallari';
import { sablonXmlDoldur } from '@/lib/sablon-xml';

describe('liste yükleme: başlık ve sütunlar', () => {
  it('başlık satırını üst boş satırlardan sonra bulur', () => {
    const s = [['Proliz Ders Listesi'], [], ['Sıra', 'Öğrenci No', 'Adı', 'Soyadı', 'TC Kimlik No', 'Cinsiyet']];
    const b = baslikBul(s, null);
    expect(b.basSatir).toBe(2);
    expect(b.eslesme).toMatchObject({ no: 1, adi: 2, soyadi: 3, tc: 4, cinsiyet: 5, bolum: -1 });
  });
  it('başlıklardaki ortak eki ("_0404KZ") yok sayar', () => {
    expect(ortakEkiTemizle(['Öğrenci No_0404KZ', 'Adı_0404KZ', 'Soyadı_0404KZ', 'Puan_0404KZ', 'Not'])).toEqual(['Öğrenci No', 'Adı', 'Soyadı', 'Puan', 'Not']);
    // %80'in altında (4 başlıktan 3'ü) ek temizlenmez
    expect(ortakEkiTemizle(['Öğrenci No_0404KZ', 'Adı_0404KZ', 'Soyadı_0404KZ', 'Puan'])[0]).toBe('Öğrenci No_0404KZ');
    expect(satirEslesmesi(['Öğrenci No_X1', 'Adı_X1', 'Soyadı_X1'], null)).toMatchObject({ no: 0, adi: 1, soyadi: 2 });
  });
  it('kayıtlı eşleştirme önce denenir', () => {
    const kayitli = eslesmeKaydi(['Okul Numarası', 'İsim', 'Soyisim'], { no: 0, tc: -1, adi: 1, soyadi: 2, adSoyad: -1, cinsiyet: -1, bolum: -1, eposta: -1, telefon: -1 });
    expect(baslikBul([['Okul Numarası', 'İsim', 'Soyisim']], kayitli).eslesme).toMatchObject({ no: 0, adi: 1, soyadi: 2 });
  });
  it('eşleştirme doğrulaması zorunlu alanları ister', () => {
    expect(() => eslesmeDogrula({ no: -1, adi: 1, soyadi: 2 }, 3)).toThrow('Öğrenci No');
    expect(() => eslesmeDogrula({ no: 0, adi: 1 }, 3)).toThrow('Soyadı');
    expect(eslesmeDogrula({ no: 0, adSoyad: 1, tc: 9 }, 3)).toMatchObject({ no: 0, adSoyad: 1, tc: -1 });
  });
  it('sütun harfleri', () => {
    expect([0, 25, 26, 27, 701].map(sutunHarfi)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ']);
  });
});

describe('liste yükleme: kayıt doğrulama', () => {
  it('TC algoritması', () => {
    expect(tcGecerli('10000000146')).toBe(true);
    expect(tcGecerli('10000000147')).toBe(false);
    expect(tcGecerli('01234567890')).toBe(false);
  });
  const e = { no: 0, tc: 3, adi: 1, soyadi: 2, adSoyad: -1, cinsiyet: 4, bolum: -1, eposta: -1, telefon: -1 };
  const satirlar = [
    ['No', 'Adı', 'Soyadı', 'TC', 'Cinsiyet'],
    ['2024001', 'Ayşe', 'Yılmaz', '10000000146', 'Kız'],
    ['(A) 2024002', 'Fatma', 'Kaya', '', 'K'],
    ['2024003', 'Ali', 'Veli', '12345678901', 'X'],
    ['20240A4', 'Hatalı', 'Numara', '', ''],
    ['', 'Numarasız', 'Öğrenci', '', ''],
    ['2024001', 'Başka', 'Kişi', '', ''],
    ['2024005', '', '', '', ''],
    ['', '', '', '', '']
  ];
  const d = dosyaKayitlari(satirlar, 0, e);
  it('geçerli kayıtlar alınır, TC\'nin yalnızca son 4 hanesi saklanır', () => {
    expect(Object.keys(d.kayit)).toEqual(['2024001', '2024002', '2024003']);
    expect(d.kayit['2024001']).toMatchObject({ tc4: '0146', cinsiyet: 'K', satir: 2 });
  });
  it('hatalı satırlar Excel satır numarasıyla raporlanır', () => {
    expect(d.hatalar.map(h => [h.satir, h.neden.slice(0, 25)])).toEqual([
      [5, 'Öğrenci numarası rakam dı'], [6, 'Öğrenci numarası boş'], [7, 'Numara dosyada tekrar edi'], [8, 'Ad ve soyad boş']
    ]);
  });
  it('işaretli numara, geçersiz TC ve tanınmayan cinsiyet uyarı olur', () => {
    expect(d.uyarilar.map(u => u.satir)).toEqual([3, 4, 4]);
  });
});

describe('liste yükleme: fark', () => {
  const kayit = (no: string, adi: string, ek: object = {}) => ({ no, tc4: '', tc6: '', adi, soyadi: 'S', cinsiyet: '', bolum: '', eposta: '', telefon: '', satir: 2, ...ek });
  const mevcut = [
    { no: '1', adi: 'Ayşe', soyadi: 'S', durum: 'aktif' as const, bolum: 'İlahiyat' },
    { no: '2', adi: 'Fatma', soyadi: 'S', durum: 'aktif' as const },
    { no: '3', adi: 'Ali', soyadi: 'S', durum: 'silindi' as const },
    { no: '4', adi: 'Veli', soyadi: 'S', durum: 'aktif' as const }
  ];
  const f = farkHesapla(mevcut, { 1: kayit('1', 'AYŞE', { bolum: '' }), 2: kayit('2', 'Fatma Nur'), 3: kayit('3', 'Ali'), 5: kayit('5', 'Yeni') }, ['adi', 'soyadi', 'bolum']);
  it('büyük/küçük harf farkı değişiklik sayılmaz; boş gelen alan mevcut değeri silmez', () => {
    expect(f.ayni).toBe(1);
  });
  it('yeni, değişen, geri gelen ve dosyada olmayanlar ayrılır', () => {
    expect(f.yeni.map(x => x.no)).toEqual(['5']);
    expect(f.degisen).toEqual([{ no: '2', ad: 'Fatma Nur S', degisiklikler: [{ alan: 'adi', eski: 'Fatma', yeni: 'Fatma Nur' }] }]);
    expect(f.geriGelen.map(x => x.no)).toEqual(['3']);
    expect(f.silinen).toEqual([{ no: '4', ad: 'Veli S' }]);
  });
  it('toplu silme eşiği: aktiflerin %10\'u, en az 5', () => {
    expect([10, 50, 51, 300].map(silmeEsigi)).toEqual([5, 5, 6, 30]);
  });
});

describe('ders programı tablosu', () => {
  it('başlığı bulur, hocası boş satırları atlar', () => {
    const r = programTablosuOku([['Hazırlık Programı'], ['Öğretim Elemanı', 'Ders Adı', 'Gün', 'Ders Saati', 'Şube'], ['Dr. A', 'Okuma', 'Pazartesi', '09:00', 'A'], ['', 'x', 'y', 'z', 'w']]);
    expect(r).toEqual({ satirlar: [{ hoca: 'Dr. A', ders: 'Okuma', gun: 'Pazartesi', saat: '09:00', sube: 'A', derslik: '' }] });
  });
  it('eksik sütunları bildirir', () => {
    expect(programTablosuOku([['Hoca', 'Ders', 'Gün']]).eksik).toEqual(['Saat', 'Şube']);
  });
});

describe('dosya okuma ve şablon', () => {
  it('CSV: noktalı virgül, tırnak ve satır sonları', () => {
    expect(csvAyristir('No;Ad\r\n1;"Ayşe; Nur"\n2;"Çift ""tırnak"""\n')).toEqual([['No', 'Ad'], ['1', 'Ayşe; Nur'], ['2', 'Çift "tırnak"']]);
    expect(csvAyristir('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('şablon XML\'ine satırlar yazılır, biçim korunur, fazla satır eklenir', () => {
    const xml = '<dimension ref="A1:H3"/><sheetData><row r="1"><c r="A1" s="1" t="s"><v>0</v></c></row><row r="2" ht="15"><c r="A2" s="5"/><c r="B2" s="5"/></row></sheetData>';
    const out = sablonXmlDoldur(xml, [['2024001', 'A & B'], ['2024002', '<C>']]);
    expect(out).toContain('<row r="2" ht="15"><c r="A2" s="5" t="inlineStr"><is><t xml:space="preserve">2024001</t></is></c><c r="B2" s="5" t="inlineStr"><is><t xml:space="preserve">A &amp; B</t></is></c></row>');
    expect(out).toContain('<row r="3"><c r="A3" t="inlineStr"><is><t xml:space="preserve">2024002</t></is></c><c r="B3" t="inlineStr"><is><t xml:space="preserve">&lt;C&gt;</t></is></c></row></sheetData>');
    expect(out).toContain('<dimension ref="A1:H3"/>');
  });
});

describe('yönetim stilinin hoca ekranında kapsamlanması', () => {
  it('seçicilere kök eklenir; :root köke döner, body atlanır, @media içi de kapsamlanır', async () => {
    const { kapsamliCss } = await import('@/components/yonetim/stil');
    const css = ':root{--brand:#123} body{padding:20px} .btn, .tab{color:red} /* not */ @media (max-width:500px){ .btn{width:100%} } @keyframes spin{to{transform:rotate(1turn)}}';
    expect(kapsamliCss(css, '.k')).toBe('.k{--brand:#123}.k .btn, .k .tab{color:red}@media (max-width:500px){.k .btn{width:100%}}@keyframes spin{to{transform:rotate(1turn)}}');
  });
});
