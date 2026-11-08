import { describe, it, expect, assertThrows } from '../framework/test-suite';
import { isStopDeskAllowed, calculateDeliveryTariff } from '../framework/domain-engine';

describe('Feature 4: Delivery Mode Toggle (Home vs Stop-Desk)', { tier: 'tier1', featureId: 'F04' }, () => {
  it('F04-T01: Delivery mode supports DOMICILE and STOP_DESK options', () => {
    const domicileTariff = calculateDeliveryTariff(16, 'DOMICILE');
    const stopDeskTariff = calculateDeliveryTariff(16, 'STOP_DESK');
    expect(domicileTariff).toBe(500);
    expect(stopDeskTariff).toBe(400);
  });

  it('F04-T02: Wilaya 16 (Alger) allows both Home and Stop-Desk delivery', () => {
    expect(isStopDeskAllowed(16)).toBe(true);
  });

  it('F04-T03: Wilaya 31 (Oran) allows Stop-Desk delivery', () => {
    expect(isStopDeskAllowed(31)).toBe(true);
  });

  it('F04-T04: Southern Wilayas 49 to 58 prohibit Stop-Desk collection', () => {
    // Check key southern wilayas in 49-58 range
    expect(isStopDeskAllowed(49)).toBe(false); // Timimoun
    expect(isStopDeskAllowed(50)).toBe(false); // Bordj Badji Mokhtar
    expect(isStopDeskAllowed(54)).toBe(false); // In Guezzam
    expect(isStopDeskAllowed(58)).toBe(false); // El Meniaa
  });

  it('F04-T05: Attempting Stop-Desk in Wilaya 54 throws operational error requiring Home delivery', () => {
    assertThrows(() => {
      calculateDeliveryTariff(54, 'STOP_DESK');
    }, 'Stop-Desk delivery is not available for Wilaya 54');
  });
});
