CREATE TABLE "donem_sinav_dersleri" (
	"sinav_kod" text NOT NULL,
	"ders" text NOT NULL,
	"tarih" text DEFAULT '' NOT NULL,
	"saat" text DEFAULT '' NOT NULL,
	"sonuc_yayinda" boolean DEFAULT false NOT NULL,
	"sira" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "donem_sinav_dersleri_sinav_kod_ders_pk" PRIMARY KEY("sinav_kod","ders")
);
--> statement-breakpoint
CREATE TABLE "donem_sinav_ogrencileri" (
	"sinav_kod" text NOT NULL,
	"no" text NOT NULL,
	"adi" text DEFAULT '' NOT NULL,
	"soyadi" text DEFAULT '' NOT NULL,
	"sinif" text DEFAULT '' NOT NULL,
	CONSTRAINT "donem_sinav_ogrencileri_sinav_kod_no_pk" PRIMARY KEY("sinav_kod","no")
);
--> statement-breakpoint
CREATE TABLE "donem_sinav_puanlari" (
	"sinav_kod" text NOT NULL,
	"no" text NOT NULL,
	"ders" text NOT NULL,
	"puan" text NOT NULL,
	CONSTRAINT "donem_sinav_puanlari_sinav_kod_no_ders_pk" PRIMARY KEY("sinav_kod","no","ders")
);
--> statement-breakpoint
CREATE TABLE "donem_sinav_yerleri" (
	"sinav_kod" text NOT NULL,
	"sinif" text NOT NULL,
	"yer" text NOT NULL,
	CONSTRAINT "donem_sinav_yerleri_sinav_kod_sinif_pk" PRIMARY KEY("sinav_kod","sinif")
);
--> statement-breakpoint
CREATE TABLE "donem_sinavlari" (
	"kod" text PRIMARY KEY NOT NULL,
	"ad" text NOT NULL,
	"siniflar" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"yer_yayinda" boolean DEFAULT false NOT NULL,
	"arsiv" boolean DEFAULT false NOT NULL,
	"olusturma" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sinav_yeri_kayitlari" (
	"liste_kod" text NOT NULL,
	"no" text NOT NULL,
	"adi" text DEFAULT '' NOT NULL,
	"soyadi" text DEFAULT '' NOT NULL,
	"salon" text NOT NULL,
	"sira" text DEFAULT '' NOT NULL,
	"kitapcik" text DEFAULT '' NOT NULL,
	CONSTRAINT "sinav_yeri_kayitlari_liste_kod_no_pk" PRIMARY KEY("liste_kod","no")
);
--> statement-breakpoint
CREATE TABLE "sinav_yeri_listeleri" (
	"kod" text PRIMARY KEY NOT NULL,
	"ad" text NOT NULL,
	"sinav_kodu" text DEFAULT '' NOT NULL,
	"tarih" text DEFAULT '' NOT NULL,
	"saat" text DEFAULT '' NOT NULL,
	"yer" text DEFAULT '' NOT NULL,
	"aciklama" text DEFAULT '' NOT NULL,
	"donem_kod" text DEFAULT '' NOT NULL,
	"yayinda" boolean DEFAULT false NOT NULL,
	"yukleme" timestamp with time zone DEFAULT now() NOT NULL,
	"dosya" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "donem_sinav_dersleri" ADD CONSTRAINT "donem_sinav_dersleri_sinav_kod_donem_sinavlari_kod_fk" FOREIGN KEY ("sinav_kod") REFERENCES "public"."donem_sinavlari"("kod") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donem_sinav_ogrencileri" ADD CONSTRAINT "donem_sinav_ogrencileri_sinav_kod_donem_sinavlari_kod_fk" FOREIGN KEY ("sinav_kod") REFERENCES "public"."donem_sinavlari"("kod") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donem_sinav_puanlari" ADD CONSTRAINT "donem_sinav_puanlari_sinav_kod_donem_sinavlari_kod_fk" FOREIGN KEY ("sinav_kod") REFERENCES "public"."donem_sinavlari"("kod") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "donem_sinav_yerleri" ADD CONSTRAINT "donem_sinav_yerleri_sinav_kod_donem_sinavlari_kod_fk" FOREIGN KEY ("sinav_kod") REFERENCES "public"."donem_sinavlari"("kod") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sinav_yeri_kayitlari" ADD CONSTRAINT "sinav_yeri_kayitlari_liste_kod_sinav_yeri_listeleri_kod_fk" FOREIGN KEY ("liste_kod") REFERENCES "public"."sinav_yeri_listeleri"("kod") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sinav_yeri_kayitlari_no_idx" ON "sinav_yeri_kayitlari" USING btree ("no");