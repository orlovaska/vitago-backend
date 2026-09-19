import { Injectable } from '@nestjs/common';
import { AppDirectory } from '../../platform/app-context';
import { isUniqueViolation } from '../../platform/database';
import { AppError } from '../../platform/http';
import { type MediaFile, MediaFacade } from '../media';
import {
  type LegalDocumentRow,
  type LegalDocumentType,
  type LegalDocumentVersionRow,
  LegalStore,
} from './legal.store';

export interface CurrentDocument {
  documentId: string;
  type: LegalDocumentType;
  publicUrl: string | null;
  versionId: string;
  publishedAt: Date;
  file: MediaFile | null;
}

export interface ConsentStatus {
  /** The user must accept `documents` before using the app. */
  needsConsent: boolean;
  /** The user accepted earlier versions: show "the terms have changed" rather than a first-run screen. */
  isUpdate: boolean;
  documents: CurrentDocument[];
}

export interface DocumentWithVersions {
  document: LegalDocumentRow;
  versions: LegalDocumentVersionRow[];
}

@Injectable()
export class LegalService {
  constructor(
    private readonly store: LegalStore,
    private readonly media: MediaFacade,
    private readonly apps: AppDirectory,
  ) {}

  /** The latest published version of each of the app's documents. */
  async currentDocuments(appId: string): Promise<CurrentDocument[]> {
    const { current } = await this.load(appId);
    const files = await this.media.findMany(current.map(({ version }) => version.fileId));
    return current.map(({ document, version }) => ({
      documentId: document.id,
      type: document.type,
      publicUrl: document.publicUrl,
      versionId: version.id,
      publishedAt: version.publishedAt,
      file: files.get(version.fileId) ?? null,
    }));
  }

  async consentStatus(userId: string, appId: string): Promise<ConsentStatus> {
    const { current, versionsByDocument } = await this.load(appId);
    const allVersionIds = [...versionsByDocument.values()].flat().map((version) => version.id);
    const accepted = await this.store.acceptedVersionIds(userId, allVersionIds);

    let needsConsent = false;
    let isUpdate = false;
    for (const { document, version } of current) {
      if (accepted.has(version.id)) continue;
      const history = versionsByDocument.get(document.id) ?? [];
      // Newest first: the versions published after the last one this user accepted.
      const lastAcceptedIndex = history.findIndex((candidate) => accepted.has(candidate.id));
      if (lastAcceptedIndex === -1) {
        needsConsent = true;
        continue;
      }
      if (history.slice(0, lastAcceptedIndex).some((newer) => newer.requiresReconsent)) {
        needsConsent = true;
        isUpdate = true;
      }
    }
    return { needsConsent, isUpdate, documents: await this.currentDocuments(appId) };
  }

  /** Accepts current versions only: consenting to a superseded text means nothing. */
  async accept(
    userId: string,
    appId: string,
    versionIds: readonly string[],
  ): Promise<ConsentStatus> {
    const { current } = await this.load(appId);
    const currentIds = new Set(current.map(({ version }) => version.id));
    const stale = versionIds.filter((id) => !currentIds.has(id));
    if (stale.length > 0) {
      throw AppError.conflict(
        'not_current_version',
        `Not the current version of this app's documents: ${stale.join(', ')}`,
      );
    }
    await this.store.accept(userId, versionIds);
    return this.consentStatus(userId, appId);
  }

  // ---- Administration ----

  async listDocuments(appId: string): Promise<DocumentWithVersions[]> {
    const documents = await this.store.listDocuments(appId);
    const versions = await this.store.listVersions(documents.map((document) => document.id));
    return documents.map((document) => ({
      document,
      versions: versions.filter((version) => version.documentId === document.id),
    }));
  }

  async createDocument(
    appId: string,
    type: LegalDocumentType,
    publicUrl: string | null,
  ): Promise<LegalDocumentRow> {
    if (!(await this.apps.findById(appId))) {
      throw AppError.badRequest('app_not_found', `App ${appId} not found`);
    }
    try {
      return await this.store.createDocument({ appId, type, publicUrl });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('document_exists', `The app already has a ${type} document`);
      }
      throw error;
    }
  }

  async updateDocument(id: string, publicUrl: string | null): Promise<LegalDocumentRow> {
    const document = await this.store.updateDocument(id, publicUrl);
    if (!document) throw AppError.notFound('document_not_found', `Document ${id} not found`);
    return document;
  }

  async deleteDocument(id: string): Promise<void> {
    if (!(await this.store.deleteDocument(id))) {
      throw AppError.notFound('document_not_found', `Document ${id} not found`);
    }
  }

  async publishVersion(
    documentId: string,
    fileId: string,
    requiresReconsent: boolean,
  ): Promise<LegalDocumentVersionRow> {
    if (!(await this.store.findDocument(documentId))) {
      throw AppError.notFound('document_not_found', `Document ${documentId} not found`);
    }
    const file = (await this.media.findMany([fileId])).get(fileId);
    if (file?.mimeType !== 'application/pdf') {
      throw AppError.badRequest('pdf_required', 'The version must reference an uploaded PDF');
    }
    return this.store.addVersion({ documentId, fileId, requiresReconsent });
  }

  deleteUserData(userId: string): Promise<void> {
    return this.store.deleteConsents(userId);
  }

  private async load(appId: string) {
    const documents = await this.store.listDocuments(appId);
    const versions = await this.store.listVersions(documents.map((document) => document.id));
    const versionsByDocument = new Map<string, LegalDocumentVersionRow[]>();
    for (const version of versions) {
      versionsByDocument.set(version.documentId, [
        ...(versionsByDocument.get(version.documentId) ?? []),
        version,
      ]);
    }
    const current = documents.flatMap((document) => {
      const latest = versionsByDocument.get(document.id)?.[0];
      return latest ? [{ document, version: latest }] : [];
    });
    return { current, versionsByDocument };
  }
}
