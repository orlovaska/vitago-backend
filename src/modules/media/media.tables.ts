import { bigint, index, pgSchema, text } from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from '../../platform/database';

export const mediaSchema = pgSchema('media');

/** Uploaded files are immutable: a changed image or recording is a new file with a new id. */
export const files = mediaSchema.table(
  'files',
  {
    id: primaryId(),
    /** Location inside the storage backend, e.g. `2026/09/<id>.mp3`. */
    storageKey: text().notNull().unique(),
    originalName: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    /** Hex SHA-256 of the content: the ETag, and the key for skipping duplicate uploads. */
    sha256: text().notNull(),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.sha256), index().on(table.createdAt)],
);
