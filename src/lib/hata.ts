/** Kullanıcıya olduğu gibi gösterilecek hata (eksik seçim, bulunamayan kayıt vb.). Diğer hatalar kaydedilir, genel mesaj gösterilir. */
export class KullaniciHatasi extends Error {
  constructor(mesaj: string) { super(mesaj); this.name = 'KullaniciHatasi'; }
}

/** Yetki hatası: tarayıcı giriş ekranına döner. */
export class YetkiHatasi extends KullaniciHatasi {
  constructor() { super('Oturum doğrulanamadı. Erişim kodunu yeniden girin.'); this.name = 'YetkiHatasi'; }
}
