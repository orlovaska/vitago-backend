import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttp, buildOpenApiDocument } from './platform/http';

/**
 * Writes the API contract to openapi.json for client type generation.
 * No database or real secrets are needed: nothing here connects or signs.
 */
async function run(): Promise<void> {
  process.env.DATABASE_URL ??= 'postgres://openapi-export@localhost/unused';
  for (const key of ['USER_JWT_SECRET', 'ADMIN_JWT_SECRET', 'DEVICE_SECRET_PEPPER']) {
    process.env[key] ??= 'openapi-export-only-'.padEnd(32, '0');
  }
  const app = await NestFactory.create(AppModule, { logger: false });
  configureHttp(app);
  const document = buildOpenApiDocument(app);
  const target = process.argv[2] ?? 'openapi.json';
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  console.log(`OpenAPI document written to ${target}`);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
