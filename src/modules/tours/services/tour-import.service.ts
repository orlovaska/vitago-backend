import { Transactional } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import { CategoriesStore } from '../stores/categories.store';
import { PointsStore } from '../stores/points.store';
import { ToursStore } from '../stores/tours.store';
import { type CategoryInput, type PointInput, type TourInput } from '../tours.inputs';
import { CategoriesService } from './categories.service';
import { PointsAdminService } from './points-admin.service';
import { ToursAdminService } from './tours-admin.service';

/**
 * Writes prepared content (see the content:import command). Repeating an
 * import converges to the same state: categories match by slug, tours by app
 * and slug, and a tour's points are replaced as a whole.
 */
@Injectable()
export class TourImportService {
  constructor(
    private readonly tours: ToursStore,
    private readonly points: PointsStore,
    private readonly categories: CategoriesStore,
    private readonly toursAdmin: ToursAdminService,
    private readonly pointsAdmin: PointsAdminService,
    private readonly categoriesAdmin: CategoriesService,
  ) {}

  /** Returns the category id. */
  async upsertCategory(input: CategoryInput): Promise<string> {
    const existing = (await this.categories.list()).find((row) => row.slug === input.slug);
    const category = existing
      ? await this.categoriesAdmin.replace(existing.id, input)
      : await this.categoriesAdmin.create(input);
    return category.id;
  }

  /** Returns the tour id. Validation is the same as for the admin API. */
  @Transactional()
  async upsertTour(tour: TourInput, points: readonly PointInput[]): Promise<string> {
    const existing = await this.tours.findBySlug(tour.appId, tour.slug);
    const saved = existing
      ? await this.toursAdmin.replace(existing.id, tour)
      : await this.toursAdmin.create(tour);
    for (const point of await this.points.byTour(saved.id)) {
      await this.points.delete(point.id);
    }
    for (const point of points) {
      await this.pointsAdmin.create(saved.id, point);
    }
    return saved.id;
  }
}
