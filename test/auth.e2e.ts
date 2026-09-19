import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthFacade } from '../src/modules/auth';
import { createTestApp, type TestApp } from './support/test-app';

const deviceSecret = (seed: string) => seed.padEnd(64, '0');

describe('auth', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.truncateAll();
  });

  afterAll(async () => {
    await t.close();
  });

  describe('device sign-in', () => {
    it('creates the account on first sign-in and finds it afterwards', async () => {
      const first = await request(t.server)
        .post('/v1/auth/device')
        .send({ secret: deviceSecret('a') })
        .expect(200);
      expect(first.body.isNewUser).toBe(true);
      expect(first.body.user.supportCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

      const second = await request(t.server)
        .post('/v1/auth/device')
        .send({ secret: deviceSecret('a') })
        .expect(200);
      expect(second.body.isNewUser).toBe(false);
      expect(second.body.user.id).toBe(first.body.user.id);
    });

    it('gives different devices different accounts', async () => {
      const [a, b] = await Promise.all(
        ['a', 'b'].map((seed) =>
          request(t.server)
            .post('/v1/auth/device')
            .send({ secret: deviceSecret(seed) }),
        ),
      );
      expect(a!.body.user.id).not.toBe(b!.body.user.id);
    });

    it('creates one account when the same device signs in concurrently', async () => {
      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(t.server)
            .post('/v1/auth/device')
            .send({ secret: deviceSecret('c') }),
        ),
      );
      const ids = new Set(responses.map((response) => response.body.user.id as string));
      expect(responses.every((response) => response.status === 200)).toBe(true);
      expect(ids.size).toBe(1);
    });

    it('returns the signed-in user from /me', async () => {
      const signIn = await request(t.server)
        .post('/v1/auth/device')
        .send({ secret: deviceSecret('d') });
      const me = await request(t.server)
        .get('/v1/auth/me')
        .set('authorization', `Bearer ${signIn.body.accessToken}`)
        .expect(200);
      expect(me.body.id).toBe(signIn.body.user.id);
    });

    it('answers 401 after the account is deleted', async () => {
      const signIn = await request(t.server)
        .post('/v1/auth/device')
        .send({ secret: deviceSecret('e') });
      await t.app.get(AuthFacade).deleteUser(signIn.body.user.id);
      await request(t.server)
        .get('/v1/auth/me')
        .set('authorization', `Bearer ${signIn.body.accessToken}`)
        .expect(401);
    });
  });

  describe('admin login', () => {
    const login = 'editor';
    const password = 'correct horse battery staple';

    beforeEach(async () => {
      await t.app.get(AuthFacade).createAdmin(login, password);
    });

    it('issues an admin token that opens admin routes only', async () => {
      const response = await request(t.server)
        .post('/v1/admin/auth/login')
        .send({ login, password })
        .expect(200);
      const token = response.body.accessToken as string;

      await request(t.server)
        .get('/v1/admin/auth/me')
        .set('authorization', `Bearer ${token}`)
        .expect(200, { id: response.body.admin.id, login });
      await request(t.server)
        .get('/v1/auth/me')
        .set('authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('does not accept an app token on admin routes', async () => {
      const signIn = await request(t.server)
        .post('/v1/auth/device')
        .send({ secret: deviceSecret('f') });
      await request(t.server)
        .get('/v1/admin/auth/me')
        .set('authorization', `Bearer ${signIn.body.accessToken}`)
        .expect(401);
    });

    it('locks the login after five wrong passwords, even for the right one', async () => {
      for (let i = 0; i < 5; i++) {
        await request(t.server)
          .post('/v1/admin/auth/login')
          .send({ login, password: 'wrong password' })
          .expect(401);
      }
      const locked = await request(t.server)
        .post('/v1/admin/auth/login')
        .send({ login, password })
        .expect(429);
      expect(locked.body.code).toBe('too_many_attempts');
    });

    it('answers the same way for an unknown login and a wrong password', async () => {
      const unknown = await request(t.server)
        .post('/v1/admin/auth/login')
        .send({ login: 'nobody', password })
        .expect(401);
      const wrong = await request(t.server)
        .post('/v1/admin/auth/login')
        .send({ login, password: 'wrong password' })
        .expect(401);
      expect(unknown.body.code).toBe(wrong.body.code);
    });
  });
});
