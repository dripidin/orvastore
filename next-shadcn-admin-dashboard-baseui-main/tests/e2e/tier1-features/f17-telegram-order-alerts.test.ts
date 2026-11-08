import { describe, it, expect } from '../framework/test-suite';
import { TelegramAlertDispatcher, maskPhoneForPrivacy } from '../framework/domain-engine';
import { TelegramOrderAlert } from '../framework/contracts';

describe('Feature 17: Telegram Bot Instant Order Alerts', { tier: 'tier1', featureId: 'F17' }, () => {
  const sampleAlert: TelegramOrderAlert = {
    orderNumber: 'ORV-261107-777',
    customerName: 'Yassine Touati',
    customerPhone: '0555123456',
    wilaya: 'Alger',
    commune: 'Bab El Oued',
    deliveryType: 'توصيل لباب المنزل (Domicile)',
    productName: 'باك كومبريسار و المفاتيح 4 في 1',
    total: 5450
  };

  it('F17-T01: Telegram dispatcher formats alert with order number, customer name, and total DZD', () => {
    const dispatcher = new TelegramAlertDispatcher();
    const formatted = dispatcher.formatAlertMessage(sampleAlert);
    expect(formatted).toContain('ORV-261107-777');
    expect(formatted).toContain('Yassine Touati');
    expect(formatted).toContain('5,450 د.ج');
  });

  it('F17-T02: Customer phone number is masked in notification text to safeguard PII', () => {
    const masked = maskPhoneForPrivacy('0555123456');
    expect(masked).toBe('0555 •• •• 56');
    const dispatcher = new TelegramAlertDispatcher();
    const msg = dispatcher.formatAlertMessage(sampleAlert);
    expect(msg).toContain('0555 •• •• 56');
  });

  it('F17-T03: First dispatch of order alert succeeds', () => {
    const dispatcher = new TelegramAlertDispatcher();
    const res = dispatcher.dispatchOrderAlert(sampleAlert);
    expect(res.dispatched).toBe(true);
    expect(res.message).toContain('ORV-261107-777');
  });

  it('F17-T04: Duplicate dispatch attempt for same order number is suppressed by dedup ledger', () => {
    const dispatcher = new TelegramAlertDispatcher();
    dispatcher.dispatchOrderAlert(sampleAlert);
    const retry = dispatcher.dispatchOrderAlert(sampleAlert);
    expect(retry.dispatched).toBe(false);
    expect(retry.deduplicated).toBe(true);
  });

  it('F17-T05: Distinct order numbers dispatch successfully in succession', () => {
    const dispatcher = new TelegramAlertDispatcher();
    const alert1 = { ...sampleAlert, orderNumber: 'ORV-ORDER-001' };
    const alert2 = { ...sampleAlert, orderNumber: 'ORV-ORDER-002' };
    expect(dispatcher.dispatchOrderAlert(alert1).dispatched).toBe(true);
    expect(dispatcher.dispatchOrderAlert(alert2).dispatched).toBe(true);
  });
});
