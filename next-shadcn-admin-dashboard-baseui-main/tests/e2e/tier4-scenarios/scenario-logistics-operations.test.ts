import { describe, it, expect } from '../framework/test-suite';
import {
  executeOrderReRouting,
  CourierProviderManager,
  TelegramAlertDispatcher,
  buildMetaCapiPurchaseEvent,
  canTransitionOrder,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  PRODUCT_PACKS,
  submitCodOrder
} from '../framework/domain-engine';
import { OrderReRoutingPayload, CourierParcelRequest, CodOrderSubmission } from '../framework/contracts';

describe('Tier 4: Real-World Scenarios — Logistics & Admin Operations', { tier: 'tier4', featureId: 'SCENARIO_LOGISTICS' }, () => {
  // Scenario 4
  it('Scenario 4: Order refused at courier stop-desk -> Re-routed (تحويل الطلبية) with copyable note', () => {
    // Original order held at Constantine stop-desk is refused by buyer
    const originalOrder = {
      orderNumber: 'ORV-261107-101',
      customerName: 'Old Customer Ahmed',
      wilayaName: 'Constantine',
      productPrice: 4950,
      status: 'RETURNED' as const
    };

    // Operator receives call from new interested buyer in Setif
    const payload: OrderReRoutingPayload = {
      orderId: 'uuid-101',
      sourceOrderId: 'uuid-101',
      newCustomerName: 'Yacine Belkacem',
      newCustomerPhone: '0770554433',
      newWilayaCode: 19,
      newWilayaName: 'Sétif',
      newCommuneName: 'El Eulma',
      newDeliveryType: 'DOMICILE',
      newDeliveryAddress: 'Cité 500 Logements',
      reason: 'Original customer refused at desk; re-routed to waiting buyer',
      operator: 'Admin Supervisor',
      shippedOverrideConfirmed: true
    };

    // Execute re-routing
    const result = executeOrderReRouting(originalOrder, payload);
    expect(result.success).toBe(true);
    expect(result.updatedShippingFee).toBe(500); // Setif Home tariff
    expect(result.updatedTotal).toBe(4950 + 500);

    // Verify copyable pre-formatted instruction note
    expect(result.formattedCourierNote).toContain('*** تحويل مسار الطرد');
    expect(result.formattedCourierNote).toContain('Yacine Belkacem');
    expect(result.formattedCourierNote).toContain('0770554433');
    expect(result.formattedCourierNote).toContain('[19] Sétif');
    expect(result.formattedCourierNote).toContain('5,450 د.ج');
  });

  // Scenario 5
  it('Scenario 5: Merchant toggles courier from Yalidine to ZR Express with payload adaptation', async () => {
    const manager = new CourierProviderManager();

    // Store initially runs on Yalidine
    manager.setActiveProvider('yalidine', { apiId: 'y-id', apiToken: 'y-tok' });
    expect(manager.getActiveProviderId()).toBe('yalidine');

    // Merchant toggles to ZR Express in backoffice settings
    manager.setActiveProvider('zr_express', { apiKey: 'zr-key', apiSecret: 'zr-secret' });
    expect(manager.getActiveProviderId()).toBe('zr_express');

    // Subsequent parcel creation dispatches via ZR Express
    const activeCourier = manager.getActiveProvider();
    const parcelReq: CourierParcelRequest = {
      orderNumber: 'ORV-ZR-001',
      customerName: 'Kamel T.',
      customerPhone: '0550123456',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Hydra',
      address: 'Hydra',
      deliveryType: 'DOMICILE',
      amountToCollect: 5450,
      productDescription: 'Pack 1'
    };
    const parcelRes = await activeCourier.createParcel(parcelReq, { apiKey: 'zr-key', apiSecret: 'zr-secret' });
    expect(parcelRes.success).toBe(true);
    expect(parcelRes.trackingCode.startsWith('ZR')).toBe(true);
    expect(parcelRes.trackingUrl).toContain('zrexpress.dz');
  });

  // Scenario 8
  it('Scenario 8: High-volume flash sale surge with Meta CAPI & Telegram deduplication', () => {
    const dispatcher = new TelegramAlertDispatcher();
    const orderNumber = 'ORV-FLASH-999';

    // Order 1 submission
    const alert = {
      orderNumber,
      customerName: 'Flash Buyer',
      customerPhone: '0550123456',
      wilaya: 'Alger',
      commune: 'Hydra',
      deliveryType: 'Domicile',
      productName: 'Pack 1',
      total: 5450
    };

    const firstDispatch = dispatcher.dispatchOrderAlert(alert);
    expect(firstDispatch.dispatched).toBe(true);

    // Accidental double-click / webhook retry with identical orderNumber
    const retryDispatch = dispatcher.dispatchOrderAlert(alert);
    expect(retryDispatch.dispatched).toBe(false);
    expect(retryDispatch.deduplicated).toBe(true);

    // Both events share same eventId for Meta CAPI deduplication
    const eventId = 'flash-sale-evt-1';
    const capi1 = buildMetaCapiPurchaseEvent({
      eventId,
      orderNumber,
      customerName: alert.customerName,
      customerPhone: alert.customerPhone,
      productName: alert.productName,
      totalPayable: alert.total,
      url: 'https://orva-store.com'
    });
    const capi2 = buildMetaCapiPurchaseEvent({
      eventId,
      orderNumber,
      customerName: alert.customerName,
      customerPhone: alert.customerPhone,
      productName: alert.productName,
      totalPayable: alert.total,
      url: 'https://orva-store.com'
    });
    expect(capi1.eventId).toBe(capi2.eventId);
    expect(capi1.userData.phone).toBe(capi2.userData.phone);
  });

  // Scenario 9
  it('Scenario 9: Boundary comparison: Wilaya 48 (Relizane) allows Stop-Desk vs Wilaya 49 (Timimoun) blocked', () => {
    // Wilaya 48 (Relizane - highest standard wilaya)
    expect(isStopDeskAllowed(48)).toBe(true);
    const w48DeskTariff = calculateDeliveryTariff(48, 'STOP_DESK');
    expect(w48DeskTariff).toBe(400);

    const w48Submission: CodOrderSubmission = {
      customerName: 'Buyer Relizane',
      customerPhone: '0550112233',
      wilayaCode: 48,
      wilayaName: 'Relizane',
      communeName: 'Relizane',
      deliveryType: 'STOP_DESK',
      packId: 'PACK1',
      productName: 'Pack 1',
      productPrice: 4950,
      shippingFee: w48DeskTariff,
      totalPayable: 4950 + w48DeskTariff
    };
    expect(submitCodOrder(w48Submission).success).toBe(true);

    // Wilaya 49 (Timimoun - start of southern 10)
    expect(isStopDeskAllowed(49)).toBe(false);
    const w49DeskSubmission: CodOrderSubmission = {
      customerName: 'Buyer Timimoun',
      customerPhone: '0661112233',
      wilayaCode: 49,
      wilayaName: 'Timimoun',
      communeName: 'Timimoun',
      deliveryType: 'STOP_DESK',
      packId: 'PACK1',
      productName: 'Pack 1',
      productPrice: 4950,
      shippingFee: 400,
      totalPayable: 5350
    };
    const w49Result = submitCodOrder(w49DeskSubmission);
    expect(w49Result.success).toBe(false);
    expect(w49Result.error).toContain('Stop-Desk');
  });

  // Scenario 10
  it('Scenario 10: Complete lifecycle of an order: Pending -> Confirmed -> Shipped -> Returned -> Re-routed', async () => {
    // 1. Customer places order on storefront
    const submission: CodOrderSubmission = {
      customerName: 'Rachid M.',
      customerPhone: '0550123456',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Hydra',
      deliveryAddress: 'Hydra Centre',
      deliveryType: 'DOMICILE',
      packId: 'PACK1',
      productName: 'Pack 1',
      productPrice: 4950,
      shippingFee: 500,
      totalPayable: 5450
    };
    const orderRes = submitCodOrder(submission);
    expect(orderRes.success).toBe(true);
    let currentStatus = 'PENDING' as const;

    // 2. Operator calls customer to verify order intent
    expect(canTransitionOrder(currentStatus, 'CONFIRMED')).toBe(true);
    currentStatus = 'CONFIRMED' as any;

    // 3. Warehouse prepares parcel
    expect(canTransitionOrder(currentStatus, 'PREPARING')).toBe(true);
    currentStatus = 'PREPARING' as any;

    // 4. Courier label printed
    expect(canTransitionOrder(currentStatus, 'READY_TO_SHIP')).toBe(true);
    currentStatus = 'READY_TO_SHIP' as any;

    // 5. Courier picks up package
    expect(canTransitionOrder(currentStatus, 'SHIPPED')).toBe(true);
    currentStatus = 'SHIPPED' as any;

    // 6. Customer is unreachable / refuses parcel upon delivery attempt
    expect(canTransitionOrder(currentStatus, 'RETURNED')).toBe(true);
    currentStatus = 'RETURNED' as any;

    // 7. Operator redirects held parcel to new customer in Biskra (Hub origin)
    const rerouteRes = executeOrderReRouting(
      {
        orderNumber: orderRes.orderNumber!,
        customerName: submission.customerName,
        wilayaName: submission.wilayaName,
        productPrice: submission.productPrice,
        status: currentStatus
      },
      {
        orderId: 'orig-id-10',
        newCustomerName: 'New Biskra Buyer',
        newCustomerPhone: '0770112233',
        newWilayaCode: 7,
        newWilayaName: 'Biskra',
        newCommuneName: 'Biskra',
        newDeliveryType: 'DOMICILE',
        newDeliveryAddress: 'Cite Moudjahidine, Biskra',
        reason: 'Original buyer refused; re-routed to new buyer in Biskra',
        operator: 'Supervisor Nadir',
        shippedOverrideConfirmed: true
      }
    );

    expect(rerouteRes.success).toBe(true);
    expect(rerouteRes.updatedShippingFee).toBe(450); // Biskra home tariff
    expect(rerouteRes.updatedTotal).toBe(4950 + 450);
    expect(rerouteRes.formattedCourierNote).toContain('New Biskra Buyer');
    expect(rerouteRes.formattedCourierNote).toContain('5,400 د.ج');
  });
});
