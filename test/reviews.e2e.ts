import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCityApp, type TestCityApp } from './support/apps';
import { adminBearer, userBearer } from './support/auth';
import { createTour } from './support/content';
import { createTestApp, type TestApp } from './support/test-app';

describe('reviews', () => {
  let t: TestApp;
  let admin: string;
  let spb: TestCityApp;
  let tourId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.truncateAll();
    admin = await adminBearer(t);
    spb = await createCityApp(t, admin);
    tourId = (await createTour(t, admin, spb)).id;
  });

  afterAll(async () => {
    await t.close();
  });

  const write = (user: string, rating: number, text = 'Отлично') =>
    request(t.server)
      .put(`/v1/tours/${tourId}/reviews/mine`)
      .set('x-bundle-id', spb.bundleId)
      .set('authorization', user)
      .send({ rating, text, authorName: 'Анна' })
      .expect(200);

  const publicList = () =>
    request(t.server)
      .get(`/v1/tours/${tourId}/reviews`)
      .set('x-bundle-id', spb.bundleId)
      .expect(200);

  const moderate = (id: string, action: 'approve' | 'reject') =>
    request(t.server)
      .post(`/v1/admin/reviews/${id}/${action}`)
      .set('authorization', admin)
      .expect(200);

  it('shows a review only after approval and counts it in the rating', async () => {
    const { bearer } = await userBearer(t, 'a');
    const saved = await write(bearer, 4);
    expect(saved.body.review.status).toBe('pending');
    expect((await publicList()).body.items).toEqual([]);

    const pending = await request(t.server)
      .get('/v1/admin/reviews?status=pending')
      .set('authorization', admin)
      .expect(200);
    expect(pending.body.items).toHaveLength(1);

    await moderate(saved.body.review.id, 'approve');
    const list = await publicList();
    expect(list.body.items).toHaveLength(1);
    expect(list.body.rating).toEqual({ tourId, average: 4, count: 1 });
  });

  it('averages approved reviews only', async () => {
    const first = await write((await userBearer(t, 'a')).bearer, 5);
    const second = await write((await userBearer(t, 'b')).bearer, 4);
    const third = await write((await userBearer(t, 'c')).bearer, 1);
    await moderate(first.body.review.id, 'approve');
    await moderate(second.body.review.id, 'approve');
    await moderate(third.body.review.id, 'reject');

    const ratings = await request(t.server)
      .get('/v1/reviews/ratings')
      .set('x-bundle-id', spb.bundleId)
      .expect(200);
    expect(ratings.body.items).toEqual([{ tourId, average: 4.5, count: 2 }]);
  });

  it('sends an edited review back to moderation', async () => {
    const { bearer } = await userBearer(t, 'a');
    const saved = await write(bearer, 5);
    await moderate(saved.body.review.id, 'approve');
    const edited = await write(bearer, 3, 'Передумала');
    expect(edited.body.review).toMatchObject({ id: saved.body.review.id, status: 'pending' });
    expect((await publicList()).body.items).toEqual([]);
  });

  it('rejects ratings outside 1–5', async () => {
    const { bearer } = await userBearer(t, 'a');
    await request(t.server)
      .put(`/v1/tours/${tourId}/reviews/mine`)
      .set('x-bundle-id', spb.bundleId)
      .set('authorization', bearer)
      .send({ rating: 6 })
      .expect(400);
  });
});
