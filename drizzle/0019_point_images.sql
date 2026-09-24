CREATE TABLE "tours"."point_images" (
	"point_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"file_id" uuid NOT NULL,
	CONSTRAINT "point_images_point_id_position_pk" PRIMARY KEY("point_id","position")
);
--> statement-breakpoint
ALTER TABLE "tours"."point_images" ADD CONSTRAINT "point_images_point_id_points_id_fk" FOREIGN KEY ("point_id") REFERENCES "tours"."points"("id") ON DELETE cascade ON UPDATE no action;