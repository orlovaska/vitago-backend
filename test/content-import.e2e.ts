import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContentImporter } from '../src/cli/content-import';
import { contentManifestSchema } from '../src/cli/content-manifest';
import { createTestApp, type TestApp } from './support/test-app';

const FIXTURE = resolve(__dirname, 'fixtures', 'content');
const manifest = contentManifestSchema.parse(
  JSON.parse(readFileSync(resolve(FIXTURE, 'manifest.json'), 'utf8')),
);

describe('content import', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await t.truncateAll();
  });

  afterAll(async () => {
    await t.close();
  });

  const tours = () =>
    request(t.server).get('/v1/tours').set('x-bundle-id', 'com.vitago.audioguide.fixture');

  it('creates the app, categories, tours, points and narration', async () => {
    const result = await new ContentImporter(t.app, FIXTURE).run(manifest);
    expect(result).toMatchObject({ tours: 1, points: 2 });

    const list = await tours().expect(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({ slug: 'walk', title: 'Прогулка', pointCount: 2 }),
    ]);
    const content = await request(t.server)
      .get('/v1/tours/walk')
      .set('x-bundle-id', 'com.vitago.audioguide.fixture')
      .expect(200);
    expect(content.body.points[0]).toMatchObject({
      name: 'Эрмитаж',
      isFree: true,
      // The length is measured from narration.mp3 on upload, not taken from the manifest.
      audio: { durationSeconds: 1, subtitles: [{ startMs: 0, endMs: 800, text: 'Эрмитаж' }] },
    });
    expect(content.body.points[1].audio).toBeNull();
    expect(content.body.introAudioUrl).toMatch(/^\/v1\/media\//);
  });

  it('converges on a repeated run instead of duplicating', async () => {
    await new ContentImporter(t.app, FIXTURE).run(manifest);
    const [counts] = await t.sql<{ tours: number; points: number; files: number }[]>`
      select (select count(*)::int from tours.tours) as tours,
             (select count(*)::int from tours.points) as points,
             (select count(*)::int from media.files) as files`;
    // photo.png, narration.mp3 and the marker drawn from the photo.
    expect(counts).toEqual({ tours: 1, points: 2, files: 3 });
    expect((await tours().expect(200)).body.items).toHaveLength(1);
  });
});
