import { tmpdir } from 'node:os';
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfig } from '../../platform/config';
import { AuthModule } from '../auth';
import { MediaAdminController } from './http/media-admin.controller';
import { MediaController } from './http/media.controller';
import { MediaFacade } from './media.facade';
import { MediaService } from './media.service';
import { MediaStore } from './media.store';
import { FileStorage } from './storage/file-storage';
import { LocalDiskStorage } from './storage/local-disk.storage';

/** Uploaded images, audio, route geometry and documents. */
@Module({
  imports: [
    AuthModule,
    MulterModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        // Uploads stream to a temp file, never into memory.
        dest: tmpdir(),
        limits: { fileSize: config.env.MEDIA_MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
      }),
    }),
  ],
  controllers: [MediaController, MediaAdminController],
  providers: [
    MediaStore,
    MediaService,
    MediaFacade,
    { provide: FileStorage, useClass: LocalDiskStorage },
  ],
  exports: [MediaFacade],
})
export class MediaModule {}
