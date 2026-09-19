import { describe, expect, it } from 'vitest';
import { AppConfig, loadEnv } from '../../../platform/config';
import { LocalDiskStorage } from './local-disk.storage';

const storage = new LocalDiskStorage(
  new AppConfig(
    loadEnv({
      DATABASE_URL: 'postgres://localhost/db',
      USER_JWT_SECRET: 'u'.repeat(32),
      ADMIN_JWT_SECRET: 'a'.repeat(32),
      DEVICE_SECRET_PEPPER: 'p'.repeat(32),
      MEDIA_DIR: 'storage/media-test',
    }),
  ),
);

describe('LocalDiskStorage', () => {
  it('resolves keys inside the media root', () => {
    expect(storage.localPath('ab/abc.mp3')).toMatch(/media-test[\\/]ab[\\/]abc\.mp3$/);
  });

  it('refuses keys that escape the media root', () => {
    expect(() => storage.localPath('../secrets.txt')).toThrow(/escapes/);
  });
});
