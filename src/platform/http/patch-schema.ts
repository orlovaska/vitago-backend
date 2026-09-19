import { z } from 'zod';

/**
 * Schema for a PATCH body: every field optional and none defaulted.
 *
 * `schema.partial()` is not enough in zod 4: a field declared with
 * `.default()` still receives its default when omitted, so a partial update
 * would silently reset every field the client did not send.
 */
export function patchSchema<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
): ReturnType<z.ZodObject<Shape>['partial']> {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [
      key,
      field instanceof z.ZodDefault ? field.unwrap() : field,
    ]),
  );
  return z.object(shape).partial() as unknown as ReturnType<z.ZodObject<Shape>['partial']>;
}
