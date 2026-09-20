import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SettingsFacade } from '../../settings';
import { KEPT_STATUSES, WalksStore } from '../walks.store';

/**
 * Generated walks pile up: every request for one writes a row. The ones
 * nobody kept are swept away once their time is up, and even the kept ones
 * are capped per user, so the table stays a working set rather than a log.
 */
@Injectable()
export class WalkLifecycleService {
  private readonly logger = new Logger(WalkLifecycleService.name);

  constructor(
    private readonly walks: WalksStore,
    private readonly settings: SettingsFacade,
  ) {}

  /** Walks nobody saved or paid for, past their day. Saved ones have no expiry. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async expire(): Promise<void> {
    const deleted = await this.walks.deleteExpired(new Date());
    if (deleted > 0) this.logger.log(`Deleted ${deleted} expired walks`);
  }

  /** Oldest walks above the per-user caps. */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async trim(): Promise<void> {
    const [maxActive, maxKept] = await Promise.all([
      this.settings.get('walks.maxActivePerUser'),
      this.settings.get('walks.maxKeptPerUser'),
    ]);
    const active = await this.walks.trimPerUser(['active'], maxActive);
    const kept = await this.walks.trimPerUser(KEPT_STATUSES, maxKept);
    if (active + kept > 0) {
      this.logger.log(`Trimmed ${active} unsaved and ${kept} kept walks over the limits`);
    }
  }
}
