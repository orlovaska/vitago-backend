import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { PaymentsModule } from '../payments';
import { RoutingModule } from '../routing';
import { SettingsModule } from '../settings';
import { ToursModule } from '../tours';
import { WalksController } from './http/walks.controller';
import { WalkLifecycleService } from './services/walk-lifecycle.service';
import { WalkPlannerService } from './services/walk-planner.service';
import { WalksService } from './services/walks.service';
import { WalksFacade } from './walks.facade';
import { WalksStore } from './walks.store';

/** Walks the user builds from the points of the app, and keeps or pays to open. */
@Module({
  imports: [AuthModule, ToursModule, RoutingModule, PaymentsModule, SettingsModule],
  controllers: [WalksController],
  providers: [WalksStore, WalkPlannerService, WalksService, WalkLifecycleService, WalksFacade],
  exports: [WalksFacade],
})
export class WalksModule {}
