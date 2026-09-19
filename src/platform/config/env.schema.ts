import { z } from 'zod';

/**
 * Every environment variable the application reads.
 * New variables are added here, never read from process.env directly.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export type Env = z.infer<typeof envSchema>;
