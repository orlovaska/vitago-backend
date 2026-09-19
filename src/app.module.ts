import { Module } from '@nestjs/common';
import { AppsDirectory, AppsModule } from './modules/apps';
import { AuthModule } from './modules/auth';
import { FavoritesModule } from './modules/favorites';
import { LegalModule } from './modules/legal';
import { MediaModule } from './modules/media';
import { ReviewsModule } from './modules/reviews';
import { SettingsModule } from './modules/settings';
import { ToursModule } from './modules/tours';
import { AppContextModule } from './platform/app-context';
import { ConfigModule } from './platform/config';
import { DatabaseModule } from './platform/database';
import { HealthModule } from './platform/health';
import { HttpModule } from './platform/http';
import { LoggingModule } from './platform/logging';

@Module({
  imports: [
    // Platform
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    HttpModule,
    HealthModule,
    // Ports implemented by modules
    AppContextModule.forRoot({ imports: [AppsModule], directory: AppsDirectory }),
    // Business modules
    AuthModule,
    MediaModule,
    SettingsModule,
    AppsModule,
    LegalModule,
    ToursModule,
    FavoritesModule,
    ReviewsModule,
  ],
})
export class AppModule {}
