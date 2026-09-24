CREATE TYPE "auth"."admin_permission" AS ENUM('content', 'reviews', 'promotions', 'payments', 'settings', 'logs', 'server', 'admins');--> statement-breakpoint
CREATE TABLE "auth"."admin_roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"system_code" text,
	"name" text NOT NULL,
	"permissions" "auth"."admin_permission"[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_systemCode_unique" UNIQUE("system_code"),
	CONSTRAINT "admin_roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
-- The three system roles must always exist; the superadmin's permissions are implied, not listed.
INSERT INTO "auth"."admin_roles" ("system_code", "name", "permissions") VALUES
	('superadmin', 'Суперадмин', '{}'),
	('promoter', 'Промоутер', '{promotions}'),
	('content_manager', 'Контент-менеджер', '{content,reviews}');--> statement-breakpoint
ALTER TABLE "auth"."admins" ADD COLUMN "role_id" uuid;--> statement-breakpoint
-- Every administrator created before roles existed could do everything.
UPDATE "auth"."admins" SET "role_id" = (SELECT "id" FROM "auth"."admin_roles" WHERE "system_code" = 'superadmin');--> statement-breakpoint
ALTER TABLE "auth"."admins" ALTER COLUMN "role_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."admins" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "auth"."admins" ADD CONSTRAINT "admins_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "auth"."admin_roles"("id") ON DELETE no action ON UPDATE no action;