import { describe, it, expect } from '../framework/test-suite';
import { submitCodOrder } from '../framework/domain-engine';
import { CodOrderSubmission } from '../framework/contracts';

describe('Feature 5: Single-Page COD Checkout Form', { tier: 'tier1', featureId: 'F05' }, () => {
  const validSubmission: CodOrderSubmission = {
    customerName: 'Karim Benali',
    customerPhone: '0550123456',
    wilayaCode: 16,
    wilayaName: 'Alger',
    communeName: 'Hydra',
    deliveryAddress: '12 Rue des Pins',
    deliveryType: 'DOMICILE',
    packId: 'PACK1',
    productName: 'باك كومبريسار و المفاتيح 4 في 1',
    productPrice: 4950,
    shippingFee: 500,
    totalPayable: 5450
  };

  it('F05-T01: Valid COD submission returns success and generates unique human-readable orderNumber', () => {
    const result = submitCodOrder(validSubmission);
    expect(result.success).toBe(true);
    expect(result.orderNumber).toBeDefined();
    expect(result.orderNumber?.startsWith('ORV-')).toBe(true);
  });

  it('F05-T02: Honeypot field trap detects automated bot and rejects submission', () => {
    const botSubmission: CodOrderSubmission = {
      ...validSubmission,
      honeypot: 'https://spam-bot.site'
    };
    const result = submitCodOrder(botSubmission);
    expect(result.success).toBe(false);
    expect(result.error).toContain('honeypot');
  });

  it('F05-T03: Missing or short customer name (< 2 characters) is rejected', () => {
    const invalidSubmission: CodOrderSubmission = {
      ...validSubmission,
      customerName: 'A'
    };
    const result = submitCodOrder(invalidSubmission);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Nom complet invalide');
  });

  it('F05-T04: Missing delivery address for DOMICILE delivery is rejected', () => {
    const invalidSubmission: CodOrderSubmission = {
      ...validSubmission,
      deliveryType: 'DOMICILE',
      deliveryAddress: ''
    };
    const result = submitCodOrder(invalidSubmission);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Adresse de livraison requise');
  });

  it('F05-T05: Valid secondary phone number is accepted in submission payload', () => {
    const submissionWithPhone2: CodOrderSubmission = {
      ...validSubmission,
      customerPhone2: '0770987654'
    };
    const result = submitCodOrder(submissionWithPhone2);
    expect(result.success).toBe(true);
  });
});
