import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { SettingsAdminController } from './http/settings-admin.controller';
import { SettingsFacade } from './settings.facade';
import { SettingsService } from './settings.service';

/** Behaviour that can be tuned from the admin without an app release. */
@Module({
  imports: [AuthModule],
  controllers: [SettingsAdminController],
  providers: [SettingsService, SettingsFacade],
  exports: [SettingsFacade],
})
export class SettingsModule {}
