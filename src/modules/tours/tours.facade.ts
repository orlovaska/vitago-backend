import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale, pickTranslation } from '../../platform/i18n';
import { MediaFacade } from '../media';
import { TourImportService } from './services/tour-import.service';
import { type TourCard, TourReader } from './services/tour-reader.service';
import {
  type CandidateFilter,
  type WalkCandidate,
  type WalkPointContent,
  WalkPointsService,
} from './services/walk-points.service';
import { PointsStore } from './stores/points.store';
import { ToursStore } from './stores/tours.store';
import { type CategoryInput, type PointInput, type TourInput } from './tours.inputs';

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
    private readonly importer: TourImportService,
    private readonly walkPoints: WalkPointsService,
  ) {}

  /** Content import: creates or updates a category by slug and returns its id. */
  upsertCategory(input: CategoryInput): Promise<string> {
    return this.importer.upsertCategory(input);
  }

  /** Content import: creates or replaces a tour (by app and slug) with all its points. */
  upsertTour(tour: TourInput, points: readonly PointInput[]): Promise<string> {
    return this.importer.upsertTour(tour, points);
  }

  /**
   * Points of the app's published tours that a generated walk may use: one row
   * per place, whichever tours repeat it, with what the planner needs to
   * choose. Optionally narrowed by a rectangle and by categories.
   */
  pointCandidates(
    appId: string,
    locale: Locale,
    filter?: CandidateFilter,
  ): Promise<WalkCandidate[]> {
    return this.walkPoints.candidates(appId, locale, filter);
  }

  /** Full content of the given points, in the given order; unknown ids are skipped. */
  pointContents(pointIds: readonly string[], locale: Locale): Promise<WalkPointContent[]> {
    return this.walkPoints.contents(pointIds, locale);
  }

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

  async publishedTourIds(appId: string): Promise<string[]> {
    const rows = await this.tours.list({ appId, publishedOnly: true });
    return rows.map((row) => row.id);
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
