import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth';
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
    // Business modules
    AuthModule,
  ],
})
export class AppModule {}
