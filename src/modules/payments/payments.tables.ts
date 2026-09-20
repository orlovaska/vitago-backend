import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId, updatedAt } from '../../platform/database';

export const paymentsSchema = pgSchema('payments');

/** What an order sells: a whole tour, or unlocking the points of one walk. */
export const orderKind = paymentsSchema.enum('order_kind', ['tour', 'walk_unlock']);

/** See ORDER_STATES.md for the allowed transitions. */
export const orderStatus = paymentsSchema.enum('order_status', [
  'created',
  'awaiting_payment',
  'paid',
  'failed',
  'expired',
  'refunded',
]);

export const orders = paymentsSchema.table(
  'orders',
  {
    id: primaryId(),
    /** Cleared when the account is deleted; the order stays for accounting. */
    userId: uuid(),
    appId: uuid().notNull(),
    kind: orderKind().notNull().default('tour'),
    /** Set for a `tour` order. */
    tourId: uuid(),
    /** Set for a `walk_unlock` order; the walk lives in the walks module. */
    walkId: uuid(),
    /**
     * The points a `walk_unlock` order pays for, frozen at checkout: what the
     * user saw priced is what the payment opens, whatever the walk shows later.
     */
    unlockPointIds: jsonb().$type<string[]>(),
    /** Snapshot at purchase time: later edits do not change what the receipt says. */
    subjectTitle: text().notNull(),
    priceKopecks: integer().notNull(),
    /** What the user pays after the promo code. */
    amountKopecks: integer().notNull(),
    promoCodeId: uuid(),
    /** Receipt e-mail; cleared when the account is deleted. */
    email: text(),
    status: orderStatus().notNull().default('created'),
    /** Terminal the payment went through, named by app slug. */
    terminal: text().notNull(),
    bankPaymentId: text().unique(),
    paymentUrl: text(),
    /** Server-side status checks made with the bank for this order. */
    bankChecks: integer().notNull().default(0),
    lastBankCheckAt: timestamp({ withTimezone: true }),
    /** After this moment an unpaid order is expired. */
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    paidAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index().on(table.userId, table.tourId),
    index().on(table.status, table.expiresAt),
    index().on(table.createdAt),
  ],
);

/** Audit trail of an order: every transition and every bank status seen. */
export const orderEvents = paymentsSchema.table(
  'order_events',
  {
    id: primaryId(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** e.g. status_changed, bank_status, late_confirmation, duplicate_payment. */
    type: text().notNull(),
    fromStatus: orderStatus(),
    toStatus: orderStatus(),
    bankPaymentId: text(),
    bankStatus: text(),
    details: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    index().on(table.orderId, table.createdAt),
    // The bank has no event id and may repeat itself: one row per (payment, status).
    uniqueIndex('order_events_bank_status_unique')
      .on(table.bankPaymentId, table.bankStatus)
      .where(sql`${table.type} = 'bank_status'`),
  ],
);

/**
 * Points opened by paying to unlock one generated walk. They stay open in
 * every walk of that user; the tours they belong to are unaffected.
 * Revoked on refund, like a purchase.
 */
export const walkUnlocks = paymentsSchema.table(
  'walk_unlocks',
  {
    id: primaryId(),
    userId: uuid().notNull(),
    /** The walk that was unlocked (walks module); no foreign key across schemas. */
    walkId: uuid().notNull(),
    orderId: uuid().references(() => orders.id, { onDelete: 'set null' }),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex('walk_unlocks_active_unique')
      .on(table.userId, table.walkId)
      .where(sql`${table.revokedAt} is null`),
    index().on(table.orderId),
  ],
);

/**
 * The points one unlock paid for. Kept even when the walk itself is deleted:
 * what was paid for stays paid for.
 */
export const walkUnlockPoints = paymentsSchema.table(
  'walk_unlock_points',
  {
    unlockId: uuid()
      .notNull()
      .references(() => walkUnlocks.id, { onDelete: 'cascade' }),
    /** Point of a tour (tours module). */
    pointId: uuid().notNull(),
  },
  (table) => [primaryKey({ columns: [table.unlockId, table.pointId] }), index().on(table.pointId)],
);

/** Access to a tour. Revoked on refund; granted again by a new purchase. */
export const purchases = paymentsSchema.table(
  'purchases',
  {
    id: primaryId(),
    userId: uuid().notNull(),
    tourId: uuid().notNull(),
    /** Null for access granted by an administrator. */
    orderId: uuid().references(() => orders.id, { onDelete: 'set null' }),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex('purchases_active_unique')
      .on(table.userId, table.tourId)
      .where(sql`${table.revokedAt} is null`),
    index().on(table.orderId),
  ],
);
