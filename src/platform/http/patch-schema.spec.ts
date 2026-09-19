import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { patchSchema } from './patch-schema';

describe('patchSchema', () => {
  const schema = z.object({
    active: z.boolean().default(true),
    tags: z.array(z.string()).default([]),
    name: z.string(),
  });

  it('leaves omitted fields out instead of filling in defaults', () => {
    expect(patchSchema(schema).parse({ name: 'x' })).toEqual({ name: 'x' });
  });

  it('still validates the fields that are sent', () => {
    expect(patchSchema(schema).safeParse({ active: 'yes' }).success).toBe(false);
    expect(patchSchema(schema).parse({ active: false })).toEqual({ active: false });
  });
});
