import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../../platform/database';
import { OPEN_STATUSES, type OrderStatus, sourcesOf } from '../order-state';
import { orderEvents, orders } from '../payments.tables';

export type OrderRow = typeof orders.$inferSelect;
export type NewOrder = Omit<
  typeof orders.$inferInsert,
  'id' | 'status' | 'createdAt' | 'updatedAt' | 'bankChecks'
>;
export type OrderEventRow = typeof orderEvents.$inferSelect;
export type NewOrderEvent = Omit<typeof orderEvents.$inferInsert, 'id' | 'createdAt'>;

export interface BankCheckLimits {
  now: Date;
  intervalMs: number;
  maxAttempts: number;
  maxAgeMs: number;
}

@Injectable()
export class OrdersStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  async insert(order: NewOrder): Promise<OrderRow> {
    const [row] = await this.db.insert(orders).values(order).returning();
    return row!;
  }

  async findById(id: string): Promise<OrderRow | null> {
    const [row] = await this.db.select().from(orders).where(eq(orders.id, id));
    return row ?? null;
  }

  /**
   * Moves the order to `to` only if its current state allows it. Returns the
   * updated row, or null when the order is missing or already elsewhere —
   * which is how concurrent or repeated confirmations lose the race.
   */
  async transition(
    id: string,
    to: OrderStatus,
    fields: Partial<Pick<OrderRow, 'bankPaymentId' | 'paymentUrl' | 'paidAt'>> = {},
  ): Promise<OrderRow | null> {
    const [row] = await this.db
      .update(orders)
      .set({ ...fields, status: to, updatedAt: new Date() })
      .where(and(eq(orders.id, id), inArray(orders.status, sourcesOf(to))))
      .returning();
    return row ?? null;
  }

  /**
   * Reserves one server-side status check with the bank, atomically, so that
   * concurrent polls and restarts cannot exceed the per-order limits.
   */
  async claimBankCheck(id: string, limits: BankCheckLimits): Promise<OrderRow | null> {
    const since = (ms: number) => new Date(limits.now.getTime() - ms);
    const [row] = await this.db
      .update(orders)
      .set({ bankChecks: sql`${orders.bankChecks} + 1`, lastBankCheckAt: limits.now })
      .where(
        and(
          eq(orders.id, id),
          inArray(orders.status, [...OPEN_STATUSES]),
          isNotNull(orders.bankPaymentId),
          lt(orders.bankChecks, limits.maxAttempts),
          gt(orders.createdAt, since(limits.maxAgeMs)),
          lte(orders.createdAt, since(limits.intervalMs)),
          or(isNull(orders.lastBankCheckAt), lte(orders.lastBankCheckAt, since(limits.intervalMs))),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** Expires every open order whose payment link has run out. */
  expireDue(now: Date): Promise<OrderRow[]> {
    return this.db
      .update(orders)
      .set({ status: 'expired', updatedAt: now })
      .where(and(inArray(orders.status, [...OPEN_STATUSES]), lte(orders.expiresAt, now)))
      .returning();
  }

  /** Records an event; false when an identical bank status was already recorded. */
  async addEvent(event: NewOrderEvent): Promise<boolean> {
    const rows = await this.db
      .insert(orderEvents)
      .values(event)
      .onConflictDoNothing()
      .returning({ id: orderEvents.id });
    return rows.length > 0;
  }

  events(orderId: string): Promise<OrderEventRow[]> {
    return this.db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(asc(orderEvents.createdAt), asc(orderEvents.id));
  }

  page(
    filter: { status?: OrderStatus; userId?: string; tourId?: string },
    limit: number,
    after?: { at: Date; id: string },
  ): Promise<OrderRow[]> {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(orders.status, filter.status));
    if (filter.userId) conditions.push(eq(orders.userId, filter.userId));
    if (filter.tourId) conditions.push(eq(orders.tourId, filter.tourId));
    if (after) {
      conditions.push(
        or(
          lt(orders.createdAt, after.at),
          and(eq(orders.createdAt, after.at), lt(orders.id, after.id)),
        )!,
      );
    }
    return this.db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit);
  }

  /** Account deletion: orders stay for accounting without personal data. */
  async forgetUser(userId: string): Promise<void> {
    await this.db
      .update(orders)
      .set({ userId: null, email: null })
      .where(eq(orders.userId, userId));
  }
}
