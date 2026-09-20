import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { ADMIN_TAG, createZodDto } from '../../../platform/http';
import { AdminAuth, CurrentAdminId } from '../../auth';
import { type SettingState, SettingsService } from '../settings.service';

const settingSchema = z.object({
  key: z.string(),
  description: z.string(),
  /** Whether the mobile app receives this value. */
  public: z.boolean(),
  value: z.unknown(),
  defaultValue: z.unknown(),
  overridden: z.boolean(),
  updatedAt: z.iso.datetime().nullable(),
});

class SettingsListDto extends createZodDto(z.object({ items: z.array(settingSchema) })) {}
class SetSettingDto extends createZodDto(z.object({ value: z.unknown() })) {}
class SettingKeyParamDto extends createZodDto(z.object({ key: z.string().max(100) })) {}

const toDto = (setting: SettingState) => ({
  ...setting,
  updatedAt: setting.updatedAt?.toISOString() ?? null,
});

@ApiTags(ADMIN_TAG)
@AdminAuth()
@Controller('admin/settings')
export class SettingsAdminController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ZodResponse({ status: 200, type: SettingsListDto })
  async list() {
    return { items: (await this.settings.list()).map(toDto) };
  }

  @Put(':key')
  @HttpCode(204)
  async set(
    @Param() { key }: SettingKeyParamDto,
    @Body() body: SetSettingDto,
    @CurrentAdminId() adminId: string,
  ): Promise<void> {
    await this.settings.set(key, body.value, adminId);
  }

  /** Drops the override so the default from the catalog applies again. */
  @Delete(':key')
  @HttpCode(204)
  async reset(@Param() { key }: SettingKeyParamDto): Promise<void> {
    await this.settings.reset(key);
  }
}
