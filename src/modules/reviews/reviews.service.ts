import { Injectable } from '@nestjs/common';
import { type Cursor } from '../../platform/http';
import { AppError } from '../../platform/http';
import { ToursFacade } from '../tours';
import { type Rating, type ReviewRow, ReviewsStore, type ReviewStatus } from './reviews.store';

export interface ReviewPage {
  items: ReviewRow[];
  next: Cursor | null;
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly store: ReviewsStore,
    private readonly tours: ToursFacade,
  ) {}

  /** Approved reviews of a published tour of the app, newest first. */
  async publishedPage(appId: string, tourId: string, limit: number, after?: Cursor) {
    await this.assertTourOfApp(appId, tourId);
    const [page, [rating]] = await Promise.all([
      this.page({ tourId, status: 'approved' }, limit, after),
      this.store.ratings([tourId]),
    ]);
    return { ...page, rating: rating ?? { tourId, average: 0, count: 0 } };
  }

  async ratingsForApp(appId: string): Promise<Rating[]> {
    return this.store.ratings(await this.tours.publishedTourIds(appId));
  }

  async own(userId: string, appId: string, tourId: string): Promise<ReviewRow | null> {
    await this.assertTourOfApp(appId, tourId);
    return this.store.findOwn(userId, tourId);
  }

  async saveOwn(
    userId: string,
    appId: string,
    tourId: string,
    review: { rating: number; text: string | null; authorName: string | null },
  ): Promise<ReviewRow> {
    await this.assertTourOfApp(appId, tourId);
    return this.store.upsertOwn(userId, tourId, review);
  }

  deleteOwn(userId: string, tourId: string): Promise<void> {
    return this.store.deleteOwn(userId, tourId);
  }

  moderationPage(status: ReviewStatus | undefined, limit: number, after?: Cursor) {
    return this.page({ status }, limit, after);
  }

  async moderate(id: string, status: 'approved' | 'rejected', adminId: string): Promise<ReviewRow> {
    const review = await this.store.moderate(id, status, adminId);
    if (!review) throw AppError.notFound('review_not_found', `Review ${id} not found`);
    return review;
  }

  deleteUserData(userId: string): Promise<void> {
    return this.store.deleteAllOfUser(userId);
  }

  private async page(
    filter: { tourId?: string; status?: ReviewStatus },
    limit: number,
    after?: Cursor,
  ): Promise<ReviewPage> {
    const rows = await this.store.page(filter, { limit: limit + 1, after });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > limit && last ? { at: last.updatedAt, id: last.id } : null,
    };
  }

  private async assertTourOfApp(appId: string, tourId: string): Promise<void> {
    const tour = await this.tours.findForSale(tourId);
    if (!tour || !tour.published || tour.appId !== appId) {
      throw AppError.notFound('tour_not_found', `Tour ${tourId} not found`);
    }
  }
}
