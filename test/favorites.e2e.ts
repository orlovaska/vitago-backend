import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCityApp, type TestCityApp } from './support/apps';
import { adminBearer, userBearer } from './support/auth';
import { createPoint, createTour } from './support/content';
import { createTestApp, type TestApp } from './support/test-app';

describe('favorites', () => {
  let t: TestApp;
  let admin: string;
  let spb: TestCityApp;
  let user: string;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.truncateAll();
    admin = await adminBearer(t);
    spb = await createCityApp(t, admin);
    user = (await userBearer(t)).bearer;
  });

  afterAll(async () => {
    await t.close();
  });

  const call = (method: 'get' | 'put' | 'delete', path: string, app = spb) =>
    request(t.server)[method](path).set('x-bundle-id', app.bundleId).set('authorization', user);

  it('saves tours and points idempotently and removes them', async () => {
    const tour = await createTour(t, admin, spb);
    const point = await createPoint(t, admin, tour.id, {
      translations: [{ locale: 'ru', name: 'Эрмитаж' }],
    });

    await call('put', `/v1/favorites/tours/${tour.id}`).expect(204);
    await call('put', `/v1/favorites/tours/${tour.id}`).expect(204);
    await call('put', `/v1/favorites/points/${point.id}`).expect(204);

    const saved = await call('get', '/v1/favorites').expect(200);
    expect(saved.body.tours).toHaveLength(1);
    expect(saved.body.points).toEqual([
      { id: point.id, tourId: tour.id, name: 'Эрмитаж', imageUrl: null },
    ]);

    await call('delete', `/v1/favorites/tours/${tour.id}`).expect(204);
    expect((await call('get', '/v1/favorites').expect(200)).body.tours).toEqual([]);
  });

  it('shows only the calling app’s favorites', async () => {
    const perm = await createCityApp(t, admin, { slug: 'perm' });
    const spbTour = await createTour(t, admin, spb);
    const permTour = await createTour(t, admin, perm, { slug: 'perm-center' });
    await call('put', `/v1/favorites/tours/${spbTour.id}`).expect(204);
    await call('put', `/v1/favorites/tours/${permTour.id}`, perm).expect(204);

    const inSpb = await call('get', '/v1/favorites').expect(200);
    expect(inSpb.body.tours.map((tour: { id: string }) => tour.id)).toEqual([spbTour.id]);
  });

  it('refuses tours that are drafts or belong to another app', async () => {
    const draft = await createTour(t, admin, spb, { slug: 'draft', status: 'draft' });
    await call('put', `/v1/favorites/tours/${draft.id}`).expect(404);
    const perm = await createCityApp(t, admin, { slug: 'perm' });
    const permTour = await createTour(t, admin, perm, { slug: 'perm-center' });
    await call('put', `/v1/favorites/tours/${permTour.id}`).expect(404);
  });

  it('requires sign-in', async () => {
    await request(t.server).get('/v1/favorites').set('x-bundle-id', spb.bundleId).expect(401);
  });
});
