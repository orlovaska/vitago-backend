import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCityApp, type TestCityApp } from './support/apps';
import { adminBearer, userBearer } from './support/auth';
import { createTestApp, type TestApp } from './support/test-app';

describe('apps', () => {
  let t: TestApp;
  let admin: string;
  let spb: TestCityApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.truncateAll();
    admin = await adminBearer(t);
    spb = await createCityApp(t, admin, {
      slug: 'spb',
      name: 'Петербург',
      mapStyleUrl: 'https://maps.example.test/style.json',
      paymentStores: ['rustore', 'google_play'],
      support: { email: 'help@example.test' },
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('returns the configuration of the app named by X-Bundle-Id', async () => {
    const response = await request(t.server)
      .get('/v1/app')
      .set('x-bundle-id', spb.bundleId)
      .expect(200);
    expect(response.body).toMatchObject({
      slug: 'spb',
      name: 'Петербург',
      mapStyleUrl: 'https://maps.example.test/style.json',
      paymentStores: ['rustore', 'google_play'],
      support: { email: 'help@example.test', telegramUrl: null },
      legalDocuments: [],
    });
    // Public settings ride along; server-only ones stay out.
    expect(response.body.settings).toHaveProperty('payments.clientPollIntervalMs');
    expect(response.body.settings).not.toHaveProperty('payments.bankCheckIntervalMs');
  });

  it('answers 400 without the header and for unknown bundles', async () => {
    expect((await request(t.server).get('/v1/app').expect(400)).body.code).toBe('app_required');
    const unknown = await request(t.server).get('/v1/app').set('x-bundle-id', 'ru.other.app');
    expect(unknown.status).toBe(400);
    expect(unknown.body.code).toBe('unknown_app');
  });

  it('sees admin changes immediately', async () => {
    await request(t.server)
      .patch(`/v1/admin/apps/${spb.id}`)
      .set('authorization', admin)
      .send({
        mapStyleUrl: 'https://maps.example.test/dark.json',
        support: { vkUrl: 'https://vk.com/x' },
      })
      .expect(200);
    const response = await request(t.server).get('/v1/app').set('x-bundle-id', spb.bundleId);
    expect(response.body.mapStyleUrl).toBe('https://maps.example.test/dark.json');
    expect(response.body.support).toMatchObject({
      email: 'help@example.test',
      vkUrl: 'https://vk.com/x',
    });
    // Fields the PATCH did not mention keep their values.
    expect(response.body.paymentStores).toEqual(['rustore', 'google_play']);
  });

  it('rejects a second app with the same bundle id', async () => {
    const response = await request(t.server)
      .post('/v1/admin/apps')
      .set('authorization', admin)
      .send({ slug: 'spb-2', bundleId: spb.bundleId, name: 'Copy' })
      .expect(409);
    expect(response.body.code).toBe('app_exists');
  });

  describe('update check', () => {
    const addVersion = (version: string, mandatory = false) =>
      request(t.server)
        .post(`/v1/admin/apps/${spb.id}/versions`)
        .set('authorization', admin)
        .send({ store: 'rustore', version, mandatory })
        .expect(201);

    const check = (version: string) =>
      request(t.server)
        .get(`/v1/app/update?store=rustore&version=${version}`)
        .set('x-bundle-id', spb.bundleId)
        .expect(200);

    it('reports the latest version and whether an update is mandatory', async () => {
      await addVersion('1.2.0', true);
      await addVersion('1.10.0');

      expect((await check('1.1.0')).body).toMatchObject({
        latestVersion: '1.10.0',
        updateRequired: true,
      });
      expect((await check('1.2.0')).body).toMatchObject({
        latestVersion: '1.10.0',
        updateRequired: false,
      });
    });

    it('knows nothing about other stores', async () => {
      await addVersion('2.0.0', true);
      const response = await request(t.server)
        .get('/v1/app/update?store=app_store&version=1.0.0')
        .set('x-bundle-id', spb.bundleId)
        .expect(200);
      expect(response.body).toEqual({
        latestVersion: null,
        releaseNotes: null,
        updateRequired: false,
      });
    });
  });

  it('records the build a signed-in user runs', async () => {
    const { bearer } = await userBearer(t);
    await request(t.server)
      .put('/v1/app/installation')
      .set('x-bundle-id', spb.bundleId)
      .set('authorization', bearer)
      .send({ store: 'rustore', version: '1.0.0' })
      .expect(204);
  });
});
