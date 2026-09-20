import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../../platform/database';
import { walkUnlockPoints, walkUnlocks } from '../payments.tables';

export type WalkUnlockRow = typeof walkUnlocks.$inferSelect;

/**
 * Points the user paid to open inside generated walks. Granted in the same
 * transaction as the order that paid for them, like a tour purchase.
 */
@Injectable()
export class WalkUnlocksStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  /** Opens these points; null when the walk is already unlocked for this user. */
  async grant(
    userId: string,
    walkId: string,
    pointIds: readonly string[],
    orderId: string | null,
  ): Promise<WalkUnlockRow | null> {
    const [unlock] = await this.db
      .insert(walkUnlocks)
      .values({ userId, walkId, orderId })
      .onConflictDoNothing()
      .returning();
    if (!unlock) return null;
    if (pointIds.length > 0) {
      await this.db
        .insert(walkUnlockPoints)
        .values([...new Set(pointIds)].map((pointId) => ({ unlockId: unlock.id, pointId })))
        .onConflictDoNothing();
    }
    return unlock;
  }

  async revokeByOrder(orderId: string): Promise<WalkUnlockRow[]> {
    return this.db
      .update(walkUnlocks)
      .set({ revokedAt: new Date() })
      .where(and(eq(walkUnlocks.orderId, orderId), isNull(walkUnlocks.revokedAt)))
      .returning();
  }

  async hasActive(userId: string, walkId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: walkUnlocks.id })
      .from(walkUnlocks)
      .where(
        and(
          eq(walkUnlocks.userId, userId),
          eq(walkUnlocks.walkId, walkId),
          isNull(walkUnlocks.revokedAt),
        ),
      );
    return !!row;
  }

  /**
   * Which of these points the user has already paid to open. A point stays
   * open even after the walk it was unlocked in is deleted.
   */
  async openPointIds(userId: string, pointIds: readonly string[]): Promise<Set<string>> {
    if (pointIds.length === 0) return new Set();
    const rows = await this.db
      .select({ pointId: walkUnlockPoints.pointId })
      .from(walkUnlockPoints)
      .innerJoin(walkUnlocks, eq(walkUnlockPoints.unlockId, walkUnlocks.id))
      .where(
        and(
          eq(walkUnlocks.userId, userId),
          isNull(walkUnlocks.revokedAt),
          inArray(walkUnlockPoints.pointId, [...pointIds]),
        ),
      );
    return new Set(rows.map((row) => row.pointId));
  }

  async deleteAllOfUser(userId: string): Promise<void> {
    await this.db.delete(walkUnlocks).where(eq(walkUnlocks.userId, userId));
  }
}
