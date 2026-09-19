import { Injectable } from '@nestjs/common';
import { ReviewsService } from './reviews.service';

/** What other modules may ask of `reviews`. */
@Injectable()
export class ReviewsFacade {
  constructor(private readonly reviews: ReviewsService) {}

  /** Account deletion step: removes the user's reviews. Idempotent. */
  deleteUserData(userId: string): Promise<void> {
    return this.reviews.deleteUserData(userId);
  }
}
