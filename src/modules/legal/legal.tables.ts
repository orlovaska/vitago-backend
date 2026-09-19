import { boolean, index, pgSchema, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from '../../platform/database';

export const legalSchema = pgSchema('legal');

export const legalDocumentType = legalSchema.enum('legal_document_type', ['terms', 'privacy']);

/** One terms of use and one privacy policy per city app. */
export const legalDocuments = legalSchema.table(
  'legal_documents',
  {
    id: primaryId(),
    /** Owning app (apps module); no foreign key across schemas. */
    appId: uuid().notNull(),
    type: legalDocumentType().notNull(),
    /** Web page where the current text is readable, linked from the app. */
    publicUrl: text(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.appId, table.type)],
);

/** Published texts of a document; the latest one is current. */
export const legalDocumentVersions = legalSchema.table(
  'legal_document_versions',
  {
    id: primaryId(),
    documentId: uuid()
      .notNull()
      .references(() => legalDocuments.id, { onDelete: 'cascade' }),
    /** PDF in the media module. */
    fileId: uuid().notNull(),
    /**
     * A substantial change: users who accepted an earlier version must accept
     * again. Editorial fixes leave it false and earlier consent still counts.
     */
    requiresReconsent: boolean().notNull(),
    publishedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.documentId, table.publishedAt)],
);

export const consents = legalSchema.table(
  'consents',
  {
    id: primaryId(),
    userId: uuid().notNull(),
    versionId: uuid()
      .notNull()
      .references(() => legalDocumentVersions.id, { onDelete: 'cascade' }),
    acceptedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.versionId), index().on(table.userId)],
);
