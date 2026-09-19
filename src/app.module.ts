import { Module } from '@nestjs/common';
import { ConfigModule } from './platform/config';

@Module({
  imports: [ConfigModule],
})
export class AppModule {}
