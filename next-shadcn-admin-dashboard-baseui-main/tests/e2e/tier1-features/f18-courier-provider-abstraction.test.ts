import { describe, it, expect } from '../framework/test-suite';
import {
  MockCourierProvider,
  YalidineCourierProvider,
  ZrExpressCourierProvider
} from '../framework/domain-engine';
import { CourierParcelRequest } from '../framework/contracts';

describe('Feature 18: Courier Abstraction (Yalidine, ZR Express)', { tier: 'tier1', featureId: 'F18' }, () => {
  const sampleRequest: CourierParcelRequest = {
    orderNumber: 'ORV-261107-123',
    customerName: 'Bilal Hadj',
    customerPhone: '0661234567',
    wilayaCode: 16,
    wilayaName: 'Alger',
    communeName: 'Hydra',
    address: '5 Boulevard des Martyrs',
    deliveryType: 'DOMICILE',
    amountToCollect: 5450,
    productDescription: 'باك كومبريسار و المفاتيح 4 في 1'
  };

  it('F18-T01: Mock Courier provider fulfills ICourierProvider contract offline with mock tracking code', async () => {
    const mock = new MockCourierProvider();
    expect(mock.id).toBe('mock');
    const conn = await mock.testConnection();
    expect(conn.success).toBe(true);

    const parcel = await mock.createParcel(sampleRequest);
    expect(parcel.success).toBe(true);
    expect(parcel.trackingCode.startsWith('MCK-16-')).toBe(true);
  });

  it('F18-T02: Yalidine provider generates official tracking format and tracking URL', async () => {
    const yal = new YalidineCourierProvider();
    expect(yal.id).toBe('yalidine');
    expect(yal.supportsStopDesk).toBe(true);

    const res = await yal.createParcel(sampleRequest, { apiId: 'test-id', apiToken: 'test-token' });
    expect(res.success).toBe(true);
    expect(res.trackingCode.startsWith('yal-16')).toBe(true);
    expect(res.trackingUrl).toContain('yalidine.com/suivi/');
  });

  it('F18-T03: ZR Express provider generates official ZR waybill format', async () => {
    const zr = new ZrExpressCourierProvider();
    expect(zr.id).toBe('zr_express');
    const res = await zr.createParcel(sampleRequest, { apiKey: 'zr-key', apiSecret: 'zr-secret' });
    expect(res.success).toBe(true);
    expect(res.trackingCode.startsWith('ZR')).toBe(true);
    expect(res.trackingCode.endsWith('DZ')).toBe(true);
  });

  it('F18-T04: Yalidine provider rejects parcel creation when API credentials are missing', async () => {
    const yal = new YalidineCourierProvider();
    const res = await yal.createParcel(sampleRequest, {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('Unauthenticated');
  });

  it('F18-T05: Courier status mapper normalizes external statuses to DELIVERED / IN_TRANSIT', async () => {
    const yal = new YalidineCourierProvider();
    const status = await yal.getTrackingStatus('yal-16123456');
    expect(status.status).toBe('DELIVERED');
  });
});
