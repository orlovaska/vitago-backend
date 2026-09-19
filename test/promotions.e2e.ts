import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PromotionsFacade } from '../src/modules/promotions';
import { createCityApp, type TestCityApp } from './support/apps';
import { adminBearer, userBearer } from './support/auth';
import { createTour } from './support/content';
import { createTestApp, type TestApp } from './support/test-app';

describe('promotions', () => {
  let t: TestApp;
  let admin: string;
  let spb: TestCityApp;
  let tourId: string;
  let user: { userId: string; bearer: string };

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.truncateAll();
    admin = await adminBearer(t);
    spb = await createCityApp(t, admin);
    tourId = (await createTour(t, admin, spb, { priceKopecks: 50_000 })).id;
    user = await userBearer(t);
  });

  afterAll(async () => {
    await t.close();
  });

  const createCode = (overrides: Record<string, unknown> = {}) =>
    request(t.server)
      .post('/v1/admin/promo-codes')
      .set('authorization', admin)
      .send({ tourId, code: 'spring', discountPercent: 20, ...overrides })
      .expect(201);

  const quote = (code: string, bearer = user.bearer) =>
    request(t.server)
      .post('/v1/promo-codes/quote')
      .set('x-bundle-id', spb.bundleId)
      .set('authorization', bearer)
      .send({ tourId, code });

  it('quotes the discounted price, whatever the case of the code', async () => {
    await createCode();
    const response = await quote(' Spring ').expect(200);
    expect(response.body).toEqual({
      code: 'SPRING',
      discountPercent: 20,
      priceKopecks: 50_000,
      discountedPriceKopecks: 40_000,
    });
  });

  it.each([
    ['unknown code', {}, 'NOPE', 'promo_code_not_found'],
    ['inactive code', { active: false }, 'SPRING', 'promo_code_inactive'],
    ['expired code', { expiresAt: '2020-01-01T00:00:00.000Z' }, 'SPRING', 'promo_code_expired'],
    ['restricted code', { restricted: true }, 'SPRING', 'promo_code_not_invited'],
  ])('rejects an %s', async (_case, overrides, code, expected) => {
    await createCode(overrides);
    const response = await quote(code).expect(400);
    expect(response.body.code).toBe(expected);
  });

  it('lets an invitation link unlock a restricted code', async () => {
    const created = await createCode({ restricted: true });
    await request(t.server)
      .post('/v1/promo-codes/claim')
      .set('x-bundle-id', spb.bundleId)
      .set('authorization', user.bearer)
      .send({ token: created.body.linkToken })
      .expect(200, { code: 'SPRING', discountPercent: 20, tourId });
    await quote('spring').expect(200);
  });

  it('stops old invitation links after rotation', async () => {
    const created = await createCode({ restricted: true });
    await request(t.server)
      .post(`/v1/admin/promo-codes/${created.body.id}/rotate-link`)
      .set('authorization', admin)
      .expect(200);
    await request(t.server)
      .post('/v1/promo-codes/claim')
      .set('x-bundle-id', spb.bundleId)
      .set('authorization', user.bearer)
      .send({ token: created.body.linkToken })
      .expect(400);
  });

  it('enforces one use per user and the total limit', async () => {
    const created = await createCode({ maxRedemptions: 1 });
    const promotions = t.app.get(PromotionsFacade);
    await promotions.recordRedemption(created.body.id, user.userId, tourId, crypto.randomUUID());

    expect((await quote('spring').expect(400)).body.code).toBe('promo_code_already_used');
    const other = await userBearer(t, 'other');
    expect((await quote('spring', other.bearer).expect(400)).body.code).toBe('promo_code_used_up');
  });

  it('refuses a duplicate code', async () => {
    await createCode();
    await request(t.server)
      .post('/v1/admin/promo-codes')
      .set('authorization', admin)
      .send({ tourId, code: 'SPRING', discountPercent: 5 })
      .expect(409);
  });
});
