import { describe, it, expect } from '../framework/test-suite';
import { TelegramAlertDispatcher } from '../framework/domain-engine';
import { TelegramOrderAlert } from '../framework/contracts';

describe('Boundary B17: Telegram Alert Rate & Dedup Boundaries', { tier: 'tier2', featureId: 'B17' }, () => {
  const alertTemplate: TelegramOrderAlert = {
    orderNumber: 'ORV-BURST-001',
    customerName: 'Burst Buyer',
    customerPhone: '0550123456',
    wilaya: 'Alger',
    commune: 'Hydra',
    deliveryType: 'Domicile',
    productName: 'Pack 1',
    total: 5450
  };

  it('B17-T01: Burst duplicates of exact same order number are all suppressed except the first', () => {
    const dispatcher = new TelegramAlertDispatcher();
    const res1 = dispatcher.dispatchOrderAlert(alertTemplate);
    const res2 = dispatcher.dispatchOrderAlert(alertTemplate);
    const res3 = dispatcher.dispatchOrderAlert(alertTemplate);
    const res4 = dispatcher.dispatchOrderAlert(alertTemplate);

    expect(res1.dispatched).toBe(true);
    expect(res2.dispatched).toBe(false);
    expect(res3.dispatched).toBe(false);
    expect(res4.dispatched).toBe(false);
  });

  it('B17-T02: Formatted alert message contains Markdown formatting characters (*, `)', () => {
    const dispatcher = new TelegramAlertDispatcher();
    const msg = dispatcher.formatAlertMessage(alertTemplate);
    expect(msg).toContain('*');
    expect(msg).toContain('`');
  });

  it('B17-T03: Customer name with Markdown special characters does not crash formatting', () => {
    const dispatcher = new TelegramAlertDispatcher();
    const specialAlert = {
      ...alertTemplate,
      customerName: 'Karim *Special* [Test] _Underscore_'
    };
    const msg = dispatcher.formatAlertMessage(specialAlert);
    expect(msg).toContain('Karim *Special* [Test] _Underscore_');
  });

  it('B17-T04: Total amount formatted with thousands separators for readability', () => {
    const dispatcher = new TelegramAlertDispatcher();
    const highAlert = { ...alertTemplate, total: 15950 };
    const msg = dispatcher.formatAlertMessage(highAlert);
    expect(msg).toContain('15,950 د.ج');
  });

  it('B17-T05: Delivery type with Arabic labels formats cleanly with truck emoji', () => {
    const dispatcher = new TelegramAlertDispatcher();
    const msg = dispatcher.formatAlertMessage(alertTemplate);
    expect(msg).toContain('🚚');
  });
});
