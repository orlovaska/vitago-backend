import { Injectable } from '@nestjs/common';
import { clientStatus } from './http/payments.dto';
import { CheckoutService, type WalkUnlockCheckoutRequest } from './services/checkout.service';
import { OrdersStore } from './stores/orders.store';
import { PurchasesStore } from './stores/purchases.store';
import { WalkUnlocksStore } from './stores/walk-unlocks.store';

/** What the app needs to start paying: the same answer as buying a tour. */
export interface StartedCheckout {
  orderId: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';
  /** Open in the browser; null when there is nothing to pay. */
  paymentUrl: string | null;
  amountKopecks: number;
  pollIntervalMs: number;
  pollWindowMs: number;
}

/** What other modules may ask of `payments`. */
@Injectable()
export class PaymentsFacade {
  constructor(
    private readonly orders: OrdersStore,
    private readonly purchases: PurchasesStore,
    private readonly walkUnlocks: WalkUnlocksStore,
    private readonly checkout: CheckoutService,
  ) {}

  hasPurchased(userId: string, tourId: string): Promise<boolean> {
    return this.purchases.hasActive(userId, tourId);
  }

  /** Which of these tours the user has bought, in one query. */
  async purchasedTourIds(userId: string, tourIds: readonly string[]): Promise<Set<string>> {
    const rows = await this.purchases.active(userId, tourIds);
    return new Set(rows.map((row) => row.tourId));
  }

  /**
   * Which of these points the user has already paid to open in a walk. Such a
   * point stays open in walks only; its tour is still sold whole.
   */
  unlockedPointIds(userId: string, pointIds: readonly string[]): Promise<Set<string>> {
    return this.walkUnlocks.openPointIds(userId, pointIds);
  }

  /** Whether the user has paid to unlock this walk. */
  hasWalkUnlock(userId: string, walkId: string): Promise<boolean> {
    return this.walkUnlocks.hasActive(userId, walkId);
  }

  /**
   * Starts paying to unlock a generated walk. The caller has already checked
   * that the walk belongs to the user and worked out its price.
   */
  async startWalkUnlock(request: WalkUnlockCheckoutRequest): Promise<StartedCheckout> {
    const { order, pollIntervalMs, pollWindowMs } = await this.checkout.checkoutWalkUnlock(request);
    return {
      orderId: order.id,
      status: clientStatus(order.status),
      paymentUrl: order.status === 'awaiting_payment' ? order.paymentUrl : null,
      amountKopecks: order.amountKopecks,
      pollIntervalMs,
      pollWindowMs,
    };
  }

  /**
   * Account deletion step. Orders stay for accounting without the user id
   * and e-mail; purchases are access rights and go. Idempotent.
   */
  async deleteUserData(userId: string): Promise<void> {
    await this.orders.forgetUser(userId);
    await this.purchases.deleteAllOfUser(userId);
    await this.walkUnlocks.deleteAllOfUser(userId);
  }
}
