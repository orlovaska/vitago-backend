import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { MediaFacade } from './media.facade';
import { MediaService } from './media.service';
import { MediaStore } from './media.store';
import { FileStorage } from './storage/file-storage';
import { LocalDiskStorage } from './storage/local-disk.storage';

/** Uploaded images, audio, route geometry and documents. */
@Module({
  imports: [AuthModule],
  providers: [
    MediaStore,
    MediaService,
    MediaFacade,
    { provide: FileStorage, useClass: LocalDiskStorage },
  ],
  exports: [MediaFacade],
})
export class MediaModule {}
