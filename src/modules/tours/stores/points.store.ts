import { Injectable } from '@nestjs/common';
import { and, asc, eq, getTableColumns, gte, inArray, lte, max, sql } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../../platform/database';
import {
  pointAudio,
  pointAudioTranslations,
  pointCategories,
  pointImages,
  points,
  pointTranslations,
  tours,
} from '../tours.tables';

export type PointRow = typeof points.$inferSelect;
/** A point together with the position of the tour it belongs to. */
export type AppPointRow = PointRow & { tourPosition: number };
/** Rectangle in degrees. TODO: a box crossing the antimeridian needs two ranges. */
export interface Bbox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}
export type PointFields = Omit<typeof points.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;
export type PointTranslationRow = typeof pointTranslations.$inferSelect;
export type PointTranslationInput = Omit<PointTranslationRow, 'pointId'>;
export type PointAudioRow = typeof pointAudio.$inferSelect;
export type PointAudioTranslationRow = typeof pointAudioTranslations.$inferSelect;
export type PointAudioTranslationInput = Omit<PointAudioTranslationRow, 'pointId'>;

/** Everything stored about a set of points, loaded in a fixed number of queries. */
export interface PointDetails {
  points: PointRow[];
  translations: PointTranslationRow[];
  audio: PointAudioRow[];
  audioTranslations: PointAudioTranslationRow[];
  categoryLinks: { pointId: string; categoryId: string }[];
  /** Carousel photos, already in display order. */
  images: { pointId: string; position: number; fileId: string }[];
}

@Injectable()
export class PointsStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  async findById(id: string): Promise<PointRow | null> {
    const [row] = await this.db.select().from(points).where(eq(points.id, id));
    return row ?? null;
  }

  async byTour(tourId: string): Promise<PointRow[]> {
    return this.db
      .select()
      .from(points)
      .where(eq(points.tourId, tourId))
      .orderBy(asc(points.position), asc(points.createdAt));
  }

  async byIds(ids: readonly string[]): Promise<PointRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(points)
      .where(inArray(points.id, [...ids]));
  }

  /**
   * Every point of the app's published tours, optionally inside a rectangle.
   * A walk is built from these, so drafts never leak into one.
   */
  async byApp(appId: string, bbox?: Bbox): Promise<AppPointRow[]> {
    const conditions = [eq(tours.appId, appId), eq(tours.status, 'published')];
    if (bbox) {
      conditions.push(
        gte(points.latitude, bbox.minLat),
        lte(points.latitude, bbox.maxLat),
        gte(points.longitude, bbox.minLon),
        lte(points.longitude, bbox.maxLon),
      );
    }
    return this.db
      .select({ ...getTableColumns(points), tourPosition: tours.position })
      .from(points)
      .innerJoin(tours, eq(points.tourId, tours.id))
      .where(and(...conditions));
  }

  async details(rows: PointRow[]): Promise<PointDetails> {
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      return {
        points: [],
        translations: [],
        audio: [],
        audioTranslations: [],
        categoryLinks: [],
        images: [],
      };
    }
    const [translations, audio, audioTranslations, categoryLinks, images] = await Promise.all([
      this.db.select().from(pointTranslations).where(inArray(pointTranslations.pointId, ids)),
      this.db.select().from(pointAudio).where(inArray(pointAudio.pointId, ids)),
      this.db
        .select()
        .from(pointAudioTranslations)
        .where(inArray(pointAudioTranslations.pointId, ids)),
      this.db.select().from(pointCategories).where(inArray(pointCategories.pointId, ids)),
      this.db
        .select()
        .from(pointImages)
        .where(inArray(pointImages.pointId, ids))
        .orderBy(asc(pointImages.position)),
    ]);
    return { points: rows, translations, audio, audioTranslations, categoryLinks, images };
  }

  async nextPosition(tourId: string): Promise<number> {
    const [row] = await this.db
      .select({ last: max(points.position) })
      .from(points)
      .where(eq(points.tourId, tourId));
    return row?.last === null || row?.last === undefined ? 0 : row.last + 1;
  }

  async insert(fields: PointFields): Promise<PointRow> {
    const [row] = await this.db.insert(points).values(fields).returning();
    return row!;
  }

  async update(id: string, fields: Partial<PointFields>): Promise<PointRow | null> {
    const [row] = await this.db
      .update(points)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(points.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<PointRow | null> {
    const [row] = await this.db.delete(points).where(eq(points.id, id)).returning();
    return row ?? null;
  }

  async setPositions(orderedIds: readonly string[]): Promise<void> {
    if (orderedIds.length === 0) return;
    const cases = sql.join(
      orderedIds.map((id, index) => sql`when ${id}::uuid then ${index}::int`),
      sql` `,
    );
    await this.db
      .update(points)
      .set({ position: sql`case ${points.id} ${cases} end`, updatedAt: new Date() })
      .where(inArray(points.id, [...orderedIds]));
  }

  async replaceTranslations(
    pointId: string,
    rows: readonly PointTranslationInput[],
  ): Promise<void> {
    await this.db.delete(pointTranslations).where(eq(pointTranslations.pointId, pointId));
    if (rows.length > 0) {
      await this.db.insert(pointTranslations).values(rows.map((row) => ({ ...row, pointId })));
    }
  }

  async replaceCategories(pointId: string, categoryIds: readonly string[]): Promise<void> {
    await this.db.delete(pointCategories).where(eq(pointCategories.pointId, pointId));
    if (categoryIds.length > 0) {
      await this.db
        .insert(pointCategories)
        .values([...new Set(categoryIds)].map((categoryId) => ({ pointId, categoryId })));
    }
  }

  /** Carousel photos of one point, in display order. */
  async imageIds(pointId: string): Promise<string[]> {
    const rows = await this.db
      .select({ fileId: pointImages.fileId })
      .from(pointImages)
      .where(eq(pointImages.pointId, pointId))
      .orderBy(asc(pointImages.position));
    return rows.map((row) => row.fileId);
  }

  async replaceImages(pointId: string, fileIds: readonly string[]): Promise<void> {
    await this.db.delete(pointImages).where(eq(pointImages.pointId, pointId));
    if (fileIds.length > 0) {
      await this.db
        .insert(pointImages)
        .values(fileIds.map((fileId, position) => ({ pointId, fileId, position })));
    }
  }

  /** Creates or replaces the audio part of a point, including every language. */
  async putAudio(
    pointId: string,
    autoplayRadiusMeters: number,
    translations: readonly PointAudioTranslationInput[],
  ): Promise<void> {
    await this.db
      .insert(pointAudio)
      .values({ pointId, autoplayRadiusMeters })
      .onConflictDoUpdate({ target: pointAudio.pointId, set: { autoplayRadiusMeters } });
    await this.db.delete(pointAudioTranslations).where(eq(pointAudioTranslations.pointId, pointId));
    if (translations.length > 0) {
      await this.db
        .insert(pointAudioTranslations)
        .values(translations.map((row) => ({ ...row, pointId })));
    }
  }

  /** Turns an audio point into a plain one; its recordings go with the cascade. */
  async deleteAudio(pointId: string): Promise<boolean> {
    const rows = await this.db
      .delete(pointAudio)
      .where(eq(pointAudio.pointId, pointId))
      .returning({ pointId: pointAudio.pointId });
    return rows.length > 0;
  }

  async touch(pointId: string): Promise<void> {
    await this.db.update(points).set({ updatedAt: new Date() }).where(eq(points.id, pointId));
  }
}
