import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ADMIN_TAG, decodeCursor, encodeCursor, IdParamDto } from '../../../platform/http';
import { AdminAuth, CurrentAdminId } from '../../auth';
import { ReviewsService } from '../reviews.service';
import {
  ModerationPageDto,
  ModerationQueryDto,
  ModerationReviewDto,
  toModerationReview,
} from './reviews.dto';

@ApiTags(ADMIN_TAG)
@AdminAuth()
@Controller('admin/reviews')
export class ReviewsAdminController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Reviews to moderate; filter by status, e.g. `pending`. */
  @Get()
  @ZodResponse({ status: 200, type: ModerationPageDto })
  async list(@Query() query: ModerationQueryDto) {
    const page = await this.reviews.moderationPage(
      query.status,
      query.limit,
      decodeCursor(query.cursor),
    );
    return {
      items: page.items.map(toModerationReview),
      nextCursor: page.next && encodeCursor(page.next),
    };
  }

  @Post(':id/approve')
  @ZodResponse({ status: 200, type: ModerationReviewDto })
  async approve(@Param() { id }: IdParamDto, @CurrentAdminId() adminId: string) {
    return toModerationReview(await this.reviews.moderate(id, 'approved', adminId));
  }

  @Post(':id/reject')
  @ZodResponse({ status: 200, type: ModerationReviewDto })
  async reject(@Param() { id }: IdParamDto, @CurrentAdminId() adminId: string) {
    return toModerationReview(await this.reviews.moderate(id, 'rejected', adminId));
  }
}
