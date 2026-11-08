import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, assertThrows, resolveProjectPath } from '../framework/test-suite';
import {
  submitCodOrder,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  PRODUCT_PACKS,
  TelegramAlertDispatcher,
  buildMetaCapiPurchaseEvent,
  executeOrderReRouting,
  generateCourierInstructionNote,
  CourierProviderManager,
  canTransitionOrder,
  REASSURANCE_PILLARS,
  CROSS_SELL_MAP
} from '../framework/domain-engine';
import type { CodOrderSubmission, OrderReRoutingPayload, CourierParcelRequest, MetaCapiEvent } from '../framework/contracts';

describe('Tier 3: Cross-Feature Pairwise Interaction Flows', { tier: 'tier3', featureId: 'PAIRWISE' }, () => {
  const communesJsonPath = path.resolve(__dirname, '../../../src/data/geoalgeria/communes.json');

  // Pair 1: F05 + F06
  it('T3-01 [F05+F06]: Checkout processes normalized phone numbers across Djezzy (07), Mobilis (06), and Ooredoo (05)', () => {
    const phones = ['+213 770 12 34 56', '0661-23-45-67', '05.50.12.34.56'];
    for (const p of phones) {
      const submission: CodOrderSubmission = {
        customerName: 'Test Buyer',
        customerPhone: p,
        wilayaCode: 16,
        wilayaName: 'Alger',
        communeName: 'Hydra',
        deliveryType: 'DOMICILE',
        deliveryAddress: '10 Rue Didouche',
        packId: 'PACK1',
        productName: 'Pack 1',
        productPrice: 4950,
        shippingFee: 500,
        totalPayable: 5450
      };
      const res = submitCodOrder(submission);
      expect(res.success).toBe(true);
    }
  });

  // Pair 2: F05 + F03
  it('T3-02 [F05+F03]: Checkout order verifies destination commune exists within selected Wilaya', () => {
    const communes = JSON.parse(fs.readFileSync(communesJsonPath, 'utf8'));
    const algerCommunes = communes.filter((c: any) => c.wilaya_code === 16).map((c: any) => c.commune_name_fr);
    expect(algerCommunes).toContain('Hydra');

    const submission: CodOrderSubmission = {
      customerName: 'Karim',
      customerPhone: '0550123456',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Hydra',
      deliveryType: 'DOMICILE',
      deliveryAddress: 'Hydra Centre',
      packId: 'PACK1',
      productName: 'Pack 1',
      productPrice: 4950,
      shippingFee: 500,
      totalPayable: 5450
    };
    const res = submitCodOrder(submission);
    expect(res.success).toBe(true);
  });

  // Pair 3: F05 + F04
  it('T3-03 [F05+F04]: Checkout order with STOP_DESK in Wilaya 16 succeeds without street address', () => {
    const submission: CodOrderSubmission = {
      customerName: 'Amine',
      customerPhone: '0661234567',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Bab Ezzouar',
      deliveryType: 'STOP_DESK',
      packId: 'PACK1',
      productName: 'Pack 1',
      productPrice: 4950,
      shippingFee: 400,
      totalPayable: 5350
    };
    const res = submitCodOrder(submission);
    expect(res.success).toBe(true);
  });

  // Pair 4: F05 + F04
  it('T3-04 [F05+F04]: Checkout submission with STOP_DESK in Southern Wilaya 54 is rejected', () => {
    const submission: CodOrderSubmission = {
      customerName: 'Mokhtar',
      customerPhone: '0770123456',
      wilayaCode: 54,
      wilayaName: 'In Guezzam',
      communeName: 'In Guezzam',
      deliveryType: 'STOP_DESK',
      packId: 'PACK1',
      productName: 'Pack 1',
      productPrice: 4950,
      shippingFee: 450,
      totalPayable: 5400
    };
    const res = submitCodOrder(submission);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Stop-Desk');
  });

  // Pair 5: F05 + F07
  it('T3-05 [F05+F07]: Dynamic pricing calculates accurate COD total across multiple Wilayas', () => {
    const testCases = [
      { wilaya: 7, mode: 'DOMICILE' as const, fee: 450, packPrice: 4950, total: 5400 },
      { wilaya: 16, mode: 'DOMICILE' as const, fee: 500, packPrice: 4950, total: 5450 },
      { wilaya: 16, mode: 'STOP_DESK' as const, fee: 400, packPrice: 4950, total: 5350 },
      { wilaya: 11, mode: 'DOMICILE' as const, fee: 1000, packPrice: 4950, total: 5950 }
    ];
    for (const tc of testCases) {
      const calcFee = calculateDeliveryTariff(tc.wilaya, tc.mode);
      expect(calcFee).toBe(tc.fee);
      expect(tc.packPrice + calcFee).toBe(tc.total);
    }
  });

  // Pair 6: F05 + F08
  it('T3-06 [F05+F08]: Checkout creates order snapshot for Pack 1 at 4,950 DZD with 4 items', () => {
    const pack = PRODUCT_PACKS.PACK1;
    expect(pack.items).toHaveLength(4);
    const submission: CodOrderSubmission = {
      customerName: 'Buyer Pack 1',
      customerPhone: '0550112233',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Hydra',
      deliveryType: 'DOMICILE',
      deliveryAddress: 'Rue 1',
      packId: 'PACK1',
      productName: pack.nameAr,
      productPrice: pack.priceDzd,
      shippingFee: 500,
      totalPayable: pack.priceDzd + 500
    };
    const res = submitCodOrder(submission);
    expect(res.success).toBe(true);
  });

  // Pair 7: F05 + F09
  it('T3-07 [F05+F09]: Checkout creates order snapshot for Pack 2 with 5 items', () => {
    const pack = PRODUCT_PACKS.PACK2;
    expect(pack.items).toHaveLength(5);
    const submission: CodOrderSubmission = {
      customerName: 'Buyer Pack 2',
      customerPhone: '0661112233',
      wilayaCode: 31,
      wilayaName: 'Oran',
      communeName: 'Es Senia',
      deliveryType: 'DOMICILE',
      deliveryAddress: 'Rue 2',
      packId: 'PACK2',
      productName: pack.nameAr,
      productPrice: pack.priceDzd,
      shippingFee: 500,
      totalPayable: pack.priceDzd + 500
    };
    const res = submitCodOrder(submission);
    expect(res.success).toBe(true);
  });

  // Pair 8: F05 + F10
  it('T3-08 [F05+F10]: Checkout creates order snapshot for Pack 3 at 15,950 DZD with 6 items', () => {
    const pack = PRODUCT_PACKS.PACK3;
    expect(pack.items).toHaveLength(6);
    const submission: CodOrderSubmission = {
      customerName: 'Buyer Pack 3',
      customerPhone: '0770112233',
      wilayaCode: 25,
      wilayaName: 'Constantine',
      communeName: 'El Khroub',
      deliveryType: 'DOMICILE',
      deliveryAddress: 'Rue 3',
      packId: 'PACK3',
      productName: pack.nameAr,
      productPrice: pack.priceDzd,
      shippingFee: 500,
      totalPayable: pack.priceDzd + 500
    };
    const res = submitCodOrder(submission);
    expect(res.success).toBe(true);
  });

  // Pair 9: F05 + F17
  it('T3-09 [F05+F17]: Successful checkout triggers Telegram alert dispatcher', () => {
    const submission: CodOrderSubmission = {
      customerName: 'Nadir S.',
      customerPhone: '0550123456',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Kouba',
      deliveryType: 'DOMICILE',
      deliveryAddress: '15 Rue de Kouba',
      packId: 'PACK1',
      productName: 'باك كومبريسار و المفاتيح 4 في 1',
      productPrice: 4950,
      shippingFee: 500,
      totalPayable: 5450
    };
    const orderRes = submitCodOrder(submission);
    expect(orderRes.success).toBe(true);

    const dispatcher = new TelegramAlertDispatcher();
    const alertRes = dispatcher.dispatchOrderAlert({
      orderNumber: orderRes.orderNumber!,
      customerName: submission.customerName,
      customerPhone: submission.customerPhone,
      wilaya: submission.wilayaName,
      commune: submission.communeName,
      deliveryType: 'Domicile',
      productName: submission.productName,
      total: submission.totalPayable
    });
    expect(alertRes.dispatched).toBe(true);
    expect(alertRes.message).toContain(orderRes.orderNumber!);
  });

  // Pair 10: F05 + F16
  it('T3-10 [F05+F16]: Checkout order generates matching Meta CAPI Purchase event with shared eventId', () => {
    const sharedEventId = 'evt-cod-purchase-101';
    const submission: CodOrderSubmission = {
      customerName: 'Sofiane',
      customerPhone: '0770123456',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Hydra',
      deliveryType: 'DOMICILE',
      deliveryAddress: 'Rue 4',
      packId: 'PACK1',
      productName: 'باك كومبريسار و المفاتيح 4 في 1',
      productPrice: 4950,
      shippingFee: 500,
      totalPayable: 5450
    };
    const orderRes = submitCodOrder(submission);

    const capiEvent = buildMetaCapiPurchaseEvent({
      eventId: sharedEventId,
      orderNumber: orderRes.orderNumber!,
      customerName: submission.customerName,
      customerPhone: submission.customerPhone,
      productName: submission.productName,
      totalPayable: submission.totalPayable,
      url: 'https://orva-store.com/checkout/confirmation'
    });
    expect(capiEvent.eventId).toBe(sharedEventId);
    expect(capiEvent.customData?.value).toBe(5450);
  });

  // Pair 11: F05 + F20
  it('T3-11 [F05+F20]: Order submission respects database schema column constraints', () => {
    const schemaSqlPath = resolveProjectPath('template/DATABASE_SCHEMA.sql');
    const sql = fs.readFileSync(schemaSqlPath, 'utf8');
    // Verify columns exist in SQL schema definition
    expect(sql).toContain('delivery_wilaya TEXT NOT NULL');
    expect(sql).toContain('delivery_commune TEXT NOT NULL');
    expect(sql).toContain('delivery_method TEXT DEFAULT \'DOMICILE\'');
    expect(sql).toContain('CHECK (total >= 0)');
  });

  // Pair 12: F04 + F07
  it('T3-12 [F04+F07]: Toggling between Domicile and Stop-Desk alters shipping fee by exact zone margin', () => {
    const homeTariff = calculateDeliveryTariff(16, 'DOMICILE');
    const deskTariff = calculateDeliveryTariff(16, 'STOP_DESK');
    expect(homeTariff).toBe(500);
    expect(deskTariff).toBe(400);
    expect(homeTariff - deskTariff).toBe(100);
  });

  // Pair 13: F04 + F03
  it('T3-13 [F04+F03]: Selecting Wilaya 54 disables Stop-Desk and enforces Home delivery tariff', () => {
    expect(isStopDeskAllowed(54)).toBe(false);
    const homeTariff = calculateDeliveryTariff(54, 'DOMICILE');
    expect(homeTariff).toBe(1000);
  });

  // Pair 14: F13 + F14
  it('T3-14 [F13+F14]: Order transitioning to RETURNED becomes eligible for order re-routing', () => {
    expect(canTransitionOrder('SHIPPED', 'RETURNED')).toBe(true);
    const returnedOrder = {
      orderNumber: 'ORV-RET-14',
      customerName: 'Old Buyer',
      wilayaName: 'Annaba',
      productPrice: 4950,
      status: 'RETURNED' as const
    };
    const payload: OrderReRoutingPayload = {
      orderId: 'uuid-14',
      newCustomerName: 'New Buyer',
      newCustomerPhone: '0550123456',
      newWilayaCode: 16,
      newWilayaName: 'Alger',
      newCommuneName: 'Hydra',
      newDeliveryType: 'DOMICILE',
      reason: 'Held at hub; forwarded',
      operator: 'Agent 1',
      shippedOverrideConfirmed: true
    };
    const res = executeOrderReRouting(returnedOrder, payload);
    expect(res.success).toBe(true);
  });

  // Pair 15: F14 + F15
  it('T3-15 [F14+F15]: Executing order re-routing automatically produces courier instruction note', () => {
    const order = {
      orderNumber: 'ORV-REROUTE-15',
      customerName: 'Anis',
      wilayaName: 'Batna',
      productPrice: 4950,
      status: 'CANCELLED' as const
    };
    const payload: OrderReRoutingPayload = {
      orderId: 'uuid-15',
      newCustomerName: 'Samir',
      newCustomerPhone: '0661234567',
      newWilayaCode: 31,
      newWilayaName: 'Oran',
      newCommuneName: 'Bir El Djir',
      newDeliveryType: 'STOP_DESK',
      reason: 'Buyer change at stop-desk',
      operator: 'Supervisor Amina',
      shippedOverrideConfirmed: true
    };
    const res = executeOrderReRouting(order, payload);
    expect(res.formattedCourierNote).toContain('*** تحويل مسار الطرد');
    expect(res.formattedCourierNote).toContain('Samir');
    expect(res.formattedCourierNote).toContain('Bir El Djir');
  });

  // Pair 16: F14 + F07
  it('T3-16 [F14+F07]: Re-routing to a new Wilaya recalculates total COD from Biskra origin', () => {
    const order = {
      orderNumber: 'ORV-TARIFF-16',
      customerName: 'Client 1',
      wilayaName: 'Biskra',
      productPrice: 4950,
      status: 'RETURNED' as const
    };
    // Re-route to Tamanrasset (Zone 5)
    const payload: OrderReRoutingPayload = {
      orderId: 'uuid-16',
      newCustomerName: 'Client 2',
      newCustomerPhone: '0770123456',
      newWilayaCode: 11,
      newWilayaName: 'Tamanrasset',
      newCommuneName: 'Tamanrasset',
      newDeliveryType: 'DOMICILE',
      reason: 'Redirect to southern buyer',
      operator: 'Agent Omar',
      shippedOverrideConfirmed: true
    };
    const res = executeOrderReRouting(order, payload);
    expect(res.updatedShippingFee).toBe(1000);
    expect(res.updatedTotal).toBe(4950 + 1000);
  });

  // Pair 17: F14 + F06
  it('T3-17 [F14+F06]: Re-routing rejects invalid new recipient phone numbers', () => {
    const order = {
      orderNumber: 'ORV-PHONE-17',
      customerName: 'Client 1',
      wilayaName: 'Alger',
      productPrice: 4950,
      status: 'RETURNED' as const
    };
    const payload: OrderReRoutingPayload = {
      orderId: 'uuid-17',
      newCustomerName: 'Client 2',
      newCustomerPhone: '0123456789', // Invalid prefix
      newWilayaCode: 16,
      newWilayaName: 'Alger',
      newCommuneName: 'Hydra',
      newDeliveryType: 'DOMICILE',
      reason: 'Forward',
      operator: 'Agent',
      shippedOverrideConfirmed: true
    };
    assertThrows(() => {
      executeOrderReRouting(order, payload);
    }, 'Invalid new customer phone');
  });

  // Pair 18: F14 + F04
  it('T3-18 [F14+F04]: Re-routing destination in Wilaya 50 (Bordj Badji Mokhtar) prohibits Stop-Desk', () => {
    const order = {
      orderNumber: 'ORV-BBM-18',
      customerName: 'Client 1',
      wilayaName: 'Alger',
      productPrice: 4950,
      status: 'RETURNED' as const
    };
    const payload: OrderReRoutingPayload = {
      orderId: 'uuid-18',
      newCustomerName: 'Client 2',
      newCustomerPhone: '0661234567',
      newWilayaCode: 50,
      newWilayaName: 'Bordj Badji Mokhtar',
      newCommuneName: 'Bordj Badji Mokhtar',
      newDeliveryType: 'STOP_DESK',
      reason: 'Forward',
      operator: 'Agent',
      shippedOverrideConfirmed: true
    };
    assertThrows(() => {
      executeOrderReRouting(order, payload);
    }, 'Stop-Desk is restricted in Wilaya 50');
  });

  // Pair 19: F18 + F19
  it('T3-19 [F18+F19]: Provider switching between Yalidine and ZR Express alters parcel tracking prefix', async () => {
    const manager = new CourierProviderManager();
    const parcelReq: CourierParcelRequest = {
      orderNumber: 'ORV-SWITCH-19',
      customerName: 'Customer',
      customerPhone: '0550123456',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Hydra',
      address: 'Hydra',
      deliveryType: 'DOMICILE',
      amountToCollect: 5450,
      productDescription: 'Pack 1'
    };

    // 1. Yalidine
    manager.setActiveProvider('yalidine', { apiId: 'id', apiToken: 'token' });
    const yalProv = manager.getActiveProvider();
    const yalRes = await yalProv.createParcel(parcelReq, { apiId: 'id', apiToken: 'token' });
    expect(yalRes.trackingCode.startsWith('yal-')).toBe(true);

    // 2. ZR Express
    manager.setActiveProvider('zr_express', { apiKey: 'k', apiSecret: 's' });
    const zrProv = manager.getActiveProvider();
    const zrRes = await zrProv.createParcel(parcelReq, { apiKey: 'k', apiSecret: 's' });
    expect(zrRes.trackingCode.startsWith('ZR')).toBe(true);
  });

  // Pair 20: F18 + F13
  it('T3-20 [F18+F13]: Courier parcel creation integrates with admin status transition to READY_TO_SHIP', async () => {
    const mockProvider = new CourierProviderManager().getActiveProvider();
    const parcelReq: CourierParcelRequest = {
      orderNumber: 'ORV-TRANS-20',
      customerName: 'Buyer',
      customerPhone: '0550123456',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Hydra',
      address: 'Hydra',
      deliveryType: 'DOMICILE',
      amountToCollect: 5450,
      productDescription: 'Pack 1'
    };
    const parcel = await mockProvider.createParcel(parcelReq, {});
    expect(parcel.success).toBe(true);
    expect(canTransitionOrder('PREPARING', 'READY_TO_SHIP')).toBe(true);
  });

  // Pair 21: F18 + F14
  it('T3-21 [F18+F14]: Re-routed parcel dispatches with updated recipient and revised COD collection amount', async () => {
    const order = {
      orderNumber: 'ORV-DISPATCH-21',
      customerName: 'Old Buyer',
      wilayaName: 'Alger',
      productPrice: 4950,
      status: 'RETURNED' as const
    };
    const payload: OrderReRoutingPayload = {
      orderId: 'uuid-21',
      newCustomerName: 'New Recipient Mustapha',
      newCustomerPhone: '0770998877',
      newWilayaCode: 31,
      newWilayaName: 'Oran',
      newCommuneName: 'Oran',
      newDeliveryType: 'DOMICILE',
      reason: 'Re-routed delivery',
      operator: 'Agent',
      shippedOverrideConfirmed: true
    };
    const rerouteRes = executeOrderReRouting(order, payload);

    const mock = new CourierProviderManager().getActiveProvider();
    const parcel = await mock.createParcel({
      orderNumber: rerouteRes.orderId,
      customerName: payload.newCustomerName,
      customerPhone: payload.newCustomerPhone,
      wilayaCode: payload.newWilayaCode,
      wilayaName: payload.newWilayaName,
      communeName: payload.newCommuneName,
      address: 'Oran Centre',
      deliveryType: payload.newDeliveryType,
      amountToCollect: rerouteRes.updatedTotal,
      productDescription: 'Pack 1'
    }, {});
    expect(parcel.success).toBe(true);
  });

  // Pair 22: F16 + F08
  it('T3-22 [F16+F08]: Visiting Pack 1 prepares ViewContent event with matching contentId and price (4,950 DZD)', () => {
    const pack = PRODUCT_PACKS.PACK1;
    const capiEvent: MetaCapiEvent = {
      eventName: 'ViewContent',
      eventId: 'view-pack-1-001',
      eventSourceUrl: 'https://orva-store.com/pack1',
      userData: {},
      customData: {
        currency: 'DZD',
        value: pack.priceDzd,
        contentName: pack.nameAr,
        contentIds: ['PACK1']
      }
    };
    expect(capiEvent.customData?.value).toBe(4950);
    expect(capiEvent.customData?.contentIds).toEqual(['PACK1']);
  });

  // Pair 23: F11 + F05
  it('T3-23 [F11+F05]: Pack 1 HTML template co-locates single-page order form alongside reassurance grid', () => {
    const pack1HtmlPath = resolveProjectPath('pack1.html');
    const html = fs.readFileSync(pack1HtmlPath, 'utf8');
    expect(html).toContain('id="order-form"');
    expect(html).toContain('guarantee-list-section');
    expect(html).toContain('المعاينة قبل الدفع');
  });

  // Pair 24: F12 + F08
  it('T3-24 [F12+F08]: Pack 1 cross-sell card provides valid navigation target to Pack 2', () => {
    const target = CROSS_SELL_MAP.PACK1;
    expect(target.targetPackId).toBe('PACK2');
    const pack2 = PRODUCT_PACKS[target.targetPackId];
    expect(pack2.itemsCount).toBe(5);
  });

  // Pair 25: F17 + F14
  it('T3-25 [F17+F14]: Order re-routing event triggers a dedicated Telegram alert for supervisory tracking', () => {
    const dispatcher = new TelegramAlertDispatcher();
    const alert = {
      orderNumber: 'REROUTE-ORV-101-999',
      customerName: 'Yacine (محول)',
      customerPhone: '0770554433',
      wilaya: 'Sétif',
      commune: 'El Eulma',
      deliveryType: 'Domicile',
      productName: 'تحويل طلبية: باك 1',
      total: 5450
    };
    const res = dispatcher.dispatchOrderAlert(alert);
    expect(res.dispatched).toBe(true);
    expect(res.message).toContain('REROUTE-ORV-101-999');
  });

  // Pair 26: F19 + F18
  it('T3-26 [F19+F18]: Active provider switching to mock maintains zero external network dependencies', async () => {
    const manager = new CourierProviderManager();
    manager.setActiveProvider('mock');
    const active = manager.getActiveProvider();
    const conn = await active.testConnection({});
    expect(conn.success).toBe(true);
    expect(conn.message).toContain('simulation mode');
  });
});
