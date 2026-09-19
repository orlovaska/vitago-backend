import request from 'supertest';
import { type TestCityApp } from './apps';
import { type TestApp } from './test-app';

let uploadCounter = 0;

/** Uploads a small unique file and returns its id. */
export async function uploadFile(
  t: TestApp,
  admin: string,
  contentType = 'image/png',
): Promise<string> {
  const extension = contentType.split('/')[1];
  const response = await request(t.server)
    .post('/v1/admin/media')
    .set('authorization', admin)
    .attach('file', Buffer.from(`test file ${++uploadCounter}`), {
      filename: `file-${uploadCounter}.${extension}`,
      contentType,
    })
    .expect(201);
  return response.body.id as string;
}

/** Creates a tour through the admin API. */
export async function createTour(
  t: TestApp,
  admin: string,
  app: TestCityApp,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; slug: string }> {
  const response = await request(t.server)
    .post('/v1/admin/tours')
    .set('authorization', admin)
    .send({
      appId: app.id,
      slug: 'center',
      status: 'published',
      priceKopecks: 49_900,
      translations: [{ locale: 'ru', title: 'Центр' }],
      ...overrides,
    })
    .expect(201);
  return response.body as { id: string; slug: string };
}

/** Adds a point to a tour through the admin API. */
export async function createPoint(
  t: TestApp,
  admin: string,
  tourId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const response = await request(t.server)
    .post(`/v1/admin/tours/${tourId}/points`)
    .set('authorization', admin)
    .send({
      latitude: 59.94,
      longitude: 30.31,
      translations: [{ locale: 'ru', name: 'Точка' }],
      ...overrides,
    })
    .expect(201);
  return response.body as { id: string; slug: string };
}
