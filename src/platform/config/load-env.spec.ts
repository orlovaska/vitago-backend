import { describe, expect, it } from 'vitest';
import { loadEnv } from './load-env';

const base = { DATABASE_URL: 'postgres://user:pass@localhost:5432/db' };

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('rejects a non-postgres database url', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });

  it('splits comma lists', () => {
    const env = loadEnv({ ...base, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });
});
