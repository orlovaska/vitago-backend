import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { LegalModule } from '../legal';
import { SettingsModule } from '../settings';
import { AppsDirectory, AppsFacade } from './apps.facade';
import { AppsService } from './apps.service';
import { AppsStore } from './apps.store';
import { AppsAdminController } from './http/apps-admin.controller';
import { AppsController } from './http/apps.controller';

/** The city apps: identity, contacts, map style, stores and released versions. */
@Module({
  imports: [AuthModule, LegalModule, SettingsModule],
  controllers: [AppsController, AppsAdminController],
  providers: [AppsStore, AppsService, AppsFacade, AppsDirectory],
  exports: [AppsFacade, AppsDirectory],
})
export class AppsModule {}
