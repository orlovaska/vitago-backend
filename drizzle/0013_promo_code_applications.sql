CREATE TABLE "promotions"."promo_code_applications" (
	"user_id" uuid NOT NULL,
	"tour_id" uuid NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_code_applications_user_id_tour_id_pk" PRIMARY KEY("user_id","tour_id")
);
--> statement-breakpoint
ALTER TABLE "promotions"."promo_code_applications" ADD CONSTRAINT "promo_code_applications_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "promotions"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;