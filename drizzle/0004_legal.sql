CREATE SCHEMA "legal";
--> statement-breakpoint
CREATE TYPE "legal"."legal_document_type" AS ENUM('terms', 'privacy');--> statement-breakpoint
CREATE TABLE "legal"."consents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consents_userId_versionId_unique" UNIQUE("user_id","version_id")
);
--> statement-breakpoint
CREATE TABLE "legal"."legal_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"document_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"requires_reconsent" boolean NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal"."legal_documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"app_id" uuid NOT NULL,
	"type" "legal"."legal_document_type" NOT NULL,
	"public_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_documents_appId_type_unique" UNIQUE("app_id","type")
);
--> statement-breakpoint
ALTER TABLE "legal"."consents" ADD CONSTRAINT "consents_version_id_legal_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "legal"."legal_document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal"."legal_document_versions" ADD CONSTRAINT "legal_document_versions_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "legal"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_user_id_index" ON "legal"."consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "legal_document_versions_document_id_published_at_index" ON "legal"."legal_document_versions" USING btree ("document_id","published_at");