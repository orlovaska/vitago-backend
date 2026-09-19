import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/test-app';

describe('platform', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('reports ready when the database answers', async () => {
    await request(t.server).get('/health/ready').expect(200, { status: 'ok' });
  });

  it('renders unknown routes as problem details', async () => {
    const response = await request(t.server).get('/v1/does-not-exist').expect(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({ status: 404, title: 'Not Found' });
  });
});
