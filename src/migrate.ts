import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { loadDotEnvFile, loadEnv } from './platform/config';

/**
 * Applies pending migrations and exits. Runs as a one-off container before
 * the API starts, so the API itself never changes the schema.
 */
async function run(): Promise<void> {
  loadDotEnvFile();
  const env = loadEnv();
  const client = postgres(env.DATABASE_URL, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle({ client }), {
      migrationsFolder: resolve(__dirname, '..', 'drizzle'),
    });
    console.log('Migrations applied');
  } finally {
    await client.end();
  }
}

run().catch((error: unknown) => {
  console.error('Migration failed', error);
  process.exit(1);
});
