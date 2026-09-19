import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isValidTbankToken, tbankToken } from './tbank-token';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('tbankToken', () => {
  it('hashes sorted scalar values with the password, skipping nested objects', () => {
    const fields = {
      TerminalKey: 'Term',
      Amount: 1000,
      OrderId: 'o-1',
      Receipt: { Email: 'a@b.c' },
      Success: true,
    };
    // Keys sorted: Amount, OrderId, Password, Success, TerminalKey
    expect(tbankToken(fields, 'pwd')).toBe(sha256('1000o-1pwdtrueTerm'));
  });

  it('accepts a correctly signed notification and nothing else', () => {
    const notification: Record<string, unknown> = {
      TerminalKey: 'Term',
      OrderId: 'o-1',
      Status: 'CONFIRMED',
      Amount: 49900,
      Success: true,
      Data: { anything: 'nested' },
    };
    notification.Token = tbankToken(notification, 'pwd');

    expect(isValidTbankToken(notification, 'pwd')).toBe(true);
    expect(isValidTbankToken(notification, 'other')).toBe(false);
    expect(isValidTbankToken({ ...notification, Amount: 1 }, 'pwd')).toBe(false);
    expect(isValidTbankToken({ ...notification, Token: 'short' }, 'pwd')).toBe(false);
  });
});
