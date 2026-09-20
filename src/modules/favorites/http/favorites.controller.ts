import { Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { type AppContext, CurrentApp, RequiresApp } from '../../../platform/app-context';
import { APP_TAG, createZodDto, IdParamDto } from '../../../platform/http';
import { type Locale, RequestLocale } from '../../../platform/i18n';
import { CurrentUserId, UserAuth } from '../../auth';
import { FavoritesService } from '../favorites.service';

class FavoritesDto extends createZodDto(
  z.object({
    /** Newest first. */
    tours: z.array(
      z.object({
        id: z.uuid(),
        slug: z.string(),
        title: z.string(),
        subtitle: z.string().nullable(),
        summary: z.string().nullable(),
        coverImageUrl: z.string().nullable(),
        priceKopecks: z.number().int(),
        distanceMeters: z.number().int().nullable(),
        durationMinutes: z.number().int().nullable(),
        pointCount: z.number().int(),
      }),
    ),
    points: z.array(
      z.object({
        id: z.uuid(),
        tourId: z.uuid(),
        name: z.string(),
        imageUrl: z.string().nullable(),
      }),
    ),
  }),
) {}

/** Adding is idempotent (PUT), so a retried request never fails. */
@ApiTags(APP_TAG)
@RequiresApp()
@UserAuth()
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ZodResponse({ status: 200, type: FavoritesDto })
  list(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @RequestLocale() locale: Locale,
  ) {
    return this.favorites.list(userId, app.id, locale);
  }

  @Put('tours/:id')
  @HttpCode(204)
  async addTour(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @Param() { id }: IdParamDto,
  ): Promise<void> {
    await this.favorites.addTour(userId, app.id, id);
  }

  @Delete('tours/:id')
  @HttpCode(204)
  async removeTour(@CurrentUserId() userId: string, @Param() { id }: IdParamDto): Promise<void> {
    await this.favorites.removeTour(userId, id);
  }

  @Put('points/:id')
  @HttpCode(204)
  async addPoint(
    @CurrentUserId() userId: string,
    @CurrentApp() app: AppContext,
    @Param() { id }: IdParamDto,
  ): Promise<void> {
    await this.favorites.addPoint(userId, app.id, id);
  }

  @Delete('points/:id')
  @HttpCode(204)
  async removePoint(@CurrentUserId() userId: string, @Param() { id }: IdParamDto): Promise<void> {
    await this.favorites.removePoint(userId, id);
  }
}
