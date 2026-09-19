import { Injectable } from '@nestjs/common';
import { OrdersStore } from './stores/orders.store';
import { PurchasesStore } from './stores/purchases.store';

/** What other modules may ask of `payments`. */
@Injectable()
export class PaymentsFacade {
  constructor(
    private readonly orders: OrdersStore,
    private readonly purchases: PurchasesStore,
  ) {}

  hasPurchased(userId: string, tourId: string): Promise<boolean> {
    return this.purchases.hasActive(userId, tourId);
  }

  /**
   * Account deletion step. Orders stay for accounting without the user id
   * and e-mail; purchases are access rights and go. Idempotent.
   */
  async deleteUserData(userId: string): Promise<void> {
    await this.orders.forgetUser(userId);
    await this.purchases.deleteAllOfUser(userId);
  }
}
