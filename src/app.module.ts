import { Module } from '@nestjs/common';
import { ConfigModule } from './platform/config';
import { DatabaseModule } from './platform/database';
import { HealthModule } from './platform/health';
import { LoggingModule } from './platform/logging';

@Module({
  imports: [ConfigModule, LoggingModule, DatabaseModule, HealthModule],
})
export class AppModule {}
