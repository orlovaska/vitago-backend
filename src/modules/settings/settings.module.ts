import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { SettingsFacade } from './settings.facade';
import { SettingsService } from './settings.service';

/** Behaviour that can be tuned from the admin without an app release. */
@Module({
  imports: [AuthModule],
  providers: [SettingsService, SettingsFacade],
  exports: [SettingsFacade],
})
export class SettingsModule {}
