import { Injectable } from '@nestjs/common';
import { type Cursor } from '../../../platform/http';
import { AppError } from '../../../platform/http';
import { ToursFacade } from '../../tours';
import { type OrderStatus } from '../order-state';
import { type OrderEventRow, type OrderRow, OrdersStore } from '../stores/orders.store';
import { type PurchaseRow, PurchasesStore } from '../stores/purchases.store';

@Injectable()
export class PaymentsAdminService {
  constructor(
    private readonly orders: OrdersStore,
    private readonly purchases: PurchasesStore,
    private readonly tours: ToursFacade,
  ) {}

  async page(
    filter: { status?: OrderStatus; userId?: string; tourId?: string },
    limit: number,
    after?: Cursor,
  ): Promise<{ items: OrderRow[]; next: Cursor | null }> {
    const rows = await this.orders.page(filter, limit + 1, after);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      next: rows.length > limit && last ? { at: last.createdAt, id: last.id } : null,
    };
  }

  async order(id: string): Promise<{ order: OrderRow; events: OrderEventRow[] }> {
    const order = await this.orders.findById(id);
    if (!order) throw AppError.notFound('order_not_found', `Order ${id} not found`);
    return { order, events: await this.orders.events(id) };
  }

  purchasesOf(userId: string): Promise<PurchaseRow[]> {
    return this.purchases.active(userId);
  }

  /** Access granted by support, without an order (compensation, testing). */
  async grant(userId: string, tourId: string): Promise<PurchaseRow> {
    if (!(await this.tours.findForSale(tourId))) {
      throw AppError.badRequest('tour_not_found', `Tour ${tourId} not found`);
    }
    const purchase = await this.purchases.grant(userId, tourId, null);
    if (!purchase) throw AppError.conflict('already_purchased', 'The user already has the tour');
    return purchase;
  }

  async revoke(purchaseId: string): Promise<void> {
    if (!(await this.purchases.revoke(purchaseId))) {
      throw AppError.notFound('purchase_not_found', `Active purchase ${purchaseId} not found`);
    }
  }
}
