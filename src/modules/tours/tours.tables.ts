import {
  boolean,
  doublePrecision,
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

/** A place on the route. Every point has a location and a description; audio is optional. */
export const points = toursSchema.table(
  'points',
  {
    id: primaryId(),
    tourId: uuid()
      .notNull()
      .references(() => tours.id, { onDelete: 'cascade' }),
    /** Order along the route, starting at 0. */
    position: integer().notNull(),
    latitude: doublePrecision().notNull(),
    longitude: doublePrecision().notNull(),
    /** Available before the tour is bought, as a preview. */
    isFree: boolean().notNull().default(false),
    imageId: uuid(),
    markerImageId: uuid(),
    /** Marker shown while the point is not yet available to the user. */
    lockedMarkerImageId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index().on(table.tourId, table.position)],
);

export const pointTranslations = toursSchema.table(
  'point_translations',
  {
    pointId: uuid()
      .notNull()
      .references(() => points.id, { onDelete: 'cascade' }),
    locale: text().notNull(),
    name: text().notNull(),
    description: text(),
    address: text(),
    openingHours: text(),
  },
  (table) => [primaryKey({ columns: [table.pointId, table.locale] })],
);

/** Present only for audio points: one row per point, settings that do not depend on language. */
export const pointAudio = toursSchema.table('point_audio', {
  pointId: uuid()
    .primaryKey()
    .references(() => points.id, { onDelete: 'cascade' }),
  /** Playback starts by itself when the user comes this close. */
  autoplayRadiusMeters: integer().notNull().default(40),
});

/** A subtitle line: shown from `startMs` to `endMs` of the recording. */
export interface SubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

export const pointAudioTranslations = toursSchema.table(
  'point_audio_translations',
  {
    pointId: uuid()
      .notNull()
      .references(() => pointAudio.pointId, { onDelete: 'cascade' }),
    locale: text().notNull(),
    audioFileId: uuid().notNull(),
    durationSeconds: integer(),
    /** Full narration text. */
    transcript: text(),
    subtitles: jsonb().$type<SubtitleCue[]>(),
  },
  (table) => [primaryKey({ columns: [table.pointId, table.locale] })],
);

/** Kind of place (museum, food, architecture…), used to filter points on the map. */
export const categories = toursSchema.table('categories', {
  id: primaryId(),
  slug: text().notNull().unique(),
  position: integer().notNull().default(0),
  iconImageId: uuid(),
});

export const categoryTranslations = toursSchema.table(
  'category_translations',
  {
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    locale: text().notNull(),
    name: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.categoryId, table.locale] })],
);

export const pointCategories = toursSchema.table(
  'point_categories',
  {
    pointId: uuid()
      .notNull()
      .references(() => points.id, { onDelete: 'cascade' }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.pointId, table.categoryId] })],
);
