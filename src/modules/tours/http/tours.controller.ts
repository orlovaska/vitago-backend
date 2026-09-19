import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { type AppContext, CurrentApp, RequiresApp } from '../../../platform/app-context';
import { APP_TAG } from '../../../platform/http';
import { type Locale, RequestLocale } from '../../../platform/i18n';
import { mediaUrl } from '../../media';
import { CategoriesService } from '../services/categories.service';
import { TourReader } from '../services/tour-reader.service';
import { CategoryListDto, TourCardListDto, TourContentDto, TourRefParamDto } from './tours.dto';

/**
 * Tour content is the same for everyone, so these routes need no sign-in and
 * answer with an ETag: an unchanged tour costs the app a 304, not a download.
 */
@ApiTags(APP_TAG)
@RequiresApp()
@Controller()
export class ToursController {
  constructor(
    private readonly reader: TourReader,
    private readonly categories: CategoriesService,
  ) {}

  /** Published tours of the calling app, in display order. */
  @Get('tours')
  @ZodResponse({ status: 200, type: TourCardListDto })
  async list(@CurrentApp() app: AppContext, @RequestLocale() locale: Locale) {
    return { items: await this.reader.listForApp(app.id, locale) };
  }

  /** Full tour: points, narration, subtitles and map. Accepts the id or the slug. */
  @Get('tours/:idOrSlug')
  @ZodResponse({ status: 200, type: TourContentDto })
  get(
    @CurrentApp() app: AppContext,
    @Param() { idOrSlug }: TourRefParamDto,
    @RequestLocale() locale: Locale,
  ) {
    return this.reader.published(app.id, idOrSlug, locale);
  }

  /** Point categories for map filters. */
  @Get('categories')
  @ZodResponse({ status: 200, type: CategoryListDto })
  async listCategories(@RequestLocale() locale: Locale) {
    const categories = await this.categories.localized(locale);
    return {
      items: categories.map(({ iconImageId, ...category }) => ({
        ...category,
        iconImageUrl: iconImageId ? mediaUrl(iconImageId) : null,
      })),
    };
  }
}
