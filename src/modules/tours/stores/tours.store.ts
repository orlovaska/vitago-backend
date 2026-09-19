import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, type SQL } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../../platform/database';
import { points, tourImages, tours, tourTranslations } from '../tours.tables';

export type TourRow = typeof tours.$inferSelect;
export type TourFields = Omit<typeof tours.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;
export type TourTranslationRow = typeof tourTranslations.$inferSelect;
export type TourTranslationInput = Omit<TourTranslationRow, 'tourId'>;

@Injectable()
export class ToursStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  async findById(id: string): Promise<TourRow | null> {
    const [row] = await this.db.select().from(tours).where(eq(tours.id, id));
    return row ?? null;
  }

  async findByIds(ids: readonly string[]): Promise<TourRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(tours)
      .where(inArray(tours.id, [...ids]));
  }

  async findBySlug(appId: string, slug: string): Promise<TourRow | null> {
    const [row] = await this.db
      .select()
      .from(tours)
      .where(and(eq(tours.appId, appId), eq(tours.slug, slug)));
    return row ?? null;
  }

  list(filter: { appId: string; publishedOnly: boolean }): Promise<TourRow[]> {
    const conditions: SQL[] = [eq(tours.appId, filter.appId)];
    if (filter.publishedOnly) conditions.push(eq(tours.status, 'published'));
    return this.db
      .select()
      .from(tours)
      .where(and(...conditions))
      .orderBy(asc(tours.position), asc(tours.createdAt));
  }

  async insert(fields: TourFields): Promise<TourRow> {
    const [row] = await this.db.insert(tours).values(fields).returning();
    return row!;
  }

  async update(id: string, fields: Partial<TourFields>): Promise<TourRow | null> {
    const [row] = await this.db
      .update(tours)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(tours.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db.delete(tours).where(eq(tours.id, id)).returning({ id: tours.id });
    return rows.length > 0;
  }

  translations(tourIds: readonly string[]): Promise<TourTranslationRow[]> {
    if (tourIds.length === 0) return Promise.resolve([]);
    return this.db
      .select()
      .from(tourTranslations)
      .where(inArray(tourTranslations.tourId, [...tourIds]));
  }

  async replaceTranslations(tourId: string, rows: readonly TourTranslationInput[]): Promise<void> {
    await this.db.delete(tourTranslations).where(eq(tourTranslations.tourId, tourId));
    if (rows.length > 0) {
      await this.db.insert(tourTranslations).values(rows.map((row) => ({ ...row, tourId })));
    }
  }

  async imageIds(tourId: string): Promise<string[]> {
    const rows = await this.db
      .select({ fileId: tourImages.fileId })
      .from(tourImages)
      .where(eq(tourImages.tourId, tourId))
      .orderBy(asc(tourImages.position));
    return rows.map((row) => row.fileId);
  }

  async replaceImages(tourId: string, fileIds: readonly string[]): Promise<void> {
    await this.db.delete(tourImages).where(eq(tourImages.tourId, tourId));
    if (fileIds.length > 0) {
      await this.db
        .insert(tourImages)
        .values(fileIds.map((fileId, position) => ({ tourId, fileId, position })));
    }
  }

  /** Number of points per tour. */
  async pointCounts(tourIds: readonly string[]): Promise<Map<string, number>> {
    if (tourIds.length === 0) return new Map();
    const rows = await this.db
      .select({ tourId: points.tourId, total: count() })
      .from(points)
      .where(inArray(points.tourId, [...tourIds]))
      .groupBy(points.tourId);
    return new Map(rows.map((row) => [row.tourId, row.total]));
  }
}
