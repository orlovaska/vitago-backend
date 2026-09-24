import { describe, expect, it } from 'vitest';
import { AppConfig, loadEnv } from '../../../platform/config';
import { generateSupportCode } from '../stores/users.store';
import { DeviceProvider } from './device.provider';

const providerWithPepper = (pepper: string) =>
  new DeviceProvider(
    new AppConfig(
      loadEnv({
        DATABASE_URL: 'postgres://localhost/db',
        USER_JWT_SECRET: 'u'.repeat(32),
        ADMIN_JWT_SECRET: 'a'.repeat(32),
        DEVICE_SECRET_PEPPER: pepper,
      }),
    ),
  );

describe('DeviceProvider', () => {
  const secret = 'f'.repeat(64);

  it('derives a stable subject that is not the secret itself', async () => {
    const provider = providerWithPepper('p'.repeat(32));
    const first = await provider.resolveSubject({ secret });
    expect(first).toBe(await provider.resolveSubject({ secret }));
    expect(first).not.toContain(secret);
  });

  it('depends on the pepper', async () => {
    const a = await providerWithPepper('p'.repeat(32)).resolveSubject({ secret });
    const b = await providerWithPepper('q'.repeat(32)).resolveSubject({ secret });
    expect(a).not.toBe(b);
  });
});

describe('generateSupportCode', () => {
  it('uses 8 unambiguous characters', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateSupportCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    }
  });
});
