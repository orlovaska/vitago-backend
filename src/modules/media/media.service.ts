import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../platform/database';
import { AppError } from '../../platform/http';
import { audioDurationSeconds } from './audio-duration';
import { renderMarker } from './marker-image';
import { ALLOWED_MEDIA_TYPES, isAllowedMediaType } from './media-types';
import { type FileRow, type ListFilesQuery, MediaStore } from './media.store';
import { FileStorage } from './storage/file-storage';

export interface IncomingFile {
  /** Temporary file; it is moved into storage or deleted. */
  tempPath: string;
  originalName: string;
  mimeType: string;
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

@Injectable()
export class MediaService {
  constructor(
    private readonly store: MediaStore,
    private readonly storage: FileStorage,
  ) {}

  /**
   * Stores an uploaded file. Identical content is stored once: uploading the
   * same bytes again returns the existing file, which makes imports repeatable.
   */
  async ingest({ tempPath, originalName, mimeType }: IncomingFile): Promise<FileRow> {
    try {
      if (!isAllowedMediaType(mimeType)) {
        throw AppError.badRequest(
          'unsupported_media_type',
          `Files of type ${mimeType} cannot be uploaded`,
        );
      }
      const [sha256, { size }] = await Promise.all([sha256Of(tempPath), stat(tempPath)]);
      // Content-addressed key: the same bytes of the same type always map to one file.
      const storageKey = `${sha256.slice(0, 2)}/${sha256}.${ALLOWED_MEDIA_TYPES[mimeType]}`;

      const durationSeconds = await audioDurationSeconds(tempPath, mimeType);

      const existing = await this.store.findByKey(storageKey);
      // Files are content-addressed, so the same bytes are never stored twice;
      // a row uploaded before durations were measured is completed here.
      if (existing) {
        return existing.durationSeconds == null && durationSeconds != null
          ? await this.store.setDuration(existing.id, durationSeconds)
          : existing;
      }

      await this.storage.save(storageKey, tempPath);
      try {
        return await this.store.insert({
          storageKey,
          originalName,
          mimeType,
          sizeBytes: size,
          sha256,
          durationSeconds,
        });
      } catch (error) {
        // A concurrent upload of the same content won the race; its row is ours too.
        if (isUniqueViolation(error)) return (await this.store.findByKey(storageKey))!;
        throw error;
      }
    } finally {
      await rm(tempPath, { force: true });
    }
  }

  /**
   * Draws the map marker of a photo and stores it like any other file. The
   * drawing is deterministic, so the same photo always yields the same file.
   */
  async markerFrom(sourceId: string): Promise<FileRow> {
    const source = await this.get(sourceId);
    if (!source.mimeType.startsWith('image/')) {
      throw AppError.badRequest('not_an_image', `File ${sourceId} is not an image`);
    }
    const tempPath = join(tmpdir(), `vitago-marker-${randomUUID()}.png`);
    try {
      await renderMarker(this.localPath(source), tempPath);
    } catch (error) {
      await rm(tempPath, { force: true });
      const reason = error instanceof Error ? error.message : String(error);
      throw AppError.badRequest(
        'image_unreadable',
        `File ${sourceId} cannot be read as an image: ${reason}`,
      );
    }
    return this.ingest({
      tempPath,
      originalName: `marker-${parse(source.originalName).name}.png`,
      mimeType: 'image/png',
    });
  }

  async get(id: string): Promise<FileRow> {
    const file = await this.store.findById(id);
    if (!file) throw AppError.notFound('file_not_found', `File ${id} not found`);
    return file;
  }

  list(query: ListFilesQuery): Promise<FileRow[]> {
    return this.store.list(query);
  }

  async remove(id: string): Promise<void> {
    const file = await this.store.delete(id);
    if (file) await this.storage.remove(file.storageKey);
  }

  localPath(file: FileRow): string {
    return this.storage.localPath(file.storageKey);
  }
}
