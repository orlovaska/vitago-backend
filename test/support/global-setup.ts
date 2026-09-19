import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { type TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const MIGRATIONS = resolve(__dirname, '..', '..', 'drizzle');

/**
 * Starts one Postgres 18 for the whole e2e run and applies migrations once.
 * TEST_DATABASE_URL points the run at an existing, disposable database
 * instead (no Docker needed); every module schema in it is dropped first.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const external = process.env.TEST_DATABASE_URL;
  const container = external
    ? undefined
    : await new PostgreSqlContainer('postgres:18-alpine').start();
  const databaseUrl = external ?? container!.getConnectionUri();

  const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    if (external) await dropAllSchemas(client);
    if (existsSync(resolve(MIGRATIONS, 'meta', '_journal.json'))) {
      await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS });
    }
  } finally {
    await client.end();
  }

  project.provide('databaseUrl', databaseUrl);
  return async () => {
    await container?.stop();
  };
}

async function dropAllSchemas(client: postgres.Sql): Promise<void> {
  const schemas = await client<{ name: string }[]>`
    select schema_name as name from information_schema.schemata
    where schema_name not in ('public', 'information_schema') and schema_name not like 'pg\\_%'`;
  for (const { name } of schemas) {
    await client.unsafe(`drop schema "${name}" cascade`);
  }
}
