import { Transactional } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { AppDirectory } from '../../../platform/app-context';
import { isUniqueViolation } from '../../../platform/database';
import { AppError } from '../../../platform/http';
import { FileReferences } from '../file-references';
import { type TourFields, type TourRow, ToursStore } from '../stores/tours.store';
import { type TourInput } from '../tours.inputs';

@Injectable()
export class ToursAdminService {
  constructor(
    private readonly tours: ToursStore,
    private readonly files: FileReferences,
    private readonly apps: AppDirectory,
  ) {}

  async get(id: string): Promise<TourRow> {
    const tour = await this.tours.findById(id);
    if (!tour) throw AppError.notFound('tour_not_found', `Tour ${id} not found`);
    return tour;
  }

  @Transactional()
  async create(input: TourInput): Promise<TourRow> {
    await this.validate(input);
    const tour = await this.withUniqueSlug(input.slug, () => this.tours.insert(fields(input)));
    await this.tours.replaceTranslations(tour.id, input.translations);
    await this.tours.replaceImages(tour.id, input.imageIds);
    return tour;
  }

  /** Replaces the tour as a whole: fields, translations and carousel. Points are untouched. */
  @Transactional()
  async replace(id: string, input: TourInput): Promise<TourRow> {
    const existing = await this.get(id);
    if (existing.appId !== input.appId) {
      throw AppError.badRequest('app_change_forbidden', 'A tour cannot move to another app');
    }
    await this.validate(input);
    const tour = await this.withUniqueSlug(input.slug, () =>
      this.tours.update(id, {
        ...fields(input),
        // Keep the first publication date across later edits.
        publishedAt: input.status === 'published' ? (existing.publishedAt ?? new Date()) : null,
      }),
    );
    await this.tours.replaceTranslations(id, input.translations);
    await this.tours.replaceImages(id, input.imageIds);
    return tour!;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.tours.delete(id))) {
      throw AppError.notFound('tour_not_found', `Tour ${id} not found`);
    }
  }

  private async validate(input: TourInput): Promise<void> {
    if (!(await this.apps.findById(input.appId))) {
      throw AppError.badRequest('app_not_found', `App ${input.appId} not found`);
    }
    await this.files.assertExist([
      input.coverImageId,
      ...input.imageIds,
      ...input.translations.map((translation) => translation.introAudioId),
    ]);
  }

  private async withUniqueSlug<T>(slug: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('slug_taken', `The app already has a tour "${slug}"`);
      }
      throw error;
    }
  }
}

function fields(input: TourInput): TourFields {
  return {
    appId: input.appId,
    slug: input.slug,
    status: input.status,
    priceKopecks: input.priceKopecks,
    position: input.position,
    coverImageId: input.coverImageId,
    distanceMeters: input.distanceMeters,
    durationMinutes: input.durationMinutes,
    mapViewport: input.mapViewport,
    publishedAt: input.status === 'published' ? new Date() : null,
  };
}
