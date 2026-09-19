import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { MediaModule } from '../media';
import { FileReferences } from './file-references';
import { ToursAdminController } from './http/tours-admin.controller';
import { ToursController } from './http/tours.controller';
import { CategoriesService } from './services/categories.service';
import { PointsAdminService } from './services/points-admin.service';
import { TourEditorViews } from './services/tour-editor-views';
import { TourReader } from './services/tour-reader.service';
import { ToursAdminService } from './services/tours-admin.service';
import { CategoriesStore } from './stores/categories.store';
import { PointsStore } from './stores/points.store';
import { ToursStore } from './stores/tours.store';
import { ToursFacade } from './tours.facade';

/** Tours, their points with optional narration, and point categories. */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [ToursController, ToursAdminController],
  providers: [
    ToursStore,
    PointsStore,
    CategoriesStore,
    FileReferences,
    ToursAdminService,
    PointsAdminService,
    CategoriesService,
    TourReader,
    TourEditorViews,
    ToursFacade,
  ],
  exports: [ToursFacade],
})
export class ToursModule {}
