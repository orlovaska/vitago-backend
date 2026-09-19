import { describe, expect, it } from 'vitest';
import { canTransition, sourcesOf, statusForBank } from './order-state';

describe('order state machine', () => {
  it.each([
    ['created', 'awaiting_payment'],
    ['created', 'paid'],
    ['awaiting_payment', 'paid'],
    ['awaiting_payment', 'failed'],
    ['awaiting_payment', 'expired'],
    ['expired', 'paid'],
    ['paid', 'refunded'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['paid', 'created'],
    ['paid', 'failed'],
    ['paid', 'expired'],
    ['failed', 'paid'],
    ['refunded', 'paid'],
    ['expired', 'failed'],
    ['awaiting_payment', 'refunded'],
  ] as const)('refuses %s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('knows every state a payment can be confirmed from', () => {
    expect(sourcesOf('paid').sort()).toEqual(['awaiting_payment', 'created', 'expired']);
  });

  it.each([
    ['CONFIRMED', 'paid'],
    ['REJECTED', 'failed'],
    ['AUTH_FAIL', 'failed'],
    ['CANCELED', 'failed'],
    ['DEADLINE_EXPIRED', 'expired'],
    ['REFUNDED', 'refunded'],
    ['PARTIAL_REFUNDED', 'refunded'],
    ['AUTHORIZED', null],
    ['NEW', null],
  ])('maps bank status %s to %s', (bank, expected) => {
    expect(statusForBank(bank)).toBe(expected);
  });
});
