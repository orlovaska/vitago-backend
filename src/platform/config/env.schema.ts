import { z } from 'zod';

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

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
