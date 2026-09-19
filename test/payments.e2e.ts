import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderStatusService } from '../src/modules/payments/services/order-status.service';
import { createCityApp, type TestCityApp } from './support/apps';
import { adminBearer, userBearer } from './support/auth';
import { createTour } from './support/content';
import { FakeBank } from './support/fake-bank';
import { createTestApp, type TestApp } from './support/test-app';

const PRICE = 49_900;

describe('payments', () => {
  const bank = new FakeBank();
  let t: TestApp;
  let admin: string;
  let spb: TestCityApp;
  let tourId: string;
  let user: { userId: string; bearer: string };

  beforeAll(async () => {
    await bank.start();
    t = await createTestApp({ env: bank.env() });
  });

  beforeEach(async () => {
    await t.truncateAll();
    bank.reset();
    admin = await adminBearer(t);
    // Drop cached overrides left by earlier tests.
    for (const key of ['payments.bankCheckMaxAttempts', 'payments.bankCheckIntervalMs']) {
      await request(t.server).delete(`/v1/admin/settings/${key}`).set('authorization', admin);
    }
    spb = await createCityApp(t, admin, { paymentStores: ['rustore'] });
    tourId = (await createTour(t, admin, spb, { priceKopecks: PRICE })).id;
    user = await userBearer(t);
  });

  afterAll(async () => {
    await t.close();
    await bank.stop();
  });

  const asUser = (method: 'get' | 'post', path: string, who = user) =>
    request(t.server)
      [method](path)
      .set('x-bundle-id', spb.bundleId)
      .set('authorization', who.bearer);

  const checkout = (body: Record<string, unknown> = {}) =>
    asUser('post', '/v1/payments/orders').send({ tourId, store: 'rustore', ...body });

  const statusOf = async (orderId: string) =>
    (await asUser('get', `/v1/payments/orders/${orderId}`).expect(200)).body.status as string;

  const access = async () =>
    (await asUser('get', `/v1/payments/tours/${tourId}/access`).expect(200)).body;

  const orderEvents = async (orderId: string) =>
    (
      await request(t.server)
        .get(`/v1/admin/orders/${orderId}`)
        .set('authorization', admin)
        .expect(200)
    ).body.events as { type: string }[];

  /** Makes the order old enough for a server-side bank check. */
  const age = (orderId: string) =>
    t.sql`update payments.orders set created_at = now() - interval '1 minute',
          last_bank_check_at = null where id = ${orderId}`;

  it('credits the purchase when the bank confirms', async () => {
    const created = await checkout().expect(201);
    expect(created.body).toMatchObject({
      status: 'pending',
      amountKopecks: PRICE,
      pollIntervalMs: 5000,
      pollWindowMs: 120_000,
    });
    expect(created.body.paymentUrl).toMatch(/^https:\/\/pay\.example\.test\//);
    const orderId = created.body.orderId as string;

    const init = bank.callsOf('Init')[0]!.body;
    expect(init).toMatchObject({ Amount: PRICE, OrderId: orderId });
    expect(init.SuccessURL).toContain('/app/spb/payment-result?status=success');

    expect((await access()).purchased).toBe(false);
    await bank.notify(t, orderId, 'AUTHORIZED').expect(200, 'OK');
    await bank.notify(t, orderId, 'CONFIRMED').expect(200, 'OK');

    expect(await statusOf(orderId)).toBe('paid');
    expect(await access()).toMatchObject({ purchased: true, accessible: true });
    const purchases = await asUser('get', '/v1/payments/purchases').expect(200);
    expect(purchases.body.items).toEqual([{ tourId, grantedAt: expect.any(String) }]);
  });

  it('acknowledges a repeated notification without processing it twice', async () => {
    const { orderId } = (await checkout().expect(201)).body;
    await bank.notify(t, orderId, 'CONFIRMED').expect(200, 'OK');
    await bank.notify(t, orderId, 'CONFIRMED').expect(200, 'OK');

    const events = await orderEvents(orderId);
    expect(events.filter((event) => event.type === 'bank_status')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'status_changed')).toHaveLength(2);
  });

  it('refuses notifications without a valid signature', async () => {
    const { orderId } = (await checkout().expect(201)).body;
    await bank.notify(t, orderId, 'CONFIRMED', { Token: 'f'.repeat(64) }).expect(403);
    expect(await statusOf(orderId)).toBe('pending');
  });

  it('ignores a confirmation for a different amount', async () => {
    const { orderId } = (await checkout().expect(201)).body;
    // Signed correctly, but for 1 ruble.
    bank.paymentOf(orderId).amount = 100;
    await bank.notify(t, orderId, 'CONFIRMED').expect(200, 'OK');
    expect(await statusOf(orderId)).toBe('pending');
    expect((await orderEvents(orderId)).map((event) => event.type)).toContain('amount_mismatch');
  });

  it('asks the bank itself when no notification arrives', async () => {
    const { orderId } = (await checkout().expect(201)).body;
    bank.paymentOf(orderId).status = 'CONFIRMED';

    // Too early: no bank check within the first interval.
    expect(await statusOf(orderId)).toBe('pending');
    expect(bank.callsOf('GetState')).toHaveLength(0);

    await age(orderId);
    expect(await statusOf(orderId)).toBe('paid');
    expect(bank.callsOf('GetState')).toHaveLength(1);
  });

  it('stops asking the bank after the attempt limit', async () => {
    await request(t.server)
      .put('/v1/admin/settings/payments.bankCheckMaxAttempts')
      .set('authorization', admin)
      .send({ value: 1 })
      .expect(204);
    const { orderId } = (await checkout().expect(201)).body;

    await age(orderId);
    await statusOf(orderId);
    await age(orderId);
    await statusOf(orderId);
    expect(bank.callsOf('GetState')).toHaveLength(1);
  });

  it('keeps a failed order failed, even if a confirmation follows', async () => {
    const { orderId } = (await checkout().expect(201)).body;
    await bank.notify(t, orderId, 'REJECTED').expect(200, 'OK');
    expect(await statusOf(orderId)).toBe('failed');
    await bank.notify(t, orderId, 'CONFIRMED').expect(200, 'OK');
    expect(await statusOf(orderId)).toBe('failed');
    expect((await access()).purchased).toBe(false);
  });

  it('honours a confirmation that arrives after the order expired', async () => {
    const { orderId } = (await checkout().expect(201)).body;
    await t.sql`update payments.orders set expires_at = now() - interval '1 second' where id = ${orderId}`;
    await t.app.get(OrderStatusService).expireOverdue();
    expect(await statusOf(orderId)).toBe('expired');

    await bank.notify(t, orderId, 'CONFIRMED').expect(200, 'OK');
    expect(await statusOf(orderId)).toBe('paid');
    expect((await orderEvents(orderId)).map((event) => event.type)).toContain('late_confirmation');
  });

  it('revokes the purchase on refund and allows buying again', async () => {
    const first = (await checkout().expect(201)).body.orderId as string;
    await bank.notify(t, first, 'CONFIRMED').expect(200);
    await checkout().expect(409);

    await bank.notify(t, first, 'REFUNDED').expect(200);
    expect(await statusOf(first)).toBe('refunded');
    expect((await access()).purchased).toBe(false);
    await checkout().expect(201);
  });

  it('completes a 100 % promo code order without the bank', async () => {
    await request(t.server)
      .post('/v1/admin/promo-codes')
      .set('authorization', admin)
      .send({ tourId, code: 'GIFT', discountPercent: 100 })
      .expect(201);
    const response = await checkout({ promoCode: 'gift' }).expect(201);
    expect(response.body).toMatchObject({ status: 'paid', amountKopecks: 0, paymentUrl: null });
    expect(bank.callsOf('Init')).toHaveLength(0);
    expect((await access()).purchased).toBe(true);
  });

  it('charges the discounted price and uses the code up', async () => {
    await request(t.server)
      .post('/v1/admin/promo-codes')
      .set('authorization', admin)
      .send({ tourId, code: 'HALF', discountPercent: 50 })
      .expect(201);
    const { orderId, amountKopecks } = (await checkout({ promoCode: 'HALF' }).expect(201)).body;
    expect(amountKopecks).toBe(24_950);
    await bank.notify(t, orderId, 'CONFIRMED').expect(200);

    const quote = await asUser('post', '/v1/promo-codes/quote').send({ tourId, code: 'HALF' });
    expect(quote.body.code).toBe('promo_code_already_used');
  });

  it('marks the order failed when the bank refuses Init', async () => {
    bank.refuseNextInit();
    const response = await checkout().expect(502);
    expect(response.body.code).toBe('bank_unavailable');
    const orders = await request(t.server)
      .get('/v1/admin/orders?status=failed')
      .set('authorization', admin)
      .expect(200);
    expect(orders.body.items).toHaveLength(1);
  });

  it.each([
    ['a store that does not sell', { store: 'app_store' }, 403, 'payments_disabled'],
    ['an unknown promo code', { promoCode: 'NOPE' }, 400, 'promo_code_not_found'],
  ])('refuses checkout from %s', async (_case, body, status, code) => {
    const response = await checkout(body).expect(status);
    expect(response.body.code).toBe(code);
  });

  it('requires a receipt e-mail when the app asks for one', async () => {
    await request(t.server)
      .patch(`/v1/admin/apps/${spb.id}`)
      .set('authorization', admin)
      .send({ receiptEmailRequired: true })
      .expect(200);
    expect((await checkout().expect(400)).body.code).toBe('email_required');
    await checkout({ email: 'buyer@example.test' }).expect(201);
    expect(bank.callsOf('Init')[0]!.body.Receipt).toMatchObject({ Email: 'buyer@example.test' });
  });

  it('prices and charges with the code the user applied, then forgets it', async () => {
    await request(t.server)
      .post('/v1/admin/promo-codes')
      .set('authorization', admin)
      .send({ tourId, code: 'TEN', discountPercent: 10 })
      .expect(201);
    await asUser('post', '/v1/promo-codes/apply').send({ tourId, code: 'ten' }).expect(200);
    expect(await access()).toMatchObject({
      priceKopecks: PRICE,
      discountedPriceKopecks: 44_910,
      appliedPromoCode: { code: 'TEN', discountPercent: 10 },
    });

    // No code in the request: checkout uses the applied one.
    const { orderId, amountKopecks } = (await checkout().expect(201)).body;
    expect(amountKopecks).toBe(44_910);
    await bank.notify(t, orderId, 'CONFIRMED').expect(200);
    expect(await access()).toMatchObject({ purchased: true, appliedPromoCode: null });
  });

  it('applies the code of an invitation link at once', async () => {
    const promo = await request(t.server)
      .post('/v1/admin/promo-codes')
      .set('authorization', admin)
      .send({ tourId, code: 'FRIENDS', discountPercent: 50, restricted: true })
      .expect(201);
    await asUser('post', '/v1/promo-codes/claim').send({ token: promo.body.linkToken }).expect(200);
    expect((await access()).discountedPriceKopecks).toBe(24_950);
  });

  it('shows the share code only after purchase', async () => {
    await request(t.server)
      .post('/v1/admin/promo-codes')
      .set('authorization', admin)
      .send({ tourId, code: 'FRIEND', discountPercent: 10, shareAfterPurchase: true })
      .expect(201);
    expect((await access()).shareCode).toBeNull();
    const { orderId } = (await checkout().expect(201)).body;
    await bank.notify(t, orderId, 'CONFIRMED').expect(200);
    expect((await access()).shareCode).toEqual({ code: 'FRIEND', discountPercent: 10 });
  });

  it('never shows one user’s order to another', async () => {
    const { orderId } = (await checkout().expect(201)).body;
    const other = await userBearer(t, 'other');
    await asUser('get', `/v1/payments/orders/${orderId}`, other).expect(404);
  });
});
