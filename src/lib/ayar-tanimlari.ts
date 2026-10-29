/**
 * Bilinen ayarlar: varsayılan değer, açıklama ve panelde nasıl düzenleneceği.
 * Kaynak: Apps Script Code.gs kurulum(), Sinav.gs SINAV_AYAR_SATIRLARI. Anahtar yoksa varsayılan geçerlidir.
 */
export type AyarTuru = 'evet-hayir' | 'sayi' | 'metin' | 'secim';
export type AyarTanimi = { anahtar: string; varsayilan: string; aciklama: string; tur: AyarTuru; secenekler?: string[]; grup: string };

export const AYAR_TANIMLARI: AyarTanimi[] = [
  { grup: 'Muafiyet sınavı', anahtar: 'MUAFIYET_YONTEMI', varsayilan: 'Ortalama', tur: 'secim', secenekler: ['Ortalama', 'Ayrı ayrı'],
    aciklama: '"Ortalama": ağırlıklı ortalama muafiyet puanını geçmeli. "Ayrı ayrı": yazılı ve sözlü kendi geçme puanlarını ayrı ayrı geçmeli.' },
  { grup: 'Muafiyet sınavı', anahtar: 'YAZILI_GECME_PUANI', varsayilan: '50', tur: 'sayi',
    aciklama: 'Sözlüye girebilmek için yazılıdan alınması gereken en düşük puan (bu puan dahil). 0 yazılırsa herkes sözlüye girer.' },
  { grup: 'Muafiyet sınavı', anahtar: 'YAZILI_AGIRLIK', varsayilan: '50', tur: 'sayi',
    aciklama: '"Ortalama" yönteminde yazılının yüzde ağırlığı (sözlü = 100 - bu değer).' },
  { grup: 'Muafiyet sınavı', anahtar: 'MUAFIYET_PUANI', varsayilan: '60', tur: 'sayi',
    aciklama: '"Ortalama" yönteminde muafiyet için gereken en düşük ortalama (bu puan dahil).' },
  { grup: 'Muafiyet sınavı', anahtar: 'SOZLU_ALT_SINIR', varsayilan: '0', tur: 'sayi',
    aciklama: '"Ortalama" yönteminde sözlüden alınması gereken en düşük puan. 0 = alt sınır yok.' },
  { grup: 'Muafiyet sınavı', anahtar: 'SOZLU_GECME_PUANI', varsayilan: '60', tur: 'sayi',
    aciklama: '"Ayrı ayrı" yönteminde sözlüden alınması gereken en düşük puan.' },
  { grup: 'Muafiyet sınavı', anahtar: 'YAZILI_TAMAMLANDI', varsayilan: 'Hayır', tur: 'evet-hayir',
    aciklama: 'Evet olduğunda yazılı puanı boş olan öğrenci "sınava girmedi" sayılır ve hazırlığa kalır.' },
  { grup: 'Muafiyet sınavı', anahtar: 'SOZLU_TAMAMLANDI', varsayilan: 'Hayır', tur: 'evet-hayir',
    aciklama: 'Evet olduğunda sözlüye girmesi gerekip puanı boş olan öğrenci "sınava girmedi" sayılır ve hazırlığa kalır.' },
  { grup: 'Muafiyet sınavı', anahtar: 'SINAV_SONUCLARI_YAYINDA', varsayilan: 'Hayır', tur: 'evet-hayir',
    aciklama: 'Evet olduğunda öğrenciler sorgulama ekranında puanlarını ve sonucunu görür.' }
];

/** Panelin "Ayarlar" listesinde gösterilmeyen (kendi ekranı olan ya da otomatik) anahtarlar. */
/** Öğrenciler artık kendi hesabıyla girdiği için eski doğrulama ayarları gösterilmez. */
const ESKI_DOGRULAMA = ['OGRENCI_DOGRULAMA', 'DOGRULAMA_ETIKETI', 'DOGRULAMA_SUTUNU', 'DOGRULAMA_HANE'];
export const GIZLI_AYAR = (anahtar: string) => anahtar.startsWith('OGRENCI_GOSTER_') || anahtar.startsWith('YOKLAMA_') || anahtar === 'PROLIZ_ESLESME' || ESKI_DOGRULAMA.includes(anahtar) ||
  ['SINIF_DUZENI', 'KIZ_SINIF_SAYISI', 'ERKEK_SINIF_SAYISI', 'KARMA_SINIF_SAYISI', 'DAGITIM_YONTEMI'].includes(anahtar);

export const OG_BOLUM_TANIMLARI = [
  { ad: 'sinif', anahtar: 'OGRENCI_GOSTER_SINIF', baslik: 'Sınıf adı',
    aciklama: 'Öğrencinin hangi sınıfta olduğu (ör. Hazırlık A). Kapalıyken ders programında ve çıktısında da sınıf adı yazmaz.' },
  { ad: 'derslik', anahtar: 'OGRENCI_GOSTER_DERSLIK', baslik: 'Derslik',
    aciklama: 'Sınıfın dersliği. Kapalıyken ders programındaki derslik bilgileri de gösterilmez.' },
  { ad: 'program', anahtar: 'OGRENCI_GOSTER_PROGRAM', baslik: 'Ders programı',
    aciklama: '"Ders programım" bölümü (haftalık program, yazdırma ve PDF) ve "bugünkü dersler" özeti.' },
  { ad: 'sinavlar', anahtar: 'OGRENCI_GOSTER_SINAVLAR', baslik: 'Sınavlarım',
    aciklama: 'Muafiyet sınavı, sınav yerleri ve dönem sınavları (yerler ve TC doğrulamalı puanlar). Kapalıyken "Sınavlarım" bölümü hiç görünmez.' },
  { ad: 'duyurular', anahtar: 'OGRENCI_GOSTER_DUYURULAR', baslik: 'Sınıfa ve öğrenciye özel duyurular',
    aciklama: 'Sorgudan sonra gösterilen, sınıfa ya da öğrenci grubuna özel duyurular. Herkese açık genel duyurular "Duyurular" sekmesinden yönetilir.' },
  { ad: 'devamsizlik', anahtar: 'OGRENCI_GOSTER_DEVAMSIZLIK', baslik: 'Devamsızlığım',
    aciklama: 'Ders ders devamsızlık saatleri ve sınıra kalan hak (öğrenci yalnızca kendi devamsızlığını görür).' }
] as const;
