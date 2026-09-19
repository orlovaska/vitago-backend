import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ToursModule } from '../tours';
import { PromotionsAdminController } from './http/promotions-admin.controller';
import { PromotionsController } from './http/promotions.controller';
import { PromotionsFacade } from './promotions.facade';
import { PromotionsService } from './promotions.service';
import { PromotionsStore } from './promotions.store';

/** Discounts. Today only promo codes; other kinds of promotion would live here too. */
@Module({
  imports: [AuthModule, ToursModule],
  controllers: [PromotionsController, PromotionsAdminController],
  providers: [PromotionsStore, PromotionsService, PromotionsFacade],
  exports: [PromotionsFacade],
})
export class PromotionsModule {}
