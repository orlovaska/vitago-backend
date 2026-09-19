import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { type AppContext, CurrentApp, RequiresApp } from '../../../platform/app-context';
import { APP_TAG } from '../../../platform/http';
import { CurrentUserId, UserAuth } from '../../auth';
import { PromotionsService } from '../promotions.service';
import { ClaimDto, ClaimRequestDto, QuoteDto, QuoteRequestDto } from './promotions.dto';

@ApiTags(APP_TAG)
@RequiresApp()
@UserAuth()
@Controller('promo-codes')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  /**
   * Checks a code for a tour and returns the price with the discount. Errors
   * carry `promo_code_<reason>` codes the app turns into messages.
   */
  @Post('quote')
  @ZodResponse({ status: 200, type: QuoteDto })
  async quote(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @Body() body: QuoteRequestDto,
  ) {
    const { promoCodeId: _id, ...quote } = await this.promotions.quote({
      userId,
      appId: app.id,
      tourId: body.tourId,
      code: body.code,
    });
    return quote;
  }

  /**
   * Applies a code to a tour for this user: from now on the tour's price for
   * them includes the discount and checkout uses the code by itself.
   */
  @Post('apply')
  @ZodResponse({ status: 200, type: QuoteDto })
  async apply(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @Body() body: QuoteRequestDto,
  ) {
    const { promoCodeId: _id, ...quote } = await this.promotions.apply({
      userId,
      appId: app.id,
      tourId: body.tourId,
      code: body.code,
    });
    return quote;
  }

  /**
   * Accepts an invitation link: unlocks a restricted code for this user and
   * applies it to its tour.
   */
  @Post('claim')
  @ZodResponse({ status: 200, type: ClaimDto })
  async claim(@CurrentUserId() userId: string, @Body() body: ClaimRequestDto) {
    const promo = await this.promotions.claim(userId, body.token);
    return { code: promo.code, discountPercent: promo.discountPercent, tourId: promo.tourId };
  }
}
