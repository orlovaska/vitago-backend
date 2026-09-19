import { Injectable } from '@nestjs/common';
import { AppError } from '../../platform/http';
import { MediaFacade } from '../media';

/** Rejects content that points at files which were never uploaded or were deleted. */
@Injectable()
export class FileReferences {
  constructor(private readonly media: MediaFacade) {}

  async assertExist(ids: readonly (string | null | undefined)[]): Promise<void> {
    const present = ids.filter((id): id is string => typeof id === 'string');
    if (present.length === 0) return;
    const missing = await this.media.findMissing(present);
    if (missing.length > 0) {
      throw AppError.badRequest('file_not_found', `Unknown file ids: ${missing.join(', ')}`);
    }
  }
}
