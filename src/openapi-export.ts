import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_TAG, buildOpenApiDocument, configureHttp, filterOpenApiByTag } from './platform/http';

/**
 * Writes the API contract for client type generation: the full document, plus
 * the `app` half beside it. The mobile app generates its types from the second
 * one — the desktop contract has no business living in the application sources.
 *
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
  // Same name with `.app` before the extension: one command keeps both files
  // in step, so they can never describe different versions of the API.
  const appTarget = target.replace(/(\.json)?$/, '.app.json');
  writeFileSync(target, serialize(document));
  writeFileSync(appTarget, serialize(filterOpenApiByTag(document, APP_TAG)));
  await app.close();
  console.log(`OpenAPI document written to ${target} and ${appTarget}`);
}

const serialize = (document: unknown): string => `${JSON.stringify(document, null, 2)}\n`;

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
