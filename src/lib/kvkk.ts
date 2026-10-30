/**
 * Öğrencilere gösterilen KVKK aydınlatma metni ve açık rıza onayı (kayıt formu ve onay ekranı ortak).
 * Metinde esaslı bir değişiklik yapılınca KVKK_SURUM değiştirilir: öğrenciler bir sonraki girişte yeniden onay verir.
 * Koruma ile ilgili cümleler sistemin gerçek davranışını anlatır (tc-ozeti.ts, kod.ts, db/index.ts); değiştirirken uyumlu tutun.
 */
export const KVKK_SURUM = '2026-10-30';

export type KvkkBolum = { baslik: string; paragraflar?: string[]; maddeler?: string[] };

export const KVKK_BASLIK = 'Kişisel verilerin ve gizliliğin';

export const KVKK_GIRIS =
  'Sınıfını, ders programını, sınavlarını ve devamsızlığını sana gösterebilmemiz için bazı kişisel bilgilerini işliyoruz. ' +
  'Bunu yaparken 6698 sayılı Kişisel Verilerin Korunması Kanunu\'na (KVKK) uyuyor, bilgilerini bize bırakılmış bir emanet gibi koruyoruz. ' +
  'Aşağıda hangi bilgilerini neden işlediğimizi, onları nasıl koruduğumuzu ve hangi haklara sahip olduğunu bulacaksın.';

export const KVKK_BOLUMLER: KvkkBolum[] = [
  {
    baslik: 'Veri sorumlusu',
    paragraflar: ['Kişisel verilerin, Sinop Üniversitesi adına İlahiyat Fakültesi Arapça Hazırlık Programı tarafından işlenir.']
  },
  {
    baslik: 'Hangi bilgilerini işliyoruz?',
    maddeler: [
      'Kimlik ve iletişim bilgilerin: öğrenci numaran, adın, soyadın, cinsiyetin, bölümün; varsa e-posta adresin ve telefon numaran.',
      'TC kimlik numaran: Tamamı hiçbir zaman kaydedilmez. Hesabını doğrulamak için yalnızca son 6 hanenin şifrelenmiş özeti, sınav listelerinde kimlik kontrolü için de son 4 hane tutulur.',
      'Eğitim bilgilerin: sınıfın, ders programın, muafiyet ve dönem sınavı puanların, sınav yerin, devamsızlığın ve imzaladığın yoklama listelerinin taranmış görüntüleri.',
      'Hesap ve güvenlik bilgilerin: şifrenin geri çevrilemez özeti, giriş zamanların ve sistemde yapılan işlemlerin kaydı; hatalı giriş denemelerinde, kötüye kullanımı önlemek için kısa bir süre IP adresin.'
    ]
  },
  {
    baslik: 'Neden işliyoruz?',
    paragraflar: [
      'Hazırlık eğitimini yürütmek için: sınıfları oluşturmak, ders programını, sınavları ve devamsızlığı takip etmek, sonuçları ve duyuruları yalnızca sana göstermek ve hesabını güvende tutmak. ' +
      'Bilgilerin bu amaçların dışında kullanılmaz; reklam ya da pazarlama için hiçbir zaman işlenmez.',
      'Bu işlemenin dayanağı, yükseköğretim mevzuatından doğan yükümlülükler ve eğitim hizmetinin yürütülmesidir (KVKK md. 5). Sistemi kullanabilmen için senden ayrıca açık rızanı da istiyoruz.'
    ]
  },
  {
    baslik: 'Bilgilerini kimler görebilir?',
    paragraflar: [
      'Yalnızca program yöneticileri ve derslerine giren öğretim elemanları, görevleri için ihtiyaç duydukları kadarını görebilir. ' +
      'Diğer öğrenciler senin bilgilerini göremez; sen de yalnızca kendi bilgilerini görürsün. Bilgilerin, kanunen yetkili kurumların talepleri dışında hiç kimseyle paylaşılmaz.',
      'Sistemin sunucuları, Avrupa Birliği\'nde (İrlanda) bulunan ve uluslararası güvenlik standartlarına uyan bulut hizmet sağlayıcılarındadır; bu nedenle bilgilerin yurt dışında saklanır.'
    ]
  },
  {
    baslik: 'Bilgilerini nasıl koruyoruz?',
    maddeler: [
      'Şifren hiçbir yerde açık olarak saklanmaz. Yalnızca geri çevrilemeyen bir özeti tutulur; yöneticiler de dahil hiç kimse şifreni göremez. Sunucular ele geçirilse bile bu özetten şifrene ulaşılamaz.',
      'TC kimlik numaranın son 6 hanesi, veritabanından ayrı bir yerde tutulan gizli bir anahtarla mühürlenir. Veritabanı ele geçirilse bile bu haneler okunamaz, deneme yoluyla da bulunamaz.',
      'Tarayıcınla sunucu arasındaki her bağlantı şifrelidir (HTTPS). Veritabanı ve yedekleri de diskte AES-256 ile şifrelenmiş olarak saklanır.',
      'Bilgilerine yalnızca kişisel hesabıyla giriş yapan yetkililer ulaşabilir. Her işlem, kimin yaptığıyla birlikte kayıt altına alınır; oturumlar 12 saat sonra kendiliğinden kapanır, art arda yapılan hatalı girişler engellenir.'
    ]
  },
  {
    baslik: 'Ne kadar süre saklıyoruz?',
    paragraflar: ['Bilgilerin, hazırlık eğitimin süresince ve mevzuatın öngördüğü süre boyunca saklanır. Bu süre dolduğunda silinir ya da kimliğinle ilişkilendirilemeyecek hale getirilir.']
  },
  {
    baslik: 'Hakların',
    paragraflar: [
      'KVKK\'nın 11. maddesi uyarınca; bilgilerinin işlenip işlenmediğini öğrenme, işlendiyse bilgi isteme, amacına uygun kullanılıp kullanılmadığını öğrenme, ' +
      'yurt içinde ya da yurt dışında aktarıldığı kişileri bilme, eksik ya da yanlışsa düzeltilmesini, şartları oluştuğunda silinmesini ve bu işlemlerin aktarıldığı kişilere bildirilmesini isteme, ' +
      'yalnızca otomatik sistemlerle yapılan bir analizin aleyhine sonucuna itiraz etme ve zarara uğradıysan zararının giderilmesini isteme hakkın vardır.',
      'Bu haklarını kullanmak ya da onayını geri çekmek için Hazırlık Programı idaresine başvurabilirsin. Onayını geri çekersen hesabın kapatılır; eğitimle ilgili zorunlu kayıtlar ise mevzuat gereği tutulmaya devam eder.'
    ]
  }
];

export const KVKK_ONAY_METNI =
  'Aydınlatma metnini okudum ve anladım. Kişisel verilerimin bu metinde anlatılan amaçlarla işlenmesine ve Avrupa Birliği\'ndeki sunucularda saklanmasına açık rızamla onay veriyorum.';
