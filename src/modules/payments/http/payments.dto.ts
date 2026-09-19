import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { pageQuery } from '../../../platform/http';
import { type OrderStatus } from '../order-state';
import { orderStatus } from '../payments.tables';
import { type OrderEventRow, type OrderRow } from '../stores/orders.store';
import { type PurchaseRow } from '../stores/purchases.store';

const storeSchema = z.enum(['app_store', 'google_play', 'rustore']);

/** What the app needs to know: still waiting, or a final outcome. */
const clientStatusSchema = z.enum(['pending', 'paid', 'failed', 'expired', 'refunded']);
export const clientStatus = (status: OrderStatus): z.infer<typeof clientStatusSchema> =>
  status === 'created' || status === 'awaiting_payment' ? 'pending' : status;

export class CheckoutRequestDto extends createZodDto(
  z.object({
    tourId: z.uuid(),
    /** Store of the calling build; only stores enabled for the app may sell. */
    store: storeSchema,
    promoCode: z.string().trim().min(1).max(40).optional(),
    /** Receipt e-mail; required when the app asks for it. */
    email: z.email().max(200).optional(),
  }),
) {}

export class CheckoutDto extends createZodDto(
  z.object({
    orderId: z.uuid(),
    status: clientStatusSchema,
    /** Open in the browser; null when nothing is left to pay (100 % promo code). */
    paymentUrl: z.string().nullable(),
    amountKopecks: z.number().int(),
    /** Pause between status requests; 0 means ask once. */
    pollIntervalMs: z.number().int(),
    /** Stop polling after this long and show "payment is being processed". */
    pollWindowMs: z.number().int(),
  }),
) {}

export class OrderStatusDto extends createZodDto(
  z.object({ orderId: z.uuid(), status: clientStatusSchema, retryAfterMs: z.number().int() }),
) {}

export class TourIdParamDto extends createZodDto(z.object({ tourId: z.uuid() })) {}

export class TourAccessDto extends createZodDto(
  z.object({
    tourId: z.uuid(),
    accessible: z.boolean(),
    purchased: z.boolean(),
    priceKopecks: z.number().int(),
    /** The price this user pays now, with their applied promo code. */
    discountedPriceKopecks: z.number().int(),
    appliedPromoCode: z.object({ code: z.string(), discountPercent: z.number().int() }).nullable(),
    shareCode: z.object({ code: z.string(), discountPercent: z.number().int() }).nullable(),
  }),
) {}

export class PurchaseListDto extends createZodDto(
  z.object({
    items: z.array(z.object({ tourId: z.uuid(), grantedAt: z.iso.datetime() })),
  }),
) {}

// ---- Admin ----

const adminOrderSchema = z.object({
  id: z.uuid(),
  userId: z.uuid().nullable(),
  appId: z.uuid(),
  tourId: z.uuid(),
  tourTitle: z.string(),
  priceKopecks: z.number().int(),
  amountKopecks: z.number().int(),
  promoCodeId: z.uuid().nullable(),
  email: z.string().nullable(),
  status: z.enum(orderStatus.enumValues),
  bankPaymentId: z.string().nullable(),
  bankChecks: z.number().int(),
  expiresAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export class AdminOrderPageDto extends createZodDto(
  z.object({ items: z.array(adminOrderSchema), nextCursor: z.string().nullable() }),
) {}

export class AdminOrderDto extends createZodDto(
  z.object({
    order: adminOrderSchema,
    events: z.array(
      z.object({
        type: z.string(),
        fromStatus: z.string().nullable(),
        toStatus: z.string().nullable(),
        bankStatus: z.string().nullable(),
        details: z.record(z.string(), z.unknown()).nullable(),
        createdAt: z.iso.datetime(),
      }),
    ),
  }),
) {}

export class AdminOrdersQueryDto extends createZodDto(
  z.object({
    ...pageQuery,
    status: z.enum(orderStatus.enumValues).optional(),
    userId: z.uuid().optional(),
    tourId: z.uuid().optional(),
  }),
) {}

const adminPurchaseSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  tourId: z.uuid(),
  orderId: z.uuid().nullable(),
  grantedAt: z.iso.datetime(),
});

export class AdminPurchaseDto extends createZodDto(adminPurchaseSchema) {}
export class AdminPurchaseListDto extends createZodDto(
  z.object({ items: z.array(adminPurchaseSchema) }),
) {}
export class GrantPurchaseDto extends createZodDto(
  z.object({ userId: z.uuid(), tourId: z.uuid() }),
) {}

export const toAdminOrder = (order: OrderRow) => ({
  id: order.id,
  userId: order.userId,
  appId: order.appId,
  tourId: order.tourId,
  tourTitle: order.tourTitle,
  priceKopecks: order.priceKopecks,
  amountKopecks: order.amountKopecks,
  promoCodeId: order.promoCodeId,
  email: order.email,
  status: order.status,
  bankPaymentId: order.bankPaymentId,
  bankChecks: order.bankChecks,
  expiresAt: order.expiresAt.toISOString(),
  paidAt: order.paidAt?.toISOString() ?? null,
  createdAt: order.createdAt.toISOString(),
});

export const toAdminEvent = (event: OrderEventRow) => ({
  type: event.type,
  fromStatus: event.fromStatus,
  toStatus: event.toStatus,
  bankStatus: event.bankStatus,
  details: event.details,
  createdAt: event.createdAt.toISOString(),
});

export const toAdminPurchase = (purchase: PurchaseRow) => ({
  id: purchase.id,
  userId: purchase.userId,
  tourId: purchase.tourId,
  orderId: purchase.orderId,
  grantedAt: purchase.grantedAt.toISOString(),
});
