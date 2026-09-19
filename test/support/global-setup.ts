import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
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

/** Starts one Postgres 18 for the whole e2e run and applies migrations once. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:18-alpine',
  ).start();
  const databaseUrl = container.getConnectionUri();

  if (existsSync(resolve(MIGRATIONS, 'meta', '_journal.json'))) {
    const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS });
    await client.end();
  }

  project.provide('databaseUrl', databaseUrl);
  return async () => {
    await container.stop();
  };
}
