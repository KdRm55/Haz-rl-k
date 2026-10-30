# Hazırlık Sistemi 2.0

Sinop İlahiyat Fakültesi Arapça Hazırlık Programı yönetim sistemi: Apps Script + Google E-Tablo sürümünün **Next.js + TypeScript + PostgreSQL** ile yeniden yazımı.

Bütün aşamalar tamamlandı. Canlıya geçişte son kez `npm run aktar -- … --yaz` çalıştırılır; geçiş doğrulanana kadar Apps Script sistemi yedek olarak açık bırakılabilir.

| Aşama | Kapsam | Durum |
|---|---|---|
| 1 | İskelet, veritabanı şeması, giriş, öğrenci sorgulama (sınıf, derslik, ders programı, duyurular, muafiyet sonucu, görünürlük ayarları), e-tablodan aktarım | ✅ |
| 2 | Hoca ekranı: haftalık ve toplu imza sirküsü, telafi/manuel giriş, ders programım, çok sayfalı düzen, yazdırma, hoca başına PDF/ZIP; öğrenci ekranına program yazdırma/PDF | ✅ |
| 3 | Yönetim paneli: öğrenci listesi (sınıf ataması, durum, not, değişiklik geçmişi, eski biçimde dışa aktarma), liste yükleme ve şablonlar, sınıflar, ders programı (tablo ve Excel'den), duyurular, öğrenci ekranı görünürlüğü, ayarlar, erişim kodları, işlem kaydı, sistem kontrolü | ✅ |
| 4 | Muafiyet sınavı: sınav listesi (yer ve puan düzeltme, toplu sınav yeri), puan listesi yükleme ve puan şablonu, kural değiştirme ve etkisini görme, sınav aşamaları, yayın | ✅ |
| 5 | Sınıf oluşturma (düzen, seviyeli/dengeli dağıtım, panelde düzenlenen taslak, sabitleme, yayın) ve sınıf değişikliği (toplu uygulama, neden, geri alma) | ✅ |
| 6 | Dönem sınavları (ders ders tarih ve puan, sınıf bazında yer, panelde puan tablosu ve puan listesi yükleme, ders ders sonuç yayını) ve sınav yeri listeleri (Kelebek listesi yükleme, sütun eşleştirme, dönem sınavına bağlama, numarayla kontrol); öğrenci ekranında Sınavlarım (yerler ve puanlar) | ✅ |
| 7 | Yoklama (hoca ekranında haftalık dersler, telafi, izinli, ders yapılmadı), sirkülere evrak numarası (QR), taranan sirkülerin tarayıcıda okunması ve onaylanması, sayfa görüntüsü arşivi, devamsızlık sınırı ve sınıf tablosu (Excel), girilmemiş yoklamalar, öğrenci ekranında Devamsızlığım; tam yedek ve geri yükleme | ✅ |
| 8 | Kişisel hesaplar: yönetici ve hoca e-posta + şifreyle, öğrenci öğrenci no + şifreyle girer; öğrenci hesabı TC son 6 haneyle açılır, hoca hesabını yönetici onaylar; Kullanıcılar sekmesi (onay, hesap ekleme, geçici şifre, kapatma) | ✅ |

## Teknoloji

- **Next.js 16** (App Router, Server Actions), **React 19**, **TypeScript**
- **PostgreSQL** + **Drizzle ORM** (şema: [src/db/schema.ts](src/db/schema.ts), geçişler: [drizzle/](drizzle/))
- Oturum: imzalı httpOnly çerez (**jose**); erişim kodları **scrypt** özeti olarak saklanır
- Yazdırma/PDF: tarayıcıda **html2canvas** + **jsPDF** (+ **JSZip**), yalnızca gerektiğinde yüklenir
- Testler: **Vitest** ([tests/](tests/))

## Klasör yapısı

```
src/
  app/                 Sayfalar ve sunucu işlemleri ( /  /hoca  /yonetim )
  components/          Arayüz bileşenleri (ogrenci/, hoca/, yonetim/ ekranları; ProgramA4 → ortak A4 program)
  db/                  Şema ve bağlantı
  lib/                 İş kuralları. Saf ve test edilebilir: metin, sinav, ogrenci-kurallari, sirku-kurallari, aktarim-kurallari,
                       program-kurallari, puan-kurallari, siniflandirma-kurallari, donem-kurallari, yoklama-kurallari,
                       yedek-kurallari, xlsx-oku, xlsx-yaz. Veritabanıyla: ogrenci, hoca, aktarim, yonetim, sinav-yonetim,
                       siniflandirma, donem-sinav, sinav-yeri, yoklama, yedek, kontrol, sablon, ayar, oturum
    tarama/            Taranan sirküleri okuma motoru (QR, köşe işaretleri, imza hücreleri; tarayıcıda çalışır)
    yazdirma/          A4 ders programı ve imza sirküsü şablonları, evrak numarası (QR), yazdırma ve PDF
scripts/
  e-tablodan-aktar.ts  Google E-Tablo (.xlsx) → veritabanı
  yonetici.ts          Yönetici hesabı ekleme (ilk kurulum ya da bütün yöneticiler şifresini unuttuğunda)
  yedekten-geri-yukle.ts  Panelden indirilen tam yedeği veritabanına geri yükleme
```

## Yerel çalıştırma

```bash
npm install
cp .env.example .env      # DATABASE_URL ve SESSION_SECRET değerlerini doldurun
npm run db:migrate        # tabloları oluşturur
npm run yonetici          # ilk yönetici hesabını oluşturur
npm run dev               # http://localhost:3000
```

Diğer komutlar: `npm test` (testler), `npm run lint` (tip denetimi), `npm run db:studio` (veritabanını tarayıcıda görüntüleme), `npm run geri-yukle -- "yedek.json"` (tam yedekten geri yükleme; önce rapor verir, `--yaz` ile yazar).

## Mevcut verileri taşıma

1. Google E-Tablo'da **Dosya → İndir → Microsoft Excel (.xlsx)**.
2. Önce yalnızca rapor alın (hiçbir şey yazılmaz):
   ```bash
   npm run aktar -- "C:\Yol\Hazirlik.xlsx"
   ```
   Sınıf, öğrenci, program, duyuru ve sınav sayıları ile uyarılar (ör. iki sınıfta birden görünen öğrenci, başlığı bulunamayan sayfa) listelenir.
3. Rapor doğruysa yazın:
   ```bash
   npm run aktar -- "C:\Yol\Hazirlik.xlsx" --yaz
   ```
   Aktarılan tablolar silinip yeniden doldurulur; işlem tek seferde yapılır, hata olursa hiçbir şey değişmez. Taşıma süresince komutu istediğiniz kadar tekrar çalıştırabilirsiniz.

Dönem sınavları ("DS …" sayfaları) ve sınav yeri listeleri aktarılmaz: dönemlik veriler oldukları için panelde yeniden tanımlanır (puanlar CSV/Excel olarak **Puan listesi yükle**, yerleşim listeleri **Sınav yerleri** sekmesinden yüklenebilir).

"Yoklama" ve "Yoklama Evrakları" sayfaları varsa aktarılır (veritabanındaki yoklamaların yerine yazılır; sayfa yoksa dokunulmaz). Böylece dönem ortasında geçişte eski yoklamalar ve QR'lı basılmış eski sirküler yeni sistemde de kullanılır. Drive'daki tarama görüntüleri aktarılmaz.

Erişim kodları aktarılmaz: yeni sistemde ortak kod yoktur, herkes kendi hesabıyla girer. İlk yönetici `npm run yonetici` ile eklenir; diğer hesaplar için **Hesaplar** bölümüne bakın. Öğrenciler hesap açarken öğrenci numaraları, TC kimlik numaralarının son 6 hanesi ve şifrelerini yazarak doğrudan hesap oluşturabilir; yazılan son 6 hane öğrencinin kaydına işlenir.

## Vercel'de yayınlama

1. Bir PostgreSQL veritabanı oluşturun. **Supabase** (ücretsiz katman yeterli): proje oluşturun, bölge olarak Avrupa'yı (ör. Frankfurt) seçin, veritabanı şifresini saklayın. **Connect** penceresinden iki adres alınır:
   - Bilgisayarınızdaki komutlar için **Session pooler** (port 5432) → kendi `.env` dosyanıza `DATABASE_URL`.
   - Vercel için **Transaction pooler** (port 6543) → Vercel'deki `DATABASE_URL`. Uygulama bu kipe uygundur (hazır sorgu kullanmaz, kilitler işlem içindedir).

   Bütün tablolarda satır güvenliği (RLS) açıktır; Supabase'in REST API'si tablolara erişemez, uygulama doğrudan veritabanına bağlanır. Neon da aynı şekilde kullanılabilir (havuzlu adres).
2. **Settings → Environment Variables**: `SESSION_SECRET` (en az 32 karakter; üretmek için `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`).
3. Depoyu Vercel'e bağlayıp yayınlayın; Next.js otomatik tanınır. Fonksiyonlar `vercel.json` ile veritabanının yanında, **Dublin** (`dub1`) bölgesinde çalışır; Supabase projeniz başka bir bölgedeyse `regions` değerini ona en yakın Vercel bölgesiyle değiştirin (ör. Frankfurt için `fra1`). Uzak bölgede her sorgu ~80 ms gecikir ve panel yavaşlar.
4. Kendi bilgisayarınızda `.env` içine Session pooler adresini `DATABASE_URL` olarak yazıp `npm run db:migrate`, `npm run aktar -- … --yaz` ve `npm run yonetici` komutlarını çalıştırın.
5. Logoyu `public/logo.png` olarak ekleyin (yoksa sayfalar logosuz açılır).

Eski Apps Script adres düzeni korunur: `/?sayfa=hoca` → `/hoca`, `/?sayfa=yonetim` → `/yonetim`.

## Günlük kullanım: e-tablo yerine panel

E-tabloda elle yapılan düzenlemelerin karşılıkları yönetim panelindedir (`/yonetim`):

| Eskiden (e-tablo) | Şimdi (panel sekmesi) |
|---|---|
| "Hazırlık X" sayfalarına öğrenci ekleme/taşıma | **Sınıf değişikliği** (toplu, nedenli, geri alınabilir) ya da **Öğrenci listesi** satırında sınıf seçimi |
| "Sınıf Taslağı" sayfasında sınıf düzeltme | **Sınıf oluşturma → Taslak** (değiştirilen öğrenci otomatik sabitlenir) |
| "Sınıflar" sayfası | **Sınıflar** |
| "Hoca Programları" sayfası | **Ders programı** (tabloda düzenleme ya da Excel'den yükleme) |
| "Ayarlar" sayfası | **Ayarlar** |
| Menüden erişim kodları, "Yetkililer" sayfası | **Kullanıcılar** (kişisel hesaplar) |
| "Duyurular", "İşlem Kaydı", "Öğrenci Değişiklikleri" | **Duyurular**, **Ayarlar → İşlem kaydı**, öğrenci satırındaki **Geçmiş** |
| "Sınav Sonuçları" sayfasına puan ve sınav yeri yazma | **Sınav ve muafiyet → Sınav listesi** (satırda düzeltme) ya da **Puan listesi yükle** |
| "DS …" sayfalarına dönem sınavı puanı yazma | **Dönem sınavları → Puanları gir / düzelt** (tablo) ya da **Puan listesi yükle** |
| "Sınav Yeri Listeleri" sayfası ve menüden liste yükleme | **Sınav yerleri** |
| "Yoklama" sayfası, hoca ekranındaki Yoklama sekmesi | Hoca ekranı → **Yoklama** (yönetici hesabıyla girilirse izinli ve silme de açılır) |
| "Yoklama Evrakları" sayfası | Otomatik: sirkü yazdırılırken ya da PDF indirilirken kaydedilir |
| Drive'daki "Taranan Sirküler (gizli)" klasörü | **Yoklama → Taranan sayfa görüntüleri** |
| Ayarlardaki YOKLAMA_SINIR_YUZDE / DONEM_HAFTA / DONEM_BASLANGIC | **Yoklama → Devamsızlık sınırı** |
| Menüden "Tam yedek al" | **Sistem kontrolü → Tam yedek indir** |
| Menüden Sistem kontrolü | **Sistem kontrolü** |

## Hesaplar

Ortak erişim kodları yerine herkesin kendi hesabı vardır. Şifreler yalnızca özet (scrypt) olarak saklanır; hatalı girişler adres ve hesap başına sınırlanır.

| Kim | Nasıl girer | Hesap nasıl açılır |
|---|---|---|
| Yönetici | `/yonetim` · e-posta + şifre | İlki `npm run yonetici` ile; sonrakiler **Kullanıcılar → Hesap ekle** (geçici şifreyle) |
| Öğretim elemanı | `/hoca` · e-posta + şifre | Hoca ekranında **Hesap oluştur**; yönetici **Kullanıcılar**'da ders programındaki adını seçip onaylar. Ya da yönetici doğrudan ekler |
| Öğrenci | `/` · öğrenci no + şifre | Öğrenci ekranında **Hesap oluştur**: öğrenci no + TC kimlik numarasının son 6 hanesi + kendi şifresi |

- **TC kimlik numarası:** Öğrenciler hesap oluştururken öğrenci numarası ile TC kimlik numaralarının son 6 hanesini ve kendi belirledikleri şifreyi girerler. Sistemde numarası kayıtlı olan her öğrenci hesabını oluşturabilir; girilen son 6 hane öğrenci kaydına otomatik işlenir. Sonraki girişlerde yalnızca öğrenci no ve şifre kullanılır.
- **Hoca yetkisi:** Hoca yalnızca hesabındaki ders programı adına ait sirküleri, yoklamaları ve taramaları görür ve kaydeder; toplu sirkü, izinli işareti, yoklama silme ve deneme taraması yalnızca yöneticidedir. Yoklamalarda "kaydeden" olarak kişinin adı görünür.
- **Şifre unutma:** Yönetici **Kullanıcılar**'da **Geçici şifre** üretir (yalnızca bir kez gösterilir); kişi ilk girişte kendi şifresini belirler. Şifre değişince, hesap kapatılınca ya da yetkisi değişince açık oturumlar hemen düşer. Bütün yöneticiler şifresini unutursa `npm run yonetici` mevcut hesabın şifresini yeniler.
- **Öğrenci ekranı** yalnızca giriş yapan öğrenciye kendi bilgilerini gösterir; genel duyurular giriş sayfasında görünmeye devam eder. Sistemde kaydı olmayan (yalnızca sınav yeri listesinde bulunan) kişiler hesap açamaz.

## Apps Script sürümünden farklar

- **Giriş:** Ortak erişim kodları yerine kişisel hesaplar (yukarıdaki **Hesaplar** bölümü); 12 saatlik güvenli oturum. Hatalı deneme sınırı adres ve hesap başınadır; bir kişinin denemeleri başkalarını kilitlemez.
- **Önbellek beklemesi yok:** Veriler her istekte veritabanından okunur; "5 dakika bekleyin / önbelleği temizleyin" adımı ortadan kalktı.
- **Tek öğrenci kaydı:** Sınıf listeleri ile öğrenci listesi tek tabloda birleşti (öğrencinin sınıfı bir alan). Bir öğrencinin iki sınıf listesinde birden görünmesi artık mümkün değil; aktarım bu durumları raporlar.
- **PDF araçları** CDN'den değil uygulamanın kendi paketlerinden yüklenir; kurum ağı CDN'i engellese de PDF indirilebilir.
- **Excel okuma** tarayıcıda, dış kütüphane indirmeden yapılır (CDN'den SheetJS yüklenmez); dosya sunucuya gönderilmez, yalnızca tablo içeriği gider. Eski .xls biçimi okunmaz, .xlsx ya da CSV kullanın.
- **Sınıf listesi yayını** "_Yedek" sayfaları yerine her öğrencinin sınıf değişikliğini geçmişine yazar (kaynak `Y-…`); tek tek değişiklikler `S-…` ile kaydedilir ve panelden geri alınabilir.
- **Liste yükleme** tek veritabanı işleminde uygulanır; aynı anda iki yükleme çalışamaz, farklar görüldükten sonra kayıtlar değişirse uygulama durur.
- **Hoca ekranı:** Ekran açılışındaki dört ayrı sunucu çağrısı (hocalar, saatler, dersler, şubeler) tek çağrıya indi ve sayfayla birlikte geliyor.
- **Dönem sınavı puanları** e-tablo sayfası yerine panel tablosunda girilir; geçersiz bir değer (ör. "7O") varsa hiçbir puan yazılmaz ve hatalı hücreler listelenir. Her puan değişikliği öğrencinin geçmişine `D-…` kaynağıyla yazılır. Öğrenci puanını kendi hesabıyla görür.
- **Yoklama ve tarama:** Kurallar aynıdır (her ders 2 saat, ders bazında sınır, izni yalnızca yönetim değiştirir, çok sayfalı sirkünün sayfaları ayrı ayrı taranabilir). Eşzamanlı düzenlemede kayıt sürüm numarasıyla denetlenir; sizden sonra biri kaydettiyse yoklama yeniden açılmalıdır. PDF okuyucu (pdf.js) CDN'den değil uygulamanın kendi paketinden yüklenir. Sirküdeki hücre yerleri ekranda değil tam A4 boyutundaki görünmez bir kopyada ölçülür; dar ekranda basılan sirküler de doğru okunur.
- **Tarama görüntüleri** Drive yerine veritabanında saklanır (sayfa başına ~100–150 KB) ve yalnızca yönetim panelinden görüntülenir. Kişisel veri olduğu için dönem sonunda **Yoklama → Bütün tarama görüntülerini sil** ile silinmeli; gerekirse önce görüntülerle birlikte tam yedek alınır.
- **Yedek:** "Tam yedek al" e-tablonun Drive kopyası yerine bütün tabloları içeren bir JSON dosyası indirir; `npm run geri-yukle` ile tek işlemde geri yüklenir. Supabase'in günlük yedekleri (ücretli planda belirli bir ana dönme) ya da Neon'un geri dönme özelliği de kullanılabilir.
#   H a z - r l - k 
 
 