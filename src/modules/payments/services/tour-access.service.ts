import { Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http';
import { PromotionsFacade, type ShareableCode } from '../../promotions';
import { ToursFacade } from '../../tours';
import { type PurchaseRow, PurchasesStore } from '../stores/purchases.store';

export interface TourAccess {
  tourId: string;
  /** Free tours and bought tours are both accessible. */
  accessible: boolean;
  purchased: boolean;
  priceKopecks: number;
  /** What this user would pay now: the price with their applied promo code. */
  discountedPriceKopecks: number;
  /** The promo code the user applied to this tour, still usable; null when none. */
  appliedPromoCode: { code: string; discountPercent: number } | null;
  /** Code the buyer may share with friends, shown after purchase. */
  shareCode: ShareableCode | null;
}

@Injectable()
export class TourAccessService {
  constructor(
    private readonly purchases: PurchasesStore,
    private readonly tours: ToursFacade,
    private readonly promotions: PromotionsFacade,
  ) {}

  async forTour(userId: string, appId: string, tourId: string): Promise<TourAccess> {
    const tour = await this.tours.findForSale(tourId);
    if (!tour || !tour.published || tour.appId !== appId) {
      throw AppError.notFound('tour_not_found', `Tour ${tourId} not found`);
    }
    const purchased = await this.purchases.hasActive(userId, tourId);
    const applied = purchased ? null : await this.promotions.appliedQuote(userId, appId, tourId);
    return {
      tourId,
      accessible: purchased || tour.priceKopecks === 0,
      purchased,
      priceKopecks: tour.priceKopecks,
      discountedPriceKopecks: applied?.discountedPriceKopecks ?? tour.priceKopecks,
      appliedPromoCode: applied && { code: applied.code, discountPercent: applied.discountPercent },
      shareCode: purchased ? await this.promotions.shareableForTour(tourId) : null,
    };
  }

  /** Access to every published tour of the app, in one call for the tour list. */
  async allForApp(userId: string, appId: string): Promise<TourAccess[]> {
    const tourIds = await this.tours.publishedTourIds(appId);
    return Promise.all(tourIds.map((tourId) => this.forTour(userId, appId, tourId)));
  }

  /** The user's purchases of this app's published tours. */
  async forApp(userId: string, appId: string): Promise<PurchaseRow[]> {
    return this.purchases.active(userId, await this.tours.publishedTourIds(appId));
  }
}
