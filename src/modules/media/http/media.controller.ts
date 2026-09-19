import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Response } from 'express';
import { APP_TAG, IdParamDto } from '../../../platform/http';
import { MediaService } from '../media.service';

/** A file's bytes never change, so clients and proxies may cache them forever. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

@ApiTags(APP_TAG)
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Downloads a file. Supports Range requests, so audio can be streamed and resumed. */
  @Get(':id')
  @ApiOkResponse({ description: 'File contents' })
  async download(@Param() { id }: IdParamDto, @Res() res: Response): Promise<void> {
    const file = await this.media.get(id);
    res.sendFile(this.media.localPath(file), {
      etag: false,
      lastModified: false,
      headers: {
        'Content-Type': file.mimeType,
        'Cache-Control': IMMUTABLE,
        ETag: `"${file.sha256}"`,
      },
    });
  }
}
