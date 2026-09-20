import { z } from 'zod';
import { patchSchema, createZodDto } from '../../../platform/http';
import { type PromoCodeRow } from '../promotions.store';

export class QuoteRequestDto extends createZodDto(
  z.object({ tourId: z.uuid(), code: z.string().trim().min(1).max(40) }),
) {}

export class QuoteDto extends createZodDto(
  z.object({
    code: z.string(),
    discountPercent: z.number().int(),
    priceKopecks: z.number().int(),
    discountedPriceKopecks: z.number().int(),
  }),
) {}

export class ClaimRequestDto extends createZodDto(z.object({ token: z.uuid() })) {}

export class ClaimDto extends createZodDto(
  z.object({ code: z.string(), discountPercent: z.number().int(), tourId: z.uuid() }),
) {}

// ---- Admin ----

const promoCodeFields = z.object({
  tourId: z.uuid(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,40}$/, 'Latin letters, digits, dashes and underscores'),
  discountPercent: z.number().int().min(1).max(100),
  active: z.boolean().default(true),
  restricted: z.boolean().default(false),
  shareAfterPurchase: z.boolean().default(false),
  maxRedemptions: z.number().int().min(1).nullable().default(null),
  expiresAt: z.iso.datetime().nullable().default(null),
});

export class CreatePromoCodeDto extends createZodDto(promoCodeFields) {}
export class UpdatePromoCodeDto extends createZodDto(
  patchSchema(promoCodeFields.omit({ tourId: true })),
) {}
export class ListPromoCodesQueryDto extends createZodDto(
  z.object({ tourId: z.uuid().optional() }),
) {}

const promoCodeSchema = promoCodeFields.extend({
  id: z.uuid(),
  /** Put into the invitation link the app opens; see POST /v1/promo-codes/claim. */
  linkToken: z.uuid(),
  createdAt: z.iso.datetime(),
});

export class PromoCodeDto extends createZodDto(promoCodeSchema) {}
export class PromoCodeListDto extends createZodDto(z.object({ items: z.array(promoCodeSchema) })) {}

export const toPromoCode = (promo: PromoCodeRow) => ({
  id: promo.id,
  tourId: promo.tourId,
  code: promo.code,
  discountPercent: promo.discountPercent,
  active: promo.active,
  restricted: promo.restricted,
  shareAfterPurchase: promo.shareAfterPurchase,
  maxRedemptions: promo.maxRedemptions,
  expiresAt: promo.expiresAt?.toISOString() ?? null,
  linkToken: promo.linkToken,
  createdAt: promo.createdAt.toISOString(),
});

/** Converts the ISO date of a request into the column value. */
export function withDate<T extends { expiresAt?: string | null }>(body: T) {
  const { expiresAt, ...rest } = body;
  return {
    ...rest,
    ...(expiresAt !== undefined && { expiresAt: expiresAt === null ? null : new Date(expiresAt) }),
  };
}
