import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { MediaModule } from '../media';
import { FileReferences } from './file-references';
import { CategoriesService } from './services/categories.service';
import { PointsAdminService } from './services/points-admin.service';
import { ToursAdminService } from './services/tours-admin.service';
import { CategoriesStore } from './stores/categories.store';
import { PointsStore } from './stores/points.store';
import { ToursStore } from './stores/tours.store';

/** Tours, their points with optional narration, and point categories. */
@Module({
  imports: [AuthModule, MediaModule],
  providers: [
    ToursStore,
    PointsStore,
    CategoriesStore,
    FileReferences,
    ToursAdminService,
    PointsAdminService,
    CategoriesService,
  ],
})
export class ToursModule {}
