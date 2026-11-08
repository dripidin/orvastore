import { describe, it, expect } from '../framework/test-suite';
import { hashSha256, buildMetaCapiPurchaseEvent } from '../framework/domain-engine';

describe('Boundary B16: Meta CAPI Hashing & Dedup Boundaries', { tier: 'tier2', featureId: 'B16' }, () => {
  it('B16-T01: Empty string produces standard SHA-256 hash representation without crashing', () => {
    const hash = hashSha256('');
    expect(hash).toHaveLength(64);
  });

  it('B16-T02: Case-insensitive hashing produces identical hashes for different letter casings', () => {
    const lower = hashSha256('karim');
    const upper = hashSha256('KARIM');
    const mixed = hashSha256('KaRiM');
    expect(lower).toBe(upper);
    expect(lower).toBe(mixed);
  });

  it('B16-T03: Phone numbers with formatting symbols produce identical hash after normalization', () => {
    const hash1 = hashSha256('0550123456');
    const event = buildMetaCapiPurchaseEvent({
      eventId: 'evt-test',
      orderNumber: 'ORV-1',
      customerName: 'Karim',
      customerPhone: '+213 550 12 34 56',
      productName: 'Pack 1',
      totalPayable: 5450,
      url: 'https://orva-store.com'
    });
    expect(event.userData.phone).toBe(hash1);
  });

  it('B16-T04: Extreme order values (> 100,000 DZD) serialize without scientific notation in CAPI payload', () => {
    const event = buildMetaCapiPurchaseEvent({
      eventId: 'evt-high',
      orderNumber: 'ORV-HIGH',
      customerName: 'VIP Buyer',
      customerPhone: '0661234567',
      productName: 'Pack 3 Bundle',
      totalPayable: 159500,
      url: 'https://orva-store.com'
    });
    expect(event.customData?.value).toBe(159500);
  });

  it('B16-T05: Deduplication eventId preserves exact client token across serialization', () => {
    const randomUuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const event = buildMetaCapiPurchaseEvent({
      eventId: randomUuid,
      orderNumber: 'ORV-UUID',
      customerName: 'Samir',
      customerPhone: '0770123456',
      productName: 'Pack 1',
      totalPayable: 5450,
      url: 'https://orva-store.com'
    });
    expect(event.eventId).toBe(randomUuid);
  });
});
