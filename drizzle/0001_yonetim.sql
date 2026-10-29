CREATE TABLE "aktarim_gecmisi" (
	"id" serial PRIMARY KEY NOT NULL,
	"tarih" timestamp with time zone DEFAULT now() NOT NULL,
	"kullanici" text NOT NULL,
	"dosya" text DEFAULT '' NOT NULL,
	"gecerli" integer NOT NULL,
	"yeni" integer NOT NULL,
	"degisen" integer NOT NULL,
	"silinen" integer NOT NULL,
	"geri_gelen" integer NOT NULL,
	"degismeyen" integer NOT NULL,
	"hatali" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ogrenci_degisiklikleri" (
	"id" serial PRIMARY KEY NOT NULL,
	"tarih" timestamp with time zone DEFAULT now() NOT NULL,
	"kaynak" text NOT NULL,
	"ogrenci_no" text NOT NULL,
	"ad_soyad" text DEFAULT '' NOT NULL,
	"alan" text NOT NULL,
	"eski" text DEFAULT '' NOT NULL,
	"yeni" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ogrenciler" ADD COLUMN "son_gorulme" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ogrenci_degisiklikleri_no_idx" ON "ogrenci_degisiklikleri" USING btree ("ogrenci_no");