ALTER TABLE "donem_sinav_dersleri" ADD COLUMN "tarih_yayinda" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "donem_sinav_dersleri" ADD COLUMN "yer_yayinda" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Sınav bazındaki yer yayını derslere taşınır; yeri ya da sonucu yayında olan dersin tarihi de yayında sayılır
UPDATE "donem_sinav_dersleri" AS d SET "yer_yayinda" = s."yer_yayinda", "tarih_yayinda" = (s."yer_yayinda" OR d."sonuc_yayinda")
  FROM "donem_sinavlari" AS s WHERE s."kod" = d."sinav_kod";--> statement-breakpoint
-- Puanı hiç girilmeden "yayınlanmış" sonuçlar kapatılır (puan yayını artık yer yayınından ve puan girişinden sonra yapılır)
UPDATE "donem_sinav_dersleri" AS d SET "sonuc_yayinda" = false
  WHERE d."sonuc_yayinda" AND (NOT d."yer_yayinda" OR NOT EXISTS (SELECT 1 FROM "donem_sinav_puanlari" AS p WHERE p."sinav_kod" = d."sinav_kod" AND p."ders" = d."ders"));--> statement-breakpoint
-- "donem_sinavlari"."yer_yayinda" silinmez: yeni sürüm yayına çıkana kadar eski kod onu okur. Artık kullanılmıyor.
SELECT 1;
