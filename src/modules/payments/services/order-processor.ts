import { Transactional } from '@nestjs-cls/transactional';
import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '../../../platform/events';
import { PromotionsFacade } from '../../promotions';
import { type BankStatusReport } from '../gateway/payment-gateway';
import { type OrderStatus, statusForBank } from '../order-state';
import { PurchaseCompleted, type PurchaseCompletedPayload } from '../payments.events';
import { type OrderRow, OrdersStore } from '../stores/orders.store';
import { PurchasesStore } from '../stores/purchases.store';

export type ReportOutcome = 'applied' | 'unchanged' | 'duplicate' | 'ignored';

interface MoveResult {
  moved: boolean;
  completed?: PurchaseCompletedPayload;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The only place order statuses change. Follows ORDER_STATES.md: every move
 * is conditional on the current state, and granting or revoking access
 * happens in the same transaction.
 */
@Injectable()
export class OrderProcessor {
  private readonly logger = new Logger(OrderProcessor.name);

  constructor(
    private readonly orders: OrdersStore,
    private readonly purchases: PurchasesStore,
    private readonly promotions: PromotionsFacade,
    private readonly events: EventBus,
  ) {}

  /** Applies a status the bank reported, by notification or on our own request. */
  async applyBankReport(
    report: BankStatusReport,
    source: 'notification' | 'status_check',
  ): Promise<ReportOutcome> {
    const { outcome, completed } = await this.applyInTransaction(report, source);
    if (completed) this.events.publish(PurchaseCompleted, completed);
    return outcome;
  }

  /** Moves an order and publishes the completion once the transaction is committed. */
  async move(order: OrderRow, target: OrderStatus, details: Record<string, unknown>) {
    const result = await this.moveInTransaction(order, target, details);
    if (result.completed) this.events.publish(PurchaseCompleted, result.completed);
    return result.moved;
  }

  @Transactional()
  private async applyInTransaction(
    report: BankStatusReport,
    source: string,
  ): Promise<MoveResult & { outcome: ReportOutcome }> {
    const order = UUID.test(report.orderId) ? await this.orders.findById(report.orderId) : null;
    if (!order) {
      this.logger.warn(`Bank reported ${report.status} for unknown order ${report.orderId}`);
      return { outcome: 'ignored', moved: false };
    }
    if (order.bankPaymentId && order.bankPaymentId !== report.bankPaymentId) {
      this.logger.warn(`Bank payment id mismatch on order ${order.id}`);
      return { outcome: 'ignored', moved: false };
    }

    const fresh = await this.orders.addEvent({
      orderId: order.id,
      type: 'bank_status',
      bankPaymentId: report.bankPaymentId,
      bankStatus: report.status,
      details: { source, amountKopecks: report.amountKopecks },
    });
    if (!fresh) return { outcome: 'duplicate', moved: false };

    const target = statusForBank(report.status);
    if (!target) return { outcome: 'unchanged', moved: false };

    if (target === 'paid' && report.amountKopecks !== order.amountKopecks) {
      this.logger.error(
        `Order ${order.id} confirmed for ${report.amountKopecks}, expected ${order.amountKopecks}`,
      );
      await this.orders.addEvent({
        orderId: order.id,
        type: 'amount_mismatch',
        details: { expected: order.amountKopecks, received: report.amountKopecks },
      });
      return { outcome: 'ignored', moved: false };
    }

    const result = await this.moveInTransaction(order, target, { source });
    return { ...result, outcome: result.moved ? 'applied' : 'unchanged' };
  }

  @Transactional()
  private async moveInTransaction(
    order: OrderRow,
    target: OrderStatus,
    details: Record<string, unknown>,
  ): Promise<MoveResult> {
    const now = new Date();
    const updated = await this.orders.transition(
      order.id,
      target,
      target === 'paid' ? { paidAt: now } : {},
    );
    if (!updated) return { moved: false };

    await this.orders.addEvent({
      orderId: order.id,
      type: 'status_changed',
      fromStatus: order.status,
      toStatus: target,
      details,
    });

    if (target === 'refunded') {
      await this.purchases.revokeByOrder(order.id);
      return { moved: true };
    }
    if (target !== 'paid' || !updated.userId) return { moved: true };

    if (order.status === 'expired') {
      await this.orders.addEvent({ orderId: order.id, type: 'late_confirmation' });
    }
    const granted = await this.purchases.grant(updated.userId, updated.tourId, updated.id);
    if (!granted) {
      this.logger.warn(`Order ${order.id} paid for a tour the user already owns; refund by hand`);
      await this.orders.addEvent({ orderId: order.id, type: 'duplicate_payment' });
    }
    if (updated.promoCodeId) {
      await this.promotions.recordRedemption(updated.promoCodeId, updated.userId, updated.id);
    }
    return {
      moved: true,
      completed: {
        orderId: updated.id,
        userId: updated.userId,
        appId: updated.appId,
        tourId: updated.tourId,
        amountKopecks: updated.amountKopecks,
        currency: 'RUB',
        occurredAt: now,
      },
    };
  }
}
