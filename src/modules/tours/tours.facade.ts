import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, pickTranslation } from '../../platform/i18n';
import { MediaFacade } from '../media';
import { type TourCard, TourReader } from './services/tour-reader.service';
import { PointsStore } from './stores/points.store';
import { ToursStore } from './stores/tours.store';

/** The facts payments needs to sell a tour, frozen into the order. */
export interface TourForSale {
  id: string;
  appId: string;
  slug: string;
  /** Title in the default language, for the bank receipt and the order record. */
  title: string;
  priceKopecks: number;
  published: boolean;
}

export interface PointSummary {
  id: string;
  tourId: string;
  appId: string;
  name: string;
  imageUrl: string | null;
}

/** What other modules may ask of `tours`. */
@Injectable()
export class ToursFacade {
  constructor(
    private readonly tours: ToursStore,
    private readonly points: PointsStore,
    private readonly reader: TourReader,
    private readonly media: MediaFacade,
  ) {}

  async findForSale(tourId: string): Promise<TourForSale | null> {
    const tour = await this.tours.findById(tourId);
    if (!tour) return null;
    const translations = await this.tours.translations([tour.id]);
    return {
      id: tour.id,
      appId: tour.appId,
      slug: tour.slug,
      title: pickTranslation(translations, DEFAULT_LOCALE)?.title ?? tour.slug,
      priceKopecks: tour.priceKopecks,
      published: tour.status === 'published',
    };
  }

  /** Published tours among `tourIds` belonging to `appId`, as list cards, in the given order. */
  async publishedCards(
    appId: string,
    tourIds: readonly string[],
    locale: Locale,
  ): Promise<TourCard[]> {
    const rows = (await this.tours.findByIds(tourIds)).filter(
      (tour) => tour.appId === appId && tour.status === 'published',
    );
    const cards = await this.reader.cards(rows, locale);
    const order = new Map(tourIds.map((id, index) => [id, index]));
    return cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  /** Points among `pointIds` whose tour is published, keyed by id. */
  async publishedPoints(
    pointIds: readonly string[],
    locale: Locale,
  ): Promise<Map<string, PointSummary>> {
    const rows = await this.points.byIds(pointIds);
    const tours = new Map(
      (await this.tours.findByIds([...new Set(rows.map((row) => row.tourId))]))
        .filter((tour) => tour.status === 'published')
        .map((tour) => [tour.id, tour]),
    );
    const visible = rows.filter((row) => tours.has(row.tourId));
    const details = await this.points.details(visible);
    const files = await this.media.findMany(
      visible.map((row) => row.imageId).filter((id): id is string => !!id),
    );
    return new Map(
      visible.map((row) => [
        row.id,
        {
          id: row.id,
          tourId: row.tourId,
          appId: tours.get(row.tourId)!.appId,
          name:
            pickTranslation(
              details.translations.filter((translation) => translation.pointId === row.id),
              locale,
            )?.name ?? '',
          imageUrl: (row.imageId && files.get(row.imageId)?.url) || null,
        },
      ]),
    );
  }
}
