import { Module } from '@nestjs/common';
import { ConfigModule } from './platform/config';
import { DatabaseModule } from './platform/database';
import { LoggingModule } from './platform/logging';

@Module({
  imports: [ConfigModule, LoggingModule, DatabaseModule],
})
export class AppModule {}
