import { Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http';
import { type Locale, pickTranslation } from '../../../platform/i18n';
import { MediaFacade } from '../../media';
import { type PointDetails, type PointRow, PointsStore } from '../stores/points.store';
import { type TourRow, ToursStore, type TourTranslationRow } from '../stores/tours.store';
import { type MapViewport, type RouteLine, type SubtitleCue } from '../tours.tables';
import { CategoriesService, type LocalizedCategory } from './categories.service';

export interface TourCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverImageUrl: string | null;
  priceKopecks: number;
  distanceMeters: number | null;
  durationMinutes: number | null;
  pointCount: number;
}

export interface PointContent {
  id: string;
  position: number;
  latitude: number;
  longitude: number;
  isFree: boolean;
  name: string;
  description: string | null;
  address: string | null;
  openingHours: string | null;
  imageUrl: string | null;
  markerImageUrl: string | null;
  lockedMarkerImageUrl: string | null;
  categoryIds: string[];
  /** Null for a point without narration. */
  audio: {
    url: string | null;
    autoplayRadiusMeters: number;
    durationSeconds: number | null;
    transcript: string | null;
    subtitles: SubtitleCue[] | null;
  } | null;
}

export interface TourContent extends TourCard {
  description: string | null;
  introAudioUrl: string | null;
  imageUrls: string[];
  mapViewport: MapViewport | null;
  route: RouteLine | null;
  points: PointContent[];
  /** Categories used by the points, with names in the requested language. */
  categories: (LocalizedCategory & { iconImageUrl: string | null })[];
}

/**
 * Assembles what the app shows. Content is the same for every user; whether
 * the user bought the tour comes from the payments module.
 */
@Injectable()
export class TourReader {
  constructor(
    private readonly tours: ToursStore,
    private readonly points: PointsStore,
    private readonly categories: CategoriesService,
    private readonly media: MediaFacade,
  ) {}

  async listForApp(appId: string, locale: Locale): Promise<TourCard[]> {
    const rows = await this.tours.list({ appId, publishedOnly: true });
    return this.cards(rows, locale);
  }

  async cards(rows: TourRow[], locale: Locale): Promise<TourCard[]> {
    const ids = rows.map((row) => row.id);
    const [translations, counts] = await Promise.all([
      this.tours.translations(ids),
      this.tours.pointCounts(ids),
    ]);
    const urls = await this.urls(rows.map((row) => row.coverImageId));
    return rows.map((row) =>
      card(row, translationOf(translations, row.id, locale), counts.get(row.id) ?? 0, urls),
    );
  }

  /** A published tour of the app, by id or slug; drafts are not found. */
  async published(appId: string, idOrSlug: string, locale: Locale): Promise<TourContent> {
    const tour = UUID.test(idOrSlug)
      ? await this.tours.findById(idOrSlug)
      : await this.tours.findBySlug(appId, idOrSlug);
    if (!tour || tour.appId !== appId || tour.status !== 'published') {
      throw AppError.notFound('tour_not_found', `Tour ${idOrSlug} not found`);
    }
    return this.content(tour, locale);
  }

  async content(tour: TourRow, locale: Locale): Promise<TourContent> {
    const [translations, imageIds, pointRows] = await Promise.all([
      this.tours.translations([tour.id]),
      this.tours.imageIds(tour.id),
      this.points.byTour(tour.id),
    ]);
    const details = await this.points.details(pointRows);
    const translation = pickTranslation(translations, locale);
    const categoryIds = [...new Set(details.categoryLinks.map((link) => link.categoryId))];
    const categories = await this.categories.localized(locale, categoryIds);

    const urls = await this.urls([
      tour.coverImageId,
      translation?.introAudioId,
      ...imageIds,
      ...pointRows.flatMap((point) => [
        point.imageId,
        point.markerImageId,
        point.lockedMarkerImageId,
      ]),
      ...details.audioTranslations.map((audio) => audio.audioFileId),
      ...categories.map((category) => category.iconImageId),
    ]);

    return {
      ...card(tour, translation, pointRows.length, urls),
      description: translation?.description ?? null,
      introAudioUrl: urlOf(urls, translation?.introAudioId),
      imageUrls: imageIds.flatMap((id) => urls.get(id) ?? []),
      mapViewport: tour.mapViewport,
      route: tour.route,
      points: pointRows.map((point) => pointContent(point, details, locale, urls)),
      categories: categories.map((category) => ({
        ...category,
        iconImageUrl: urlOf(urls, category.iconImageId),
      })),
    };
  }

  private async urls(ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
    const files = await this.media.findMany(ids.filter((id): id is string => !!id));
    return new Map([...files].map(([id, file]) => [id, file.url]));
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function urlOf(urls: Map<string, string>, id: string | null | undefined): string | null {
  return (id && urls.get(id)) || null;
}

function translationOf(
  translations: TourTranslationRow[],
  tourId: string,
  locale: Locale,
): TourTranslationRow | undefined {
  return pickTranslation(
    translations.filter((translation) => translation.tourId === tourId),
    locale,
  );
}

function card(
  row: TourRow,
  translation: TourTranslationRow | undefined,
  pointCount: number,
  urls: Map<string, string>,
): TourCard {
  return {
    id: row.id,
    slug: row.slug,
    title: translation?.title ?? row.slug,
    subtitle: translation?.subtitle ?? null,
    coverImageUrl: urlOf(urls, row.coverImageId),
    priceKopecks: row.priceKopecks,
    distanceMeters: row.distanceMeters,
    durationMinutes: row.durationMinutes,
    pointCount,
  };
}

function pointContent(
  point: PointRow,
  details: PointDetails,
  locale: Locale,
  urls: Map<string, string>,
): PointContent {
  const translation = pickTranslation(
    details.translations.filter((row) => row.pointId === point.id),
    locale,
  );
  const audio = details.audio.find((row) => row.pointId === point.id);
  const recording =
    audio &&
    pickTranslation(
      details.audioTranslations.filter((row) => row.pointId === point.id),
      locale,
    );
  return {
    id: point.id,
    position: point.position,
    latitude: point.latitude,
    longitude: point.longitude,
    isFree: point.isFree,
    name: translation?.name ?? '',
    description: translation?.description ?? null,
    address: translation?.address ?? null,
    openingHours: translation?.openingHours ?? null,
    imageUrl: urlOf(urls, point.imageId),
    markerImageUrl: urlOf(urls, point.markerImageId),
    lockedMarkerImageUrl: urlOf(urls, point.lockedMarkerImageId),
    categoryIds: details.categoryLinks
      .filter((link) => link.pointId === point.id)
      .map((link) => link.categoryId),
    audio: audio
      ? {
          url: urlOf(urls, recording?.audioFileId),
          autoplayRadiusMeters: audio.autoplayRadiusMeters,
          durationSeconds: recording?.durationSeconds ?? null,
          transcript: recording?.transcript ?? null,
          subtitles: recording?.subtitles ?? null,
        }
      : null,
  };
}
