import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../../platform/database';
import { purchases } from '../payments.tables';

export type PurchaseRow = typeof purchases.$inferSelect;

@Injectable()
export class PurchasesStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  /** Grants access; null when the user already has it (a duplicate payment). */
  async grant(userId: string, tourId: string, orderId: string | null): Promise<PurchaseRow | null> {
    const [row] = await this.db
      .insert(purchases)
      .values({ userId, tourId, orderId })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async revokeByOrder(orderId: string): Promise<PurchaseRow[]> {
    return this.db
      .update(purchases)
      .set({ revokedAt: new Date() })
      .where(and(eq(purchases.orderId, orderId), isNull(purchases.revokedAt)))
      .returning();
  }

  async revoke(id: string): Promise<PurchaseRow | null> {
    const [row] = await this.db
      .update(purchases)
      .set({ revokedAt: new Date() })
      .where(and(eq(purchases.id, id), isNull(purchases.revokedAt)))
      .returning();
    return row ?? null;
  }

  async hasActive(userId: string, tourId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: purchases.id })
      .from(purchases)
      .where(
        and(
          eq(purchases.userId, userId),
          eq(purchases.tourId, tourId),
          isNull(purchases.revokedAt),
        ),
      );
    return !!row;
  }

  /** Active purchases of the user, newest first, optionally limited to some tours. */
  active(userId: string, tourIds?: readonly string[]): Promise<PurchaseRow[]> {
    if (tourIds?.length === 0) return Promise.resolve([]);
    return this.db
      .select()
      .from(purchases)
      .where(
        and(
          eq(purchases.userId, userId),
          isNull(purchases.revokedAt),
          tourIds ? inArray(purchases.tourId, [...tourIds]) : undefined,
        ),
      )
      .orderBy(desc(purchases.grantedAt));
  }

  async deleteAllOfUser(userId: string): Promise<void> {
    await this.db.delete(purchases).where(eq(purchases.userId, userId));
  }
}
