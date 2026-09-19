import { pgSchema, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from '../../platform/database';

export const favoritesSchema = pgSchema('favorites');

/** Tour and point ids come from the tours module; no foreign keys across schemas. */
export const favoriteTours = favoritesSchema.table(
  'favorite_tours',
  {
    userId: uuid().notNull(),
    tourId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tourId] })],
);

export const favoritePoints = favoritesSchema.table(
  'favorite_points',
  {
    userId: uuid().notNull(),
    pointId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.pointId] })],
);
