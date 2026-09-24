import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthFacade } from '../src/modules/auth';
import { createCityApp, type TestCityApp } from './support/apps';
import { adminBearer } from './support/auth';
import { createTour } from './support/content';
import { createTestApp, type TestApp } from './support/test-app';

describe('administrators and roles', () => {
  let t: TestApp;
  let superadmin: string;

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await t.truncateAll();
    superadmin = await adminBearer(t, 'root');
  });

  afterAll(async () => {
    await t.close();
  });

  const roles = async () => {
    const response = await request(t.server)
      .get('/v1/admin/roles')
      .set('authorization', superadmin)
      .expect(200);
    return response.body as {
      items: { id: string; name: string; systemCode: string | null; permissions: string[] }[];
      assignablePermissions: string[];
    };
  };

  const roleId = async (systemCode: string) =>
    (await roles()).items.find((role) => role.systemCode === systemCode)!.id;

  const adminId = async (login: string) => {
    const response = await request(t.server)
      .get('/v1/admin/admins')
      .set('authorization', superadmin)
      .expect(200);
    return (response.body.items as { id: string; login: string }[]).find(
      (admin) => admin.login === login,
    )!.id;
  };

  const signIn = async (login: string, password: string) => {
    const response = await request(t.server)
      .post('/v1/admin/auth/login')
      .send({ login, password })
      .expect(200);
    return `Bearer ${response.body.accessToken}`;
  };

  describe('permissions', () => {
    let spb: TestCityApp;
    let tourId: string;

    beforeEach(async () => {
      spb = await createCityApp(t, superadmin);
      tourId = (await createTour(t, superadmin, spb)).id;
    });

    it('lets a promoter manage promo codes and read tours, nothing more', async () => {
      const promoter = await adminBearer(t, 'promoter', 'promoter');

      await request(t.server)
        .post('/v1/admin/promo-codes')
        .set('authorization', promoter)
        .send({ tourId, code: 'spring', discountPercent: 20 })
        .expect(201);
      await request(t.server).get('/v1/admin/apps').set('authorization', promoter).expect(200);
      await request(t.server)
        .get('/v1/admin/tours')
        .query({ appId: spb.id })
        .set('authorization', promoter)
        .expect(200);

      const forbidden = await request(t.server)
        .delete(`/v1/admin/tours/${tourId}`)
        .set('authorization', promoter)
        .expect(403);
      expect(forbidden.body.code).toBe('forbidden');
      for (const path of ['/v1/admin/reviews', '/v1/admin/orders', '/v1/admin/admins']) {
        await request(t.server).get(path).set('authorization', promoter).expect(403);
      }
    });

    it('lets a content manager edit content and moderate reviews, not promo codes', async () => {
      const editor = await adminBearer(t, 'editor', 'content_manager');

      await request(t.server)
        .get(`/v1/admin/tours/${tourId}`)
        .set('authorization', editor)
        .expect(200);
      await request(t.server).get('/v1/admin/reviews').set('authorization', editor).expect(200);
      await request(t.server).get('/v1/admin/promo-codes').set('authorization', editor).expect(403);
      await request(t.server).get('/v1/admin/settings').set('authorization', editor).expect(403);
      await request(t.server).get('/v1/admin/roles').set('authorization', editor).expect(403);
    });

    it('tells every role who it is and what it may do', async () => {
      const promoter = await adminBearer(t, 'promoter', 'promoter');
      const me = await request(t.server)
        .get('/v1/admin/auth/me')
        .set('authorization', promoter)
        .expect(200);
      expect(me.body.role).toMatchObject({ systemCode: 'promoter', permissions: ['promotions'] });
    });
  });

  describe('administrators', () => {
    it('creates an administrator with a password shown once', async () => {
      const created = await request(t.server)
        .post('/v1/admin/admins')
        .set('authorization', superadmin)
        .send({ login: 'anna', roleId: await roleId('content_manager') })
        .expect(201);
      expect(created.body.admin).toMatchObject({
        login: 'anna',
        role: { systemCode: 'content_manager' },
        disabledAt: null,
      });
      expect(created.body.password.length).toBeGreaterThanOrEqual(12);

      await signIn('anna', created.body.password);
      await request(t.server)
        .post('/v1/admin/admins')
        .set('authorization', superadmin)
        .send({ login: 'anna', roleId: await roleId('promoter') })
        .expect(409);
    });

    it('applies a new role to open sessions at once', async () => {
      const bearer = await adminBearer(t, 'anna', 'promoter');
      await request(t.server)
        .patch(`/v1/admin/admins/${await adminId('anna')}`)
        .set('authorization', superadmin)
        .send({ roleId: await roleId('content_manager') })
        .expect(200);
      await request(t.server).get('/v1/admin/promo-codes').set('authorization', bearer).expect(403);
      await request(t.server).get('/v1/admin/reviews').set('authorization', bearer).expect(200);
    });

    it('signs a disabled administrator out and keeps them out', async () => {
      const bearer = await adminBearer(t, 'anna', 'promoter');
      const id = await adminId('anna');
      await request(t.server)
        .patch(`/v1/admin/admins/${id}`)
        .set('authorization', superadmin)
        .send({ disabled: true })
        .expect(200);

      await request(t.server).get('/v1/admin/auth/me').set('authorization', bearer).expect(401);
      await request(t.server)
        .post('/v1/admin/auth/login')
        .send({ login: 'anna', password: 'test-admin-password-123' })
        .expect(401);

      await request(t.server)
        .patch(`/v1/admin/admins/${id}`)
        .set('authorization', superadmin)
        .send({ disabled: false })
        .expect(200);
      await signIn('anna', 'test-admin-password-123');
    });

    it('ends old sessions when the password is reset', async () => {
      const bearer = await adminBearer(t, 'anna', 'promoter');
      const reset = await request(t.server)
        .post(`/v1/admin/admins/${await adminId('anna')}/reset-password`)
        .set('authorization', superadmin)
        .expect(200);

      await request(t.server).get('/v1/admin/auth/me').set('authorization', bearer).expect(401);
      const fresh = await signIn('anna', reset.body.password);
      await request(t.server).get('/v1/admin/auth/me').set('authorization', fresh).expect(200);
    });

    it('does not let an administrator change their own account', async () => {
      const response = await request(t.server)
        .patch(`/v1/admin/admins/${await adminId('root')}`)
        .set('authorization', superadmin)
        .send({ roleId: await roleId('promoter') })
        .expect(409);
      expect(response.body.code).toBe('own_account');
    });

    it('keeps one superadmin when two demote each other at once', async () => {
      const second = await adminBearer(t, 'second');
      const [rootId, secondId, promoter] = await Promise.all([
        adminId('root'),
        adminId('second'),
        roleId('promoter'),
      ]);
      const [a, b] = await Promise.all([
        request(t.server)
          .patch(`/v1/admin/admins/${secondId}`)
          .set('authorization', superadmin)
          .send({ roleId: promoter }),
        request(t.server)
          .patch(`/v1/admin/admins/${rootId}`)
          .set('authorization', second)
          .send({ roleId: promoter }),
      ]);
      // The loser was either demoted before its guard ran (403) or hit the last-one rule (409).
      const [won, lost] = [a.status, b.status].sort();
      expect(won).toBe(200);
      expect([403, 409]).toContain(lost);
    });

    it('does not let the CLI demote the last superadmin', async () => {
      await expect(t.app.get(AuthFacade).setAdminRole('root', 'promoter')).rejects.toMatchObject({
        code: 'last_superadmin',
      });
    });
  });

  describe('roles', () => {
    it('always has the three system roles, which cannot be changed', async () => {
      const { items, assignablePermissions } = await roles();
      expect(items.map((role) => role.systemCode)).toEqual([
        'superadmin',
        'promoter',
        'content_manager',
      ]);
      expect(items[0]!.permissions).toContain('server');
      expect(assignablePermissions).not.toContain('admins');
      expect(assignablePermissions).not.toContain('server');

      const system = items[1]!.id;
      await request(t.server)
        .patch(`/v1/admin/roles/${system}`)
        .set('authorization', superadmin)
        .send({ name: 'Renamed' })
        .expect(409);
      await request(t.server)
        .delete(`/v1/admin/roles/${system}`)
        .set('authorization', superadmin)
        .expect(409);
    });

    it('creates a custom role that grants exactly its permissions', async () => {
      const created = await request(t.server)
        .post('/v1/admin/roles')
        .set('authorization', superadmin)
        .send({ name: 'Модератор', permissions: ['reviews', 'reviews'] })
        .expect(201);
      expect(created.body).toMatchObject({ systemCode: null, permissions: ['reviews'] });

      const account = await request(t.server)
        .post('/v1/admin/admins')
        .set('authorization', superadmin)
        .send({ login: 'moder', roleId: created.body.id })
        .expect(201);
      const bearer = await signIn('moder', account.body.password);
      await request(t.server).get('/v1/admin/reviews').set('authorization', bearer).expect(200);
      await request(t.server).get('/v1/admin/apps').set('authorization', bearer).expect(403);

      const inUse = await request(t.server)
        .delete(`/v1/admin/roles/${created.body.id}`)
        .set('authorization', superadmin)
        .expect(409);
      expect(inUse.body.code).toBe('role_in_use');
    });

    it('never gives a custom role the superadmin-only permissions', async () => {
      await request(t.server)
        .post('/v1/admin/roles')
        .set('authorization', superadmin)
        .send({ name: 'Almost root', permissions: ['admins'] })
        .expect(400);
    });

    it('drops a custom role nobody holds', async () => {
      const created = await request(t.server)
        .post('/v1/admin/roles')
        .set('authorization', superadmin)
        .send({ name: 'Temporary', permissions: [] })
        .expect(201);
      await request(t.server)
        .delete(`/v1/admin/roles/${created.body.id}`)
        .set('authorization', superadmin)
        .expect(204);
      expect((await roles()).items).toHaveLength(3);
    });
  });
});
