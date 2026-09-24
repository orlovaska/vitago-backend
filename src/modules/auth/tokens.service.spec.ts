import { describe, expect, it } from 'vitest';
import { AppConfig, loadEnv } from '../../platform/config';
import { TokensService } from './tokens.service';

const env = loadEnv({
  DATABASE_URL: 'postgres://localhost/db',
  USER_JWT_SECRET: 'u'.repeat(32),
  ADMIN_JWT_SECRET: 'a'.repeat(32),
  DEVICE_SECRET_PEPPER: 'p'.repeat(32),
});
const tokens = new TokensService(new AppConfig(env));

describe('TokensService', () => {
  it('round-trips the subject for the same audience', async () => {
    const { accessToken, expiresIn } = await tokens.issue('app', 'user-1');
    expect(expiresIn).toBe(3600);
    await expect(tokens.verify('app', accessToken)).resolves.toEqual({
      subject: 'user-1',
      version: 0,
    });
  });

  it('carries the session version', async () => {
    const { accessToken } = await tokens.issue('admin', 'admin-1', 3);
    await expect(tokens.verify('admin', accessToken)).resolves.toEqual({
      subject: 'admin-1',
      version: 3,
    });
  });

  it('never accepts an app token as an admin token', async () => {
    const { accessToken } = await tokens.issue('app', 'user-1');
    await expect(tokens.verify('admin', accessToken)).resolves.toBeNull();
  });

  it('rejects garbage', async () => {
    await expect(tokens.verify('app', 'not-a-token')).resolves.toBeNull();
  });
});
