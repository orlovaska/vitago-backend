import { randomUUID } from 'node:crypto';
import { copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { API_PREFIX } from '../../platform/http';
import { MediaService } from './media.service';
import { MediaStore } from './media.store';

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
    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          durationSeconds: row.durationSeconds,
          url: mediaUrl(row.id),
        },
      ]),
    );
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
    return {
      id: row.id,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      durationSeconds: row.durationSeconds,
      url: mediaUrl(row.id),
    };
  }
}
