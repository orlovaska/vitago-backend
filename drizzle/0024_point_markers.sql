CREATE TABLE "tours"."marker_files" (
	"file_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tours"."points" ADD COLUMN "marker_id" uuid;--> statement-breakpoint
ALTER TABLE "tours"."points" ADD COLUMN "marker_spec" text;