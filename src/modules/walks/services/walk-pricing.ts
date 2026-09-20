/** The settings that decide what unlocking a walk costs. */
export interface WalkPricing {
  mode: 'per_point' | 'tiered' | 'fixed';
  perPointKopecks: number;
  minKopecks: number;
  maxKopecks: number;
  tiers: { upToPoints: number | null; priceKopecks: number }[];
}

/**
 * What the user pays to unlock the locked points of a walk. A walk with
 * nothing locked is free, and every mode stays between the configured lowest
 * and highest price, so a misconfigured tier cannot charge an absurd amount.
 */
export function walkPrice(lockedCount: number, pricing: WalkPricing): number {
  if (lockedCount <= 0) return 0;
  const raw = rawPrice(lockedCount, pricing);
  return Math.min(Math.max(raw, pricing.minKopecks), pricing.maxKopecks);
}

function rawPrice(lockedCount: number, pricing: WalkPricing): number {
  switch (pricing.mode) {
    case 'fixed':
      return pricing.minKopecks;
    case 'per_point':
      return pricing.perPointKopecks * lockedCount;
    case 'tiered': {
      const tier = pricing.tiers.find(
        (candidate) => candidate.upToPoints === null || lockedCount <= candidate.upToPoints,
      );
      return tier?.priceKopecks ?? pricing.minKopecks;
    }
  }
}
