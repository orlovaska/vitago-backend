import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppError } from '../../../platform/http';
import { SettingsFacade } from '../../settings';
import { GatewayError, PaymentGateway } from '../gateway/payment-gateway';
import { OPEN_STATUSES } from '../order-state';
import { type OrderRow, OrdersStore } from '../stores/orders.store';
import { OrderProcessor } from './order-processor';

export interface OrderStatusView {
  order: OrderRow;
  /** When the app should ask again; from settings, never hard-coded in the app. */
  retryAfterMs: number;
}

/**
 * Answers the app's status polls. The bank notification is the primary path;
 * while none has arrived, the server itself asks the bank (GetState), within
 * the per-order limits from settings, so a late or lost notification does not
 * leave a paid user waiting.
 */
@Injectable()
export class OrderStatusService {
  private readonly logger = new Logger(OrderStatusService.name);

  constructor(
    private readonly orders: OrdersStore,
    private readonly processor: OrderProcessor,
    private readonly gateway: PaymentGateway,
    private readonly settings: SettingsFacade,
  ) {}

  async status(userId: string, orderId: string): Promise<OrderStatusView> {
    let order = await this.orders.findById(orderId);
    if (!order || order.userId !== userId) {
      throw AppError.notFound('order_not_found', `Order ${orderId} not found`);
    }
    if (OPEN_STATUSES.includes(order.status)) {
      order = (await this.checkWithBank(order)) ?? order;
    }
    return { order, retryAfterMs: await this.settings.get('payments.clientPollIntervalMs') };
  }

  private async checkWithBank(order: OrderRow): Promise<OrderRow | null> {
    const [intervalMs, maxAttempts, maxAgeMs] = await Promise.all([
      this.settings.get('payments.bankCheckIntervalMs'),
      this.settings.get('payments.bankCheckMaxAttempts'),
      this.settings.get('payments.bankCheckMaxAgeMs'),
    ]);
    const claimed = await this.orders.claimBankCheck(order.id, {
      now: new Date(),
      intervalMs,
      maxAttempts,
      maxAgeMs,
    });
    if (!claimed?.bankPaymentId) return null;
    try {
      const report = await this.gateway.getState(claimed.terminal, claimed.bankPaymentId);
      await this.processor.applyBankReport({ ...report, orderId: order.id }, 'status_check');
    } catch (error) {
      // The notification may still arrive; the app simply keeps waiting.
      if (!(error instanceof GatewayError)) throw error;
      this.logger.warn(`Status check of order ${order.id} failed: ${error.message}`);
      return null;
    }
    return this.orders.findById(order.id);
  }

  /** Unpaid orders whose payment link ran out become expired. */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireOverdue(): Promise<void> {
    const expired = await this.orders.expireDue(new Date());
    for (const order of expired) {
      await this.orders.addEvent({
        orderId: order.id,
        type: 'status_changed',
        toStatus: 'expired',
        details: { source: 'expiry' },
      });
    }
    if (expired.length > 0) this.logger.log(`Expired ${expired.length} unpaid orders`);
  }
}
