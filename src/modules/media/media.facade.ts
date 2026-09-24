import { randomUUID } from 'node:crypto';
import { copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { API_PREFIX } from '../../platform/http';
import { MediaService } from './media.service';
import { type FileRow, MediaStore } from './media.store';

export interface MediaFile {
  id: string;
  mimeType: string;
  sizeBytes: number;
  /** Playing time of a recording, measured on upload; null for anything else. */
  durationSeconds: number | null;
  /** Path of the public download endpoint, relative to the API origin. */
  url: string;
}

export const mediaUrl = (id: string) => `/${API_PREFIX}/media/${id}`;

const toMediaFile = (row: FileRow): MediaFile => ({
  id: row.id,
  mimeType: row.mimeType,
  sizeBytes: row.sizeBytes,
  durationSeconds: row.durationSeconds,
  url: mediaUrl(row.id),
});

/** What other modules may ask of `media`. */
@Injectable()
export class MediaFacade {
  constructor(
    private readonly store: MediaStore,
    private readonly service: MediaService,
  ) {}

  /** Files that exist among `ids`, keyed by id; missing ids are simply absent. */
  async findMany(ids: readonly string[]): Promise<Map<string, MediaFile>> {
    const rows = await this.store.findManyByIds([...new Set(ids)]);
    return new Map(rows.map((row) => [row.id, toMediaFile(row)]));
  }

  /** Ids from `ids` that do not exist, for validating references before saving them. */
  async findMissing(ids: readonly string[]): Promise<string[]> {
    const found = await this.findMany(ids);
    return [...new Set(ids)].filter((id) => !found.has(id));
  }

  /** Copies a local file into media storage (used by content import); the source stays untouched. */
  async importFile(sourcePath: string, mimeType: string): Promise<MediaFile> {
    const tempPath = join(tmpdir(), `vitago-import-${randomUUID()}`);
    await copyFile(sourcePath, tempPath);
    const row = await this.service.ingest({
      tempPath,
      originalName: basename(sourcePath),
      mimeType,
    });
    return toMediaFile(row);
  }

  /**
   * The map marker of a photo, drawn by the server (see marker-image.ts).
   * Throws a 400 when the file is not a readable image.
   */
  async markerFrom(photoId: string): Promise<MediaFile> {
    return toMediaFile(await this.service.markerFrom(photoId));
  }

  /** Deletes the file and its bytes; an unknown id is not an error. */
  remove(id: string): Promise<void> {
    return this.service.remove(id);
  }
}
