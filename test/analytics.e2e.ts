import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCityApp } from './support/apps';
import { adminBearer, userBearer } from './support/auth';
import { createTour } from './support/content';
import { FakeBank } from './support/fake-bank';
import { createTestApp, type TestApp } from './support/test-app';

describe('analytics', () => {
  const bank = new FakeBank();
  const reports: URL[] = [];
  let metrica: Server;
  let t: TestApp;

  beforeAll(async () => {
    await bank.start();
    metrica = createServer((req, res) => {
      reports.push(new URL(req.url ?? '/', 'http://metrica.test'));
      res.end('{}');
    });
    await new Promise<void>((resolve) => metrica.listen(0, '127.0.0.1', resolve));
    const port = (metrica.address() as AddressInfo).port;
    t = await createTestApp({
      env: {
        ...bank.env(),
        APPMETRICA_API_URL: `http://127.0.0.1:${port}`,
        APPMETRICA_APPS: JSON.stringify({ spb: { applicationId: '123', postApiKey: 'key' } }),
      },
    });
    await t.truncateAll();
  });

  afterAll(async () => {
    await t.close();
    await bank.stop();
    await new Promise((resolve) => metrica.close(resolve));
  });

  it('reports a confirmed purchase as revenue', async () => {
    const admin = await adminBearer(t);
    const spb = await createCityApp(t, admin, { paymentStores: ['rustore'] });
    const tour = await createTour(t, admin, spb, { priceKopecks: 49_900 });
    const user = await userBearer(t);
    const order = await request(t.server)
      .post('/v1/payments/orders')
      .set('x-bundle-id', spb.bundleId)
      .set('authorization', user.bearer)
      .send({ tourId: tour.id, store: 'rustore' })
      .expect(201);
    await bank.notify(t, order.body.orderId, 'CONFIRMED').expect(200);

    await expect.poll(() => reports.length, { timeout: 3000 }).toBe(1);
    const report = reports[0]!;
    expect(report.pathname).toBe('/logs/v1/import/revenue');
    expect(Object.fromEntries(report.searchParams)).toMatchObject({
      application_id: '123',
      post_api_key: 'key',
      profile_id: user.userId,
      price: '499.00',
      currency: 'RUB',
      transaction_id: order.body.orderId,
      revenue_event_type: 'one_time_purchase',
    });
  });
});
