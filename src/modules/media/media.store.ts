import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, like, lt, or, type SQL } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../platform/database';
import { files } from './media.tables';

export type FileRow = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;

export interface ListFilesQuery {
  limit: number;
  /** Only files whose MIME type starts with this, e.g. `audio/`. */
  mimePrefix?: string;
  /** Continue after this file (keyset pagination by created_at, id). */
  after?: Pick<FileRow, 'id' | 'createdAt'>;
}

@Injectable()
export class MediaStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  async findById(id: string): Promise<FileRow | null> {
    const [row] = await this.db.select().from(files).where(eq(files.id, id));
    return row ?? null;
  }

  async findManyByIds(ids: readonly string[]): Promise<FileRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(files)
      .where(inArray(files.id, [...ids]));
  }

  async findByKey(storageKey: string): Promise<FileRow | null> {
    const [row] = await this.db.select().from(files).where(eq(files.storageKey, storageKey));
    return row ?? null;
  }

  async insert(file: NewFile): Promise<FileRow> {
    const [row] = await this.db.insert(files).values(file).returning();
    return row!;
  }

  async list({ limit, mimePrefix, after }: ListFilesQuery): Promise<FileRow[]> {
    const filters: SQL[] = [];
    if (mimePrefix) filters.push(like(files.mimeType, `${mimePrefix}%`));
    if (after) {
      filters.push(
        or(
          lt(files.createdAt, after.createdAt),
          and(eq(files.createdAt, after.createdAt), lt(files.id, after.id)),
        )!,
      );
    }
    return this.db
      .select()
      .from(files)
      .where(and(...filters))
      .orderBy(desc(files.createdAt), desc(files.id))
      .limit(limit);
  }

  async delete(id: string): Promise<FileRow | null> {
    const [row] = await this.db.delete(files).where(eq(files.id, id)).returning();
    return row ?? null;
  }
}
