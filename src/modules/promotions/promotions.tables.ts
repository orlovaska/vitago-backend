import {
  boolean,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from '../../platform/database';

export const promotionsSchema = pgSchema('promotions');

export const promoCodes = promotionsSchema.table('promo_codes', {
  id: primaryId(),
  /** Tour the discount applies to (tours module); no foreign key across schemas. */
  tourId: uuid().notNull(),
  /** Stored upper-case; users may type it in any case. */
  code: text().notNull().unique(),
  discountPercent: integer().notNull(),
  active: boolean().notNull().default(true),
  /** Only users who opened the code's invitation link may use it. */
  restricted: boolean().notNull().default(false),
  /** Shown to buyers of the tour after payment, to share with friends. */
  shareAfterPurchase: boolean().notNull().default(false),
  /** Secret part of the invitation link; rotating it invalidates old links. */
  linkToken: uuid().notNull().unique().defaultRandom(),
  /** Total uses across all users; null means unlimited. */
  maxRedemptions: integer(),
  expiresAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

/** A code used in a paid order. The user id is cleared when the account is deleted. */
export const promoCodeRedemptions = promotionsSchema.table(
  'promo_code_redemptions',
  {
    id: primaryId(),
    promoCodeId: uuid()
      .notNull()
      .references(() => promoCodes.id, { onDelete: 'cascade' }),
    userId: uuid(),
    /** Order in the payments module. */
    orderId: uuid().notNull().unique(),
    redeemedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.promoCodeId, table.userId), index().on(table.userId)],
);

/** Users who opened the invitation link of a restricted code. */
export const promoCodeAllowedUsers = promotionsSchema.table(
  'promo_code_allowed_users',
  {
    promoCodeId: uuid()
      .notNull()
      .references(() => promoCodes.id, { onDelete: 'cascade' }),
    userId: uuid().notNull(),
    claimedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.promoCodeId, table.userId] }), index().on(table.userId)],
);
