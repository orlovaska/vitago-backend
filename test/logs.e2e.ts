import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminBearer } from './support/auth';
import { createTestApp, type TestApp } from './support/test-app';

const FILE = 'api.2026-09-01.1.log';

describe('logs', () => {
  let t: TestApp;
  let admin: string;

  beforeAll(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vitago-logs-'));
    await writeFile(
      join(dir, FILE),
      [
        { level: 30, msg: 'request completed', time: 1 },
        { level: 50, msg: 'bank unreachable', time: 2 },
        'not json',
        { level: 40, msg: 'Bank payment id mismatch', time: 3 },
      ]
        .map((line) => (typeof line === 'string' ? line : JSON.stringify(line)))
        .join('\n'),
    );
    await writeFile(join(dir, 'secrets.txt'), 'nope');
    t = await createTestApp({ env: { LOG_DIR: dir } });
    await t.truncateAll();
    admin = await adminBearer(t);
  });

  afterAll(async () => {
    await t.close();
  });

  const get = (path: string) => request(t.server).get(path).set('authorization', admin);

  it('lists only log files', async () => {
    const response = await get('/v1/admin/logs/files').expect(200);
    expect(response.body.items.map((file: { name: string }) => file.name)).toContain(FILE);
    expect(response.body.items.map((file: { name: string }) => file.name)).not.toContain(
      'secrets.txt',
    );
  });

  it('filters entries by level and text, newest first', async () => {
    const warnings = await get(`/v1/admin/logs/entries?file=${FILE}&minLevel=warn`).expect(200);
    expect(warnings.body.items.map((entry: { msg: string }) => entry.msg)).toEqual([
      'Bank payment id mismatch',
      'bank unreachable',
    ]);
    const search = await get(`/v1/admin/logs/entries?file=${FILE}&search=MISMATCH`).expect(200);
    expect(search.body.items).toHaveLength(1);
  });

  it('refuses paths outside the log directory', async () => {
    await get('/v1/admin/logs/files/secrets.txt').expect(400);
    await get(`/v1/admin/logs/entries?file=${encodeURIComponent('../api.x.log')}`).expect(400);
  });

  it('downloads a file', async () => {
    const response = await get(`/v1/admin/logs/files/${FILE}`).expect(200);
    expect(response.headers['content-disposition']).toContain(FILE);
  });

  it('changes the level of the running process', async () => {
    await request(t.server)
      .put('/v1/admin/logs/level')
      .set('authorization', admin)
      .send({ level: 'debug' })
      .expect(204);
    expect((await get('/v1/admin/logs/level').expect(200)).body).toEqual({ level: 'debug' });
  });
});
