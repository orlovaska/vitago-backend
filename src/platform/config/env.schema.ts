import { z } from 'zod';

/**
 * Every environment variable the application reads.
 * New variables are added here, never read from process.env directly.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Directory for rotated log files; unset means stdout only. */
  LOG_DIR: z.string().min(1).optional(),
  /** Rotated files kept on disk: one per day, plus extra ones when a day exceeds LOG_FILE_SIZE. */
  LOG_MAX_FILES: z.coerce.number().int().min(1).default(30),
  LOG_FILE_SIZE: z.string().regex(/^\d+[kmg]?$/).default('50m'),
});

export type Env = z.infer<typeof envSchema>;
