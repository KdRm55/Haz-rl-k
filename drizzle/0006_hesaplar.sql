CREATE TABLE "kullanicilar" (
	"id" serial PRIMARY KEY NOT NULL,
	"tur" text NOT NULL,
	"ogrenci_no" text,
	"eposta" text,
	"ad_soyad" text DEFAULT '' NOT NULL,
	"hoca_adi" text DEFAULT '' NOT NULL,
	"sifre_ozeti" text NOT NULL,
	"durum" text DEFAULT 'aktif' NOT NULL,
	"sifre_degistirmeli" boolean DEFAULT false NOT NULL,
	"oturum_surumu" integer DEFAULT 1 NOT NULL,
	"olusturma" timestamp with time zone DEFAULT now() NOT NULL,
	"son_giris" timestamp with time zone,
	CONSTRAINT "kullanicilar_ogrenci_no_unique" UNIQUE("ogrenci_no"),
	CONSTRAINT "kullanicilar_eposta_unique" UNIQUE("eposta")
);
--> statement-breakpoint
ALTER TABLE "kullanicilar" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ogrenciler" ADD COLUMN "tc6" text DEFAULT '' NOT NULL;