import { Injectable } from '@nestjs/common';
import { type CurrentDocument, LegalService } from './legal.service';

/** What other modules may ask of `legal`. */
@Injectable()
export class LegalFacade {
  constructor(private readonly legal: LegalService) {}

  currentDocuments(appId: string): Promise<CurrentDocument[]> {
    return this.legal.currentDocuments(appId);
  }

  /** Account deletion step: removes the user's consents. Idempotent. */
  deleteUserData(userId: string): Promise<void> {
    return this.legal.deleteUserData(userId);
  }
}
