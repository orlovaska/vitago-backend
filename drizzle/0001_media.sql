CREATE SCHEMA "media";
--> statement-breakpoint
CREATE TABLE "media"."files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storageKey_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE INDEX "files_sha256_index" ON "media"."files" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "files_created_at_index" ON "media"."files" USING btree ("created_at");