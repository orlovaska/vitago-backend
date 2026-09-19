CREATE SCHEMA "tours";
--> statement-breakpoint
CREATE TYPE "tours"."tour_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "tours"."tour_images" (
	"tour_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "tour_images_tour_id_position_pk" PRIMARY KEY("tour_id","position")
);
--> statement-breakpoint
CREATE TABLE "tours"."tour_translations" (
	"tour_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"intro_audio_id" uuid,
	CONSTRAINT "tour_translations_tour_id_locale_pk" PRIMARY KEY("tour_id","locale")
);
--> statement-breakpoint
CREATE TABLE "tours"."tours" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"app_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" "tours"."tour_status" DEFAULT 'draft' NOT NULL,
	"price_kopecks" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"cover_image_id" uuid,
	"distance_meters" integer,
	"duration_minutes" integer,
	"map_viewport" jsonb,
	"route" jsonb,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tours_appId_slug_unique" UNIQUE("app_id","slug")
);
--> statement-breakpoint
ALTER TABLE "tours"."tour_images" ADD CONSTRAINT "tour_images_tour_id_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "tours"."tours"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours"."tour_translations" ADD CONSTRAINT "tour_translations_tour_id_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "tours"."tours"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tours_app_id_position_index" ON "tours"."tours" USING btree ("app_id","position");