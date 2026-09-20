import { HttpStatus, Injectable } from '@nestjs/common';
import { type AppContext } from '../../../platform/app-context';
import { AppConfig } from '../../../platform/config';
import { AppError } from '../../../platform/http';
import { AppsFacade, type Store } from '../../apps';
import { PromotionsFacade, type PromoQuote } from '../../promotions';
import { SettingsFacade } from '../../settings';
import { ToursFacade } from '../../tours';
import { GatewayError, PaymentGateway } from '../gateway/payment-gateway';
import { type OrderRow, OrdersStore } from '../stores/orders.store';
import { PurchasesStore } from '../stores/purchases.store';
import { WalkUnlocksStore } from '../stores/walk-unlocks.store';
import { OrderProcessor } from './order-processor';

export interface CheckoutRequest {
  userId: string;
  app: AppContext;
  tourId: string;
  /** Store the calling build comes from; only some stores may sell. */
  store: Store;
  promoCode?: string;
  email?: string;
}

/** Everything payments needs to sell the unlock of one generated walk. */
export interface WalkUnlockCheckoutRequest {
  userId: string;
  app: AppContext;
  walkId: string;
  /** Price fixed when the walk was generated; payments never recalculates it. */
  amountKopecks: number;
  /** The locked points this payment opens. */
  pointIds: readonly string[];
  /** What the receipt shows, e.g. a walk of an hour with twelve points. */
  title: string;
  store: Store;
  email?: string;
}

export interface CheckoutResult {
  order: OrderRow;
  /** How often and for how long the app polls the order status; tuned in settings. */
  pollIntervalMs: number;
  pollWindowMs: number;
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly config: AppConfig,
    private readonly orders: OrdersStore,
    private readonly purchases: PurchasesStore,
    private readonly walkUnlocks: WalkUnlocksStore,
    private readonly processor: OrderProcessor,
    private readonly gateway: PaymentGateway,
    private readonly apps: AppsFacade,
    private readonly tours: ToursFacade,
    private readonly promotions: PromotionsFacade,
    private readonly settings: SettingsFacade,
  ) {}

  async checkout(request: CheckoutRequest): Promise<CheckoutResult> {
    const app = await this.sellingApp(request.app.id, request.store, request.email);

    const tour = await this.tours.findForSale(request.tourId);
    if (!tour || !tour.published || tour.appId !== app.id) {
      throw AppError.notFound('tour_not_found', `Tour ${request.tourId} not found`);
    }
    if (tour.priceKopecks === 0) {
      throw AppError.badRequest('tour_is_free', 'Free tours need no purchase');
    }
    if (await this.purchases.hasActive(request.userId, tour.id)) {
      throw AppError.conflict('already_purchased', 'The tour is already purchased');
    }

    // An explicit code wins; otherwise the code the user applied to this tour, if still usable.
    const quote: PromoQuote | null = request.promoCode
      ? await this.promotions.quote({
          userId: request.userId,
          appId: app.id,
          tourId: tour.id,
          code: request.promoCode,
        })
      : await this.promotions.appliedQuote(request.userId, app.id, tour.id);

    const ttlMs = this.config.env.PAYMENT_ORDER_TTL_MINUTES * 60_000;
    let order = await this.orders.insert({
      userId: request.userId,
      appId: app.id,
      tourId: tour.id,
      subjectTitle: tour.title,
      priceKopecks: tour.priceKopecks,
      amountKopecks: quote?.discountedPriceKopecks ?? tour.priceKopecks,
      promoCodeId: quote?.promoCodeId ?? null,
      email: request.email ?? null,
      terminal: app.slug,
      expiresAt: new Date(Date.now() + ttlMs),
    });

    order =
      order.amountKopecks === 0
        ? await this.completeFree(order)
        : await this.startBankPayment(order, app.slug);

    const [pollIntervalMs, pollWindowMs] = await Promise.all([
      this.settings.get('payments.clientPollIntervalMs'),
      this.settings.get('payments.clientPollWindowMs'),
    ]);
    return { order, pollIntervalMs, pollWindowMs };
  }

  /**
   * Starts paying to unlock a generated walk. The walks module has already
   * checked that the walk is the callers own and worked out the price, so
   * nothing here reads a walk: payments must not depend on walks.
   */
  async checkoutWalkUnlock(request: WalkUnlockCheckoutRequest): Promise<CheckoutResult> {
    const app = await this.sellingApp(request.app.id, request.store, request.email);
    if (request.amountKopecks <= 0) {
      throw AppError.badRequest('walk_is_free', 'This walk has nothing locked to pay for');
    }
    if (await this.walkUnlocks.hasActive(request.userId, request.walkId)) {
      throw AppError.conflict('already_purchased', 'The walk is already unlocked');
    }

    const ttlMs = this.config.env.PAYMENT_ORDER_TTL_MINUTES * 60_000;
    // Walk unlocks carry no promo code: discounts belong to tours.
    let order = await this.orders.insert({
      userId: request.userId,
      appId: app.id,
      kind: 'walk_unlock',
      walkId: request.walkId,
      unlockPointIds: [...request.pointIds],
      subjectTitle: request.title,
      priceKopecks: request.amountKopecks,
      amountKopecks: request.amountKopecks,
      email: request.email ?? null,
      terminal: app.slug,
      expiresAt: new Date(Date.now() + ttlMs),
    });
    order = await this.startBankPayment(order, app.slug);

    const [pollIntervalMs, pollWindowMs] = await Promise.all([
      this.settings.get('payments.clientPollIntervalMs'),
      this.settings.get('payments.clientPollWindowMs'),
    ]);
    return { order, pollIntervalMs, pollWindowMs };
  }

  /** A 100 % discount: nothing to charge, the purchase is granted at once. */
  private async completeFree(order: OrderRow): Promise<OrderRow> {
    await this.processor.move(order, 'paid', { source: 'zero_amount' });
    return (await this.orders.findById(order.id))!;
  }

  /** The app, once it is clear it may sell anything at all in this build. */
  private async sellingApp(appId: string, store: Store, email: string | undefined) {
    const app = await this.apps.findById(appId);
    if (!app?.paymentStores.includes(store)) {
      throw AppError.forbidden('payments_disabled', 'Nothing can be bought in this build');
    }
    if (!this.gateway.hasTerminal(app.slug)) {
      throw new AppError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'payments_unavailable',
        'Payments are not configured for this app',
      );
    }
    if (app.receiptEmailRequired && !email) {
      throw AppError.badRequest('email_required', 'An e-mail for the receipt is required');
    }
    return app;
  }

  private async startBankPayment(order: OrderRow, slug: string): Promise<OrderRow> {
    const result = `${this.config.env.PAYMENT_RETURN_BASE_URL}/app/${slug}/payment-result`;
    try {
      const payment = await this.gateway.init({
        terminal: order.terminal,
        orderId: order.id,
        amountKopecks: order.amountKopecks,
        description: order.subjectTitle,
        email: order.email,
        successUrl: `${result}?status=success&orderId=${order.id}`,
        failUrl: `${result}?status=fail&orderId=${order.id}`,
        expiresAt: order.expiresAt,
      });
      const updated = await this.orders.transition(order.id, 'awaiting_payment', {
        bankPaymentId: payment.bankPaymentId,
        paymentUrl: payment.paymentUrl,
      });
      if (updated) {
        await this.orders.addEvent({
          orderId: order.id,
          type: 'status_changed',
          fromStatus: 'created',
          toStatus: 'awaiting_payment',
          bankPaymentId: payment.bankPaymentId,
        });
      }
      // A notification may have moved the order already; report what it is now.
      return (await this.orders.findById(order.id))!;
    } catch (error) {
      if (!(error instanceof GatewayError)) throw error;
      await this.processor.move(order, 'failed', { source: 'init', error: error.message });
      throw new AppError(
        HttpStatus.BAD_GATEWAY,
        'bank_unavailable',
        'The bank did not accept the payment; try again later',
      );
    }
  }
}
