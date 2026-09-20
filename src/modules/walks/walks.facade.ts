import { Injectable } from '@nestjs/common';
import { WalksService } from './services/walks.service';

/** What other modules may ask of `walks`. */
@Injectable()
export class WalksFacade {
  constructor(private readonly walks: WalksService) {}

  /**
   * Account deletion step. A walk is personal, so it goes with the user; what
   * was paid for is kept by the payments module, which forgets it separately.
   */
  deleteUserData(userId: string): Promise<void> {
    return this.walks.deleteUserData(userId);
  }
}
