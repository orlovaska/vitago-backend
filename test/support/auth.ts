import request from 'supertest';
import { AuthFacade, type SystemRole } from '../../src/modules/auth';
import { type TestApp } from './test-app';

/** Creates an administrator (if needed) and returns a Bearer header value. */
export async function adminBearer(
  t: TestApp,
  login = 'test-admin',
  role: SystemRole = 'superadmin',
): Promise<string> {
  const password = 'test-admin-password-123';
  try {
    await t.app.get(AuthFacade).createAdmin(login, { role, password });
  } catch {
    // Already created earlier in this test file.
  }
  const response = await request(t.server)
    .post('/v1/admin/auth/login')
    .send({ login, password })
    .expect(200);
  return `Bearer ${response.body.accessToken}`;
}

/** Signs a device in and returns its user id and Bearer header value. */
export async function userBearer(
  t: TestApp,
  seed = 'device',
): Promise<{ userId: string; bearer: string }> {
  const response = await request(t.server)
    .post('/v1/auth/device')
    .send({ secret: seed.padEnd(64, '0') })
    .expect(200);
  return { userId: response.body.user.id, bearer: `Bearer ${response.body.accessToken}` };
}
