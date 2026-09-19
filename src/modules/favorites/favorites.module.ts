import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { ToursModule } from '../tours';
import { FavoritesFacade } from './favorites.facade';
import { FavoritesService } from './favorites.service';
import { FavoritesStore } from './favorites.store';
import { FavoritesController } from './http/favorites.controller';

/** Tours and points a user saved. */
@Module({
  imports: [AuthModule, ToursModule],
  controllers: [FavoritesController],
  providers: [FavoritesStore, FavoritesService, FavoritesFacade],
  exports: [FavoritesFacade],
})
export class FavoritesModule {}
