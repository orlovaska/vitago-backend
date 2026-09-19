import { Module } from '@nestjs/common';
import { AuthModule } from '../auth';
import { LogsAdminController } from './http/logs-admin.controller';
import { LogsService } from './logs.service';

/** Log files and the log level, for the admin. Owns no tables. */
@Module({
  imports: [AuthModule],
  controllers: [LogsAdminController],
  providers: [LogsService],
})
export class LogsModule {}
