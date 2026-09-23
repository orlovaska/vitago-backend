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
    // zod 4 describes schemas in JSON Schema 2020-12 (`type: ['string', 'null']`);
    // declaring 3.1 keeps the document honest instead of mixing both dialects
    .setOpenAPIVersion('3.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, USER_AUTH)
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, ADMIN_AUTH)
    .addTag(APP_TAG, 'Mobile application')
    .addTag(ADMIN_TAG, 'Desktop administration')
    .build();

  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}

/**
 * The contract carries two audiences in one document, split by tag. The mobile
 * app generates its types from this file, so shipping the admin half means the
 * whole desktop contract lives in the application sources for no reason.
 *
 * This returns a document with one tag's operations and nothing else: paths
 * that have no operation with the tag are dropped, and so are schemas and
 * security schemes that only those paths referenced.
 */
export function filterOpenApiByTag(doc: OpenAPIObject, tag: string): OpenAPIObject {
  const paths: OpenAPIObject['paths'] = {};
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    const kept = keepTaggedOperations(item as Record<string, unknown>, tag);
    if (kept) paths[path] = kept;
  }

  return {
    ...doc,
    paths,
    tags: (doc.tags ?? []).filter((declared) => declared.name === tag),
    components: {
      ...doc.components,
      schemas: reachableSchemas(paths, doc.components?.schemas ?? {}),
      securitySchemes: keepNamed(doc.components?.securitySchemes ?? {}, usedSecurityNames(paths)),
    },
  };
}

/** Everything a path item may hold besides operations stays untouched. */
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

function keepTaggedOperations(
  item: Record<string, unknown>,
  tag: string,
): Record<string, unknown> | null {
  const kept: Record<string, unknown> = {};
  let hasOperation = false;

  for (const [key, value] of Object.entries(item)) {
    if (!HTTP_METHODS.includes(key)) {
      kept[key] = value;
      continue;
    }
    const tags = (value as { tags?: string[] } | null)?.tags ?? [];
    if (tags.includes(tag)) {
      kept[key] = value;
      hasOperation = true;
    }
  }

  // A path item without operations is not a path: shared parameters alone
  // describe nothing to call.
  return hasOperation ? kept : null;
}

const SCHEMA_REF = '#/components/schemas/';

function collectRefs(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, into);
    return;
  }
  if (typeof value !== 'object' || value === null) return;

  for (const [key, nested] of Object.entries(value)) {
    if (key === '$ref' && typeof nested === 'string' && nested.startsWith(SCHEMA_REF)) {
      into.add(nested.slice(SCHEMA_REF.length));
      continue;
    }
    collectRefs(nested, into);
  }
}

const keepNamed = <T>(entries: Record<string, T>, names: Set<string>): Record<string, T> =>
  Object.fromEntries(Object.entries(entries).filter(([name]) => names.has(name)));

/**
 * Schemas the kept paths can reach, directly or through other schemas. Today
 * nestjs-zod inlines nested objects and no schema references another, so the
 * walk finds nothing past the first step — but the first shared DTO that comes
 * in as a `$ref` would otherwise be dropped and leave a document that does not
 * resolve. A schema used by both audiences stays in both documents; one used
 * only by the dropped half goes with it.
 */
function reachableSchemas<T>(
  paths: OpenAPIObject['paths'],
  schemas: Record<string, T>,
): Record<string, T> {
  const queue: string[] = [];
  const seed = new Set<string>();
  collectRefs(paths, seed);
  queue.push(...seed);

  const reached = new Set<string>();
  while (queue.length > 0) {
    const name = queue.pop();
    if (name === undefined || reached.has(name) || !(name in schemas)) continue;
    reached.add(name);
    const nested = new Set<string>();
    collectRefs(schemas[name], nested);
    queue.push(...nested);
  }

  return keepNamed(schemas, reached);
}

/** The app half never sends an admin token, so its document must not offer one. */
function usedSecurityNames(paths: OpenAPIObject['paths']): Set<string> {
  const used = new Set<string>();
  for (const item of Object.values(paths ?? {})) {
    for (const [key, operation] of Object.entries(item as Record<string, unknown>)) {
      if (!HTTP_METHODS.includes(key)) continue;
      const security = (operation as { security?: Record<string, unknown>[] } | null)?.security;
      for (const requirement of security ?? []) {
        for (const name of Object.keys(requirement)) used.add(name);
      }
    }
  }

  return used;
}

export function serveOpenApiDocs(app: INestApplication): void {
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, buildOpenApiDocument(app), {
    jsonDocumentUrl: `${API_PREFIX}/openapi.json`,
  });
}
