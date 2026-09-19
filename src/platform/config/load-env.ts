import { existsSync } from 'node:fs';
import { envSchema, type Env } from './env.schema';

/** Values that must never reach production: copied placeholders and obvious defaults. */
const PLACEHOLDER_PATTERN = /change-?me|placeholder|example|secret|password/i;
const MIN_SECRET_LENGTH = 32;
/** A generated secret of 32+ characters has far more distinct characters than this. */
const MIN_DISTINCT_CHARACTERS = 10;

function isWeakSecret(value: string): boolean {
  return (
    value.length < MIN_SECRET_LENGTH ||
    PLACEHOLDER_PATTERN.test(value) ||
    new Set(value).size < MIN_DISTINCT_CHARACTERS
  );
}

/** Keys that hold secrets; their strength is checked in production. */
export const SECRET_KEYS: readonly (keyof Env)[] = [
  'USER_JWT_SECRET',
  'ADMIN_JWT_SECRET',
  'DEVICE_SECRET_PEPPER',
];

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    const weak = SECRET_KEYS.filter((key) => {
      const value = env[key];
      return isWeakSecret(typeof value === 'string' ? value : '');
    });
    if (weak.length > 0) {
      throw new Error(`Refusing to start in production with weak secrets: ${weak.join(', ')}`);
    }
  }
  return env;
}

/** Reads a local .env file in development; containers pass variables directly. */
export function loadDotEnvFile(path = '.env'): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}
