CREATE SCHEMA "payments";
--> statement-breakpoint
CREATE TYPE "payments"."order_status" AS ENUM('created', 'awaiting_payment', 'paid', 'failed', 'expired', 'refunded');--> statement-breakpoint
CREATE TABLE "payments"."order_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_status" "payments"."order_status",
	"to_status" "payments"."order_status",
	"bank_payment_id" text,
	"bank_status" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments"."orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid,
	"app_id" uuid NOT NULL,
	"tour_id" uuid NOT NULL,
	"tour_title" text NOT NULL,
	"price_kopecks" integer NOT NULL,
	"amount_kopecks" integer NOT NULL,
	"promo_code_id" uuid,
	"email" text,
	"status" "payments"."order_status" DEFAULT 'created' NOT NULL,
	"terminal" text NOT NULL,
	"bank_payment_id" text,
	"payment_url" text,
	"bank_checks" integer DEFAULT 0 NOT NULL,
	"last_bank_check_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_bankPaymentId_unique" UNIQUE("bank_payment_id")
);
--> statement-breakpoint
CREATE TABLE "payments"."purchases" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"tour_id" uuid NOT NULL,
	"order_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payments"."order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "payments"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments"."purchases" ADD CONSTRAINT "purchases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "payments"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order_id_created_at_index" ON "payments"."order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_events_bank_status_unique" ON "payments"."order_events" USING btree ("bank_payment_id","bank_status") WHERE "payments"."order_events"."type" = 'bank_status';--> statement-breakpoint
CREATE INDEX "orders_user_id_tour_id_index" ON "payments"."orders" USING btree ("user_id","tour_id");--> statement-breakpoint
CREATE INDEX "orders_status_expires_at_index" ON "payments"."orders" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "orders_created_at_index" ON "payments"."orders" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_active_unique" ON "payments"."purchases" USING btree ("user_id","tour_id") WHERE "payments"."purchases"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "purchases_order_id_index" ON "payments"."purchases" USING btree ("order_id");