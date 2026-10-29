/**
 * Veritabanı şeması. Apps Script sürümündeki e-tablo sayfalarının karşılıkları:
 *   Sınıflar → siniflar · "Hazırlık X" sayfaları + Öğrenciler → ogrenciler (sinifId)
 *   Ayarlar → ayarlar · Yetkililer → yetkililer · İşlem Kaydı → islemKaydi · (yeni) kişisel hesaplar → kullanicilar
 *   Hoca Programları → hocaProgrami · Duyurular → duyurular · Sınav Sonuçları → sinavSonuclari
 *   Aktarım Geçmişi → aktarimGecmisi · Öğrenci Değişiklikleri → ogrenciDegisiklikleri · Sınıf Taslağı → sinifTaslagi
 *   Dönem Sınavları + "DS …" sayfaları → donemSinavlari, donemSinavDersleri, donemSinavOgrencileri, donemSinavPuanlari, donemSinavYerleri
 *   Sınav Yeri Listeleri / Kayıtları → sinavYeriListeleri, sinavYeriKayitlari
 *   Yoklama → yoklamalar · Yoklama Evrakları → yoklamaEvraklari · Drive tarama klasörü → taramaGorselleri
 */
/*
 * Bütün tablolarda satır güvenliği (RLS) açıktır ve hiç kural tanımlı değildir: Supabase gibi tabloları REST API ile
 * dışarı açan sağlayıcılarda veriler o yoldan okunamaz. Uygulama tablo sahibi olarak bağlandığı için etkilenmez.
 */
import { boolean, date, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const siniflar = pgTable('siniflar', {
  id: serial('id').primaryKey(),
  ad: text('ad').notNull().unique(),             // "Hazırlık A"
  anahtar: text('anahtar').notNull().unique(),   // "A" (Türkçe karakter ve boşluk temizlenmiş)
  derslik: text('derslik').notNull().default(''),
  tur: text('tur').notNull().default('Karma'),   // 'K' | 'E' | 'Karma'
  kapasite: integer('kapasite').notNull().default(0),
  aktif: boolean('aktif').notNull().default(true)
}).enableRLS();

export const ogrenciler = pgTable('ogrenciler', {
  no: text('no').primaryKey(),
  adi: text('adi').notNull().default(''),
  soyadi: text('soyadi').notNull().default(''),
  cinsiyet: text('cinsiyet').notNull().default(''),          // 'K' | 'E' | ''
  tc4: text('tc4').notNull().default(''),                    // TC kimlik numarasının yalnızca son 4 hanesi
  tc6: text('tc6').notNull().default(''),                    // TC kimlik numarasının son 6 hanesi (hesap açarken kimlik doğrulaması)
  dogrulamaDegeri: text('dogrulama_degeri').notNull().default(''), // eski DOGRULAMA_SUTUNU düzeni için
  bolum: text('bolum').notNull().default(''),
  eposta: text('eposta').notNull().default(''),
  telefon: text('telefon').notNull().default(''),
  durum: text('durum').notNull().default('aktif'),           // 'aktif' | 'silindi'
  kayitli: boolean('kayitli').notNull().default(true),       // false: yalnızca sınıf listesinde var, öğrenci listesinde yok
  not: text('not').notNull().default(''),
  sinifId: integer('sinif_id').references(() => siniflar.id, { onDelete: 'set null' }),
  sinifSira: integer('sinif_sira'),
  ilkGorulme: timestamp('ilk_gorulme', { withTimezone: true }).notNull().defaultNow(),
  sonGorulme: timestamp('son_gorulme', { withTimezone: true }),   // son yüklenen listede görüldüğü an
  guncellendi: timestamp('guncellendi', { withTimezone: true }).notNull().defaultNow()
}, t => [index('ogrenciler_sinif_idx').on(t.sinifId)]).enableRLS();

export const ayarlar = pgTable('ayarlar', {
  anahtar: text('anahtar').primaryKey(),
  deger: text('deger').notNull().default(''),
  aciklama: text('aciklama').notNull().default('')
}).enableRLS();

export const yetkililer = pgTable('yetkililer', {
  eposta: text('eposta').primaryKey(),
  rol: text('rol').notNull(),            // 'admin' | 'hoca'
  adSoyad: text('ad_soyad').notNull().default('')
}).enableRLS();

/**
 * Kişisel hesaplar. Yönetici ve hoca e-postayla, öğrenci öğrenci numarasıyla girer.
 * Öğrenci hesabı TC son 6 haneyle doğrulanarak açılır; hoca hesabı yönetici onaylayınca etkinleşir.
 */
export const kullanicilar = pgTable('kullanicilar', {
  id: serial('id').primaryKey(),
  tur: text('tur').notNull(),                                  // 'admin' | 'hoca' | 'ogrenci'
  ogrenciNo: text('ogrenci_no').unique(),                      // yalnızca öğrenci
  eposta: text('eposta').unique(),                             // yönetici ve hoca (küçük harf)
  adSoyad: text('ad_soyad').notNull().default(''),
  hocaAdi: text('hoca_adi').notNull().default(''),             // hocanın ders programındaki adı
  sifreOzeti: text('sifre_ozeti').notNull(),                   // scrypt özeti
  durum: text('durum').notNull().default('aktif'),             // 'bekliyor' | 'aktif' | 'pasif'
  sifreDegistirmeli: boolean('sifre_degistirmeli').notNull().default(false),   // yöneticinin verdiği geçici şifre
  oturumSurumu: integer('oturum_surumu').notNull().default(1), // şifre değişince ya da hesap kapanınca eski oturumlar düşer
  olusturma: timestamp('olusturma', { withTimezone: true }).notNull().defaultNow(),
  sonGiris: timestamp('son_giris', { withTimezone: true })
}).enableRLS();

/** Eski ortak erişim kodları (kişisel hesaplardan önce). Artık kullanılmıyor; geçmiş kurulumlar için duruyor. */
export const erisimKodlari = pgTable('erisim_kodlari', {
  rol: text('rol').primaryKey(),         // 'admin' | 'hoca'
  kodOzeti: text('kod_ozeti').notNull(), // scrypt özeti; kodun kendisi saklanmaz
  guncellendi: timestamp('guncellendi', { withTimezone: true }).notNull().defaultNow()
}).enableRLS();

export const girisDenemeleri = pgTable('giris_denemeleri', {
  id: serial('id').primaryKey(),
  anahtar: text('anahtar').notNull(),    // istemci IP adresi
  zaman: timestamp('zaman', { withTimezone: true }).notNull().defaultNow()
}, t => [index('giris_denemeleri_idx').on(t.anahtar, t.zaman)]).enableRLS();

export const islemKaydi = pgTable('islem_kaydi', {
  id: serial('id').primaryKey(),
  zaman: timestamp('zaman', { withTimezone: true }).notNull().defaultNow(),
  kullanici: text('kullanici').notNull(),
  islem: text('islem').notNull(),
  ayrinti: text('ayrinti').notNull().default('')
}).enableRLS();

export const hocaProgrami = pgTable('hoca_programi', {
  id: serial('id').primaryKey(),
  hoca: text('hoca').notNull(),
  ders: text('ders').notNull().default(''),
  gun: text('gun').notNull().default(''),
  saat: text('saat').notNull().default(''),
  sube: text('sube').notNull().default(''),   // e-tablodaki yazım korunur ("A", "Hazırlık A", "Özel" …)
  derslik: text('derslik').notNull().default(''),
  sira: integer('sira').notNull().default(0)
}).enableRLS();

export const duyurular = pgTable('duyurular', {
  id: serial('id').primaryKey(),
  baslik: text('baslik').notNull().default(''),
  metin: text('metin').notNull().default(''),
  kime: text('kime').notNull().default('Herkes'),
  baslangic: date('baslangic', { mode: 'string' }),
  bitis: date('bitis', { mode: 'string' }),       // bitiş günü dahil
  aktif: boolean('aktif').notNull().default(true),
  olusturma: timestamp('olusturma', { withTimezone: true }).notNull().defaultNow()
}).enableRLS();

export const sinavSonuclari = pgTable('sinav_sonuclari', {
  no: text('no').primaryKey(),
  adi: text('adi').notNull().default(''),
  soyadi: text('soyadi').notNull().default(''),
  yer: text('yer').notNull().default(''),
  yazili: text('yazili').notNull().default(''),   // '' | '0'–'100' | 'G' (girmedi)
  sozlu: text('sozlu').notNull().default('')
}).enableRLS();

export const aktarimGecmisi = pgTable('aktarim_gecmisi', {
  id: serial('id').primaryKey(),
  tarih: timestamp('tarih', { withTimezone: true }).notNull().defaultNow(),
  kullanici: text('kullanici').notNull(),
  dosya: text('dosya').notNull().default(''),
  gecerli: integer('gecerli').notNull(),
  yeni: integer('yeni').notNull(),
  degisen: integer('degisen').notNull(),
  silinen: integer('silinen').notNull(),
  geriGelen: integer('geri_gelen').notNull(),
  degismeyen: integer('degismeyen').notNull(),
  hatali: integer('hatali').notNull()
}).enableRLS();

/** Her alan değişikliğinin izi: liste yüklemesinden ("A-0003") ya da panelden elle ("Elle"). */
export const ogrenciDegisiklikleri = pgTable('ogrenci_degisiklikleri', {
  id: serial('id').primaryKey(),
  tarih: timestamp('tarih', { withTimezone: true }).notNull().defaultNow(),
  kaynak: text('kaynak').notNull(),
  ogrenciNo: text('ogrenci_no').notNull(),
  adSoyad: text('ad_soyad').notNull().default(''),
  alan: text('alan').notNull(),
  eski: text('eski').notNull().default(''),
  yeni: text('yeni').notNull().default('')
}, t => [index('ogrenci_degisiklikleri_no_idx').on(t.ogrenciNo)]).enableRLS();

/** Sınıf taslağı (e-tablodaki "Sınıf Taslağı" sayfası): yayınlanana kadar öğrencilere ve hocalara görünmez. */
export const sinifTaslagi = pgTable('sinif_taslagi', {
  no: text('no').primaryKey(),
  sinif: text('sinif').notNull().default(''),   // sınıf adı ("Hazırlık A"); boş = sınıf seçilmedi
  sabit: boolean('sabit').notNull().default(false),   // işaretliyse "Yeniden dağıt" yerini değiştirmez
  sira: integer('sira').notNull().default(0)
}).enableRLS();

/* ---------- Dönem (yıl içi) sınavları ---------- */
export const donemSinavlari = pgTable('donem_sinavlari', {
  kod: text('kod').primaryKey(),   // "S1", "S2" …
  ad: text('ad').notNull(),
  siniflar: jsonb('siniflar').$type<string[]>().notNull().default([]),   // katılan sınıf adları
  yerYayinda: boolean('yer_yayinda').notNull().default(false),
  arsiv: boolean('arsiv').notNull().default(false),
  olusturma: timestamp('olusturma', { withTimezone: true }).notNull().defaultNow()
}).enableRLS();

export const donemSinavDersleri = pgTable('donem_sinav_dersleri', {
  sinavKod: text('sinav_kod').notNull().references(() => donemSinavlari.kod, { onDelete: 'cascade' }),
  ders: text('ders').notNull(),
  tarih: text('tarih').notNull().default(''),   // gg.aa.yyyy
  saat: text('saat').notNull().default(''),
  sonucYayinda: boolean('sonuc_yayinda').notNull().default(false),
  sira: integer('sira').notNull().default(0)
}, t => [primaryKey({ columns: [t.sinavKod, t.ders] })]).enableRLS();

/** Sınava katılan öğrenciler: oluşturulduğu andaki sınıfıyla (sonradan sınıf değişse de sonuçlar o sınıfla kalır). */
export const donemSinavOgrencileri = pgTable('donem_sinav_ogrencileri', {
  sinavKod: text('sinav_kod').notNull().references(() => donemSinavlari.kod, { onDelete: 'cascade' }),
  no: text('no').notNull(),
  adi: text('adi').notNull().default(''),
  soyadi: text('soyadi').notNull().default(''),
  sinif: text('sinif').notNull().default('')
}, t => [primaryKey({ columns: [t.sinavKod, t.no] })]).enableRLS();

/** Puan: "0"–"100" ya da "G" (girmedi). Satır yoksa puan henüz girilmemiştir. */
export const donemSinavPuanlari = pgTable('donem_sinav_puanlari', {
  sinavKod: text('sinav_kod').notNull().references(() => donemSinavlari.kod, { onDelete: 'cascade' }),
  no: text('no').notNull(),
  ders: text('ders').notNull(),
  puan: text('puan').notNull()
}, t => [primaryKey({ columns: [t.sinavKod, t.no, t.ders] })]).enableRLS();

/** Sınıf bazında özel sınav yeri (yoksa sınıfın dersliği). */
export const donemSinavYerleri = pgTable('donem_sinav_yerleri', {
  sinavKod: text('sinav_kod').notNull().references(() => donemSinavlari.kod, { onDelete: 'cascade' }),
  sinif: text('sinif').notNull(),
  yer: text('yer').notNull()
}, t => [primaryKey({ columns: [t.sinavKod, t.sinif] })]).enableRLS();

/* ---------- Sınav yeri listeleri (kelebek sistem çıktısı) ---------- */
export const sinavYeriListeleri = pgTable('sinav_yeri_listeleri', {
  kod: text('kod').primaryKey(),   // "L1", "L2" …
  ad: text('ad').notNull(),
  sinavKodu: text('sinav_kodu').notNull().default(''),
  tarih: text('tarih').notNull().default(''),   // gg.aa.yyyy
  saat: text('saat').notNull().default(''),
  yer: text('yer').notNull().default(''),
  aciklama: text('aciklama').notNull().default(''),
  donemKod: text('donem_kod').notNull().default(''),   // bağlı dönem sınavı (isteğe bağlı)
  yayinda: boolean('yayinda').notNull().default(false),
  yukleme: timestamp('yukleme', { withTimezone: true }).notNull().defaultNow(),
  dosya: text('dosya').notNull().default('')
}).enableRLS();

/** Kitapçık türü saklanır ama öğrenciye gösterilmez. */
export const sinavYeriKayitlari = pgTable('sinav_yeri_kayitlari', {
  listeKod: text('liste_kod').notNull().references(() => sinavYeriListeleri.kod, { onDelete: 'cascade' }),
  no: text('no').notNull(),
  adi: text('adi').notNull().default(''),
  soyadi: text('soyadi').notNull().default(''),
  salon: text('salon').notNull(),
  sira: text('sira').notNull().default(''),
  kitapcik: text('kitapcik').notNull().default('')
}, t => [primaryKey({ columns: [t.listeKod, t.no] }), index('sinav_yeri_kayitlari_no_idx').on(t.no)]).enableRLS();

/* ---------- Yoklama ---------- */
/** Bir ders oturumunun yoklaması (tarih + sınıf + saat + ders; 2 ders saati). Listeler öğrenci numaralarıdır. */
export const yoklamalar = pgTable('yoklamalar', {
  anahtar: text('anahtar').primaryKey(),   // oturumAnahtari(): "yyyy-mm-dd|A|10.00-12.00|SARF"
  tarih: text('tarih').notNull(),          // yyyy-mm-dd
  saat: text('saat').notNull().default(''),
  ders: text('ders').notNull(),
  sinif: text('sinif').notNull(),
  hoca: text('hoca').notNull().default(''),
  tur: text('tur').notNull().default('Program'),     // Program | Telafi
  durum: text('durum').notNull().default('Yapıldı'), // Yapıldı | Yapılmadı
  liste: jsonb('liste').$type<string[]>().notNull().default([]),
  yok1: jsonb('yok1').$type<string[]>().notNull().default([]),
  yok2: jsonb('yok2').$type<string[]>().notNull().default([]),
  izinli: jsonb('izinli').$type<string[]>().notNull().default([]),
  kaynak: text('kaynak').notNull().default('Manuel'),   // Manuel | Tarama | Karma
  kaydeden: text('kaydeden').notNull().default(''),
  zaman: timestamp('zaman', { withTimezone: true }).notNull().defaultNow(),
  aciklama: text('aciklama').notNull().default(''),
  surum: integer('surum').notNull().default(1)   // eşzamanlı düzenleme denetimi
}, t => [index('yoklamalar_tarih_idx').on(t.tarih), index('yoklamalar_sinif_idx').on(t.sinif)]).enableRLS();

/** Basılan her sirkü sayfasının kaydı: QR'daki evrak no, sütunlar, öğrenci sırası, hücre yerleşimi (tarama bununla okunur). */
export const yoklamaEvraklari = pgTable('yoklama_evraklari', {
  no: text('no').primaryKey(),   // 8 karakter
  ozet: text('ozet').notNull().unique(),   // aynı sayfa yeniden basılınca aynı numara
  olusturma: timestamp('olusturma', { withTimezone: true }).notNull().defaultNow(),
  sonYazdirma: timestamp('son_yazdirma', { withTimezone: true }).notNull().defaultNow(),
  hoca: text('hoca').notNull().default(''),
  sinif: text('sinif').notNull().default(''),
  tur: text('tur').notNull().default('Program'),
  hafta: text('hafta').notNull().default(''),
  sayfa: integer('sayfa').notNull().default(1),
  toplam: integer('toplam').notNull().default(1),
  sutunlar: jsonb('sutunlar').$type<{ tarih: string; saat: string; ders: string }[]>().notNull().default([]),
  ogrenciler: jsonb('ogrenciler').$type<string[]>().notNull().default([]),
  satir: integer('satir').notNull().default(0),
  yerlesim: jsonb('yerlesim').$type<Record<string, unknown>>().notNull().default({}),
  tarama: text('tarama').notNull().default('')   // son taramanın özeti
}).enableRLS();

/** Kaydedilen taramaların sayfa görüntüleri (itiraz durumunda kanıt; kişisel veri — dönem sonunda silinmeli). */
export const taramaGorselleri = pgTable('tarama_gorselleri', {
  id: serial('id').primaryKey(),
  evrakNo: text('evrak_no').notNull(),
  zaman: timestamp('zaman', { withTimezone: true }).notNull().defaultNow(),
  turu: text('turu').notNull().default('image/jpeg'),
  boyut: integer('boyut').notNull().default(0),
  veri: text('veri').notNull()   // base64
}, t => [index('tarama_gorselleri_evrak_idx').on(t.evrakNo)]).enableRLS();
