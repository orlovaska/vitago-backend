import { createHash, timingSafeEqual } from 'node:crypto';

type Scalar = string | number | boolean;

/**
 * T-Bank request signature: take the top-level scalar fields (nested objects
 * such as Receipt and DATA are left out), add the terminal Password, sort by
 * key, concatenate the values and hash with SHA-256.
 */
export function tbankToken(fields: Record<string, unknown>, password: string): string {
  const scalars: Record<string, Scalar> = { Password: password };
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'Token') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      scalars[key] = value;
    }
  }
  const joined = Object.keys(scalars)
    .sort()
    .map((key) => String(scalars[key]))
    .join('');
  return createHash('sha256').update(joined).digest('hex');
}

export function isValidTbankToken(fields: Record<string, unknown>, password: string): boolean {
  const received = fields.Token;
  if (typeof received !== 'string' || !/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = tbankToken(fields, password);
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received.toLowerCase(), 'hex'));
}
