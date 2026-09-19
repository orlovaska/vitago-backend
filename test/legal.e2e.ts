import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCityApp, type TestCityApp } from './support/apps';
import { adminBearer, userBearer } from './support/auth';
import { createTestApp, type TestApp } from './support/test-app';

let pdfCounter = 0;

describe('legal', () => {
  let t: TestApp;
  let admin: string;
  let spb: TestCityApp;
  let user: string;
  let termsId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.truncateAll();
    admin = await adminBearer(t);
    spb = await createCityApp(t, admin);
    user = (await userBearer(t)).bearer;
    const terms = await request(t.server)
      .post('/v1/admin/legal/documents')
      .set('authorization', admin)
      .send({ appId: spb.id, type: 'terms', publicUrl: 'https://example.test/terms' })
      .expect(201);
    termsId = terms.body.id;
  });

  afterAll(async () => {
    await t.close();
  });

  async function publish(requiresReconsent: boolean): Promise<string> {
    const pdf = await request(t.server)
      .post('/v1/admin/media')
      .set('authorization', admin)
      .attach('file', Buffer.from(`%PDF-1.4 terms ${++pdfCounter}`), {
        filename: 'terms.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const version = await request(t.server)
      .post(`/v1/admin/legal/documents/${termsId}/versions`)
      .set('authorization', admin)
      .send({ fileId: pdf.body.id, requiresReconsent })
      .expect(201);
    return version.body.id as string;
  }

  const status = () =>
    request(t.server)
      .get('/v1/legal/consent')
      .set('x-bundle-id', spb.bundleId)
      .set('authorization', user)
      .expect(200);

  const accept = (versionIds: string[]) =>
    request(t.server)
      .post('/v1/legal/consent')
      .set('x-bundle-id', spb.bundleId)
      .set('authorization', user)
      .send({ versionIds });

  it('lists the current version of each document', async () => {
    await publish(true);
    const latest = await publish(false);
    const response = await request(t.server)
      .get('/v1/legal/documents')
      .set('x-bundle-id', spb.bundleId)
      .expect(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      type: 'terms',
      versionId: latest,
      publicUrl: 'https://example.test/terms',
    });
    expect(response.body.items[0].fileUrl).toMatch(/^\/v1\/media\//);
  });

  it('asks a new user to consent, then stops asking', async () => {
    const version = await publish(true);
    expect((await status()).body).toMatchObject({ needsConsent: true, isUpdate: false });
    const accepted = await accept([version]).expect(200);
    expect(accepted.body.needsConsent).toBe(false);
  });

  it('does not ask again after an editorial update', async () => {
    await accept([await publish(true)]).expect(200);
    await publish(false);
    expect((await status()).body.needsConsent).toBe(false);
  });

  it('asks again after a substantial update, as an update', async () => {
    await accept([await publish(true)]).expect(200);
    await publish(false);
    await publish(true);
    expect((await status()).body).toMatchObject({ needsConsent: true, isUpdate: true });
  });

  it('refuses consent to a superseded version', async () => {
    const old = await publish(true);
    await publish(true);
    const response = await accept([old]).expect(409);
    expect(response.body.code).toBe('not_current_version');
  });

  it('only publishes PDFs', async () => {
    const image = await request(t.server)
      .post('/v1/admin/media')
      .set('authorization', admin)
      .attach('file', Buffer.from('png'), { filename: 'x.png', contentType: 'image/png' })
      .expect(201);
    const response = await request(t.server)
      .post(`/v1/admin/legal/documents/${termsId}/versions`)
      .set('authorization', admin)
      .send({ fileId: image.body.id, requiresReconsent: true })
      .expect(400);
    expect(response.body.code).toBe('pdf_required');
  });
});
