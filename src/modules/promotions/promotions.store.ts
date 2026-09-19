import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../platform/database';
import { promoCodeAllowedUsers, promoCodeRedemptions, promoCodes } from './promotions.tables';

export type PromoCodeRow = typeof promoCodes.$inferSelect;
export type PromoCodeFields = Omit<
  typeof promoCodes.$inferInsert,
  'id' | 'createdAt' | 'linkToken'
>;

@Injectable()
export class PromotionsStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  async findById(id: string): Promise<PromoCodeRow | null> {
    const [row] = await this.db.select().from(promoCodes).where(eq(promoCodes.id, id));
    return row ?? null;
  }

  async findByCode(code: string): Promise<PromoCodeRow | null> {
    const [row] = await this.db.select().from(promoCodes).where(eq(promoCodes.code, code));
    return row ?? null;
  }

  async findByLinkToken(token: string): Promise<PromoCodeRow | null> {
    const [row] = await this.db.select().from(promoCodes).where(eq(promoCodes.linkToken, token));
    return row ?? null;
  }

  list(tourId?: string): Promise<PromoCodeRow[]> {
    return this.db
      .select()
      .from(promoCodes)
      .where(tourId ? eq(promoCodes.tourId, tourId) : undefined)
      .orderBy(desc(promoCodes.createdAt));
  }

  async insert(fields: PromoCodeFields): Promise<PromoCodeRow> {
    const [row] = await this.db.insert(promoCodes).values(fields).returning();
    return row!;
  }

  async update(
    id: string,
    fields: Partial<PromoCodeFields> & { linkToken?: string },
  ): Promise<PromoCodeRow | null> {
    const [row] = await this.db
      .update(promoCodes)
      .set(fields)
      .where(eq(promoCodes.id, id))
      .returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(promoCodes)
      .where(eq(promoCodes.id, id))
      .returning({ id: promoCodes.id });
    return rows.length > 0;
  }

  async redemptionCount(promoCodeId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(promoCodeRedemptions)
      .where(eq(promoCodeRedemptions.promoCodeId, promoCodeId));
    return row?.total ?? 0;
  }

  async hasRedeemed(promoCodeId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: promoCodeRedemptions.id })
      .from(promoCodeRedemptions)
      .where(
        and(
          eq(promoCodeRedemptions.promoCodeId, promoCodeId),
          eq(promoCodeRedemptions.userId, userId),
        ),
      );
    return !!row;
  }

  /** Idempotent per order: a repeated confirmation of the same order records nothing new. */
  async recordRedemption(promoCodeId: string, userId: string, orderId: string): Promise<void> {
    await this.db
      .insert(promoCodeRedemptions)
      .values({ promoCodeId, userId, orderId })
      .onConflictDoNothing();
  }

  async isAllowed(promoCodeId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ userId: promoCodeAllowedUsers.userId })
      .from(promoCodeAllowedUsers)
      .where(
        and(
          eq(promoCodeAllowedUsers.promoCodeId, promoCodeId),
          eq(promoCodeAllowedUsers.userId, userId),
        ),
      );
    return !!row;
  }

  async allow(promoCodeId: string, userId: string): Promise<void> {
    await this.db
      .insert(promoCodeAllowedUsers)
      .values({ promoCodeId, userId })
      .onConflictDoNothing();
  }

  async shareableForTour(tourId: string, now: Date): Promise<PromoCodeRow | null> {
    const [row] = await this.db
      .select()
      .from(promoCodes)
      .where(
        and(
          eq(promoCodes.tourId, tourId),
          eq(promoCodes.active, true),
          eq(promoCodes.shareAfterPurchase, true),
          or(isNull(promoCodes.expiresAt), gt(promoCodes.expiresAt, now)),
        ),
      )
      .orderBy(desc(promoCodes.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** Account deletion: redemptions stay for usage limits, anonymised; invitations go. */
  async forgetUser(userId: string): Promise<void> {
    await this.db
      .update(promoCodeRedemptions)
      .set({ userId: null })
      .where(eq(promoCodeRedemptions.userId, userId));
    await this.db.delete(promoCodeAllowedUsers).where(eq(promoCodeAllowedUsers.userId, userId));
  }
}
