import { describe, it, expect } from '../framework/test-suite';
import { isValidAlgerianPhone, normalizeAlgerianPhone } from '../framework/domain-engine';

describe('Feature 6: Algerian Phone Regex (05/06/07)', { tier: 'tier1', featureId: 'F06' }, () => {
  it('F06-T01: Accepts valid 10-digit Ooredoo number starting with 05', () => {
    expect(isValidAlgerianPhone('0550123456')).toBe(true);
    expect(isValidAlgerianPhone('0561998877')).toBe(true);
  });

  it('F06-T02: Accepts valid 10-digit Mobilis number starting with 06', () => {
    expect(isValidAlgerianPhone('0661234567')).toBe(true);
    expect(isValidAlgerianPhone('0699001122')).toBe(true);
  });

  it('F06-T03: Accepts valid 10-digit Djezzy number starting with 07', () => {
    expect(isValidAlgerianPhone('0770123456')).toBe(true);
    expect(isValidAlgerianPhone('0798282495')).toBe(true);
  });

  it('F06-T04: Normalizes international format (+213) to local Algerian 10-digit format', () => {
    const normalized = normalizeAlgerianPhone('+213 798 28 24 95');
    expect(normalized).toBe('0798282495');
    expect(isValidAlgerianPhone('+213 798 28 24 95')).toBe(true);
  });

  it('F06-T05: Rejects landline and invalid prefixes (02, 04, 08, 09, 01)', () => {
    expect(isValidAlgerianPhone('021123456')).toBe(false);
    expect(isValidAlgerianPhone('041987654')).toBe(false);
    expect(isValidAlgerianPhone('0881234567')).toBe(false);
    expect(isValidAlgerianPhone('0991234567')).toBe(false);
  });
});
