import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { legalDocumentType } from '../legal.tables';
import { type LegalDocumentVersionRow } from '../legal.store';
import {
  type ConsentStatus,
  type CurrentDocument,
  type DocumentWithVersions,
} from '../legal.service';

const documentTypeSchema = z.enum(legalDocumentType.enumValues);

export const currentDocumentSchema = z.object({
  documentId: z.uuid(),
  type: documentTypeSchema,
  /** Web page with the readable text. */
  publicUrl: z.string().nullable(),
  versionId: z.uuid(),
  publishedAt: z.iso.datetime(),
  /** Download path of the PDF, or null if the file was removed. */
  fileUrl: z.string().nullable(),
});

export class CurrentDocumentListDto extends createZodDto(
  z.object({ items: z.array(currentDocumentSchema) }),
) {}

export class ConsentStatusDto extends createZodDto(
  z.object({
    needsConsent: z.boolean(),
    isUpdate: z.boolean(),
    documents: z.array(currentDocumentSchema),
  }),
) {}

export class AcceptConsentDto extends createZodDto(
  z.object({ versionIds: z.array(z.uuid()).min(1).max(10) }),
) {}

export const toCurrentDocument = (document: CurrentDocument) => ({
  documentId: document.documentId,
  type: document.type,
  publicUrl: document.publicUrl,
  versionId: document.versionId,
  publishedAt: document.publishedAt.toISOString(),
  fileUrl: document.file?.url ?? null,
});

export const toConsentStatus = (status: ConsentStatus) => ({
  needsConsent: status.needsConsent,
  isUpdate: status.isUpdate,
  documents: status.documents.map(toCurrentDocument),
});

// ---- Admin ----

const versionSchema = z.object({
  id: z.uuid(),
  fileId: z.uuid(),
  requiresReconsent: z.boolean(),
  publishedAt: z.iso.datetime(),
});

const adminDocumentSchema = z.object({
  id: z.uuid(),
  appId: z.uuid(),
  type: documentTypeSchema,
  publicUrl: z.string().nullable(),
  /** Newest first; the first one is current. */
  versions: z.array(versionSchema),
});

export class AdminDocumentDto extends createZodDto(adminDocumentSchema) {}
export class AdminDocumentListDto extends createZodDto(
  z.object({ items: z.array(adminDocumentSchema) }),
) {}
export class AdminDocumentVersionDto extends createZodDto(versionSchema) {}

export class ListDocumentsQueryDto extends createZodDto(z.object({ appId: z.uuid() })) {}

export class CreateDocumentDto extends createZodDto(
  z.object({
    appId: z.uuid(),
    type: documentTypeSchema,
    publicUrl: z.url().max(500).nullable().default(null),
  }),
) {}

export class UpdateDocumentDto extends createZodDto(
  z.object({ publicUrl: z.url().max(500).nullable() }),
) {}

export class PublishVersionDto extends createZodDto(
  z.object({
    /** An uploaded PDF. */
    fileId: z.uuid(),
    /** Substantial change: everyone who accepted an earlier version must accept again. */
    requiresReconsent: z.boolean(),
  }),
) {}

export const toAdminVersion = (version: LegalDocumentVersionRow) => ({
  id: version.id,
  fileId: version.fileId,
  requiresReconsent: version.requiresReconsent,
  publishedAt: version.publishedAt.toISOString(),
});

export const toAdminDocument = ({ document, versions }: DocumentWithVersions) => ({
  id: document.id,
  appId: document.appId,
  type: document.type,
  publicUrl: document.publicUrl,
  versions: versions.map(toAdminVersion),
});
