import { describe, it, expect } from '../framework/test-suite';
import { PRODUCT_PACKS } from '../framework/domain-engine';

describe('Boundary B08: Pack 1 Pricing & Item Inventory Invariants', { tier: 'tier2', featureId: 'B08' }, () => {
  const pack = PRODUCT_PACKS.PACK1;

  it('B08-T01: Pack 1 price invariant is exactly 4,950 DZD', () => {
    expect(pack.priceDzd).toBe(4950);
  });

  it('B08-T02: Pack 1 items array has length strictly equal to 4', () => {
    expect(pack.items).toHaveLength(4);
  });

  it('B08-T03: No item description in Pack 1 is empty or less than 10 characters', () => {
    for (const item of pack.items) {
      expect(typeof item).toBe('string');
      expect(item.length).toBeGreaterThan(10);
    }
  });

  it('B08-T04: Savings calculation is exactly 4,800 DZD', () => {
    expect(pack.savingsDzd).toBe(4800);
    expect(pack.originalPriceDzd - 4950).toBe(4800);
  });

  it('B08-T05: Hero asset path references pack-1 directory with valid file extension', () => {
    expect(pack.heroAsset).toMatch(/pack.*4950\.(webp|jpg|png)/);
  });
});
