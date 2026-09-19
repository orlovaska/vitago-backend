import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AccountDeletionService } from '../src/modules/users';
import { createCityApp, type TestCityApp } from './support/apps';
import { adminBearer, userBearer } from './support/auth';
import { createPoint, createTour, uploadFile } from './support/content';
import { FakeBank } from './support/fake-bank';
import { createTestApp, type TestApp } from './support/test-app';

describe('account deletion', () => {
  const bank = new FakeBank();
  let t: TestApp;
  let admin: string;
  let spb: TestCityApp;

  beforeAll(async () => {
    await bank.start();
    t = await createTestApp({ env: bank.env() });
  });

  beforeEach(async () => {
    await t.truncateAll();
    bank.reset();
    admin = await adminBearer(t);
    spb = await createCityApp(t, admin, { paymentStores: ['rustore'] });
  });

  afterAll(async () => {
    await t.close();
    await bank.stop();
  });

  /** Rows in any module table whose user_id column still points at the user. */
  async function rowsReferencing(userId: string): Promise<Record<string, number>> {
    const columns = await t.sql<{ schema: string; table: string }[]>`
      select table_schema as schema, table_name as "table" from information_schema.columns
      where column_name = 'user_id' and table_schema not in ('pg_catalog', 'information_schema')`;
    const counts: Record<string, number> = {};
    for (const { schema, table } of columns) {
      const [row] = await t.sql.unsafe<{ total: number }[]>(
        `select count(*)::int as total from "${schema}"."${table}" where user_id = $1`,
        [userId],
      );
      if (row!.total > 0) counts[`${schema}.${table}`] = row!.total;
    }
    const [identity] = await t.sql<{ total: number }[]>`
      select count(*)::int as total from auth.users where id = ${userId}`;
    if (identity!.total > 0) counts['auth.users'] = identity!.total;
    return counts;
  }

  it('removes the user from every module and keeps orders without personal data', async () => {
    const user = await userBearer(t);
    const as = (method: 'get' | 'post' | 'put' | 'delete', path: string) =>
      request(t.server)
        [method](path)
        .set('x-bundle-id', spb.bundleId)
        .set('authorization', user.bearer);

    // Data in every module that keeps something about users.
    const tour = await createTour(t, admin, spb, { priceKopecks: 10_000 });
    const point = await createPoint(t, admin, tour.id);
    await as('put', `/v1/favorites/tours/${tour.id}`).expect(204);
    await as('put', `/v1/favorites/points/${point.id}`).expect(204);
    await as('put', `/v1/tours/${tour.id}/reviews/mine`).send({ rating: 5 }).expect(200);
    await as('put', '/v1/app/installation')
      .send({ store: 'rustore', version: '1.0.0' })
      .expect(204);

    const document = await request(t.server)
      .post('/v1/admin/legal/documents')
      .set('authorization', admin)
      .send({ appId: spb.id, type: 'terms' })
      .expect(201);
    const pdf = await uploadFile(t, admin, 'application/pdf');
    const version = await request(t.server)
      .post(`/v1/admin/legal/documents/${document.body.id}/versions`)
      .set('authorization', admin)
      .send({ fileId: pdf, requiresReconsent: true })
      .expect(201);
    await as('post', '/v1/legal/consent')
      .send({ versionIds: [version.body.id] })
      .expect(200);

    const promo = await request(t.server)
      .post('/v1/admin/promo-codes')
      .set('authorization', admin)
      .send({ tourId: tour.id, code: 'INVITE', discountPercent: 10, restricted: true })
      .expect(201);
    await as('post', '/v1/promo-codes/claim').send({ token: promo.body.linkToken }).expect(200);
    const order = await as('post', '/v1/payments/orders')
      .send({ tourId: tour.id, store: 'rustore', promoCode: 'INVITE', email: 'me@example.test' })
      .expect(201);
    await bank.notify(t, order.body.orderId, 'CONFIRMED').expect(200);

    expect(Object.keys(await rowsReferencing(user.userId)).length).toBeGreaterThan(5);

    await as('delete', '/v1/users/me').expect(204);

    expect(await rowsReferencing(user.userId)).toEqual({});
    const [kept] = await t.sql<{ user_id: string | null; email: string | null; status: string }[]>`
      select user_id, email, status from payments.orders where id = ${order.body.orderId}`;
    expect(kept).toEqual({ user_id: null, email: null, status: 'paid' });
    const [redemption] = await t.sql<{ total: number }[]>`
      select count(*)::int as total from promotions.promo_code_redemptions`;
    expect(redemption!.total).toBe(1);

    // The old token is refused and the device starts a new account.
    await as('get', '/v1/favorites').expect(401);
    const again = await userBearer(t);
    expect(again.userId).not.toBe(user.userId);
  });

  it('is idempotent, and the old token stops working at once', async () => {
    const user = await userBearer(t);
    const deletion = t.app.get(AccountDeletionService);
    await deletion.deleteAccount(user.userId);
    await deletion.deleteAccount(user.userId);
    await request(t.server).delete('/v1/users/me').set('authorization', user.bearer).expect(401);
  });
});
