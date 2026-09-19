import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminBearer } from './support/auth';
import { createTestApp, type TestApp } from './support/test-app';

const audio = Buffer.from('ID3 fake mp3 payload '.repeat(100));

describe('media', () => {
  let t: TestApp;
  let admin: string;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.truncateAll();
    admin = await adminBearer(t);
  });

  afterAll(async () => {
    await t.close();
  });

  const upload = (content: Buffer, filename: string, contentType: string) =>
    request(t.server)
      .post('/v1/admin/media')
      .set('authorization', admin)
      .attach('file', content, { filename, contentType });

  it('uploads a file and serves it publicly with a content ETag', async () => {
    const uploaded = await upload(audio, 'точка.mp3', 'audio/mpeg').expect(201);
    expect(uploaded.body).toMatchObject({
      originalName: 'точка.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: audio.length,
    });

    const download = await request(t.server)
      .get(uploaded.body.url)
      .responseType('blob')
      .expect(200);
    expect(download.headers['content-type']).toBe('audio/mpeg');
    expect(download.headers.etag).toBe(`"${uploaded.body.sha256}"`);
    expect(download.headers['cache-control']).toContain('immutable');
    expect(Buffer.from(download.body as Buffer).equals(audio)).toBe(true);
  });

  it('serves byte ranges and honours If-None-Match', async () => {
    const { body } = await upload(audio, 'a.mp3', 'audio/mpeg').expect(201);

    const partial = await request(t.server).get(body.url).set('range', 'bytes=0-9').expect(206);
    expect(partial.headers['content-range']).toBe(`bytes 0-9/${audio.length}`);

    await request(t.server).get(body.url).set('if-none-match', `"${body.sha256}"`).expect(304);
  });

  it('stores identical content once', async () => {
    const first = await upload(audio, 'a.mp3', 'audio/mpeg').expect(201);
    const second = await upload(audio, 'copy.mp3', 'audio/mpeg').expect(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it('rejects unsupported types', async () => {
    const response = await upload(Buffer.from('MZ'), 'x.exe', 'application/x-msdownload').expect(
      400,
    );
    expect(response.body.code).toBe('unsupported_media_type');
  });

  it('lists files newest first with a cursor', async () => {
    for (const name of ['1', '2', '3']) {
      await upload(Buffer.from(name), `${name}.json`, 'application/json').expect(201);
    }
    const first = await request(t.server)
      .get('/v1/admin/media?limit=2')
      .set('authorization', admin)
      .expect(200);
    expect(first.body.items.map((file: { originalName: string }) => file.originalName)).toEqual([
      '3.json',
      '2.json',
    ]);

    const second = await request(t.server)
      .get(`/v1/admin/media?limit=2&cursor=${first.body.nextCursor}`)
      .set('authorization', admin)
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
  });

  it('deletes a file', async () => {
    const { body } = await upload(audio, 'a.mp3', 'audio/mpeg').expect(201);
    await request(t.server)
      .delete(`/v1/admin/media/${body.id}`)
      .set('authorization', admin)
      .expect(204);
    await request(t.server).get(body.url).expect(404);
  });

  it('requires an admin token to upload', async () => {
    await request(t.server)
      .post('/v1/admin/media')
      .attach('file', audio, { filename: 'a.mp3', contentType: 'audio/mpeg' })
      .expect(401);
  });
});
