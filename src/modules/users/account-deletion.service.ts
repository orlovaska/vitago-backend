import { Transactional } from '@nestjs-cls/transactional';
import { Injectable, Logger } from '@nestjs/common';
import { AppsFacade } from '../apps';
import { AuthFacade } from '../auth';
import { FavoritesFacade } from '../favorites';
import { LegalFacade } from '../legal';
import { PaymentsFacade } from '../payments';
import { PromotionsFacade } from '../promotions';
import { ReviewsFacade } from '../reviews';
import { WalksFacade } from '../walks';

/**
 * Deletes an account for good (no soft delete). Every module holding user
 * data has one idempotent step here; a new module with user data must add
 * its step. Orders survive for accounting, stripped of personal data.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly payments: PaymentsFacade,
    private readonly promotions: PromotionsFacade,
    private readonly legal: LegalFacade,
    private readonly reviews: ReviewsFacade,
    private readonly favorites: FavoritesFacade,
    private readonly apps: AppsFacade,
    private readonly walks: WalksFacade,
    private readonly auth: AuthFacade,
  ) {}

  /** All steps run in one transaction: the account is either gone entirely or untouched. */
  @Transactional()
  async deleteAccount(userId: string): Promise<void> {
    await this.payments.deleteUserData(userId);
    await this.promotions.deleteUserData(userId);
    await this.legal.deleteUserData(userId);
    await this.reviews.deleteUserData(userId);
    await this.favorites.deleteUserData(userId);
    await this.apps.deleteUserData(userId);
    await this.walks.deleteUserData(userId);
    // Last: the identity goes once nothing else refers to the user.
    await this.auth.deleteUser(userId);
    this.logger.log(`Deleted account ${userId}`);
  }
}
