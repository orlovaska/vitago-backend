import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../platform/database';
import { favoritePoints, favoriteTours } from './favorites.tables';

@Injectable()
export class FavoritesStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  /** Newest first. */
  async tourIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ tourId: favoriteTours.tourId })
      .from(favoriteTours)
      .where(eq(favoriteTours.userId, userId))
      .orderBy(desc(favoriteTours.createdAt));
    return rows.map((row) => row.tourId);
  }

  /** Newest first. */
  async pointIds(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ pointId: favoritePoints.pointId })
      .from(favoritePoints)
      .where(eq(favoritePoints.userId, userId))
      .orderBy(desc(favoritePoints.createdAt));
    return rows.map((row) => row.pointId);
  }

  async addTour(userId: string, tourId: string): Promise<void> {
    await this.db.insert(favoriteTours).values({ userId, tourId }).onConflictDoNothing();
  }

  async removeTour(userId: string, tourId: string): Promise<void> {
    await this.db
      .delete(favoriteTours)
      .where(and(eq(favoriteTours.userId, userId), eq(favoriteTours.tourId, tourId)));
  }

  async addPoint(userId: string, pointId: string): Promise<void> {
    await this.db.insert(favoritePoints).values({ userId, pointId }).onConflictDoNothing();
  }

  async removePoint(userId: string, pointId: string): Promise<void> {
    await this.db
      .delete(favoritePoints)
      .where(and(eq(favoritePoints.userId, userId), eq(favoritePoints.pointId, pointId)));
  }

  async deleteAll(userId: string): Promise<void> {
    await this.db.delete(favoriteTours).where(eq(favoriteTours.userId, userId));
    await this.db.delete(favoritePoints).where(eq(favoritePoints.userId, userId));
  }
}
