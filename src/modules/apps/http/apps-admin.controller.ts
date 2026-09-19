import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ADMIN_TAG, IdParamDto } from '../../../platform/http';
import { AdminAuth } from '../../auth';
import { AppsService } from '../apps.service';
import {
  AdminAppDto,
  AdminAppListDto,
  AppVersionDto,
  AppVersionListDto,
  AppVersionParamsDto,
  CreateAppDto,
  CreateAppVersionDto,
  supportColumns,
  toAdminApp,
  toAppVersion,
  UpdateAppDto,
} from './apps.dto';

@ApiTags(ADMIN_TAG)
@AdminAuth()
@Controller('admin/apps')
export class AppsAdminController {
  constructor(private readonly apps: AppsService) {}

  @Get()
  @ZodResponse({ status: 200, type: AdminAppListDto })
  async list() {
    return { items: (await this.apps.list()).map(toAdminApp) };
  }

  @Post()
  @ZodResponse({ status: 201, type: AdminAppDto })
  async create(@Body() body: CreateAppDto) {
    const { support, ...fields } = body;
    return toAdminApp(await this.apps.create({ ...fields, ...supportColumns(support) }));
  }

  @Get(':id')
  @ZodResponse({ status: 200, type: AdminAppDto })
  async get(@Param() { id }: IdParamDto) {
    return toAdminApp(await this.apps.get(id));
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: AdminAppDto })
  async update(@Param() { id }: IdParamDto, @Body() body: UpdateAppDto) {
    const { support, ...fields } = body;
    return toAdminApp(await this.apps.update(id, { ...fields, ...supportColumns(support) }));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param() { id }: IdParamDto): Promise<void> {
    await this.apps.remove(id);
  }

  @Get(':id/versions')
  @ZodResponse({ status: 200, type: AppVersionListDto })
  async versions(@Param() { id }: IdParamDto) {
    return { items: (await this.apps.listVersions(id)).map(toAppVersion) };
  }

  @Post(':id/versions')
  @ZodResponse({ status: 201, type: AppVersionDto })
  async addVersion(@Param() { id }: IdParamDto, @Body() body: CreateAppVersionDto) {
    return toAppVersion(await this.apps.addVersion(id, body));
  }

  @Delete(':id/versions/:versionId')
  @HttpCode(204)
  async removeVersion(@Param() { id, versionId }: AppVersionParamsDto): Promise<void> {
    await this.apps.removeVersion(id, versionId);
  }
}
