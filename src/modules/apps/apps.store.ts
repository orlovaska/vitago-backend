import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../platform/database';
import { apps, appVersions, type store, userAppVersions } from './apps.tables';

export type AppRow = typeof apps.$inferSelect;
export type AppInput = Omit<typeof apps.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;
export type AppVersionRow = typeof appVersions.$inferSelect;
export type Store = (typeof store.enumValues)[number];

@Injectable()
export class AppsStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  list(): Promise<AppRow[]> {
    return this.db.select().from(apps).orderBy(asc(apps.name));
  }

  async findById(id: string): Promise<AppRow | null> {
    const [row] = await this.db.select().from(apps).where(eq(apps.id, id));
    return row ?? null;
  }

  async findByBundleId(bundleId: string): Promise<AppRow | null> {
    const [row] = await this.db.select().from(apps).where(eq(apps.bundleId, bundleId));
    return row ?? null;
  }

  async findBySlug(slug: string): Promise<AppRow | null> {
    const [row] = await this.db.select().from(apps).where(eq(apps.slug, slug));
    return row ?? null;
  }

  async create(input: AppInput): Promise<AppRow> {
    const [row] = await this.db.insert(apps).values(input).returning();
    return row!;
  }

  async update(id: string, input: Partial<AppInput>): Promise<AppRow | null> {
    const [row] = await this.db.update(apps).set(input).where(eq(apps.id, id)).returning();
    return row ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db.delete(apps).where(eq(apps.id, id)).returning({ id: apps.id });
    return rows.length > 0;
  }

  listVersions(appId: string): Promise<AppVersionRow[]> {
    return this.db
      .select()
      .from(appVersions)
      .where(eq(appVersions.appId, appId))
      .orderBy(asc(appVersions.releasedAt));
  }

  async addVersion(version: typeof appVersions.$inferInsert): Promise<AppVersionRow> {
    const [row] = await this.db.insert(appVersions).values(version).returning();
    return row!;
  }

  async deleteVersion(appId: string, versionId: string): Promise<boolean> {
    const rows = await this.db
      .delete(appVersions)
      .where(and(eq(appVersions.appId, appId), eq(appVersions.id, versionId)))
      .returning({ id: appVersions.id });
    return rows.length > 0;
  }

  async reportUserVersion(
    userId: string,
    appId: string,
    store: Store,
    version: string,
  ): Promise<void> {
    await this.db
      .insert(userAppVersions)
      .values({ userId, appId, store, version })
      .onConflictDoUpdate({
        target: [userAppVersions.userId, userAppVersions.appId],
        set: { store, version, updatedAt: new Date() },
      });
  }

  async deleteUserVersions(userId: string): Promise<void> {
    await this.db.delete(userAppVersions).where(eq(userAppVersions.userId, userId));
  }
}
