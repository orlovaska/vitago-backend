import { Controller, Get, HttpStatus, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { type Response } from 'express';
import { AppDirectory, type AppLinkTarget } from '../../../platform/app-context';
import { AppConfig } from '../../../platform/config';
import { AppError } from '../../../platform/http';
import { AppStoreLinks } from '../services/app-store-links';
import { type TourContent, TourReader } from '../services/tour-reader.service';
import { renderTourSharePage, type SharedTour } from './tour-share.page';

/** City part of the path: an app slug, never anything longer or stranger. */
const CITY = /^[a-z0-9-]{1,64}$/;
/** Tours change rarely, and a preview a few minutes old is fine. */
const CACHE = 'public, max-age=300';

/**
 * Page of a shared tour link. nginx sends vitagoguides.ru/app/<city>/tours/<tour>
 * here (deploy/nginx/snippets/site.conf); the page itself is described in
 * tour-share.page.ts. It is HTML for browsers and link previews, not part of
 * the app contract, so it stays out of the OpenAPI document.
 */
@ApiExcludeController()
@Controller('share')
export class TourShareController {
  constructor(
    private readonly apps: AppDirectory,
    private readonly reader: TourReader,
    private readonly appStore: AppStoreLinks,
    private readonly config: AppConfig,
  ) {}

  @Get(':city/tours/:tour')
  async tour(
    @Param('city') city: string,
    @Param('tour') tourRef: string,
    @Res() res: Response,
  ): Promise<void> {
    const app = CITY.test(city) ? await this.apps.findBySlug(city) : null;
    const tour = app ? await this.published(app, tourRef) : null;

    const html = renderTourSharePage({
      pageUrl: this.pageUrl(city, tour?.slug ?? tourRef),
      tour: tour && this.shared(tour),
      app: app && {
        name: app.name,
        bundleId: app.bundleId,
        urlScheme: app.urlScheme,
        appStoreUrl: await this.appStore.urlFor(app.bundleId),
      },
    });

    res
      .status(tour ? HttpStatus.OK : HttpStatus.NOT_FOUND)
      .type('html')
      .set('Cache-Control', CACHE)
      .send(html);
  }

  /** The tour, or null when the app has no such published tour. */
  private async published(app: AppLinkTarget, tourRef: string): Promise<TourContent | null> {
    try {
      return await this.reader.published(app.id, tourRef, 'ru');
    } catch (error) {
      if (error instanceof AppError && error.code === 'tour_not_found') return null;
      throw error;
    }
  }

  private shared(tour: TourContent): SharedTour {
    const image = tour.coverImageUrl ?? tour.imageUrls[0] ?? null;
    return {
      slug: tour.slug,
      title: tour.title,
      subtitle: tour.subtitle,
      summary: tour.summary,
      description: tour.description,
      // Previews are fetched by other sites, so the image needs the API's own origin
      imageUrl: image && `${this.origin(this.config.env.PUBLIC_API_URL)}${image}`,
    };
  }

  private pageUrl(city: string, tourSlug: string): string {
    const site = this.origin(this.config.env.PUBLIC_SITE_URL);
    return `${site}/app/${encodeURIComponent(city)}/tours/${encodeURIComponent(tourSlug)}`;
  }

  private origin(url: string): string {
    return url.replace(/\/+$/, '');
  }
}
