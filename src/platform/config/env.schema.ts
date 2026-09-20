import { z } from 'zod';

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** A JSON object in one variable, keyed by app slug; `example` is shown when it does not parse. */
const jsonBySlug = <Value extends z.ZodType>(value: Value, example: string) =>
  z
    .string()
    .default('{}')
    .transform((raw, context) => {
      const parsed = z.record(z.string(), value).safeParse(safeJson(raw));
      if (!parsed.success) {
        context.addIssue({ code: 'custom', message: `Expected ${example}` });
        return z.NEVER;
      }
      return parsed.data;
    });

const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);

/** Area whose OpenStreetMap data goes into the routing graph, and the extract it is cut from. */
const routingRegion = z.object({
  sourcePbfUrl: z.url(),
  bbox: z
    .object({ minLon: longitude, minLat: latitude, maxLon: longitude, maxLat: latitude })
    .refine((box) => box.minLon < box.maxLon && box.minLat < box.maxLat, {
      message: 'minLon and minLat must be less than maxLon and maxLat',
    }),
});

const commaList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

/**
 * Every environment variable the application reads.
 * New variables are added here, never read from process.env directly.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Browser origins allowed in development only; production never sends CORS headers. */
  CORS_ORIGINS: commaList,
  /** Interactive docs at /v1/docs; off in production unless enabled explicitly. */
  OPENAPI_DOCS: booleanFlag.optional(),

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).default(10),

  /** Signs access tokens of the mobile app. Changing it signs every device out once. */
  USER_JWT_SECRET: z.string().min(32),
  /** Signs admin tokens; distinct from USER_JWT_SECRET so an app token never opens the admin API. */
  ADMIN_JWT_SECRET: z.string().min(32),
  USER_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
  ADMIN_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(43_200),
  /** HMAC key for device secrets. Changing it detaches every device from its account. */
  DEVICE_SECRET_PEPPER: z.string().min(32),

  /** Root directory of uploaded files (a Docker volume in production). */
  MEDIA_DIR: z.string().min(1).default('storage/media'),
  MEDIA_MAX_UPLOAD_MB: z.coerce.number().int().min(1).default(100),

  TBANK_API_URL: z.url().default('https://securepay.tinkoff.ru/v2'),
  /**
   * Acquiring terminals by app slug, as JSON:
   * {"spb":{"terminalKey":"…","password":"…"}}. Passwords sign every request
   * and must never reach the app.
   */
  TBANK_TERMINALS: jsonBySlug(
    z.object({ terminalKey: z.string().min(1), password: z.string().min(1) }),
    '{"<slug>":{"terminalKey":"…","password":"…"}}',
  ),
  /** Tax system printed on receipts (54-FZ), e.g. usn_income. */
  TBANK_TAXATION: z
    .enum(['osn', 'usn_income', 'usn_income_outcome', 'esn', 'patent'])
    .default('usn_income'),
  /** Public URL of POST /v1/payments/tbank/notifications, registered with each order. */
  PAYMENT_NOTIFICATION_URL: z.url().optional(),
  /** Site with the payment result page: <base>/app/<slug>/payment-result. */
  PAYMENT_RETURN_BASE_URL: z.url().default('https://vitagoguides.ru'),
  /** Lifetime of a payment link; unpaid orders expire after it. */
  PAYMENT_ORDER_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(60),

  APPMETRICA_API_URL: z.url().default('https://api.appmetrica.yandex.ru'),
  /**
   * AppMetrica Post API credentials by app slug, as JSON:
   * {"spb":{"applicationId":"…","postApiKey":"…"}}. Apps without an entry report nothing.
   */
  APPMETRICA_APPS: jsonBySlug(
    z.object({ applicationId: z.string().min(1), postApiKey: z.string().min(1) }),
    '{"<slug>":{"applicationId":"…","postApiKey":"…"}}',
  ),

  /** Valhalla routing engine (deploy/routing); unset means routing is unavailable. */
  VALHALLA_URL: z.url().optional(),
  /**
   * Routing area of each app by slug, as JSON:
   * {"spb":{"sourcePbfUrl":"…","bbox":{"minLon":…,"minLat":…,"maxLon":…,"maxLat":…}}}.
   * deploy/routing/update-routing.sh builds the Valhalla graph from these areas only.
   */
  ROUTING_REGIONS: jsonBySlug(
    routingRegion,
    '{"<slug>":{"sourcePbfUrl":"…","bbox":{"minLon":…,"minLat":…,"maxLon":…,"maxLat":…}}}',
  ),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Directory for rotated log files; unset means stdout only. */
  LOG_DIR: z.string().min(1).optional(),
  /** Rotated files kept on disk: one per day, plus extra ones when a day exceeds LOG_FILE_SIZE. */
  LOG_MAX_FILES: z.coerce.number().int().min(1).default(30),
  LOG_FILE_SIZE: z
    .string()
    .regex(/^\d+[kmg]?$/)
    .default('50m'),
});

export type Env = z.infer<typeof envSchema>;
