import { Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http';
import { DEFAULT_LOCALE, pickTranslation } from '../../../platform/i18n';
import { PointsStore } from '../stores/points.store';
import { type TourRow, ToursStore } from '../stores/tours.store';
import { type PointInput, type TourInput } from '../tours.inputs';

export interface TourEditorView extends TourInput {
  id: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  points: { id: string; position: number; name: string; hasAudio: boolean }[];
}

export interface PointEditorView extends PointInput {
  id: string;
  tourId: string;
  position: number;
}

/**
 * What the admin edits: every language at once, in the same shape the write
 * endpoints accept, so a view can be changed and sent back as is.
 */
@Injectable()
export class TourEditorViews {
  constructor(
    private readonly tours: ToursStore,
    private readonly points: PointsStore,
  ) {}

  async list(appId: string): Promise<TourRow[]> {
    return this.tours.list({ appId, publishedOnly: false });
  }

  async tour(id: string): Promise<TourEditorView> {
    const tour = await this.tours.findById(id);
    if (!tour) throw AppError.notFound('tour_not_found', `Tour ${id} not found`);
    const [translations, imageIds, pointRows] = await Promise.all([
      this.tours.translations([id]),
      this.tours.imageIds(id),
      this.points.byTour(id),
    ]);
    const details = await this.points.details(pointRows);
    return {
      id: tour.id,
      appId: tour.appId,
      slug: tour.slug,
      status: tour.status,
      priceKopecks: tour.priceKopecks,
      position: tour.position,
      coverImageId: tour.coverImageId,
      distanceMeters: tour.distanceMeters,
      durationMinutes: tour.durationMinutes,
      mapViewport: tour.mapViewport,
      translations: translations.map(({ tourId: _tourId, ...rest }) => ({
        ...rest,
        locale: rest.locale as TourInput['translations'][number]['locale'],
      })),
      imageIds,
      publishedAt: tour.publishedAt,
      createdAt: tour.createdAt,
      updatedAt: tour.updatedAt,
      points: pointRows.map((point) => ({
        id: point.id,
        position: point.position,
        name:
          pickTranslation(
            details.translations.filter((row) => row.pointId === point.id),
            DEFAULT_LOCALE,
          )?.name ?? '',
        hasAudio: details.audio.some((row) => row.pointId === point.id),
      })),
    };
  }

  async point(id: string): Promise<PointEditorView> {
    const point = await this.points.findById(id);
    if (!point) throw AppError.notFound('point_not_found', `Point ${id} not found`);
    const details = await this.points.details([point]);
    const audio = details.audio[0];
    type Locale = PointInput['translations'][number]['locale'];
    return {
      id: point.id,
      tourId: point.tourId,
      position: point.position,
      latitude: point.latitude,
      longitude: point.longitude,
      isFree: point.isFree,
      imageId: point.imageId,
      imageIds: details.images.map((image) => image.fileId),
      translations: details.translations.map(({ pointId: _pointId, ...rest }) => ({
        ...rest,
        locale: rest.locale as Locale,
      })),
      categoryIds: details.categoryLinks.map((link) => link.categoryId),
      audio: audio
        ? {
            autoplayRadiusMeters: audio.autoplayRadiusMeters,
            translations: details.audioTranslations.map(({ pointId: _pointId, ...rest }) => ({
              ...rest,
              locale: rest.locale as Locale,
            })),
          }
        : null,
    };
  }
}
