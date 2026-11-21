CREATE TABLE "optik_kitapciklari" (
	"set_kod" text NOT NULL,
	"kitapcik" text NOT NULL,
	"ad" text DEFAULT '' NOT NULL,
	"boyut" integer DEFAULT 0 NOT NULL,
	"tamam" boolean DEFAULT false NOT NULL,
	"veri" text DEFAULT '' NOT NULL,
	"zaman" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "optik_kitapciklari_set_kod_kitapcik_pk" PRIMARY KEY("set_kod","kitapcik")
);
--> statement-breakpoint
ALTER TABLE "optik_kitapciklari" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "optik_kitapciklari" ADD CONSTRAINT "optik_kitapciklari_set_kod_optik_setleri_kod_fk" FOREIGN KEY ("set_kod") REFERENCES "public"."optik_setleri"("kod") ON DELETE cascade ON UPDATE no action;