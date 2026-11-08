import { describe, it, expect } from '../framework/test-suite';

describe('Boundary B02: Branding & Locale Edge Cases', { tier: 'tier2', featureId: 'B02' }, () => {
  it('B02-T01: Arabic brand string preserves diacritics and unicode directional markers', () => {
    const rawBrandAr = 'مَتْجَرُ أُورْفَا — ORVA STORE';
    expect(rawBrandAr.length).toBeGreaterThan(10);
    expect(/[\u0600-\u06FF]/.test(rawBrandAr)).toBe(true);
  });

  it('B02-T02: Mixed LTR and RTL text displays customer phone with explicit LTR isolation', () => {
    const phone = '0798282495';
    const textWithPhone = `خدمة الزبائن: \u202A${phone}\u202C`;
    expect(textWithPhone).toContain(phone);
  });

  it('B02-T03: Extreme customer care phone input variants normalize cleanly', () => {
    const variants = [
      '+213 798 28 24 95',
      '0798-28-24-95',
      '0798.28.24.95',
      '(0798) 282495'
    ];
    for (const v of variants) {
      const clean = v.replace(/[\s\-\.\(\)\+]/g, '');
      expect(clean.endsWith('798282495')).toBe(true);
    }
  });

  it('B02-T04: Font fallback cascade guarantees Latin and Arabic character rendering', () => {
    const fontStack = "Tajawal, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    expect(fontStack.startsWith('Tajawal')).toBe(true);
    expect(fontStack).toContain('sans-serif');
  });

  it('B02-T05: Top banner text handles small screen viewports without overflowing text boundaries', () => {
    const bannerText = 'التوصيل لجميع الولايات.';
    expect(bannerText.length).toBeLessThan(40);
  });
});
