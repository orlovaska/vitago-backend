import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { type AppContext, CurrentApp, RequiresApp } from '../../../platform/app-context';
import { APP_TAG, IdParamDto } from '../../../platform/http';
import { type Locale, RequestLocale } from '../../../platform/i18n';
import { CurrentUserId, UserAuth } from '../../auth';
import { WalksService } from '../services/walks.service';
import {
  GenerateWalkDto,
  UnlockWalkDto,
  WalkCheckoutDto,
  WalkDto,
  WalkListDto,
  WalkPointParamDto,
} from './walks.dto';

/**
 * Walks the user builds from the points of the app. A generated walk is kept
 * at once, so it survives a restart and can be paid for, but it disappears by
 * itself unless the user saves it.
 */
@ApiTags(APP_TAG)
@RequiresApp()
@UserAuth()
@Controller('walks')
export class WalksController {
  constructor(private readonly walks: WalksService) {}

  /** Builds a walk from the requested time, ends and categories, and keeps it. */
  @Post('generate')
  @ZodResponse({ status: 201, type: WalkDto })
  generate(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @RequestLocale() locale: Locale,
    @Body() body: GenerateWalkDto,
  ) {
    return this.walks.generate(userId, app, locale, {
      durationMinutes: body.durationMinutes,
      start: body.start,
      endMode: body.endMode,
      end: body.end ?? null,
      categories: body.categories,
      area: body.area ?? null,
    });
  }

  /** The walks the user keeps, newest first. Unsaved ones are not listed. */
  @Get()
  @ZodResponse({ status: 200, type: WalkListDto })
  async list(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @RequestLocale() locale: Locale,
  ) {
    return { items: await this.walks.list(userId, app.id, locale) };
  }

  /** One walk, saved or not: this is how the app reopens the current one. */
  @Get(':id')
  @ZodResponse({ status: 200, type: WalkDto })
  get(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @RequestLocale() locale: Locale,
    @Param() { id }: IdParamDto,
  ) {
    return this.walks.read(userId, app.id, locale, id);
  }

  /** Keeps the walk for good. Saving twice is the same as saving once. */
  @Post(':id/save')
  @ZodResponse({ status: 200, type: WalkDto })
  save(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @RequestLocale() locale: Locale,
    @Param() { id }: IdParamDto,
  ) {
    return this.walks.save(userId, app.id, locale, id);
  }

  /**
   * Drops one point from the walk and answers with the rebuilt walk: the
   * route, the time and the price all follow what is left.
   */
  @Delete(':id/points/:pointId')
  @ZodResponse({ status: 200, type: WalkDto })
  removePoint(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @RequestLocale() locale: Locale,
    @Param() { id, pointId }: WalkPointParamDto,
  ) {
    return this.walks.removePoint(userId, app.id, locale, id, pointId);
  }

  /**
   * Starts paying to open the locked points of the walk. Open `paymentUrl`,
   * then poll the order: access is granted only when the bank confirms.
   */
  @Post(':id/unlock')
  @ZodResponse({ status: 201, type: WalkCheckoutDto })
  unlock(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @RequestLocale() locale: Locale,
    @Param() { id }: IdParamDto,
    @Body() body: UnlockWalkDto,
  ) {
    return this.walks.startUnlock(userId, app, locale, id, body);
  }

  /** Forgets the walk. Points already paid for stay open in other walks. */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @Param() { id }: IdParamDto,
  ): Promise<void> {
    await this.walks.remove(userId, app.id, id);
  }
}
