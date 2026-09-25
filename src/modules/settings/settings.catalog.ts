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
const seconds = (min: number, max: number) => z.number().int().min(min).max(max);

/**
 * Price of unlocking a generated walk. `per_point` multiplies the number of
 * locked points and clamps to the min and max; `tiered` takes the first tier
 * whose `upToPoints` is not exceeded (`null` is the last, open-ended one);
 * `fixed` always charges the minimum.
 */
type WalkPricingMode = 'per_point' | 'tiered' | 'fixed';
const walkPricingMode = z.enum(['per_point', 'tiered', 'fixed']);

const walkPricingTiers = z.array(
  z.object({
    upToPoints: z.number().int().positive().nullable(),
    priceKopecks: z.number().int().min(0),
  }),
);

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
  'points.nearbyRadiusMeters': define({
    description:
      'How far from the user a point still counts as “near you” on the home screen, in metres. The app may ask for less, never for more.',
    schema: z.number().int().min(100).max(10_000),
    default: 1000,
    public: false,
  }),
  'points.nearbyMaxPoints': define({
    description:
      'Most points the “near you” list returns, nearest first. The app may ask for fewer, never for more.',
    schema: z.number().int().min(1).max(50),
    default: 15,
    public: false,
  }),
  'walks.defaultVisitSeconds': define({
    description:
      'Time counted for a point of a generated walk without narration: looking at it takes a while too.',
    schema: seconds(0, 3600),
    default: 180,
    public: false,
  }),
  'walks.pointOverheadSeconds': define({
    description:
      'Added to every point of a generated walk on top of its narration: approaching it, stopping, looking around.',
    schema: seconds(0, 3600),
    default: 60,
    public: false,
  }),
  'walks.candidateSpeedMps': define({
    description:
      'Walking speed used only to guess how far a walk can reach while picking candidates. The time of the route itself always comes from the routing engine.',
    schema: z.number().min(0.5).max(3),
    default: 1.3,
    public: false,
  }),
  'walks.maxCandidates': define({
    description:
      'How many points a generated walk chooses from. With the start and the end this must stay under the routing engine matrix limit (2500 location pairs).',
    schema: z.number().int().min(5).max(48),
    default: 45,
    public: false,
  }),
  'walks.maxPasses': define({
    description: 'How many times a generated walk is improved and refilled before it is answered.',
    schema: z.number().int().min(1).max(10),
    default: 3,
    public: false,
  }),
  'walks.budgetTolerance': define({
    description:
      'How far over the requested time a generated walk may end up before a point is dropped, as a share of it. 0.1 means 10 %.',
    schema: z.number().min(0).max(1),
    default: 0.1,
    public: false,
  }),
  'walks.defaultTtlDays': define({
    description:
      'How long a generated walk that was neither saved nor paid for is kept before the nightly job deletes it.',
    schema: z.number().int().min(1).max(365),
    default: 7,
    public: false,
  }),
  'walks.maxActivePerUser': define({
    description: 'How many unsaved walks one user keeps; the oldest above this are deleted.',
    schema: z.number().int().min(1).max(1000),
    default: 30,
    public: false,
  }),
  'walks.maxKeptPerUser': define({
    description: 'How many saved and paid walks one user keeps; the oldest above this are deleted.',
    schema: z.number().int().min(1).max(1000),
    default: 100,
    public: false,
  }),
  'walks.generationsPerHour': define({
    description: 'How many walks one user may generate in an hour.',
    schema: z.number().int().min(1).max(1000),
    default: 10,
    public: false,
  }),
  'walks.pricing.mode': define<WalkPricingMode>({
    description: 'How the price of unlocking a generated walk is calculated.',
    schema: walkPricingMode,
    default: 'tiered',
    public: false,
  }),
  'walks.pricing.perPointKopecks': define({
    description: 'Price of one locked point in the per_point mode.',
    schema: z.number().int().min(0),
    default: 1500,
    public: false,
  }),
  'walks.pricing.minKopecks': define({
    description:
      'Lowest price of unlocking a walk; also the whole price in the fixed mode. Below the smallest amount the bank accepts nothing can be sold.',
    schema: z.number().int().min(100),
    default: 9900,
    public: false,
  }),
  'walks.pricing.maxKopecks': define({
    description: 'Highest price of unlocking a walk, whatever the number of points.',
    schema: z.number().int().min(100),
    default: 49900,
    public: false,
  }),
  'walks.pricing.tiers': define({
    description:
      'Price steps by number of locked points, used in the tiered mode. The last tier has upToPoints null and covers everything above.',
    schema: walkPricingTiers,
    default: [
      { upToPoints: 3, priceKopecks: 9900 },
      { upToPoints: 7, priceKopecks: 19900 },
      { upToPoints: 15, priceKopecks: 29900 },
      { upToPoints: null, priceKopecks: 39900 },
    ] as z.infer<typeof walkPricingTiers>,
    public: false,
  }),
} as const satisfies Record<string, SettingDefinition<unknown>>;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}
