import { Injectable } from '@nestjs/common';
import { AppError } from '../../platform/http';
import { DEFAULT_LOCALE, type Locale } from '../../platform/i18n';
import { type PointSummary, type TourCard, ToursFacade } from '../tours';
import { FavoritesStore } from './favorites.store';

export interface Favorites {
  tours: TourCard[];
  points: PointSummary[];
}

/**
 * One account is shared by all city apps on a device, so favorites are stored
 * per user and filtered to the calling app when read.
 */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly store: FavoritesStore,
    private readonly tours: ToursFacade,
  ) {}

  async list(userId: string, appId: string, locale: Locale): Promise<Favorites> {
    const [tourIds, pointIds] = await Promise.all([
      this.store.tourIds(userId),
      this.store.pointIds(userId),
    ]);
    const [tours, points] = await Promise.all([
      this.tours.publishedCards(appId, tourIds, locale),
      this.tours.publishedPoints(pointIds, locale),
    ]);
    return {
      tours,
      points: pointIds.flatMap((id) => {
        const point = points.get(id);
        return point && point.appId === appId ? [point] : [];
      }),
    };
  }

  async addTour(userId: string, appId: string, tourId: string): Promise<void> {
    const tour = await this.tours.findForSale(tourId);
    if (!tour || !tour.published || tour.appId !== appId) {
      throw AppError.notFound('tour_not_found', `Tour ${tourId} not found`);
    }
    await this.store.addTour(userId, tourId);
  }

  async addPoint(userId: string, appId: string, pointId: string): Promise<void> {
    const point = (await this.tours.publishedPoints([pointId], DEFAULT_LOCALE)).get(pointId);
    if (!point || point.appId !== appId) {
      throw AppError.notFound('point_not_found', `Point ${pointId} not found`);
    }
    await this.store.addPoint(userId, pointId);
  }

  removeTour(userId: string, tourId: string): Promise<void> {
    return this.store.removeTour(userId, tourId);
  }

  removePoint(userId: string, pointId: string): Promise<void> {
    return this.store.removePoint(userId, pointId);
  }
}
