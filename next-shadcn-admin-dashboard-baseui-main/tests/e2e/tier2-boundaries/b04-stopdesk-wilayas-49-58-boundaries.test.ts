import { describe, it, expect, assertThrows } from '../framework/test-suite';
import { isStopDeskAllowed, calculateDeliveryTariff } from '../framework/domain-engine';

describe('Boundary B04: Stop-Desk Wilayas 49-58 Barrier', { tier: 'tier2', featureId: 'B04' }, () => {
  it('B04-T01: Wilaya 48 (Relizane) allows Stop-Desk delivery', () => {
    expect(isStopDeskAllowed(48)).toBe(true);
    expect(calculateDeliveryTariff(48, 'STOP_DESK')).toBe(400);
  });

  it('B04-T02: Wilaya 49 (Timimoun) strictly blocks Stop-Desk delivery', () => {
    expect(isStopDeskAllowed(49)).toBe(false);
    assertThrows(() => {
      calculateDeliveryTariff(49, 'STOP_DESK');
    }, 'Stop-Desk delivery is not available for Wilaya 49');
  });

  it('B04-T03: Wilaya 54 (In Guezzam) strictly blocks Stop-Desk delivery', () => {
    expect(isStopDeskAllowed(54)).toBe(false);
    assertThrows(() => {
      calculateDeliveryTariff(54, 'STOP_DESK');
    }, 'Stop-Desk delivery is not available for Wilaya 54');
  });

  it('B04-T04: Wilaya 58 (El Meniaa) strictly blocks Stop-Desk delivery', () => {
    expect(isStopDeskAllowed(58)).toBe(false);
    assertThrows(() => {
      calculateDeliveryTariff(58, 'STOP_DESK');
    }, 'Stop-Desk delivery is not available for Wilaya 58');
  });

  it('B04-T05: Home delivery is permitted across all 10 new Wilayas (49 through 58)', () => {
    for (let code = 49; code <= 58; code++) {
      const tariff = calculateDeliveryTariff(code, 'DOMICILE');
      expect(tariff).toBeGreaterThan(0);
    }
  });
});
