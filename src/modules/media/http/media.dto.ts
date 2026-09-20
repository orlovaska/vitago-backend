import { z } from 'zod';
import { pageQuery, createZodDto } from '../../../platform/http';
import { mediaUrl } from '../media.facade';
import { type FileRow } from '../media.store';

const fileSchema = z.object({
  id: z.uuid(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string(),
  url: z.string(),
  createdAt: z.iso.datetime(),
});

export class FileDto extends createZodDto(fileSchema) {}

export class FilePageDto extends createZodDto(
  z.object({ items: z.array(fileSchema), nextCursor: z.string().nullable() }),
) {}

export class ListFilesQueryDto extends createZodDto(
  z.object({
    ...pageQuery,
    /** e.g. `audio/` or `image/png`. */
    mimePrefix: z.string().max(100).optional(),
  }),
) {}

export const toFileDto = (file: FileRow) => ({
  id: file.id,
  originalName: file.originalName,
  mimeType: file.mimeType,
  sizeBytes: file.sizeBytes,
  sha256: file.sha256,
  url: mediaUrl(file.id),
  createdAt: file.createdAt.toISOString(),
});
