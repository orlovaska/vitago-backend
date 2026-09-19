import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { AppsDirectory, AppsFacade } from './apps.facade';
import { AppsService } from './apps.service';
import { AppsStore } from './apps.store';

/** The city apps: identity, contacts, map style, stores and released versions. */
@Module({
  imports: [AuthModule],
  providers: [AppsStore, AppsService, AppsFacade, AppsDirectory],
  exports: [AppsFacade, AppsDirectory],
})
export class AppsModule {}
