import { describe, it, expect } from '../framework/test-suite';
import { REASSURANCE_PILLARS } from '../framework/domain-engine';

describe('Boundary B11: Reassurance Content Invariants', { tier: 'tier2', featureId: 'B11' }, () => {
  it('B11-T01: Each reassurance pillar contains unique non-empty ID between 1 and 4', () => {
    const ids = REASSURANCE_PILLARS.map(p => p.id);
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  it('B11-T02: No reassurance title or description is shorter than 10 characters', () => {
    for (const p of REASSURANCE_PILLARS) {
      expect(p.titleAr.length).toBeGreaterThan(10);
      expect(p.descAr.length).toBeGreaterThan(20);
    }
  });

  it('B11-T03: Inspection pillar explicitly emphasizes the right to inspect package contents before paying', () => {
    const p1 = REASSURANCE_PILLARS.find(p => p.id === 1);
    expect(p1?.descAr).toContain('فتح الطرد والتأكد');
  });

  it('B11-T04: Delivery pillar explicitly promises fast delivery window of 24 to 48 hours', () => {
    const p2 = REASSURANCE_PILLARS.find(p => p.id === 2);
    expect(p2?.descAr).toContain('24 إلى 48 ساعة');
  });

  it('B11-T05: Payment pillar explicitly confirms hand-to-hand cash payment upon arrival', () => {
    const p3 = REASSURANCE_PILLARS.find(p => p.id === 3);
    expect(p3?.descAr).toContain('نقداً يداً بيد');
  });
});
