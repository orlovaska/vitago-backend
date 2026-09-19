import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../platform/database';
import { AppError } from '../../platform/http';
import { ToursFacade } from '../tours';
import { type PromoCodeFields, type PromoCodeRow, PromotionsStore } from './promotions.store';

export interface PromoQuote {
  promoCodeId: string;
  code: string;
  discountPercent: number;
  priceKopecks: number;
  discountedPriceKopecks: number;
}

export const normalizeCode = (code: string) => code.trim().toUpperCase();

export function applyDiscount(priceKopecks: number, discountPercent: number): number {
  return Math.round((priceKopecks * (100 - discountPercent)) / 100);
}

/** Why a code cannot be used; the app shows a message per reason. */
type Rejection =
  'not_found' | 'inactive' | 'expired' | 'other_tour' | 'not_invited' | 'used_up' | 'already_used';

const rejected = (reason: Rejection) =>
  AppError.badRequest(`promo_code_${reason}`, `The promo code cannot be used: ${reason}`);

@Injectable()
export class PromotionsService {
  constructor(
    private readonly store: PromotionsStore,
    private readonly tours: ToursFacade,
  ) {}

  /** Checks a code for this user and tour and computes the discounted price. */
  async quote(input: {
    userId: string;
    appId: string;
    tourId: string;
    code: string;
  }): Promise<PromoQuote> {
    const tour = await this.tours.findForSale(input.tourId);
    if (!tour || !tour.published || tour.appId !== input.appId) {
      throw AppError.notFound('tour_not_found', `Tour ${input.tourId} not found`);
    }
    const promo = await this.store.findByCode(normalizeCode(input.code));
    if (!promo) throw rejected('not_found');
    if (!promo.active) throw rejected('inactive');
    if (promo.expiresAt && promo.expiresAt <= new Date()) throw rejected('expired');
    if (promo.tourId !== tour.id) throw rejected('other_tour');
    if (promo.restricted && !(await this.store.isAllowed(promo.id, input.userId))) {
      throw rejected('not_invited');
    }
    if (await this.store.hasRedeemed(promo.id, input.userId)) throw rejected('already_used');
    if (
      promo.maxRedemptions !== null &&
      (await this.store.redemptionCount(promo.id)) >= promo.maxRedemptions
    ) {
      throw rejected('used_up');
    }
    return {
      promoCodeId: promo.id,
      code: promo.code,
      discountPercent: promo.discountPercent,
      priceKopecks: tour.priceKopecks,
      discountedPriceKopecks: applyDiscount(tour.priceKopecks, promo.discountPercent),
    };
  }

  /** Opening an invitation link lets the user use a restricted code. */
  async claim(userId: string, token: string): Promise<PromoCodeRow> {
    const promo = await this.store.findByLinkToken(token);
    if (!promo || !promo.active) throw rejected('not_found');
    await this.store.allow(promo.id, userId);
    return promo;
  }

  recordRedemption(promoCodeId: string, userId: string, orderId: string): Promise<void> {
    return this.store.recordRedemption(promoCodeId, userId, orderId);
  }

  shareableForTour(tourId: string): Promise<PromoCodeRow | null> {
    return this.store.shareableForTour(tourId, new Date());
  }

  forgetUser(userId: string): Promise<void> {
    return this.store.forgetUser(userId);
  }

  // ---- Administration ----

  list(tourId?: string): Promise<PromoCodeRow[]> {
    return this.store.list(tourId);
  }

  async create(fields: PromoCodeFields): Promise<PromoCodeRow> {
    if (!(await this.tours.findForSale(fields.tourId))) {
      throw AppError.badRequest('tour_not_found', `Tour ${fields.tourId} not found`);
    }
    return this.withUniqueCode(() =>
      this.store.insert({ ...fields, code: normalizeCode(fields.code) }),
    );
  }

  async update(id: string, fields: Partial<PromoCodeFields>): Promise<PromoCodeRow> {
    const promo = await this.withUniqueCode(() =>
      this.store.update(id, {
        ...fields,
        ...(fields.code !== undefined && { code: normalizeCode(fields.code) }),
      }),
    );
    if (!promo) throw AppError.notFound('promo_code_not_found', `Promo code ${id} not found`);
    return promo;
  }

  /** Issues a new invitation link; the old one stops working. */
  async rotateLink(id: string): Promise<PromoCodeRow> {
    const promo = await this.store.update(id, { linkToken: randomUUID() });
    if (!promo) throw AppError.notFound('promo_code_not_found', `Promo code ${id} not found`);
    return promo;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.store.delete(id))) {
      throw AppError.notFound('promo_code_not_found', `Promo code ${id} not found`);
    }
  }

  private async withUniqueCode<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('promo_code_exists', 'This code already exists');
      }
      throw error;
    }
  }
}
