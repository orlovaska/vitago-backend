import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../platform/config';
import { OnDomainEvent } from '../../platform/events';
import { AppsFacade } from '../apps';
import { PurchaseCompleted, type PurchaseCompletedPayload } from '../payments';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Sends each confirmed purchase to AppMetrica as in-app revenue, so the
 * Monetisation reports (ARPU, LTV) include server-side payments. The app sets
 * its AppMetrica profile id to our user id, which ties the two together.
 *
 * Best effort: a failure is logged and not retried. Revenue reports are
 * analytics, never the source of truth for purchases.
 */
@Injectable()
export class RevenueReporter {
  private readonly logger = new Logger(RevenueReporter.name);

  constructor(
    private readonly config: AppConfig,
    private readonly apps: AppsFacade,
  ) {}

  @OnDomainEvent(PurchaseCompleted)
  async onPurchaseCompleted(purchase: PurchaseCompletedPayload): Promise<void> {
    const app = await this.apps.findById(purchase.appId);
    const credentials = app && this.config.env.APPMETRICA_APPS[app.slug];
    if (!credentials) return;

    const params = new URLSearchParams({
      post_api_key: credentials.postApiKey,
      application_id: credentials.applicationId,
      profile_id: purchase.userId,
      revenue_event_type: 'one_time_purchase',
      event_timestamp: String(Math.floor(purchase.occurredAt.getTime() / 1000)),
      price: (purchase.amountKopecks / 100).toFixed(2),
      currency: purchase.currency,
      product_id: purchase.subjectId,
      transaction_id: purchase.orderId,
      session_type: 'foreground',
    });
    try {
      const response = await fetch(
        `${this.config.env.APPMETRICA_API_URL}/logs/v1/import/revenue?${params.toString()}`,
        { method: 'POST', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
      if (!response.ok) {
        this.logger.warn(
          `AppMetrica refused revenue for order ${purchase.orderId}: ${response.status}`,
        );
      }
    } catch (error) {
      this.logger.warn(`AppMetrica unreachable for order ${purchase.orderId}: ${String(error)}`);
    }
  }
}
