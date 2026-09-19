import { Injectable } from '@nestjs/common';
import { and, avg, count, desc, eq, inArray, lt, or, type SQL } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../platform/database';
import { reviews, type reviewStatus } from './reviews.tables';

export type ReviewRow = typeof reviews.$inferSelect;
export type ReviewStatus = (typeof reviewStatus.enumValues)[number];

export interface Rating {
  tourId: string;
  average: number;
  count: number;
}

interface PageQuery {
  limit: number;
  after?: { at: Date; id: string };
}

@Injectable()
export class ReviewsStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  async findById(id: string): Promise<ReviewRow | null> {
    const [row] = await this.db.select().from(reviews).where(eq(reviews.id, id));
    return row ?? null;
  }

  async findOwn(userId: string, tourId: string): Promise<ReviewRow | null> {
    const [row] = await this.db
      .select()
      .from(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.tourId, tourId)));
    return row ?? null;
  }

  /** Creates the user's review of the tour or replaces it, sending it back to moderation. */
  async upsertOwn(
    userId: string,
    tourId: string,
    review: { rating: number; text: string | null; authorName: string | null },
  ): Promise<ReviewRow> {
    const changes = {
      ...review,
      status: 'pending' as const,
      updatedAt: new Date(),
      moderatedAt: null,
      moderatedBy: null,
    };
    const [row] = await this.db
      .insert(reviews)
      .values({ userId, tourId, ...changes })
      .onConflictDoUpdate({ target: [reviews.userId, reviews.tourId], set: changes })
      .returning();
    return row!;
  }

  async deleteOwn(userId: string, tourId: string): Promise<void> {
    await this.db
      .delete(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.tourId, tourId)));
  }

  async deleteAllOfUser(userId: string): Promise<void> {
    await this.db.delete(reviews).where(eq(reviews.userId, userId));
  }

  /** Newest change first; keyset pagination on (updated_at, id). */
  page(filter: { tourId?: string; status?: ReviewStatus }, { limit, after }: PageQuery) {
    const conditions: SQL[] = [];
    if (filter.tourId) conditions.push(eq(reviews.tourId, filter.tourId));
    if (filter.status) conditions.push(eq(reviews.status, filter.status));
    if (after) {
      conditions.push(
        or(
          lt(reviews.updatedAt, after.at),
          and(eq(reviews.updatedAt, after.at), lt(reviews.id, after.id)),
        )!,
      );
    }
    return this.db
      .select()
      .from(reviews)
      .where(and(...conditions))
      .orderBy(desc(reviews.updatedAt), desc(reviews.id))
      .limit(limit);
  }

  async moderate(id: string, status: ReviewStatus, adminId: string): Promise<ReviewRow | null> {
    const [row] = await this.db
      .update(reviews)
      .set({ status, moderatedAt: new Date(), moderatedBy: adminId })
      .where(eq(reviews.id, id))
      .returning();
    return row ?? null;
  }

  /** Average rating of approved reviews per tour. */
  async ratings(tourIds: readonly string[]): Promise<Rating[]> {
    if (tourIds.length === 0) return [];
    const rows = await this.db
      .select({ tourId: reviews.tourId, average: avg(reviews.rating), count: count() })
      .from(reviews)
      .where(and(inArray(reviews.tourId, [...tourIds]), eq(reviews.status, 'approved')))
      .groupBy(reviews.tourId);
    return rows.map((row) => ({
      tourId: row.tourId,
      average: Math.round(Number(row.average) * 10) / 10,
      count: row.count,
    }));
  }
}
