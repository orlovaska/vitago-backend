ALTER TABLE "media"."files" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "tours"."point_audio_translations" DROP COLUMN "duration_seconds";