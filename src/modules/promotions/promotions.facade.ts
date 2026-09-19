import { Injectable } from '@nestjs/common';
import { type PromoQuote, PromotionsService } from './promotions.service';

export interface ShareableCode {
  code: string;
  discountPercent: number;
}

/** What other modules may ask of `promotions`. */
@Injectable()
export class PromotionsFacade {
  constructor(private readonly promotions: PromotionsService) {}

  /** Throws a 4xx AppError with a `promo_code_*` code when the code cannot be used. */
  quote(input: {
    userId: string;
    appId: string;
    tourId: string;
    code: string;
  }): Promise<PromoQuote> {
    return this.promotions.quote(input);
  }

  /** Called once an order paid with the code is confirmed. Idempotent per order. */
  recordRedemption(promoCodeId: string, userId: string, orderId: string): Promise<void> {
    return this.promotions.recordRedemption(promoCodeId, userId, orderId);
  }

  /** The code a buyer of the tour may share, if the tour has one. */
  async shareableForTour(tourId: string): Promise<ShareableCode | null> {
    const promo = await this.promotions.shareableForTour(tourId);
    return promo && { code: promo.code, discountPercent: promo.discountPercent };
  }

  /** Account deletion step: anonymises redemptions and drops invitations. Idempotent. */
  deleteUserData(userId: string): Promise<void> {
    return this.promotions.forgetUser(userId);
  }
}
