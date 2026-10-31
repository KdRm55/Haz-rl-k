/** Sunucu ile öğrenci ekranı arasında paylaşılan veri tipleri. */

export type Duyuru = { baslik: string; metin: string; tarih: string };

export type ProgramSatiri = { gun: string; saat: string; ders: string; hoca: string; derslik: string };

export type SinavBilgisi = {
  yer: string;
  yayinda: boolean;
  yazili?: string;
  sozlu?: string;
  ortalama?: number | null;
  sonuc?: string;
  aciklama?: string;
};

export type Gorunum = { sinif: boolean; derslik: boolean; program: boolean; sinavlar: boolean; duyurular: boolean; devamsizlik: boolean };

export type OgrenciAyarlari = { dogrulama: boolean; kaynak: 'proliz' | 'sayfa'; etiket: string; hane: number };

/** Dönem sınavı (öğrenci ekranı): yer yayındaysa tarih ve yer; sonucu açıklanmışsa sonucVar. */
export type DonemSinaviBilgisi = { kod: string; ad: string; sinif: string; yerYayinda: boolean; sonucVar: boolean; dersler: { ders: string; tarih: string; saat: string; yer: string; gecti: boolean }[] };
/** Sınav yeri listesinden öğrencinin yeri (kitapçık türü verilmez). */
export type SinavYeriBilgisi = { ad: string; tarih: string; saat: string; yer: string; aciklama: string; salon: string; sira: string; donemKod: string; gecti: boolean };

type Ortak = {
  bulundu: true;
  numara: string;
  adSoyad: string;
  maskeli: boolean;
  sinav: SinavBilgisi | null;
  duyurular: Duyuru[];
  gorunum: Gorunum;
  sinavYerleri: SinavYeriBilgisi[];
};

/** Devamsızlığım: yalnızca öğrenci doğrulaması açıkken gönderilir. */
export type DevamsizlikOzeti = {
  sinirYuzde: number; sinirVar: boolean; sonTarih: string;
  dersler: { ders: string; yokSaat: number; izinliSaat: number; oturum: number; sinir: number | null; durum: '' | 'yakin' | 'asti';
    kayitlar: { iso: string; tarih: string; saat: string; durum: 'yok' | 'geldi' | 'izinli' | 'yapilmadi'; yokSaat: number; tur: string; y1?: boolean; y2?: boolean }[] }[];
};

export type SorguSonucu =
  | (Ortak & { tur: 'sinif'; sinif: string; derslik: string; program: ProgramSatiri[]; donemSinavlari: { sinavlar: DonemSinaviBilgisi[]; sonucVar: boolean } | null; devamsizlik?: DevamsizlikOzeti | null })
  | (Ortak & { tur: 'muaf' | 'bekliyor' })
  /** Sistemde kaydı yok ama yayındaki bir sınav yeri listesinde var: yalnızca sınav yeri gösterilir */
  | (Ortak & { tur: 'sinavyeri' })
  | { bulundu: false; mesaj: string };

/** TC doğrulamalı dönem sınavı sonuçları */
export type DonemSonucu = { ok: true; adSoyad: string; esik: number; sinavlar: { kod: string; ad: string; sinif: string; dersler: { ders: string; tarih: string; puan: number | string; sinifOrt: number | null }[] }[] }
  | { ok: false; mesaj: string };
