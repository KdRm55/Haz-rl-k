ALTER TABLE "kullanicilar" ADD COLUMN "kvkk_onay" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kullanicilar" ADD COLUMN "kvkk_surum" text DEFAULT '' NOT NULL;