import { Injectable } from '@nestjs/common';
import { FavoritesStore } from './favorites.store';

/** What other modules may ask of `favorites`. */
@Injectable()
export class FavoritesFacade {
  constructor(private readonly store: FavoritesStore) {}

  /** Account deletion step: removes every favorite of the user. Idempotent. */
  deleteUserData(userId: string): Promise<void> {
    return this.store.deleteAll(userId);
  }
}
