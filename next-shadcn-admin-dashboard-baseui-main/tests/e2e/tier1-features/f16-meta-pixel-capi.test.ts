import { describe, it, expect } from '../framework/test-suite';
import { buildMetaCapiPurchaseEvent, hashSha256 } from '../framework/domain-engine';

describe('Feature 16: Meta Pixel & CAPI Deduplication', { tier: 'tier1', featureId: 'F16' }, () => {
  it('F16-T01: SHA-256 phone hashing produces 64-character lowercase hexadecimal hash', () => {
    const hash = hashSha256('0550123456');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('F16-T02: Shared eventId links browser Pixel and server CAPI Purchase events for deduplication', () => {
    const eventId = 'evt-test-12345';
    const event = buildMetaCapiPurchaseEvent({
      eventId,
      orderNumber: 'ORV-261107-555',
      customerName: 'Nabil Saidi',
      customerPhone: '0550123456',
      productName: 'باك كومبريسار و المفاتيح 4 في 1',
      totalPayable: 5450,
      url: 'https://orva-store.com/checkout/confirmation'
    });
    expect(event.eventId).toBe(eventId);
    expect(event.eventName).toBe('Purchase');
  });

  it('F16-T03: Server CAPI event includes customer phone and name hashed with SHA-256', () => {
    const event = buildMetaCapiPurchaseEvent({
      eventId: 'evt-100',
      orderNumber: 'ORV-100',
      customerName: 'Samir',
      customerPhone: '0661234567',
      productName: 'Pack 1',
      totalPayable: 5450,
      url: 'https://orva-store.com'
    });
    expect(event.userData.phone).toBe(hashSha256('0661234567'));
    expect(event.userData.name).toBe(hashSha256('Samir'));
  });

  it('F16-T04: Currency in customData is strictly formatted as DZD (Algerian Dinars)', () => {
    const event = buildMetaCapiPurchaseEvent({
      eventId: 'evt-200',
      orderNumber: 'ORV-200',
      customerName: 'Ali',
      customerPhone: '0770123456',
      productName: 'Pack 2',
      totalPayable: 13890,
      url: 'https://orva-store.com'
    });
    expect(event.customData?.currency).toBe('DZD');
    expect(event.customData?.value).toBe(13890);
  });

  it('F16-T05: Case and whitespace normalization guarantees consistent hash values', () => {
    const hash1 = hashSha256('  Ahmed Ben  ');
    const hash2 = hashSha256('ahmed ben');
    expect(hash1).toBe(hash2);
  });
});
