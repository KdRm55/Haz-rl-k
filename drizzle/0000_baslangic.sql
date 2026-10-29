CREATE TABLE "ayarlar" (
	"anahtar" text PRIMARY KEY NOT NULL,
	"deger" text DEFAULT '' NOT NULL,
	"aciklama" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "duyurular" (
	"id" serial PRIMARY KEY NOT NULL,
	"baslik" text DEFAULT '' NOT NULL,
	"metin" text DEFAULT '' NOT NULL,
	"kime" text DEFAULT 'Herkes' NOT NULL,
	"baslangic" date,
	"bitis" date,
	"aktif" boolean DEFAULT true NOT NULL,
	"olusturma" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "erisim_kodlari" (
	"rol" text PRIMARY KEY NOT NULL,
	"kod_ozeti" text NOT NULL,
	"guncellendi" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "giris_denemeleri" (
	"id" serial PRIMARY KEY NOT NULL,
	"anahtar" text NOT NULL,
	"zaman" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hoca_programi" (
	"id" serial PRIMARY KEY NOT NULL,
	"hoca" text NOT NULL,
	"ders" text DEFAULT '' NOT NULL,
	"gun" text DEFAULT '' NOT NULL,
	"saat" text DEFAULT '' NOT NULL,
	"sube" text DEFAULT '' NOT NULL,
	"derslik" text DEFAULT '' NOT NULL,
	"sira" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "islem_kaydi" (
	"id" serial PRIMARY KEY NOT NULL,
	"zaman" timestamp with time zone DEFAULT now() NOT NULL,
	"kullanici" text NOT NULL,
	"islem" text NOT NULL,
	"ayrinti" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ogrenciler" (
	"no" text PRIMARY KEY NOT NULL,
	"adi" text DEFAULT '' NOT NULL,
	"soyadi" text DEFAULT '' NOT NULL,
	"cinsiyet" text DEFAULT '' NOT NULL,
	"tc4" text DEFAULT '' NOT NULL,
	"dogrulama_degeri" text DEFAULT '' NOT NULL,
	"bolum" text DEFAULT '' NOT NULL,
	"eposta" text DEFAULT '' NOT NULL,
	"telefon" text DEFAULT '' NOT NULL,
	"durum" text DEFAULT 'aktif' NOT NULL,
	"kayitli" boolean DEFAULT true NOT NULL,
	"not" text DEFAULT '' NOT NULL,
	"sinif_id" integer,
	"sinif_sira" integer,
	"ilk_gorulme" timestamp with time zone DEFAULT now() NOT NULL,
	"guncellendi" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sinav_sonuclari" (
	"no" text PRIMARY KEY NOT NULL,
	"adi" text DEFAULT '' NOT NULL,
	"soyadi" text DEFAULT '' NOT NULL,
	"yer" text DEFAULT '' NOT NULL,
	"yazili" text DEFAULT '' NOT NULL,
	"sozlu" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "siniflar" (
	"id" serial PRIMARY KEY NOT NULL,
	"ad" text NOT NULL,
	"anahtar" text NOT NULL,
	"derslik" text DEFAULT '' NOT NULL,
	"tur" text DEFAULT 'Karma' NOT NULL,
	"kapasite" integer DEFAULT 0 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	CONSTRAINT "siniflar_ad_unique" UNIQUE("ad"),
	CONSTRAINT "siniflar_anahtar_unique" UNIQUE("anahtar")
);
--> statement-breakpoint
CREATE TABLE "yetkililer" (
	"eposta" text PRIMARY KEY NOT NULL,
	"rol" text NOT NULL,
	"ad_soyad" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ogrenciler" ADD CONSTRAINT "ogrenciler_sinif_id_siniflar_id_fk" FOREIGN KEY ("sinif_id") REFERENCES "public"."siniflar"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "giris_denemeleri_idx" ON "giris_denemeleri" USING btree ("anahtar","zaman");--> statement-breakpoint
CREATE INDEX "ogrenciler_sinif_idx" ON "ogrenciler" USING btree ("sinif_id");