import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SettingsFacade } from '../src/modules/settings';
import { adminBearer } from './support/auth';
import { createTestApp, type TestApp } from './support/test-app';

const KEY = 'payments.clientPollIntervalMs';

describe('settings', () => {
  let t: TestApp;
  let admin: string;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.truncateAll();
    admin = await adminBearer(t);
    // Truncation bypasses the service, so reset through it to drop its cache.
    await request(t.server).delete(`/v1/admin/settings/${KEY}`).set('authorization', admin);
  });

  afterAll(async () => {
    await t.close();
  });

  it('lists every catalog setting with its default', async () => {
    const response = await request(t.server)
      .get('/v1/admin/settings')
      .set('authorization', admin)
      .expect(200);
    expect(response.body.items).toContainEqual(
      expect.objectContaining({ key: KEY, value: 5000, overridden: false, public: true }),
    );
  });

  it('applies an override immediately and resets it', async () => {
    const facade = t.app.get(SettingsFacade);
    await request(t.server)
      .put(`/v1/admin/settings/${KEY}`)
      .set('authorization', admin)
      .send({ value: 10_000 })
      .expect(204);
    expect(await facade.get(KEY)).toBe(10_000);
    expect(await facade.getPublic()).toMatchObject({ [KEY]: 10_000 });

    await request(t.server)
      .delete(`/v1/admin/settings/${KEY}`)
      .set('authorization', admin)
      .expect(204);
    expect(await facade.get(KEY)).toBe(5000);
  });

  it('rejects values outside the schema', async () => {
    const response = await request(t.server)
      .put(`/v1/admin/settings/${KEY}`)
      .set('authorization', admin)
      .send({ value: 10 })
      .expect(400);
    expect(response.body.code).toBe('invalid_setting_value');
  });

  it('rejects keys outside the catalog', async () => {
    await request(t.server)
      .put('/v1/admin/settings/made.up')
      .set('authorization', admin)
      .send({ value: 1 })
      .expect(404);
  });

  it('keeps server-only settings out of the public subset', async () => {
    const publicSettings = await t.app.get(SettingsFacade).getPublic();
    expect(publicSettings).not.toHaveProperty('payments.bankCheckIntervalMs');
  });
});
