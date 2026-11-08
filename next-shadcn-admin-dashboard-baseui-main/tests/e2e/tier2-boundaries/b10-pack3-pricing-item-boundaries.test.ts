import { describe, it, expect } from '../framework/test-suite';
import { PRODUCT_PACKS } from '../framework/domain-engine';

describe('Boundary B10: Pack 3 Pricing & Welding Equipment Invariants', { tier: 'tier2', featureId: 'B10' }, () => {
  const pack = PRODUCT_PACKS.PACK3;

  it('B10-T01: Pack 3 price invariant is exactly 15,950 DZD', () => {
    expect(pack.priceDzd).toBe(15950);
  });

  it('B10-T02: Pack 3 items array has length strictly equal to 6', () => {
    expect(pack.items).toHaveLength(6);
  });

  it('B10-T03: Core tool specifies MMA-200 MINI welding machine model CT33102', () => {
    expect(pack.items[0]).toContain('CROWN CT33102 MMA-200 MINI');
  });

  it('B10-T04: Safety system explicitly cites VRD voltage reduction system', () => {
    expect(pack.items[2]).toContain('VRD');
  });

  it('B10-T05: Protective gear item explicitly details anti-cut GILAN gloves', () => {
    expect(pack.items[3]).toContain('GILAN Anti-Cut');
  });
});
