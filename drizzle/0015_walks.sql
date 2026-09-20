CREATE SCHEMA "walks";

--> statement-breakpoint
CREATE TYPE "payments"."order_kind" AS ENUM('tour', 'walk_unlock');
--> statement-breakpoint
CREATE TYPE "walks"."walk_status" AS ENUM('active', 'saved', 'purchased');
--> statement-breakpoint
CREATE TYPE "walks"."walk_end_mode" AS ENUM('same_as_start', 'custom');
--> statement-breakpoint
CREATE TABLE "payments"."walk_unlocks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"walk_id" uuid NOT NULL,
	"order_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);

--> statement-breakpoint
CREATE TABLE "payments"."walk_unlock_points" (
	"unlock_id" uuid NOT NULL,
	"point_id" uuid NOT NULL,
	CONSTRAINT "walk_unlock_points_unlock_id_point_id_pk" PRIMARY KEY("unlock_id","point_id")
);

--> statement-breakpoint
CREATE TABLE "walks"."walks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"requested_minutes" integer NOT NULL,
	"start_lat" double precision NOT NULL,
	"start_lon" double precision NOT NULL,
	"end_mode" "walks"."walk_end_mode" NOT NULL,
	"end_lat" double precision,
	"end_lon" double precision,
	"category_ids" jsonb,
	"area" jsonb,
	"point_ids" jsonb NOT NULL,
	"route" jsonb,
	"route_key" text,
	"distance_meters" integer NOT NULL,
	"walking_seconds" integer NOT NULL,
	"visit_seconds" integer NOT NULL,
	"status" "walks"."walk_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"locked_count" integer DEFAULT 0 NOT NULL,
	"amount_kopecks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

--> statement-breakpoint
ALTER TABLE "payments"."orders" ALTER COLUMN "tour_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments"."orders" ALTER COLUMN "tour_title" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments"."orders" ADD COLUMN "kind" "payments"."order_kind" DEFAULT 'tour' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments"."orders" ADD COLUMN "walk_id" uuid;
--> statement-breakpoint
ALTER TABLE "payments"."orders" ADD COLUMN "unlock_point_ids" jsonb;
--> statement-breakpoint
ALTER TABLE "payments"."orders" ADD COLUMN "subject_title" text;
--> statement-breakpoint
UPDATE "payments"."orders" SET "subject_title" = "tour_title" WHERE "subject_title" IS NULL;
--> statement-breakpoint
ALTER TABLE "payments"."orders" ALTER COLUMN "subject_title" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments"."walk_unlocks" ADD CONSTRAINT "walk_unlocks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "payments"."orders"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payments"."walk_unlock_points" ADD CONSTRAINT "walk_unlock_points_unlock_id_walk_unlocks_id_fk" FOREIGN KEY ("unlock_id") REFERENCES "payments"."walk_unlocks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "walk_unlocks_active_unique" ON "payments"."walk_unlocks" USING btree ("user_id","walk_id") WHERE "payments"."walk_unlocks"."revoked_at" is null;
--> statement-breakpoint
CREATE INDEX "walk_unlocks_order_id_index" ON "payments"."walk_unlocks" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX "walk_unlock_points_point_id_index" ON "payments"."walk_unlock_points" USING btree ("point_id");
--> statement-breakpoint
CREATE INDEX "walks_user_id_created_at_index" ON "walks"."walks" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "walks_status_expires_at_index" ON "walks"."walks" USING btree ("status","expires_at");
