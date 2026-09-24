import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MARKER_IMAGE, MARKER_SPEC } from '../src/modules/media/marker-image';
import { MarkersService } from '../src/modules/tours/services/markers.service';
import { createCityApp, type TestCityApp } from './support/apps';
import { adminBearer } from './support/auth';
import { createPoint, createTour, uploadFile, uploadPhoto } from './support/content';
import { createTestApp, type TestApp } from './support/test-app';

describe('point markers', () => {
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

  const markerOf = async (pointId: string) => {
    const [row] = await t.sql<{ markerId: string | null; markerSpec: string | null }[]>`
      select marker_id as "markerId", marker_spec as "markerSpec"
      from tours.points where id = ${pointId}`;
    return row!;
  };
  const fileExists = async (id: string) =>
    (await t.sql`select 1 from media.files where id = ${id}`).length > 0;
  const upkeep = () => t.app.get(MarkersService).reconcile();

  it('draws the marker from the cover photo when a point is saved', async () => {
    const photo = await uploadPhoto(t, admin);
    const point = await createPoint(t, admin, tourId, { imageId: photo });

    const { markerId, markerSpec } = await markerOf(point.id);
    expect(markerId).not.toBeNull();
    expect(markerSpec).toBe(MARKER_SPEC);

    const content = await request(t.server)
      .get('/v1/tours/center')
      .set('x-bundle-id', spb.bundleId)
      .expect(200);
    expect(content.body.points[0].markerImageUrl).toBe(`/v1/media/${markerId}`);
    expect(content.body.points[0]).not.toHaveProperty('lockedMarkerImageUrl');

    const image = await request(t.server)
      .get(`/v1/media/${markerId}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect('content-type', 'image/png');
    expect(await sharp(image.body as Buffer).metadata()).toMatchObject({
      width: MARKER_IMAGE.size,
      height: MARKER_IMAGE.size,
      hasAlpha: true,
    });
  });

  it('leaves a point without a photo without a marker', async () => {
    const point = await createPoint(t, admin, tourId);
    expect(await markerOf(point.id)).toEqual({ markerId: null, markerSpec: null });
  });

  it('refuses a cover that is not a readable image', async () => {
    const broken = await uploadFile(t, admin, 'image/png');
    const response = await request(t.server)
      .post(`/v1/admin/tours/${tourId}/points`)
      .set('authorization', admin)
      .send({
        latitude: 59.94,
        longitude: 30.31,
        imageId: broken,
        translations: [{ locale: 'ru', name: 'Точка' }],
      })
      .expect(400);
    expect(response.body.code).toBe('image_unreadable');
  });

  it('keeps a shared marker while a point uses it and deletes it after', async () => {
    const photo = await uploadPhoto(t, admin);
    const first = await createPoint(t, admin, tourId, { imageId: photo });
    const second = await createPoint(t, admin, tourId, { imageId: photo });
    const shared = (await markerOf(first.id)).markerId!;
    expect((await markerOf(second.id)).markerId).toBe(shared);

    // The first point gets another photo: the old marker is still the second one's.
    const other = await uploadPhoto(t, admin, '#a33');
    await request(t.server)
      .put(`/v1/admin/points/${first.id}`)
      .set('authorization', admin)
      .send({
        latitude: 59.94,
        longitude: 30.31,
        imageId: other,
        translations: [{ locale: 'ru', name: 'Точка' }],
      })
      .expect(200);
    expect((await markerOf(first.id)).markerId).not.toBe(shared);
    await upkeep();
    expect(await fileExists(shared)).toBe(true);

    await request(t.server)
      .delete(`/v1/admin/points/${second.id}`)
      .set('authorization', admin)
      .expect(204);
    await upkeep();
    expect(await fileExists(shared)).toBe(false);
  });

  it('redraws markers made with another shape', async () => {
    const photo = await uploadPhoto(t, admin);
    const point = await createPoint(t, admin, tourId, { imageId: photo });
    // As if the marker were drawn before the shape in marker-image.ts changed.
    const legacy = await uploadPhoto(t, admin, '#33a');
    await t.sql`update tours.points set marker_id = ${legacy}, marker_spec = '96:0.5:v0'
                where id = ${point.id}`;
    await t.sql`insert into tours.marker_files (file_id) values (${legacy})`;

    await upkeep();

    const { markerId, markerSpec } = await markerOf(point.id);
    expect(markerSpec).toBe(MARKER_SPEC);
    expect(markerId).not.toBe(legacy);
    expect(await fileExists(legacy)).toBe(false);
  });

  it('deletes hand-made markers the migration handed over', async () => {
    // Migration 0025 moves the old marker files into the registry.
    const handMade = await uploadFile(t, admin, 'image/png');
    await t.sql`insert into tours.marker_files (file_id) values (${handMade})`;

    await upkeep();

    expect(await fileExists(handMade)).toBe(false);
    expect(await t.sql`select 1 from tours.marker_files`).toHaveLength(0);
  });
});
