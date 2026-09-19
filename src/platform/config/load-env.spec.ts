import { describe, expect, it } from 'vitest';
import { loadEnv } from './load-env';

const base = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  USER_JWT_SECRET: 'u'.repeat(32),
  ADMIN_JWT_SECRET: 'a'.repeat(32),
  DEVICE_SECRET_PEPPER: 'p'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('rejects a non-postgres database url', () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('splits comma lists', () => {
    const env = loadEnv({ ...base, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('refuses weak secrets in production only', () => {
    const strong = {
      ...base,
      NODE_ENV: 'production',
      USER_JWT_SECRET: 'q7Vd9kLm2Xz4Rt8Bw1Nc6Hs3Pf5Gj0Ya',
      ADMIN_JWT_SECRET: 'Zr4Kp8Wm1Ts6Qd3Xv9Lb2Nf7Hc5Jg0Ey',
      DEVICE_SECRET_PEPPER: 'Mb6Tq1Zx9Rv4Kd8Wn3Lp7Cs2Hf5Gj0Ua',
    };
    expect(() => loadEnv(strong)).not.toThrow();
    expect(() => loadEnv({ ...strong, USER_JWT_SECRET: 'change-me'.padEnd(40, '-') })).toThrow(
      /USER_JWT_SECRET/,
    );
    expect(() => loadEnv({ ...strong, ADMIN_JWT_SECRET: 'a'.repeat(40) })).toThrow(
      /ADMIN_JWT_SECRET/,
    );
    expect(() => loadEnv(base)).not.toThrow();
  });
});
