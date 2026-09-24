import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { MediaModule } from '../media';
import { RoutingModule } from '../routing';
import { FileReferences } from './file-references';
import { ToursAdminController } from './http/tours-admin.controller';
import { ToursController } from './http/tours.controller';
import { CategoriesService } from './services/categories.service';
import { MarkersService } from './services/markers.service';
import { NearbyPointsService } from './services/nearby-points.service';
import { PointsAdminService } from './services/points-admin.service';
import { TourEditorViews } from './services/tour-editor-views';
import { TourImportService } from './services/tour-import.service';
import { RouteLineService } from './services/route-line.service';
import { TourReader } from './services/tour-reader.service';
import { ToursAdminService } from './services/tours-admin.service';
import { WalkPointsService } from './services/walk-points.service';
import { CategoriesStore } from './stores/categories.store';
import { MarkersStore } from './stores/markers.store';
import { PointsStore } from './stores/points.store';
import { ToursStore } from './stores/tours.store';
import { ToursFacade } from './tours.facade';

/** Tours, their points with optional narration, and point categories. */
@Module({
  imports: [AuthModule, MediaModule, RoutingModule],
  controllers: [ToursController, ToursAdminController],
  providers: [
    ToursStore,
    PointsStore,
    CategoriesStore,
    MarkersStore,
    FileReferences,
    ToursAdminService,
    PointsAdminService,
    MarkersService,
    CategoriesService,
    NearbyPointsService,
    RouteLineService,
    TourReader,
    TourEditorViews,
    TourImportService,
    WalkPointsService,
    ToursFacade,
  ],
  exports: [ToursFacade],
})
export class ToursModule {}
