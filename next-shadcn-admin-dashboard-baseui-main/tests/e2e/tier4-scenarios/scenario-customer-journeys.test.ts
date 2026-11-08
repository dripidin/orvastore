import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, assertThrows } from '../framework/test-suite';
import {
  submitCodOrder,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  PRODUCT_PACKS,
  TelegramAlertDispatcher,
  buildMetaCapiPurchaseEvent,
  normalizeAlgerianPhone
} from '../framework/domain-engine';
import { CodOrderSubmission } from '../framework/contracts';

describe('Tier 4: Real-World Scenarios — Customer Purchasing Journeys', { tier: 'tier4', featureId: 'SCENARIO_CUSTOMER' }, () => {
  const communesJsonPath = path.resolve(__dirname, '../../../src/data/geoalgeria/communes.json');

  // Scenario 1
  it('Scenario 1: Customer in Algiers buys Pack 1 (Home Delivery) with instant Telegram alert', () => {
    // Step 1: Customer lands on Pack 1 page and inspects pricing
    const pack = PRODUCT_PACKS.PACK1;
    expect(pack.priceDzd).toBe(4950);

    // Step 2: Customer selects Alger (Wilaya 16) and commune Hydra
    const communes = JSON.parse(fs.readFileSync(communesJsonPath, 'utf8'));
    const algerCommunes = communes.filter((c: any) => c.wilaya_code === 16).map((c: any) => c.commune_name_fr);
    expect(algerCommunes).toContain('Hydra');

    // Step 3: Dynamic shipping calculated for Home Delivery
    const shipping = calculateDeliveryTariff(16, 'DOMICILE');
    expect(shipping).toBe(500);
    const expectedTotal = pack.priceDzd + shipping;
    expect(expectedTotal).toBe(5450);

    // Step 4: Customer submits 1-page checkout
    const submission: CodOrderSubmission = {
      customerName: 'Karim Benali',
      customerPhone: '0550123456',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Hydra',
      deliveryAddress: '15 Rue des Pins, Hydra',
      deliveryType: 'DOMICILE',
      packId: 'PACK1',
      productName: pack.nameAr,
      productPrice: pack.priceDzd,
      shippingFee: shipping,
      totalPayable: expectedTotal
    };
    const orderResult = submitCodOrder(submission);
    expect(orderResult.success).toBe(true);
    expect(orderResult.orderNumber?.startsWith('ORV-')).toBe(true);

    // Step 5: Telegram alert dispatched to operations group
    const dispatcher = new TelegramAlertDispatcher();
    const alertResult = dispatcher.dispatchOrderAlert({
      orderNumber: orderResult.orderNumber!,
      customerName: submission.customerName,
      customerPhone: submission.customerPhone,
      wilaya: submission.wilayaName,
      commune: submission.communeName,
      deliveryType: 'توصيل لباب المنزل (Domicile)',
      productName: submission.productName,
      total: submission.totalPayable
    });
    expect(alertResult.dispatched).toBe(true);
    expect(alertResult.message).toContain('5,450 د.ج');

    // Step 6: Meta CAPI Purchase event generated
    const capiEvent = buildMetaCapiPurchaseEvent({
      eventId: 'evt-scen-1',
      orderNumber: orderResult.orderNumber!,
      customerName: submission.customerName,
      customerPhone: submission.customerPhone,
      productName: submission.productName,
      totalPayable: submission.totalPayable,
      url: 'https://orva-store.com/pack1'
    });
    expect(capiEvent.customData?.value).toBe(5450);
  });

  // Scenario 2
  it('Scenario 2: Customer in Oran orders Pack 2 (Stop-Desk Pickup) with agency routing', () => {
    // Step 1: Pack 2 Pro Workshop pack
    const pack = PRODUCT_PACKS.PACK2;
    expect(pack.itemsCount).toBe(5);

    // Step 2: Oran (Wilaya 31) allows Stop-Desk pickup
    expect(isStopDeskAllowed(31)).toBe(true);
    const stopDeskTariff = calculateDeliveryTariff(31, 'STOP_DESK');
    expect(stopDeskTariff).toBe(400);

    const totalPayable = pack.priceDzd + stopDeskTariff;

    // Step 3: Checkout form submission for agency pickup
    const submission: CodOrderSubmission = {
      customerName: 'Amina Mansouri',
      customerPhone: '0661987654',
      wilayaCode: 31,
      wilayaName: 'Oran',
      communeName: 'Es Senia',
      deliveryType: 'STOP_DESK',
      packId: 'PACK2',
      productName: pack.nameAr,
      productPrice: pack.priceDzd,
      shippingFee: stopDeskTariff,
      totalPayable
    };
    const orderResult = submitCodOrder(submission);
    expect(orderResult.success).toBe(true);
  });

  // Scenario 3
  it('Scenario 3: Customer in In Guezzam (Wilaya 54) attempts Stop-Desk -> Blocked & Auto-fallback to Home', () => {
    // Step 1: Customer in In Guezzam attempts to select Stop-Desk
    expect(isStopDeskAllowed(54)).toBe(false);

    const attemptedSubmission: CodOrderSubmission = {
      customerName: 'Mokhtar InGuezzam',
      customerPhone: '0770554433',
      wilayaCode: 54,
      wilayaName: 'In Guezzam',
      communeName: 'In Guezzam',
      deliveryType: 'STOP_DESK',
      packId: 'PACK1',
      productName: 'Pack 1',
      productPrice: 4950,
      shippingFee: 400,
      totalPayable: 5350
    };

    // Step 2: System rejects Stop-Desk submission with explanatory guidance
    const attemptResult = submitCodOrder(attemptedSubmission);
    expect(attemptResult.success).toBe(false);
    expect(attemptResult.error).toContain('Stop-Desk');

    // Step 3: Fallback to Home delivery succeeds with southern zone tariff
    const homeTariff = calculateDeliveryTariff(54, 'DOMICILE');
    expect(homeTariff).toBe(1000);

    const correctedSubmission: CodOrderSubmission = {
      ...attemptedSubmission,
      deliveryType: 'DOMICILE',
      deliveryAddress: 'Centre Ville In Guezzam, Rue Principale',
      shippingFee: homeTariff,
      totalPayable: 4950 + homeTariff
    };
    const finalResult = submitCodOrder(correctedSubmission);
    expect(finalResult.success).toBe(true);
    expect(finalResult.orderNumber).toBeDefined();
  });

  // Scenario 6
  it('Scenario 6: Expat / Customer with international (+213) phone orders Pack 3 (Welder) Home Delivery', () => {
    const pack = PRODUCT_PACKS.PACK3;
    expect(pack.priceDzd).toBe(15950);

    // Customer enters international format
    const rawPhone = '+213 (0) 798 28 24 95';
    const norm = normalizeAlgerianPhone(rawPhone);
    expect(norm).toBe('0798282495');

    // Delivery to Biskra (Hub Origin Wilaya 07)
    const shipping = calculateDeliveryTariff(7, 'DOMICILE');
    expect(shipping).toBe(450);

    const submission: CodOrderSubmission = {
      customerName: 'Djamel Belkadi',
      customerPhone: rawPhone,
      wilayaCode: 7,
      wilayaName: 'Biskra',
      communeName: 'Biskra',
      deliveryAddress: 'Cite El Bassatine',
      deliveryType: 'DOMICILE',
      packId: 'PACK3',
      productName: pack.nameAr,
      productPrice: pack.priceDzd,
      shippingFee: shipping,
      totalPayable: pack.priceDzd + shipping
    };
    const res = submitCodOrder(submission);
    expect(res.success).toBe(true);
  });

  // Scenario 7
  it('Scenario 7: Malicious bot automated POST intercepted by Honeypot & Anti-Spam protection', () => {
    const botSubmission: CodOrderSubmission = {
      customerName: '<script>document.cookie</script>',
      customerPhone: '0000000000',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Hydra',
      deliveryAddress: 'http://malicious-payload.example',
      deliveryType: 'DOMICILE',
      packId: 'PACK1',
      productName: 'Pack 1',
      productPrice: 4950,
      shippingFee: 500,
      totalPayable: 5450,
      honeypot: 'https://crawler-bot.xyz/trap'
    };

    // Honeypot immediately intercepts bot with 0 database mutation and 0 Telegram notification
    const res = submitCodOrder(botSubmission);
    expect(res.success).toBe(false);
    expect(res.error).toContain('honeypot');
  });
});
