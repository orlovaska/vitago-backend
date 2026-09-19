import { Body, Controller, Get, HttpCode, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { type AppContext, CurrentApp, RequiresApp } from '../../../platform/app-context';
import { APP_TAG } from '../../../platform/http';
import { CurrentUserId, UserAuth } from '../../auth';
import { LegalFacade } from '../../legal';
import { SettingsFacade } from '../../settings';
import { AppsService } from '../apps.service';
import {
  ClientConfigDto,
  ReportInstallationDto,
  toAppConfig,
  toLegalDocument,
  UpdateInfoDto,
  UpdateQueryDto,
} from './apps.dto';

@ApiTags(APP_TAG)
@RequiresApp()
@Controller('app')
export class AppsController {
  constructor(
    private readonly apps: AppsService,
    private readonly legal: LegalFacade,
    private readonly settings: SettingsFacade,
  ) {}

  /** Start-up configuration of the calling app: contacts, map, stores, legal documents, settings. */
  @Get()
  @ZodResponse({ status: 200, type: ClientConfigDto })
  async config(@CurrentApp() app: AppContext) {
    const [row, documents, settings] = await Promise.all([
      this.apps.get(app.id),
      this.legal.currentDocuments(app.id),
      this.settings.getPublic(),
    ]);
    return {
      ...toAppConfig(row),
      legalDocuments: documents.map(toLegalDocument),
      settings,
    };
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
