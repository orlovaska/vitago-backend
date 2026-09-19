import { describe, expect, it } from 'vitest';
import { applyDiscount, normalizeCode } from './promotions.service';

describe('promo code helpers', () => {
  it('rounds the discounted price to whole kopecks', () => {
    expect(applyDiscount(49_900, 10)).toBe(44_910);
    expect(applyDiscount(33_333, 15)).toBe(28_333);
    expect(applyDiscount(49_900, 100)).toBe(0);
  });

  it('ignores case and surrounding spaces', () => {
    expect(normalizeCode('  spring-25 ')).toBe('SPRING-25');
  });
});
