import { Transactional } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http';
import { FileReferences } from '../file-references';
import { CategoriesStore } from '../stores/categories.store';
import { type PointRow, PointsStore } from '../stores/points.store';
import { ToursStore } from '../stores/tours.store';
import { type PointAudioInput, type PointInput } from '../tours.inputs';

@Injectable()
export class PointsAdminService {
  constructor(
    private readonly points: PointsStore,
    private readonly tours: ToursStore,
    private readonly categories: CategoriesStore,
    private readonly files: FileReferences,
  ) {}

  async get(id: string): Promise<PointRow> {
    const point = await this.points.findById(id);
    if (!point) throw AppError.notFound('point_not_found', `Point ${id} not found`);
    return point;
  }

  /** Adds a point at the end of the route. */
  @Transactional()
  async create(tourId: string, input: PointInput): Promise<PointRow> {
    if (!(await this.tours.findById(tourId))) {
      throw AppError.notFound('tour_not_found', `Tour ${tourId} not found`);
    }
    await this.validate(input);
    const point = await this.points.insert({
      tourId,
      position: await this.points.nextPosition(tourId),
      ...fields(input),
    });
    await this.writeParts(point.id, input);
    return point;
  }

  /** Replaces the point as a whole, including its audio. Its place on the route is kept. */
  @Transactional()
  async replace(id: string, input: PointInput): Promise<PointRow> {
    await this.get(id);
    await this.validate(input);
    const point = await this.points.update(id, fields(input));
    await this.writeParts(id, input);
    return point!;
  }

  async remove(id: string): Promise<void> {
    if (!(await this.points.delete(id))) {
      throw AppError.notFound('point_not_found', `Point ${id} not found`);
    }
  }

  /** Creates or replaces the narration, turning the point into an audio point. */
  @Transactional()
  async putAudio(pointId: string, audio: PointAudioInput): Promise<void> {
    await this.get(pointId);
    await this.files.assertExist(audio.translations.map((translation) => translation.audioFileId));
    await this.points.putAudio(pointId, audio.autoplayRadiusMeters, audio.translations);
    await this.points.touch(pointId);
  }

  @Transactional()
  async removeAudio(pointId: string): Promise<void> {
    if (!(await this.points.deleteAudio(pointId))) {
      throw AppError.notFound('audio_not_found', `Point ${pointId} has no audio`);
    }
    await this.points.touch(pointId);
  }

  /** Sets the route order; the list must contain every point of the tour exactly once. */
  @Transactional()
  async reorder(tourId: string, orderedIds: readonly string[]): Promise<void> {
    const current = await this.points.byTour(tourId);
    const expected = new Set(current.map((point) => point.id));
    const same =
      orderedIds.length === expected.size &&
      new Set(orderedIds).size === orderedIds.length &&
      orderedIds.every((id) => expected.has(id));
    if (!same) {
      throw AppError.badRequest(
        'order_mismatch',
        'The order must list every point of the tour exactly once',
      );
    }
    await this.points.setPositions(orderedIds);
  }

  private async writeParts(pointId: string, input: PointInput): Promise<void> {
    await this.points.replaceTranslations(pointId, input.translations);
    await this.points.replaceCategories(pointId, input.categoryIds);
    await this.points.replaceImages(pointId, input.imageIds);
    if (input.audio) {
      await this.points.putAudio(
        pointId,
        input.audio.autoplayRadiusMeters,
        input.audio.translations,
      );
    } else {
      await this.points.deleteAudio(pointId);
    }
  }

  private async validate(input: PointInput): Promise<void> {
    await this.files.assertExist([
      input.imageId,
      ...input.imageIds,
      input.markerImageId,
      input.lockedMarkerImageId,
      ...(input.audio?.translations.map((translation) => translation.audioFileId) ?? []),
    ]);
    const categoryIds = [...new Set(input.categoryIds)];
    const found = await this.categories.byIds(categoryIds);
    if (found.length !== categoryIds.length) {
      throw AppError.badRequest('category_not_found', 'Unknown category ids');
    }
  }
}

function fields(input: PointInput) {
  return {
    latitude: input.latitude,
    longitude: input.longitude,
    isFree: input.isFree,
    imageId: input.imageId,
    markerImageId: input.markerImageId,
    lockedMarkerImageId: input.lockedMarkerImageId,
  };
}
