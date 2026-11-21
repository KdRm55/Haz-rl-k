CREATE TABLE "optik_gorselleri" (
	"set_kod" text NOT NULL,
	"no" text NOT NULL,
	"turu" text DEFAULT 'image/jpeg' NOT NULL,
	"veri" text NOT NULL,
	CONSTRAINT "optik_gorselleri_set_kod_no_pk" PRIMARY KEY("set_kod","no")
);
--> statement-breakpoint
ALTER TABLE "optik_gorselleri" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "optik_kayitlari" (
	"set_kod" text NOT NULL,
	"no" text NOT NULL,
	"ad_soyad" text DEFAULT '' NOT NULL,
	"kitapcik" text NOT NULL,
	"cevaplar" text NOT NULL,
	"kaynak" text DEFAULT 'QR' NOT NULL,
	"uyari" text DEFAULT '' NOT NULL,
	"gorsel" boolean DEFAULT false NOT NULL,
	"zaman" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "optik_kayitlari_set_kod_no_pk" PRIMARY KEY("set_kod","no")
);
--> statement-breakpoint
ALTER TABLE "optik_kayitlari" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "optik_setleri" (
	"kod" text PRIMARY KEY NOT NULL,
	"ad" text NOT NULL,
	"donem_kod" text NOT NULL,
	"ders" text NOT NULL,
	"soru_sayisi" integer DEFAULT 0 NOT NULL,
	"yanlis_cezasi" text DEFAULT '0' NOT NULL,
	"anahtar" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"yayinda" boolean DEFAULT false NOT NULL,
	"olusturma" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "optik_setleri" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sinav_yeri_kayitlari" ADD COLUMN "karekod" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "optik_gorselleri" ADD CONSTRAINT "optik_gorselleri_set_kod_optik_setleri_kod_fk" FOREIGN KEY ("set_kod") REFERENCES "public"."optik_setleri"("kod") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optik_kayitlari" ADD CONSTRAINT "optik_kayitlari_set_kod_optik_setleri_kod_fk" FOREIGN KEY ("set_kod") REFERENCES "public"."optik_setleri"("kod") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sinav_yeri_kayitlari_karekod_idx" ON "sinav_yeri_kayitlari" USING btree ("karekod");