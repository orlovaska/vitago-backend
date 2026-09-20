import { createZodDto as baseCreateZodDto, type ZodDto } from 'nestjs-zod';

type PropertySchema = Record<string, unknown>;
type Properties = Record<string, PropertySchema>;

/** Stays on the property itself; everything else describes the value. */
const PARENT_KEYS = new Set(['required', 'description', 'title', 'deprecated', 'example']);

/**
 * JSON Schema 2020-12 writes "nullable string" as `type: ['string', 'null']`,
 * but @nestjs/swagger reads an array `type` as a nested array type and turns
 * the field into `string[]`, silently dropping the null. Rewriting such a
 * property into the `anyOf` form swagger passes through keeps the contract
 * honest: `string | null` in the generated clients.
 */
function fixNullableProperties(properties: Properties): Properties {
  const fixed: Properties = {};
  for (const [key, property] of Object.entries(properties)) {
    const type = property.type;
    if (!Array.isArray(type)) {
      fixed[key] = property;
      continue;
    }
    const parent: PropertySchema = {};
    const value: PropertySchema = {};
    for (const [name, entry] of Object.entries(property)) {
      if (name === 'type') {
        continue;
      }
      // nestjs-zod's own bookkeeping (x-nestjs_zod-*) is read back on the property
      (PARENT_KEYS.has(name) || name.startsWith('x-') ? parent : value)[name] = entry;
    }
    fixed[key] = {
      ...parent,
      // Empty type + a combinator is the shape nestjs-zod already uses for unions
      type: '',
      anyOf: (type as string[]).map((one) =>
        one === 'null' ? { type: one } : { ...value, type: one },
      ),
    };
  }
  return fixed;
}

/**
 * `this` is left alone on purpose: nestjs-zod names the output schema after
 * the class the getter is called on, so `TourContentDto.Output` must still see
 * the subclass and not the base this wrapper returns.
 */
function withFixedMetadata<T>(dto: T): T {
  const target = dto as object as {
    _OPENAPI_METADATA_FACTORY?: (this: unknown) => unknown;
  };
  const factory = target._OPENAPI_METADATA_FACTORY;
  if (factory) {
    Object.defineProperty(target, '_OPENAPI_METADATA_FACTORY', {
      configurable: true,
      value: function (this: unknown) {
        return fixNullableProperties(factory.call(this) as Properties);
      },
    });
  }
  const output = Object.getOwnPropertyDescriptor(target, 'Output');
  const get = output?.get as ((this: unknown) => unknown) | undefined;
  if (get) {
    Object.defineProperty(target, 'Output', {
      configurable: true,
      get: function (this: unknown) {
        return withFixedMetadata(get.call(this));
      },
    });
  }
  return dto;
}

/**
 * `createZodDto` from nestjs-zod with nullable fields repaired. Always import
 * it from here — the plain one from nestjs-zod produces a broken contract.
 */
export function createZodDto<TSchema extends Parameters<typeof baseCreateZodDto>[0]>(
  schema: TSchema,
): ZodDto<TSchema, false> {
  return withFixedMetadata(baseCreateZodDto(schema));
}
