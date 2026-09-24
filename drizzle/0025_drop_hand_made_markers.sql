-- Hand-made markers give way to ones the server draws from the cover photo.
-- Their files are handed to the marker registry, whose sweep deletes them from
-- media once no point uses them; this migration stays inside its own schema.
INSERT INTO "tours"."marker_files" ("file_id")
SELECT DISTINCT "file_id"
FROM "tours"."points",
     unnest(array["marker_image_id", "locked_marker_image_id"]) AS "file_id"
WHERE "file_id" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "tours"."points" DROP COLUMN "marker_image_id";--> statement-breakpoint
ALTER TABLE "tours"."points" DROP COLUMN "locked_marker_image_id";
