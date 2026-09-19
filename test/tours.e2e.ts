import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCityApp, type TestCityApp } from './support/apps';
import { adminBearer } from './support/auth';
import { createPoint, createTour, uploadFile } from './support/content';
import { createTestApp, type TestApp } from './support/test-app';

describe('tours', () => {
  let t: TestApp;
  let admin: string;
  let spb: TestCityApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.truncateAll();
    admin = await adminBearer(t);
    spb = await createCityApp(t, admin);
  });

  afterAll(async () => {
    await t.close();
  });

  const appGet = (path: string, locale?: string) => {
    const call = request(t.server).get(path).set('x-bundle-id', spb.bundleId);
    return locale ? call.set('accept-language', locale) : call;
  };

  it('lists only published tours of the calling app, in order', async () => {
    await createTour(t, admin, spb, { slug: 'second', position: 2 });
    await createTour(t, admin, spb, { slug: 'first', position: 1 });
    await createTour(t, admin, spb, { slug: 'draft', status: 'draft' });
    const other = await createCityApp(t, admin, { slug: 'perm' });
    await createTour(t, admin, other, { slug: 'elsewhere' });

    const response = await appGet('/v1/tours').expect(200);
    expect(response.body.items.map((tour: { slug: string }) => tour.slug)).toEqual([
      'first',
      'second',
    ]);
  });

  it('serves full content in the requested language with a fallback', async () => {
    const audioRu = await uploadFile(t, admin, 'audio/mpeg');
    const audioEn = await uploadFile(t, admin, 'audio/mpeg');
    const museum = await request(t.server)
      .post('/v1/admin/categories')
      .set('authorization', admin)
      .send({
        slug: 'museum',
        translations: [
          { locale: 'ru', name: 'Музей' },
          { locale: 'en', name: 'Museum' },
        ],
      })
      .expect(201);
    const tour = await createTour(t, admin, spb, {
      translations: [
        { locale: 'ru', title: 'Центр', description: 'Прогулка' },
        { locale: 'en', title: 'Centre' },
      ],
      mapViewport: { center: { latitude: 59.9, longitude: 30.3 }, zoom: 13 },
    });
    await createPoint(t, admin, tour.id, {
      isFree: true,
      categoryIds: [museum.body.id],
      translations: [
        { locale: 'ru', name: 'Эрмитаж' },
        { locale: 'en', name: 'Hermitage' },
      ],
      audio: {
        translations: [
          {
            locale: 'ru',
            audioFileId: audioRu,
            subtitles: [{ startMs: 0, endMs: 900, text: 'Здравствуйте' }],
          },
          { locale: 'en', audioFileId: audioEn },
        ],
      },
    });
    await createPoint(t, admin, tour.id, { translations: [{ locale: 'ru', name: 'Без звука' }] });

    const en = await appGet(`/v1/tours/${tour.slug}`, 'en-GB,en;q=0.9').expect(200);
    expect(en.body).toMatchObject({ title: 'Centre', description: null, pointCount: 2 });
    expect(en.body.points[0]).toMatchObject({
      name: 'Hermitage',
      isFree: true,
      audio: { url: `/v1/media/${audioEn}`, autoplayRadiusMeters: 40 },
    });
    expect(en.body.points[1]).toMatchObject({ name: 'Без звука', audio: null });
    expect(en.body.categories).toEqual([
      expect.objectContaining({ slug: 'museum', name: 'Museum' }),
    ]);

    const ru = await appGet(`/v1/tours/${tour.id}`).expect(200);
    expect(ru.body.points[0].audio.subtitles).toEqual([
      { startMs: 0, endMs: 900, text: 'Здравствуйте' },
    ]);
  });

  it('answers 304 when the content has not changed', async () => {
    const tour = await createTour(t, admin, spb);
    const first = await appGet(`/v1/tours/${tour.id}`).expect(200);
    await appGet(`/v1/tours/${tour.id}`).set('if-none-match', first.headers.etag!).expect(304);
  });

  it('hides drafts and tours of other apps', async () => {
    const draft = await createTour(t, admin, spb, { slug: 'draft', status: 'draft' });
    await appGet(`/v1/tours/${draft.id}`).expect(404);
    const other = await createCityApp(t, admin, { slug: 'perm' });
    const foreign = await createTour(t, admin, other, { slug: 'foreign' });
    await appGet(`/v1/tours/${foreign.id}`).expect(404);
  });

  it('rejects references to files that do not exist', async () => {
    const response = await request(t.server)
      .post('/v1/admin/tours')
      .set('authorization', admin)
      .send({
        appId: spb.id,
        slug: 'broken',
        coverImageId: '01900000-0000-7000-8000-000000000000',
        translations: [{ locale: 'ru', title: 'X' }],
      })
      .expect(400);
    expect(response.body.code).toBe('file_not_found');
  });

  it('adds and removes narration without touching the point', async () => {
    const tour = await createTour(t, admin, spb);
    const point = await createPoint(t, admin, tour.id);
    const audio = await uploadFile(t, admin, 'audio/mpeg');

    const withAudio = await request(t.server)
      .put(`/v1/admin/points/${point.id}/audio`)
      .set('authorization', admin)
      .send({ autoplayRadiusMeters: 25, translations: [{ locale: 'ru', audioFileId: audio }] })
      .expect(200);
    expect(withAudio.body.audio).toMatchObject({ autoplayRadiusMeters: 25 });

    await request(t.server)
      .delete(`/v1/admin/points/${point.id}/audio`)
      .set('authorization', admin)
      .expect(204);
    const after = await request(t.server)
      .get(`/v1/admin/points/${point.id}`)
      .set('authorization', admin)
      .expect(200);
    expect(after.body.audio).toBeNull();
    expect(after.body.translations[0].name).toBe('Точка');
  });

  it('reorders points and insists on the complete list', async () => {
    const tour = await createTour(t, admin, spb);
    const a = await createPoint(t, admin, tour.id, { translations: [{ locale: 'ru', name: 'A' }] });
    const b = await createPoint(t, admin, tour.id, { translations: [{ locale: 'ru', name: 'B' }] });

    await request(t.server)
      .put(`/v1/admin/tours/${tour.id}/points/order`)
      .set('authorization', admin)
      .send({ pointIds: [a.id] })
      .expect(400);
    await request(t.server)
      .put(`/v1/admin/tours/${tour.id}/points/order`)
      .set('authorization', admin)
      .send({ pointIds: [b.id, a.id] })
      .expect(204);

    const content = await appGet(`/v1/tours/${tour.id}`).expect(200);
    expect(content.body.points.map((point: { name: string }) => point.name)).toEqual(['B', 'A']);
  });

  it('round-trips the admin editor view through PUT', async () => {
    const tour = await createTour(t, admin, spb);
    const view = await request(t.server)
      .get(`/v1/admin/tours/${tour.id}`)
      .set('authorization', admin)
      .expect(200);
    const {
      id: _id,
      points: _points,
      publishedAt: _p,
      createdAt: _c,
      updatedAt: _u,
      ...input
    } = view.body;
    const updated = await request(t.server)
      .put(`/v1/admin/tours/${tour.id}`)
      .set('authorization', admin)
      .send({ ...input, priceKopecks: 29_900 })
      .expect(200);
    expect(updated.body.priceKopecks).toBe(29_900);
  });
});
