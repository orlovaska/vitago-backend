import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, gte, inArray, lt, sql } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../platform/database';
import { walks } from './walks.tables';

export type WalkRow = typeof walks.$inferSelect;
export type WalkFields = Omit<typeof walks.$inferInsert, 'id' | 'createdAt'>;
export type WalkStatus = WalkRow['status'];

/** Statuses a walk keeps for good; the rest expire. */
export const KEPT_STATUSES = ['saved', 'purchased'] as const satisfies readonly WalkStatus[];

@Injectable()
export class WalksStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  async insert(fields: WalkFields): Promise<WalkRow> {
    const [row] = await this.db.insert(walks).values(fields).returning();
    return row!;
  }

  async findById(id: string): Promise<WalkRow | null> {
    const [row] = await this.db.select().from(walks).where(eq(walks.id, id));
    return row ?? null;
  }

  /** The user's walks of this app in the given statuses, newest first. */
  listForUser(
    userId: string,
    appId: string,
    statuses: readonly WalkStatus[] = KEPT_STATUSES,
  ): Promise<WalkRow[]> {
    return (
      this.db
        .select()
        .from(walks)
        .where(
          and(
            eq(walks.userId, userId),
            eq(walks.appId, appId),
            inArray(walks.status, [...statuses]),
          ),
        )
        // Latest kept first; a paid walk that was never saved falls back to its
        // creation time.
        .orderBy(desc(sql`coalesce(${walks.savedAt}, ${walks.createdAt})`))
    );
  }

  async update(id: string, fields: Partial<WalkFields>): Promise<WalkRow | null> {
    const [row] = await this.db.update(walks).set(fields).where(eq(walks.id, id)).returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db.delete(walks).where(eq(walks.id, id)).returning({ id: walks.id });
    return rows.length > 0;
  }

  /** How many walks the user generated since `since`; every generation is a row. */
  async countSince(userId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(walks)
      .where(and(eq(walks.userId, userId), gte(walks.createdAt, since)));
    return row?.total ?? 0;
  }

  /** Account deletion: a walk is personal, so it goes with the user. */
  async deleteAllOfUser(userId: string): Promise<void> {
    await this.db.delete(walks).where(eq(walks.userId, userId));
  }

  /** Drops the walks nobody kept once their time is up. Returns how many went. */
  async deleteExpired(now: Date): Promise<number> {
    const rows = await this.db
      .delete(walks)
      .where(and(eq(walks.status, 'active'), lt(walks.expiresAt, now)))
      .returning({ id: walks.id });
    return rows.length;
  }

  /**
   * Keeps at most `limit` walks of these statuses per user, newest first, and
   * deletes the rest. Returns how many went.
   */
  async trimPerUser(statuses: readonly WalkStatus[], limit: number): Promise<number> {
    const ranked = this.db
      .select({
        id: walks.id,
        position:
          sql<number>`row_number() over (partition by ${walks.userId} order by ${walks.createdAt} desc)`.as(
            'position',
          ),
      })
      .from(walks)
      .where(inArray(walks.status, [...statuses]))
      .as('ranked');

    const overflow = await this.db
      .select({ id: ranked.id })
      .from(ranked)
      .where(gt(ranked.position, limit));
    if (overflow.length === 0) return 0;

    await this.db.delete(walks).where(
      inArray(
        walks.id,
        overflow.map((row) => row.id),
      ),
    );
    return overflow.length;
  }
}
