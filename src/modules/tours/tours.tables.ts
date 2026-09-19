import {
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId, updatedAt } from '../../platform/database';

export const toursSchema = pgSchema('tours');

/** Draft tours are visible only in the admin. */
export const tourStatus = toursSchema.enum('tour_status', ['draft', 'published']);

/** Initial camera of the tour map. */
export interface MapViewport {
  center: { latitude: number; longitude: number };
  zoom: number;
  /** Area the user can pan within. */
  bounds?: { south: number; west: number; north: number; east: number };
}

/** GeoJSON LineString of the walking route, [longitude, latitude] pairs. */
export interface RouteLine {
  type: 'LineString';
  coordinates: [number, number][];
}

export const tours = toursSchema.table(
  'tours',
  {
    id: primaryId(),
    /** City app that sells the tour (apps module); no foreign key across schemas. */
    appId: uuid().notNull(),
    /** Used in shared links, e.g. vitagoguides.ru/app/spb/tours/<slug>. */
    slug: text().notNull(),
    status: tourStatus().notNull().default('draft'),
    /** 0 means free. */
    priceKopecks: integer().notNull().default(0),
    /** Position in the app's tour list. */
    position: integer().notNull().default(0),
    coverImageId: uuid(),
    distanceMeters: integer(),
    durationMinutes: integer(),
    mapViewport: jsonb().$type<MapViewport>(),
    route: jsonb().$type<RouteLine>(),
    publishedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique().on(table.appId, table.slug), index().on(table.appId, table.position)],
);

export const tourTranslations = toursSchema.table(
  'tour_translations',
  {
    tourId: uuid()
      .notNull()
      .references(() => tours.id, { onDelete: 'cascade' }),
    locale: text().notNull(),
    title: text().notNull(),
    subtitle: text(),
    description: text(),
    /** Optional introduction played before the first point. */
    introAudioId: uuid(),
  },
  (table) => [primaryKey({ columns: [table.tourId, table.locale] })],
);

/** Photo carousel of the tour page, in display order. */
export const tourImages = toursSchema.table(
  'tour_images',
  {
    tourId: uuid()
      .notNull()
      .references(() => tours.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    fileId: uuid().notNull(),
  },
  (table) => [primaryKey({ columns: [table.tourId, table.position] })],
);
