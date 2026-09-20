import { describe, expect, it } from 'vitest';
import { walkPrice, type WalkPricing } from './walk-pricing';

const pricing: WalkPricing = {
  mode: 'tiered',
  perPointKopecks: 1500,
  minKopecks: 9900,
  maxKopecks: 49900,
  tiers: [
    { upToPoints: 3, priceKopecks: 9900 },
    { upToPoints: 7, priceKopecks: 19900 },
    { upToPoints: 15, priceKopecks: 29900 },
    { upToPoints: null, priceKopecks: 39900 },
  ],
};

describe('walkPrice', () => {
  it('charges nothing when every point is already open', () => {
    expect(walkPrice(0, pricing)).toBe(0);
  });

  it.each([
    [1, 9900],
    [3, 9900],
    [4, 19900],
    [7, 19900],
    [8, 29900],
    [15, 29900],
    [16, 39900],
    [200, 39900],
  ])('takes the tier that covers %i locked points: %i kopecks', (locked, expected) => {
    expect(walkPrice(locked, pricing)).toBe(expected);
  });

  it('multiplies by the number of points in the per_point mode', () => {
    const perPoint = { ...pricing, mode: 'per_point' as const };
    expect(walkPrice(10, perPoint)).toBe(15_000);
  });

  it('never goes below the lowest or above the highest price', () => {
    const perPoint = { ...pricing, mode: 'per_point' as const };
    expect(walkPrice(1, perPoint)).toBe(9900);
    expect(walkPrice(100, perPoint)).toBe(49_900);
  });

  it('charges the same for any walk in the fixed mode', () => {
    const fixed = { ...pricing, mode: 'fixed' as const };
    expect(walkPrice(1, fixed)).toBe(9900);
    expect(walkPrice(30, fixed)).toBe(9900);
  });

  it('falls back to the lowest price when no tier matches', () => {
    const broken = { ...pricing, tiers: [{ upToPoints: 2, priceKopecks: 100_000 }] };
    expect(walkPrice(50, broken)).toBe(9900);
  });
});
