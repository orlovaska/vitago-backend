import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { API_PREFIX } from './configure-http';

/** Security scheme names referenced by guards' @ApiBearerAuth(). */
export const USER_AUTH = 'user';
export const ADMIN_AUTH = 'admin';

/** OpenAPI tags that split the contract between the mobile app and the desktop admin. */
export const APP_TAG = 'app';
export const ADMIN_TAG = 'admin';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Vitago API')
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, USER_AUTH)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, ADMIN_AUTH)
    .addTag(APP_TAG, 'Mobile application')
    .addTag(ADMIN_TAG, 'Desktop administration')
    .build();

  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}

export function serveOpenApiDocs(app: INestApplication): void {
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: `${API_PREFIX}/openapi.json`,
  });
}
