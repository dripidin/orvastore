import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from '../framework/test-suite';
import { PRODUCT_PACKS } from '../framework/domain-engine';

describe('Feature 10: Pack 3 Detail Page (15,950 DZD & 6 Welding Items)', { tier: 'tier1', featureId: 'F10' }, () => {
  const pack3HtmlPath = path.resolve(__dirname, '../../../../pack3.html');

  it('F10-T01: Pack 3 price is exactly 15,950 DZD', () => {
    const pack = PRODUCT_PACKS.PACK3;
    expect(pack.priceDzd).toBe(15950);
    expect(pack.originalPriceDzd).toBe(24500);
    expect(pack.savingsDzd).toBe(8550);
  });

  it('F10-T02: Pack 3 includes exactly 6 welding tools and safety equipment', () => {
    const pack = PRODUCT_PACKS.PACK3;
    expect(pack.itemsCount).toBe(6);
    expect(pack.items.length).toBe(6);
  });

  it('F10-T03: Pack 3 features Crown CT33102 MMA-200 Mini welder with current control', () => {
    const welder = PRODUCT_PACKS.PACK3.items[0];
    expect(welder).toContain('CROWN CT33102 MMA-200 MINI');
    const currentControl = PRODUCT_PACKS.PACK3.items[1];
    expect(currentControl).toContain('Current Control');
  });

  it('F10-T04: Pack 3 specifies integrated VRD safety voltage reduction and anti-cut GILAN gloves', () => {
    const vrd = PRODUCT_PACKS.PACK3.items[2];
    expect(vrd).toContain('VRD');
    const gloves = PRODUCT_PACKS.PACK3.items[3];
    expect(gloves).toContain('GILAN Anti-Cut');
  });

  it('F10-T05: Pack 3 HTML template exists and references Pack 3 webp hero asset', () => {
    expect(fs.existsSync(pack3HtmlPath)).toBe(true);
    const html = fs.readFileSync(pack3HtmlPath, 'utf8');
    expect(html).toContain('pack3 15950.webp');
    expect(html).toContain('15,950 د.ج');
  });
});
