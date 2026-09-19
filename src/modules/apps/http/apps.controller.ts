import { Body, Controller, Get, HttpCode, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { type AppContext, CurrentApp, RequiresApp } from '../../../platform/app-context';
import { APP_TAG } from '../../../platform/http';
import { CurrentUserId, UserAuth } from '../../auth';
import { AppsService } from '../apps.service';
import {
  AppConfigDto,
  ReportInstallationDto,
  toAppConfig,
  UpdateInfoDto,
  UpdateQueryDto,
} from './apps.dto';

@ApiTags(APP_TAG)
@RequiresApp()
@Controller('app')
export class AppsController {
  constructor(private readonly apps: AppsService) {}

  /** Configuration of the calling app: contacts, map style, stores that sell tours. */
  @Get()
  @ZodResponse({ status: 200, type: AppConfigDto })
  async config(@CurrentApp() app: AppContext) {
    return toAppConfig(await this.apps.get(app.id));
  }

  /** Whether a newer build exists and whether this one must update first. */
  @Get('update')
  @ZodResponse({ status: 200, type: UpdateInfoDto })
  update(@CurrentApp() app: AppContext, @Query() query: UpdateQueryDto) {
    return this.apps.updateInfo(app.id, query.store, query.version);
  }

  /** Records which build the signed-in user runs. */
  @Put('installation')
  @UserAuth()
  @HttpCode(204)
  async reportInstallation(
    @CurrentApp() app: AppContext,
    @CurrentUserId() userId: string,
    @Body() body: ReportInstallationDto,
  ): Promise<void> {
    await this.apps.reportUserVersion(userId, app.id, body.store, body.version);
  }
}
