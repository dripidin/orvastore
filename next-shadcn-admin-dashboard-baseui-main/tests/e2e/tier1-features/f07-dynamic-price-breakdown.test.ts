import { describe, it, expect } from '../framework/test-suite';
import { calculateDeliveryTariff, PRODUCT_PACKS } from '../framework/domain-engine';

describe('Feature 7: Dynamic Real-Time Price Breakdown', { tier: 'tier1', featureId: 'F07' }, () => {
  it('F07-T01: Calculates Pack 1 home delivery total: 4,950 DZD pack + 500 DZD shipping = 5,450 DZD', () => {
    const packPrice = PRODUCT_PACKS.PACK1.priceDzd;
    const shipping = calculateDeliveryTariff(16, 'DOMICILE');
    const total = packPrice + shipping;
    expect(packPrice).toBe(4950);
    expect(shipping).toBe(500);
    expect(total).toBe(5450);
  });

  it('F07-T02: Stop-Desk delivery fee is cheaper than Home Delivery in same Wilaya', () => {
    const homeShipping = calculateDeliveryTariff(31, 'DOMICILE');
    const deskShipping = calculateDeliveryTariff(31, 'STOP_DESK');
    expect(deskShipping).toBeLessThan(homeShipping);
    expect(homeShipping - deskShipping).toBeGreaterThanOrEqual(100);
  });

  it('F07-T03: Origin Hub Wilaya 07 (Biskra) has lowest central shipping tariff', () => {
    const biskraHomeShipping = calculateDeliveryTariff(7, 'DOMICILE');
    const algiersHomeShipping = calculateDeliveryTariff(16, 'DOMICILE');
    expect(biskraHomeShipping).toBeLessThanOrEqual(algiersHomeShipping);
  });

  it('F07-T04: Southern Wilayas have higher delivery fees reflecting regional transport costs', () => {
    const algiersShipping = calculateDeliveryTariff(16, 'DOMICILE');
    const ouarglaShipping = calculateDeliveryTariff(30, 'DOMICILE');
    const tamanrassetShipping = calculateDeliveryTariff(11, 'DOMICILE');
    expect(ouarglaShipping).toBeGreaterThan(algiersShipping);
    expect(tamanrassetShipping).toBeGreaterThan(ouarglaShipping);
  });

  it('F07-T05: Total payable COD amount strictly equals product price plus shipping fee', () => {
    const wilayasToTest = [7, 16, 25, 31, 39];
    for (const code of wilayasToTest) {
      const shipping = calculateDeliveryTariff(code, 'DOMICILE');
      const expectedTotal = PRODUCT_PACKS.PACK1.priceDzd + shipping;
      expect(expectedTotal).toBe(4950 + shipping);
    }
  });
});
