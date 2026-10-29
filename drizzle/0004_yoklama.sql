CREATE TABLE "tarama_gorselleri" (
	"id" serial PRIMARY KEY NOT NULL,
	"evrak_no" text NOT NULL,
	"zaman" timestamp with time zone DEFAULT now() NOT NULL,
	"turu" text DEFAULT 'image/jpeg' NOT NULL,
	"boyut" integer DEFAULT 0 NOT NULL,
	"veri" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yoklama_evraklari" (
	"no" text PRIMARY KEY NOT NULL,
	"ozet" text NOT NULL,
	"olusturma" timestamp with time zone DEFAULT now() NOT NULL,
	"son_yazdirma" timestamp with time zone DEFAULT now() NOT NULL,
	"hoca" text DEFAULT '' NOT NULL,
	"sinif" text DEFAULT '' NOT NULL,
	"tur" text DEFAULT 'Program' NOT NULL,
	"hafta" text DEFAULT '' NOT NULL,
	"sayfa" integer DEFAULT 1 NOT NULL,
	"toplam" integer DEFAULT 1 NOT NULL,
	"sutunlar" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ogrenciler" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"satir" integer DEFAULT 0 NOT NULL,
	"yerlesim" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tarama" text DEFAULT '' NOT NULL,
	CONSTRAINT "yoklama_evraklari_ozet_unique" UNIQUE("ozet")
);
--> statement-breakpoint
CREATE TABLE "yoklamalar" (
	"anahtar" text PRIMARY KEY NOT NULL,
	"tarih" text NOT NULL,
	"saat" text DEFAULT '' NOT NULL,
	"ders" text NOT NULL,
	"sinif" text NOT NULL,
	"hoca" text DEFAULT '' NOT NULL,
	"tur" text DEFAULT 'Program' NOT NULL,
	"durum" text DEFAULT 'Yapıldı' NOT NULL,
	"liste" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"yok1" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"yok2" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"izinli" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kaynak" text DEFAULT 'Manuel' NOT NULL,
	"kaydeden" text DEFAULT '' NOT NULL,
	"zaman" timestamp with time zone DEFAULT now() NOT NULL,
	"aciklama" text DEFAULT '' NOT NULL,
	"surum" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tarama_gorselleri_evrak_idx" ON "tarama_gorselleri" USING btree ("evrak_no");--> statement-breakpoint
CREATE INDEX "yoklamalar_tarih_idx" ON "yoklamalar" USING btree ("tarih");--> statement-breakpoint
CREATE INDEX "yoklamalar_sinif_idx" ON "yoklamalar" USING btree ("sinif");