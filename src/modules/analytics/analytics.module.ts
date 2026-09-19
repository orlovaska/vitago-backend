import { Module } from '@nestjs/common';
import { AppsModule } from '../apps';
import { RevenueReporter } from './revenue-reporter';

/** Reports business events to external analytics. Listens only; nothing depends on it. */
@Module({
  imports: [AppsModule],
  providers: [RevenueReporter],
})
export class AnalyticsModule {}
