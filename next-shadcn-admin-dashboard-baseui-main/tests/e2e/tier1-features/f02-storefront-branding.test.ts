import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from '../framework/test-suite';

describe('Feature 2: Storefront Branding & Tajawal Font', { tier: 'tier1', featureId: 'F02' }, () => {
  const pack1Path = path.resolve(__dirname, '../../../../pack1.html');

  it('F02-T01: Brand name ORVA STORE is prominently featured in storefront header', () => {
    expect(fs.existsSync(pack1Path)).toBe(true);
    const html = fs.readFileSync(pack1Path, 'utf8');
    expect(html).toContain('ORVA');
    expect(html).toContain('STORE');
  });

  it('F02-T02: Algerian customer support phone 0798282495 is displayed in header', () => {
    const html = fs.readFileSync(pack1Path, 'utf8');
    expect(html).toContain('0798282495');
    expect(html).toContain('خدمة الزبائن: 0798282495');
  });

  it('F02-T03: Document direction is RTL and language is Arabic', () => {
    const html = fs.readFileSync(pack1Path, 'utf8');
    expect(html).toMatch(/<html[^>]*dir=["']rtl["']/);
    expect(html).toMatch(/<html[^>]*lang=["']ar["']/);
  });

  it('F02-T04: Tajawal Google Font is linked for legibility and Arabic aesthetics', () => {
    const html = fs.readFileSync(pack1Path, 'utf8');
    expect(html).toContain('family=Tajawal');
  });

  it('F02-T05: Top reassurance banner announces delivery to all 58 Wilayas', () => {
    const html = fs.readFileSync(pack1Path, 'utf8');
    expect(html).toContain('التوصيل لجميع الولايات');
  });
});
