import { Module } from '@nestjs/common';
import { ConfigModule } from './platform/config';
import { LoggingModule } from './platform/logging';

@Module({
  imports: [ConfigModule, LoggingModule],
})
export class AppModule {}
