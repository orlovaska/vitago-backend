import { defineConfig } from 'drizzle-kit';

// Each module declares its tables in its own Postgres schema (see src/modules/*/*.tables.ts).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/*.tables.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
