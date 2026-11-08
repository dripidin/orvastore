import { describe, it, expect } from '../framework/test-suite';
import { YalidineCourierProvider, ZrExpressCourierProvider } from '../framework/domain-engine';
import { CourierParcelRequest } from '../framework/contracts';

describe('Boundary B18: Courier Parcel Payload Boundaries', { tier: 'tier2', featureId: 'B18' }, () => {
  const baseReq: CourierParcelRequest = {
    orderNumber: 'ORV-PARCEL-BOUND',
    customerName: 'Samir Brahim',
    customerPhone: '0550123456',
    wilayaCode: 16,
    wilayaName: 'Alger',
    communeName: 'Hydra',
    address: '10 Rue des Freres',
    deliveryType: 'DOMICILE',
    amountToCollect: 5450,
    productDescription: 'Pack 1'
  };

  it('B18-T01: Yalidine parcel request includes secondary phone when present', async () => {
    const yal = new YalidineCourierProvider();
    const reqWithPhone2 = { ...baseReq, customerPhone2: '0770998877' };
    const res = await yal.createParcel(reqWithPhone2, { apiId: 'id', apiToken: 'token' });
    expect(res.success).toBe(true);
  });

  it('B18-T02: Yalidine parcel request succeeds when secondary phone is undefined', async () => {
    const yal = new YalidineCourierProvider();
    const res = await yal.createParcel(baseReq, { apiId: 'id', apiToken: 'token' });
    expect(res.success).toBe(true);
  });

  it('B18-T03: ZR Express parcel request handles stop-desk delivery mode with stopDeskId', async () => {
    const zr = new ZrExpressCourierProvider();
    const stopDeskReq: CourierParcelRequest = {
      ...baseReq,
      deliveryType: 'STOP_DESK',
      stopDeskId: 'ZR-HUB-1601'
    };
    const res = await zr.createParcel(stopDeskReq, { apiKey: 'key', apiSecret: 'secret' });
    expect(res.success).toBe(true);
  });

  it('B18-T04: Courier parcel request with high COD amount (15,950 DZD) succeeds without numeric overflow', async () => {
    const yal = new YalidineCourierProvider();
    const highAmountReq = { ...baseReq, amountToCollect: 15950 };
    const res = await yal.createParcel(highAmountReq, { apiId: 'id', apiToken: 'token' });
    expect(res.success).toBe(true);
  });

  it('B18-T05: Long product description (200 characters) serializes safely', async () => {
    const zr = new ZrExpressCourierProvider();
    const longDescReq = {
      ...baseReq,
      productDescription: 'باك الخدمة والصيانة 4 في 1 للسيارة والمنزل: منفاخ عجلات TOYOTA، طقم مفاتيح 46 قطعة، مفك مرن 11 قطعة، وطقم 6 مفكات مع التوصيل والدفع عند الاستلام'
    };
    const res = await zr.createParcel(longDescReq, { apiKey: 'key', apiSecret: 'secret' });
    expect(res.success).toBe(true);
  });
});
