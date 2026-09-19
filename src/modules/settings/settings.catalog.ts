import { z } from 'zod';

interface SettingDefinition<T> {
  description: string;
  schema: z.ZodType<T>;
  default: T;
  /** Sent to the mobile app in its configuration; otherwise server-only. */
  public: boolean;
}

const define = <T>(definition: SettingDefinition<T>) => definition;

const milliseconds = (min: number) => z.number().int().min(min);

/**
 * Every setting that can be changed without a release. Values are validated
 * against the schema on write, so a typo cannot, say, make clients poll
 * without pauses.
 */
export const SETTINGS = {
  'payments.clientPollIntervalMs': define({
    description:
      'Pause between the app’s payment status requests. 0 means a single check without polling.',
    schema: z.union([z.literal(0), milliseconds(1000)]),
    default: 5000,
    public: true,
  }),
  'payments.clientPollWindowMs': define({
    description:
      'How long the app keeps polling before it shows “payment is being processed”. 0 means one request.',
    schema: milliseconds(0),
    default: 120_000,
    public: true,
  }),
  'payments.bankCheckIntervalMs': define({
    description: 'Minimum gap between the server’s own status checks with the bank for one order.',
    schema: milliseconds(5000),
    default: 15_000,
    public: false,
  }),
  'payments.bankCheckMaxAttempts': define({
    description: 'Maximum number of server-side status checks with the bank per order.',
    schema: z.number().int().min(0).max(1000),
    default: 20,
    public: false,
  }),
  'payments.bankCheckMaxAgeMs': define({
    description:
      'Orders older than this are no longer checked with the bank; the bank notification still arrives.',
    schema: milliseconds(60_000),
    default: 1_800_000,
    public: false,
  }),
} as const satisfies Record<string, SettingDefinition<unknown>>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}
