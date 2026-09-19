CREATE SCHEMA "promotions";
--> statement-breakpoint
CREATE TABLE "promotions"."promo_code_allowed_users" (
	"promo_code_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_code_allowed_users_promo_code_id_user_id_pk" PRIMARY KEY("promo_code_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "promotions"."promo_code_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"promo_code_id" uuid NOT NULL,
	"user_id" uuid,
	"order_id" uuid NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_code_redemptions_orderId_unique" UNIQUE("order_id"),
	CONSTRAINT "promo_code_redemptions_promoCodeId_userId_unique" UNIQUE("promo_code_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "promotions"."promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tour_id" uuid NOT NULL,
	"code" text NOT NULL,
	"discount_percent" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"restricted" boolean DEFAULT false NOT NULL,
	"share_after_purchase" boolean DEFAULT false NOT NULL,
	"link_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"max_redemptions" integer,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promo_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "promo_codes_linkToken_unique" UNIQUE("link_token")
);
--> statement-breakpoint
ALTER TABLE "promotions"."promo_code_allowed_users" ADD CONSTRAINT "promo_code_allowed_users_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "promotions"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions"."promo_code_redemptions" ADD CONSTRAINT "promo_code_redemptions_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "promotions"."promo_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "promo_code_allowed_users_user_id_index" ON "promotions"."promo_code_allowed_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "promo_code_redemptions_user_id_index" ON "promotions"."promo_code_redemptions" USING btree ("user_id");