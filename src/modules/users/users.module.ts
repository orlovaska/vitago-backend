import { Module } from '@nestjs/common';
import { AppsModule } from '../apps';
import { AuthModule } from '../auth';
import { FavoritesModule } from '../favorites';
import { LegalModule } from '../legal';
import { PaymentsModule } from '../payments';
import { PromotionsModule } from '../promotions';
import { ReviewsModule } from '../reviews';
import { AccountDeletionService } from './account-deletion.service';
import { UsersController } from './http/users.controller';

/**
 * The user as a whole. There is no profile (no name or avatar; the language
 * comes with each request), so the module owns no tables: it orchestrates
 * account deletion across the modules that hold user data.
 */
@Module({
  imports: [
    AuthModule,
    AppsModule,
    FavoritesModule,
    LegalModule,
    PaymentsModule,
    PromotionsModule,
    ReviewsModule,
  ],
  controllers: [UsersController],
  providers: [AccountDeletionService],
  exports: [AccountDeletionService],
})
export class UsersModule {}
