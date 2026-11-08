import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from '../framework/test-suite';
import { PRODUCT_PACKS } from '../framework/domain-engine';

describe('Feature 9: Pack 2 Detail Page (5 Items & Crown 20V Drill)', { tier: 'tier1', featureId: 'F09' }, () => {
  const pack2HtmlPath = path.resolve(__dirname, '../../../../pack2.html');

  it('F09-T01: Pack 2 represents Pro Workshop pack with 5 tools', () => {
    const pack = PRODUCT_PACKS.PACK2;
    expect(pack.itemsCount).toBe(5);
    expect(pack.items.length).toBe(5);
  });

  it('F09-T02: Pack 2 core tool is Crown 20V drill with 2 batteries and 29 accessories', () => {
    const drillItem = PRODUCT_PACKS.PACK2.items[0];
    expect(drillItem).toContain('CROWN 20V');
    expect(drillItem).toContain('2 بطاريات');
    expect(drillItem).toContain('29 قطعة');
  });

  it('F09-T03: Pack 2 includes professional GILAN protective gloves', () => {
    const glovesItem = PRODUCT_PACKS.PACK2.items[4];
    expect(glovesItem).toContain('GILAN');
    expect(glovesItem).toContain('قفازات');
  });

  it('F09-T04: Pack 2 pricing structure reflects significant customer savings', () => {
    const pack = PRODUCT_PACKS.PACK2;
    expect(pack.priceDzd).toBe(13390);
    expect(pack.originalPriceDzd).toBe(21250);
    expect(pack.savingsDzd).toBe(7860);
    expect(pack.originalPriceDzd - pack.priceDzd).toBe(pack.savingsDzd);
  });

  it('F09-T05: Pack 2 HTML template exists and references Pack 2 image asset', () => {
    expect(fs.existsSync(pack2HtmlPath)).toBe(true);
    const html = fs.readFileSync(pack2HtmlPath, 'utf8');
    expect(html).toContain('pack2 12950');
    expect(html).toContain('13,390 د.ج');
  });
});
