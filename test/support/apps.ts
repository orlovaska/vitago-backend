import request from 'supertest';
import { type TestApp } from './test-app';

export interface TestCityApp {
  id: string;
  slug: string;
  bundleId: string;
}

/** Creates a city app through the admin API. */
export async function createCityApp(
  t: TestApp,
  admin: string,
  overrides: Record<string, unknown> = {},
): Promise<TestCityApp> {
  const slug = (overrides.slug as string | undefined) ?? 'spb';
  const response = await request(t.server)
    .post('/v1/admin/apps')
    .set('authorization', admin)
    .send({ slug, bundleId: `ru.vitago.${slug.replaceAll('-', '')}`, name: slug, ...overrides })
    .expect(201);
  return response.body as TestCityApp;
}
