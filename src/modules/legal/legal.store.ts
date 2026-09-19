import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../platform/database';
import {
  consents,
  legalDocuments,
  type legalDocumentType,
  legalDocumentVersions,
} from './legal.tables';

export type LegalDocumentRow = typeof legalDocuments.$inferSelect;
export type LegalDocumentVersionRow = typeof legalDocumentVersions.$inferSelect;
export type LegalDocumentType = (typeof legalDocumentType.enumValues)[number];

@Injectable()
export class LegalStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  listDocuments(appId: string): Promise<LegalDocumentRow[]> {
    return this.db
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.appId, appId))
      .orderBy(asc(legalDocuments.type));
  }

  async findDocument(id: string): Promise<LegalDocumentRow | null> {
    const [row] = await this.db.select().from(legalDocuments).where(eq(legalDocuments.id, id));
    return row ?? null;
  }

  async createDocument(document: typeof legalDocuments.$inferInsert): Promise<LegalDocumentRow> {
    const [row] = await this.db.insert(legalDocuments).values(document).returning();
    return row!;
  }

  async updateDocument(id: string, publicUrl: string | null): Promise<LegalDocumentRow | null> {
    const [row] = await this.db
      .update(legalDocuments)
      .set({ publicUrl })
      .where(eq(legalDocuments.id, id))
      .returning();
    return row ?? null;
  }

  async deleteDocument(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(legalDocuments)
      .where(eq(legalDocuments.id, id))
      .returning({ id: legalDocuments.id });
    return rows.length > 0;
  }

  /** All versions of the given documents, newest first. */
  listVersions(documentIds: readonly string[]): Promise<LegalDocumentVersionRow[]> {
    if (documentIds.length === 0) return Promise.resolve([]);
    return this.db
      .select()
      .from(legalDocumentVersions)
      .where(inArray(legalDocumentVersions.documentId, [...documentIds]))
      .orderBy(desc(legalDocumentVersions.publishedAt), desc(legalDocumentVersions.id));
  }

  async addVersion(
    version: typeof legalDocumentVersions.$inferInsert,
  ): Promise<LegalDocumentVersionRow> {
    const [row] = await this.db.insert(legalDocumentVersions).values(version).returning();
    return row!;
  }

  /** Version ids among `versionIds` the user has accepted. */
  async acceptedVersionIds(userId: string, versionIds: readonly string[]): Promise<Set<string>> {
    if (versionIds.length === 0) return new Set();
    const rows = await this.db
      .select({ versionId: consents.versionId })
      .from(consents)
      .where(and(eq(consents.userId, userId), inArray(consents.versionId, [...versionIds])));
    return new Set(rows.map((row) => row.versionId));
  }

  async accept(userId: string, versionIds: readonly string[]): Promise<void> {
    if (versionIds.length === 0) return;
    await this.db
      .insert(consents)
      .values(versionIds.map((versionId) => ({ userId, versionId })))
      .onConflictDoNothing();
  }

  async deleteConsents(userId: string): Promise<void> {
    await this.db.delete(consents).where(eq(consents.userId, userId));
  }
}
