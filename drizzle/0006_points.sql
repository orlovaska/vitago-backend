CREATE TABLE "tours"."categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"icon_image_id" uuid,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tours"."category_translations" (
	"category_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "category_translations_category_id_locale_pk" PRIMARY KEY("category_id","locale")
);
--> statement-breakpoint
CREATE TABLE "tours"."point_audio" (
	"point_id" uuid PRIMARY KEY NOT NULL,
	"autoplay_radius_meters" integer DEFAULT 40 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tours"."point_audio_translations" (
	"point_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"audio_file_id" uuid NOT NULL,
	"duration_seconds" integer,
	"transcript" text,
	"subtitles" jsonb,
	CONSTRAINT "point_audio_translations_point_id_locale_pk" PRIMARY KEY("point_id","locale")
);
--> statement-breakpoint
CREATE TABLE "tours"."point_categories" (
	"point_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "point_categories_point_id_category_id_pk" PRIMARY KEY("point_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "tours"."point_translations" (
	"point_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"address" text,
	"opening_hours" text,
	CONSTRAINT "point_translations_point_id_locale_pk" PRIMARY KEY("point_id","locale")
);
--> statement-breakpoint
CREATE TABLE "tours"."points" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tour_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"image_id" uuid,
	"marker_image_id" uuid,
	"locked_marker_image_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tours"."category_translations" ADD CONSTRAINT "category_translations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "tours"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours"."point_audio" ADD CONSTRAINT "point_audio_point_id_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "tours"."points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours"."point_audio_translations" ADD CONSTRAINT "point_audio_translations_point_id_point_audio_point_id_fk" FOREIGN KEY ("point_id") REFERENCES "tours"."point_audio"("point_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours"."point_categories" ADD CONSTRAINT "point_categories_point_id_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "tours"."points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours"."point_categories" ADD CONSTRAINT "point_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "tours"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours"."point_translations" ADD CONSTRAINT "point_translations_point_id_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "tours"."points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tours"."points" ADD CONSTRAINT "points_tour_id_tours_id_fk" FOREIGN KEY ("tour_id") REFERENCES "tours"."tours"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "points_tour_id_position_index" ON "tours"."points" USING btree ("tour_id","position");