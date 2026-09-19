CREATE SCHEMA "apps";
--> statement-breakpoint
CREATE TYPE "apps"."store" AS ENUM('app_store', 'google_play', 'rustore');--> statement-breakpoint
CREATE TABLE "apps"."app_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"app_id" uuid NOT NULL,
	"store" "apps"."store" NOT NULL,
	"version" text NOT NULL,
	"mandatory" boolean DEFAULT false NOT NULL,
	"release_notes" text,
	"released_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_versions_appId_store_version_unique" UNIQUE("app_id","store","version")
);
--> statement-breakpoint
CREATE TABLE "apps"."apps" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"bundle_id" text NOT NULL,
	"name" text NOT NULL,
	"url_scheme" text,
	"map_style_url" text,
	"payment_stores" "apps"."store"[] DEFAULT '{}' NOT NULL,
	"receipt_email_required" boolean DEFAULT false NOT NULL,
	"support_email" text,
	"support_telegram_url" text,
	"support_vk_url" text,
	"support_max_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apps_slug_unique" UNIQUE("slug"),
	CONSTRAINT "apps_bundleId_unique" UNIQUE("bundle_id")
);
--> statement-breakpoint
CREATE TABLE "apps"."user_app_versions" (
	"user_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"store" "apps"."store" NOT NULL,
	"version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_app_versions_user_id_app_id_pk" PRIMARY KEY("user_id","app_id")
);
--> statement-breakpoint
ALTER TABLE "apps"."app_versions" ADD CONSTRAINT "app_versions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "apps"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apps"."user_app_versions" ADD CONSTRAINT "user_app_versions_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "apps"."apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_app_versions_user_id_index" ON "apps"."user_app_versions" USING btree ("user_id");