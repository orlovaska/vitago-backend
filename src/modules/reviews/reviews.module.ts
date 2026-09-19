import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ToursModule } from '../tours';
import { ReviewsAdminController } from './http/reviews-admin.controller';
import { ReviewsController } from './http/reviews.controller';
import { ReviewsFacade } from './reviews.facade';
import { ReviewsService } from './reviews.service';
import { ReviewsStore } from './reviews.store';

/** Tour reviews and their moderation. */
@Module({
  imports: [AuthModule, ToursModule],
  controllers: [ReviewsController, ReviewsAdminController],
  providers: [ReviewsStore, ReviewsService, ReviewsFacade],
  exports: [ReviewsFacade],
})
export class ReviewsModule {}
