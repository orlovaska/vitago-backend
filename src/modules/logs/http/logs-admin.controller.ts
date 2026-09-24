import { Body, Controller, Get, HttpCode, Param, Put, Query, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { z } from 'zod';
import { ADMIN_TAG, createZodDto } from '../../../platform/http';
import { AdminAuth } from '../../auth';
import { LOG_LEVELS, LogsService } from '../logs.service';

const levelSchema = z.enum(LOG_LEVELS);

class LogFileListDto extends createZodDto(
  z.object({
    items: z.array(
      z.object({ name: z.string(), sizeBytes: z.number().int(), modifiedAt: z.iso.datetime() }),
    ),
  }),
) {}

class LogFileParamDto extends createZodDto(z.object({ name: z.string().max(200) })) {}

class LogEntriesQueryDto extends createZodDto(
  z.object({
    file: z.string().max(200),
    minLevel: levelSchema.default('info'),
    search: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(2000).default(200),
  }),
) {}

class LogEntriesDto extends createZodDto(
  z.object({ items: z.array(z.record(z.string(), z.unknown())) }),
) {}

class LogLevelDto extends createZodDto(z.object({ level: levelSchema })) {}

@ApiTags(ADMIN_TAG)
@AdminAuth('logs')
@Controller('admin/logs')
export class LogsAdminController {
  constructor(private readonly logs: LogsService) {}

  /** Log files on disk, newest first. */
  @Get('files')
  @ZodResponse({ status: 200, type: LogFileListDto })
  async files() {
    const files = await this.logs.files();
    return {
      items: files.map((file) => ({ ...file, modifiedAt: file.modifiedAt.toISOString() })),
    };
  }

  /** Downloads a whole log file. */
  @Get('files/:name')
  @ApiOkResponse({ description: 'Log file, one JSON object per line' })
  download(@Param() { name }: LogFileParamDto, @Res() res: Response): void {
    res.download(this.logs.pathOf(name), name);
  }

  /** Newest matching entries of one file, newest first. */
  @Get('entries')
  @ZodResponse({ status: 200, type: LogEntriesDto })
  async entries(@Query() query: LogEntriesQueryDto) {
    return { items: await this.logs.entries(query) };
  }

  @Get('level')
  @ZodResponse({ status: 200, type: LogLevelDto })
  level() {
    return { level: this.logs.level() };
  }

  /** Changes the log level of the running API until it restarts. */
  @Put('level')
  @HttpCode(204)
  setLevel(@Body() body: LogLevelDto): void {
    this.logs.setLevel(body.level);
  }
}
