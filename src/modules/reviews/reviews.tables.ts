import { index, pgSchema, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from '../../platform/database';

export const reviewsSchema = pgSchema('reviews');

/** Reviews are shown only after an administrator approves them. */
export const reviewStatus = reviewsSchema.enum('review_status', [
  'pending',
  'approved',
  'rejected',
]);

export const reviews = reviewsSchema.table(
  'reviews',
  {
    id: primaryId(),
    userId: uuid().notNull(),
    /** Tour in the tours module; no foreign key across schemas. */
    tourId: uuid().notNull(),
    /** 1 to 5 stars. */
    rating: smallint().notNull(),
    text: text(),
    /** Name shown next to the review, chosen by the author. */
    authorName: text(),
    status: reviewStatus().notNull().default('pending'),
    createdAt: createdAt(),
    /** Last change by the author; an edit goes back to moderation. */
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    moderatedAt: timestamp({ withTimezone: true }),
    moderatedBy: uuid(),
  },
  (table) => [
    // One review per user and tour; editing replaces it.
    unique().on(table.userId, table.tourId),
    index().on(table.tourId, table.status),
    index().on(table.status, table.updatedAt),
  ],
);
