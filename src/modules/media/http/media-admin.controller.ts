import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import {
  ADMIN_TAG,
  AppError,
  decodeCursor,
  encodeCursor,
  IdParamDto,
} from '../../../platform/http';
import { AdminAuth } from '../../auth';
import { MediaService } from '../media.service';
import { FileDto, FilePageDto, ListFilesQueryDto, toFileDto } from './media.dto';

@ApiTags(ADMIN_TAG)
@AdminAuth()
@Controller('admin/media')
export class MediaAdminController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ZodResponse({ status: 201, type: FileDto })
  async upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw AppError.badRequest('file_required', 'Send the file in the "file" field');
    const stored = await this.media.ingest({
      tempPath: file.path,
      // Multer decodes multipart filenames as latin1.
      originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      mimeType: file.mimetype,
    });
    return toFileDto(stored);
  }

  @Get()
  @ZodResponse({ status: 200, type: FilePageDto })
  async list(@Query() query: ListFilesQueryDto) {
    const cursor = decodeCursor(query.cursor);
    const rows = await this.media.list({
      limit: query.limit + 1,
      mimePrefix: query.mimePrefix,
      after: cursor && { createdAt: cursor.at, id: cursor.id },
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map(toFileDto),
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ at: last.createdAt, id: last.id })
          : null,
    };
  }

  @Get(':id')
  @ZodResponse({ status: 200, type: FileDto })
  async get(@Param() { id }: IdParamDto) {
    return toFileDto(await this.media.get(id));
  }

  /** Deletes the file. Content that still references it will show it as missing. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param() { id }: IdParamDto): Promise<void> {
    await this.media.remove(id);
  }
}
