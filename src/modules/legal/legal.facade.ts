import { Injectable } from '@nestjs/common';
import { type LegalDocumentType } from './legal.store';
import { type CurrentDocument, LegalService } from './legal.service';

/** What other modules may ask of `legal`. */
@Injectable()
export class LegalFacade {
  constructor(private readonly legal: LegalService) {}

  currentDocuments(appId: string): Promise<CurrentDocument[]> {
    return this.legal.currentDocuments(appId);
  }

  /**
   * Content import: creates the document if the app has none of that type,
   * keeps its public link up to date, and publishes the text as the current
   * version.
   *
   * The same file does not become a second version. Media storage is
   * content-addressed, so an unchanged PDF always yields the same id, and an
   * extra version would void consent people have already given: with
   * requiresReconsent every routine import would ask everyone again.
   */
  async publishDocument(input: {
    appId: string;
    type: LegalDocumentType;
    publicUrl: string | null;
    fileId: string;
    requiresReconsent: boolean;
  }): Promise<{ published: boolean }> {
    const existing = (await this.legal.listDocuments(input.appId)).find(
      ({ document }) => document.type === input.type,
    );
    const document = existing
      ? await this.legal.updateDocument(existing.document.id, input.publicUrl)
      : await this.legal.createDocument(input.appId, input.type, input.publicUrl);

    // Versions come newest first, so the current one heads the list.
    if (existing?.versions[0]?.fileId === input.fileId) {
      return { published: false };
    }
    await this.legal.publishVersion(document.id, input.fileId, input.requiresReconsent);
    return { published: true };
  }

  /** Account deletion step: removes the user's consents. Idempotent. */
  deleteUserData(userId: string): Promise<void> {
    return this.legal.deleteUserData(userId);
  }
}
