import { Module } from '@nestjs/common';
import { ConfigModule } from './platform/config';
import { DatabaseModule } from './platform/database';
import { HealthModule } from './platform/health';
import { HttpModule } from './platform/http';
import { LoggingModule } from './platform/logging';

@Module({
  imports: [ConfigModule, LoggingModule, DatabaseModule, HttpModule, HealthModule],
})
export class AppModule {}
