import { type OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import { ADMIN_TAG, APP_TAG, filterOpenApiByTag } from './openapi';

/**
 * The mobile app generates its types from the filtered document, so a schema
 * dropped by mistake is a contract that no longer resolves — and a path kept
 * by mistake is the admin API shipped inside the application sources.
 */
describe('filterOpenApiByTag', () => {
  const document = {
    openapi: '3.1.0',
    info: { title: 'Vitago API', version: '1' },
    tags: [{ name: APP_TAG }, { name: ADMIN_TAG }],
    paths: {
      '/v1/tours': {
        get: {
          tags: [APP_TAG],
          responses: {
            200: { content: { 'application/json': { schema: { $ref: ref('TourDto') } } } },
          },
        },
      },
      '/v1/admin/tours': {
        // Shared path: one operation per audience, and only one may survive
        get: {
          tags: [ADMIN_TAG],
          security: [{ admin: [] }],
          responses: {
            200: { content: { 'application/json': { schema: { $ref: ref('AdminTourDto') } } } },
          },
        },
        post: { tags: [APP_TAG], security: [{ user: [] }], responses: { 201: {} } },
      },
      '/v1/admin/logs': {
        get: {
          tags: [ADMIN_TAG],
          security: [{ admin: [] }],
          responses: {
            200: { content: { 'application/json': { schema: { $ref: ref('LogDto') } } } },
          },
        },
      },
    },
    components: {
      schemas: {
        TourDto: { type: 'object', properties: { media: { $ref: ref('MediaDto') } } },
        AdminTourDto: { type: 'object', properties: { media: { $ref: ref('MediaDto') } } },
        LogDto: { type: 'object', properties: { entry: { $ref: ref('LogEntryDto') } } },
        LogEntryDto: { type: 'object' },
        MediaDto: { type: 'object' },
      },
      securitySchemes: {
        user: { type: 'http', scheme: 'bearer' },
        admin: { type: 'http', scheme: 'bearer' },
      },
    },
  } as unknown as OpenAPIObject;

  const filtered = filterOpenApiByTag(document, APP_TAG);

  it('keeps only paths with an operation of the tag', () => {
    expect(Object.keys(filtered.paths)).toEqual(['/v1/tours', '/v1/admin/tours']);
  });

  it('drops the other audience operations inside a kept path', () => {
    expect(Object.keys(filtered.paths['/v1/admin/tours'] ?? {})).toEqual(['post']);
  });

  it('drops schemas only the removed paths referenced, with their nested ones', () => {
    const schemas = Object.keys(filtered.components?.schemas ?? {}).sort();

    expect(schemas).toEqual(['MediaDto', 'TourDto']);
  });

  it('keeps a schema reached through another schema', () => {
    // MediaDto is referenced by no path, only by TourDto
    expect(filtered.components?.schemas?.MediaDto).toBeDefined();
  });

  it('keeps a schema shared by both audiences', () => {
    const adminOnly = filterOpenApiByTag(document, ADMIN_TAG);

    expect(Object.keys(adminOnly.components?.schemas ?? {}).sort()).toEqual([
      'AdminTourDto',
      'LogDto',
      'LogEntryDto',
      'MediaDto',
    ]);
  });

  it('offers only the security schemes the kept operations use', () => {
    expect(Object.keys(filtered.components?.securitySchemes ?? {})).toEqual(['user']);
  });

  it('declares one tag', () => {
    expect(filtered.tags).toEqual([{ name: APP_TAG }]);
  });

  it('leaves the source document untouched', () => {
    expect(Object.keys(document.paths)).toHaveLength(3);
    expect(Object.keys(document.components?.schemas ?? {})).toHaveLength(5);
  });
});

function ref(name: string): string {
  return `#/components/schemas/${name}`;
}
