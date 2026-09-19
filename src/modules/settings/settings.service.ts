import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../platform/database';
import { AppError } from '../../platform/http';
import {
  isSettingKey,
  SETTING_KEYS,
  SETTINGS,
  type SettingKey,
  type SettingValue,
} from './settings.catalog';
import { settings } from './settings.tables';

export interface SettingState {
  key: SettingKey;
  description: string;
  public: boolean;
  value: unknown;
  defaultValue: unknown;
  overridden: boolean;
  updatedAt: Date | null;
}

type Override = { value: unknown; updatedAt: Date };

/**
 * Reads are served from memory: the API runs as one process and every write
 * goes through here, so invalidating on write keeps the cache exact.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache: Promise<Map<SettingKey, Override>> | null = null;

  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const override = (await this.overrides()).get(key);
    return (override ? override.value : SETTINGS[key].default) as SettingValue<K>;
  }

  async list(): Promise<SettingState[]> {
    const overrides = await this.overrides();
    return SETTING_KEYS.map((key) => {
      const override = overrides.get(key);
      return {
        key,
        description: SETTINGS[key].description,
        public: SETTINGS[key].public,
        value: override ? override.value : SETTINGS[key].default,
        defaultValue: SETTINGS[key].default,
        overridden: override !== undefined,
        updatedAt: override?.updatedAt ?? null,
      };
    });
  }

  async set(key: string, value: unknown, adminId: string): Promise<void> {
    const settingKey = this.assertKey(key);
    const parsed = SETTINGS[settingKey].schema.safeParse(value);
    if (!parsed.success) {
      throw AppError.badRequest(
        'invalid_setting_value',
        `${key}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
      );
    }
    const row = { key: settingKey, value: parsed.data, updatedAt: new Date(), updatedBy: adminId };
    await this.txHost.tx
      .insert(settings)
      .values(row)
      .onConflictDoUpdate({ target: settings.key, set: row });
    this.cache = null;
  }

  async reset(key: string): Promise<void> {
    await this.txHost.tx.delete(settings).where(eq(settings.key, this.assertKey(key)));
    this.cache = null;
  }

  private assertKey(key: string): SettingKey {
    if (!isSettingKey(key)) throw AppError.notFound('unknown_setting', `No setting "${key}"`);
    return key;
  }

  private overrides(): Promise<Map<SettingKey, Override>> {
    this.cache ??= this.load().catch((error: unknown) => {
      this.cache = null;
      throw error;
    });
    return this.cache;
  }

  private async load(): Promise<Map<SettingKey, Override>> {
    const rows = await this.txHost.tx.select().from(settings);
    const result = new Map<SettingKey, Override>();
    for (const row of rows) {
      // A stored value that no longer fits the catalog (key removed, schema
      // tightened) falls back to the default instead of breaking callers.
      if (!isSettingKey(row.key) || !SETTINGS[row.key].schema.safeParse(row.value).success) {
        this.logger.warn(`Ignoring stored setting ${row.key}: not valid for the current catalog`);
        continue;
      }
      result.set(row.key, { value: row.value, updatedAt: row.updatedAt });
    }
    return result;
  }
}
