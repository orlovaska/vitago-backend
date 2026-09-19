import { Injectable } from '@nestjs/common';
import { type SettingKey, type SettingValue } from './settings.catalog';
import { SettingsService } from './settings.service';

/** What other modules may ask of `settings`. */
@Injectable()
export class SettingsFacade {
  constructor(private readonly settings: SettingsService) {}

  get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    return this.settings.get(key);
  }

  /** Settings the mobile app receives in its configuration, keyed by setting key. */
  async getPublic(): Promise<Record<string, unknown>> {
    const all = await this.settings.list();
    return Object.fromEntries(all.filter((s) => s.public).map((s) => [s.key, s.value]));
  }
}
