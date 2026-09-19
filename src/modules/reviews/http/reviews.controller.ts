import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { type AppContext, CurrentApp, RequiresApp } from '../../../platform/app-context';
import { APP_TAG, decodeCursor, encodeCursor } from '../../../platform/http';
import { CurrentUserId, UserAuth } from '../../auth';
import { ReviewsService } from '../reviews.service';
import {
  OwnReviewDto,
  PageQueryDto,
  RatingListDto,
  SaveReviewDto,
  TourIdParamDto,
  TourReviewsDto,
  toOwnReview,
  toPublicReview,
} from './reviews.dto';

@ApiTags(APP_TAG)
@RequiresApp()
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Average rating of every published tour of the app, for the tour list. */
  @Get('reviews/ratings')
  @ZodResponse({ status: 200, type: RatingListDto })
  async ratings(@CurrentApp() app: AppContext) {
    return { items: await this.reviews.ratingsForApp(app.id) };
  }

  /** Approved reviews of a tour, newest first, with its rating. */
  @Get('tours/:tourId/reviews')
  @ZodResponse({ status: 200, type: TourReviewsDto })
  async list(
    @CurrentApp() app: AppContext,
    @Param() { tourId }: TourIdParamDto,
    @Query() query: PageQueryDto,
  ) {
    const page = await this.reviews.publishedPage(
      app.id,
      tourId,
      query.limit,
      decodeCursor(query.cursor),
    );
    return {
      rating: page.rating,
      items: page.items.map(toPublicReview),
      nextCursor: page.next && encodeCursor(page.next),
    };
  }

  /** The signed-in user's review of the tour, whatever its moderation status. */
  @Get('tours/:tourId/reviews/mine')
  @UserAuth()
  @ZodResponse({ status: 200, type: OwnReviewDto })
  async own(
    @CurrentApp() app: AppContext,
    @CurrentUserId() userId: string,
    @Param() { tourId }: TourIdParamDto,
  ) {
    const review = await this.reviews.own(userId, app.id, tourId);
    return { review: review && toOwnReview(review) };
  }

  /** Creates or replaces the user's review; it is shown after moderation. */
  @Put('tours/:tourId/reviews/mine')
  @UserAuth()
  @ZodResponse({ status: 200, type: OwnReviewDto })
  async save(
    @CurrentApp() app: AppContext,
    @CurrentUserId() userId: string,
    @Param() { tourId }: TourIdParamDto,
    @Body() body: SaveReviewDto,
  ) {
    return { review: toOwnReview(await this.reviews.saveOwn(userId, app.id, tourId, body)) };
  }

  @Delete('tours/:tourId/reviews/mine')
  @UserAuth()
  @HttpCode(204)
  async remove(
    @CurrentUserId() userId: string,
    @Param() { tourId }: TourIdParamDto,
  ): Promise<void> {
    await this.reviews.deleteOwn(userId, tourId);
  }
}
