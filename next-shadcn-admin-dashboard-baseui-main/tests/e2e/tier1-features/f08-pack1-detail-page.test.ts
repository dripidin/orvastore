import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, resolveProjectPath } from '../framework/test-suite';
import { PRODUCT_PACKS } from '../framework/domain-engine';

describe('Feature 8: Pack 1 Detail Page (4,950 DZD & 4 Items)', { tier: 'tier1', featureId: 'F08' }, () => {
  const pack1HtmlPath = resolveProjectPath('pack1.html');

  it('F08-T01: Pack 1 price is exactly 4,950 DZD with 4,800 DZD savings', () => {
    const pack = PRODUCT_PACKS.PACK1;
    expect(pack.priceDzd).toBe(4950);
    expect(pack.originalPriceDzd).toBe(9750);
    expect(pack.savingsDzd).toBe(4800);
    expect(pack.originalPriceDzd - pack.priceDzd).toBe(pack.savingsDzd);
  });

  it('F08-T02: Pack 1 includes exactly 4 utility and maintenance tools', () => {
    const pack = PRODUCT_PACKS.PACK1;
    expect(pack.itemsCount).toBe(4);
    expect(pack.items.length).toBe(4);
  });

  it('F08-T03: Pack 1 item 1 is TOYOTA tire compressor with built-in pressure gauge', () => {
    const item = PRODUCT_PACKS.PACK1.items[0];
    expect(item).toContain('منفاخ عجلات TOYOTA');
    expect(item).toContain('ضغط');
  });

  it('F08-T04: Pack 1 items 2, 3, 4 include Starcle Pro ratchet keys, flexible screwdriver, and 6-piece screwdriver set', () => {
    const items = PRODUCT_PACKS.PACK1.items;
    expect(items[1]).toContain('46 قطعة');
    expect(items[2]).toContain('11 قطعة');
    expect(items[3]).toContain('6 قطع');
  });

  it('F08-T05: Pack 1 HTML template exists and references Pack 1 webp hero asset', () => {
    expect(fs.existsSync(pack1HtmlPath)).toBe(true);
    const html = fs.readFileSync(pack1HtmlPath, 'utf8');
    expect(html).toContain('pack1 4950.webp');
    expect(html).toContain('4,950 د.ج');
  });
});
