CREATE SCHEMA "reviews";
--> statement-breakpoint
CREATE TYPE "reviews"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "reviews"."reviews" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"tour_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"text" text,
	"author_name" text,
	"status" "reviews"."review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"moderated_at" timestamp with time zone,
	"moderated_by" uuid,
	CONSTRAINT "reviews_userId_tourId_unique" UNIQUE("user_id","tour_id")
);
--> statement-breakpoint
CREATE INDEX "reviews_tour_id_status_index" ON "reviews"."reviews" USING btree ("tour_id","status");--> statement-breakpoint
CREATE INDEX "reviews_status_updated_at_index" ON "reviews"."reviews" USING btree ("status","updated_at");