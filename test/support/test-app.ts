import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TransactionHost } from '@nestjs-cls/transactional';
import { type Sql } from 'postgres';
import { type App } from 'supertest/types';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { type DbTxHost, SQL_CLIENT } from '../../src/platform/database';
import { configureHttp } from '../../src/platform/http';

export interface TestApp {
  app: INestApplication;
  /** Base for supertest: `request(t.server)`. */
  server: App;
  /** Empties every module table. Use between tests that commit (HTTP requests always do). */
  truncateAll(): Promise<void>;
  /** Runs service-level code in a transaction that is always rolled back. */
  inRollback<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class Rollback extends Error {}

export async function createTestApp(): Promise<TestApp> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = inject('databaseUrl');
  process.env.LOG_LEVEL ??= 'warn';
  process.env.USER_JWT_SECRET = 'test-user-jwt-secret-0000000000000000';
  process.env.ADMIN_JWT_SECRET = 'test-admin-jwt-secret-000000000000000';
  process.env.DEVICE_SECRET_PEPPER = 'test-device-pepper-00000000000000000';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureHttp(app);
  await app.init();

  const sql = app.get<Sql>(SQL_CLIENT);
  const txHost = app.get<DbTxHost>(TransactionHost);

  return {
    app,
    server: app.getHttpServer() as App,
    async truncateAll() {
      const tables = await sql<{ name: string }[]>`
        select format('%I.%I', table_schema, table_name) as name
        from information_schema.tables
        where table_type = 'BASE TABLE'
          and table_schema not in ('pg_catalog', 'information_schema', 'drizzle', 'public')`;
      if (tables.length > 0) {
        await sql.unsafe(
          `truncate ${tables.map((table) => table.name).join(', ')} restart identity cascade`,
        );
      }
    },
    async inRollback<T>(fn: () => Promise<T>): Promise<T> {
      let result: T | undefined;
      try {
        await txHost.withTransaction(async () => {
          result = await fn();
          throw new Rollback();
        });
      } catch (error) {
        if (!(error instanceof Rollback)) throw error;
      }
      return result as T;
    },
    close: () => app.close(),
  };
}
