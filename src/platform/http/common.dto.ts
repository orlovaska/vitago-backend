import { z } from 'zod';
import { createZodDto } from './zod-dto';

/** `:id` route parameter; anything but a UUID is a 400, not a database error. */
export class IdParamDto extends createZodDto(z.object({ id: z.uuid() })) {}

/** Opaque cursor for keyset pagination: the last item's sort key and id. */
export interface Cursor {
  at: Date;
  id: string;
}

export function encodeCursor({ at, id }: Cursor): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): Cursor | undefined {
  if (!cursor) return undefined;
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const date = new Date(at ?? '');
  if (!id || Number.isNaN(date.getTime())) return undefined;
  return { at: date, id };
}

export const pageQuery = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
};
