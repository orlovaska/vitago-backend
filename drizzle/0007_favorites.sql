CREATE SCHEMA "favorites";
--> statement-breakpoint
CREATE TABLE "favorites"."favorite_points" (
	"user_id" uuid NOT NULL,
	"point_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_points_user_id_point_id_pk" PRIMARY KEY("user_id","point_id")
);
--> statement-breakpoint
CREATE TABLE "favorites"."favorite_tours" (
	"user_id" uuid NOT NULL,
	"tour_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_tours_user_id_tour_id_pk" PRIMARY KEY("user_id","tour_id")
);
