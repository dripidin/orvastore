import { describe, it, expect } from '../framework/test-suite';
import { normalizeAlgerianPhone, isValidAlgerianPhone } from '../framework/domain-engine';

describe('Boundary B06: Phone Formatting & Prefix Edge Cases', { tier: 'tier2', featureId: 'B06' }, () => {
  it('B06-T01: International format with double zeros 00213 normalizes to 10 digits', () => {
    const norm = normalizeAlgerianPhone('00213 550 12 34 56');
    expect(norm).toBe('0550123456');
    expect(isValidAlgerianPhone(norm)).toBe(true);
  });

  it('B06-T02: Format with country code without plus 213550123456 normalizes correctly', () => {
    const norm = normalizeAlgerianPhone('213550123456');
    expect(norm).toBe('0550123456');
  });

  it('B06-T03: Phone with heavy punctuation (slashes, brackets, hyphens) sanitizes cleanly', () => {
    const raw = '(07) 70-12/34.56';
    const norm = normalizeAlgerianPhone(raw);
    expect(norm.includes('0770123456')).toBe(true);
  });

  it('B06-T04: Numbers with 9 digits or 11 digits are rejected', () => {
    expect(isValidAlgerianPhone('055012345')).toBe(false); // 9 digits
    expect(isValidAlgerianPhone('05501234567')).toBe(false); // 11 digits
  });

  it('B06-T05: Numbers containing alphabetic or special characters are rejected', () => {
    expect(isValidAlgerianPhone('055012345A')).toBe(false);
    expect(isValidAlgerianPhone('077012345#')).toBe(false);
  });
});
