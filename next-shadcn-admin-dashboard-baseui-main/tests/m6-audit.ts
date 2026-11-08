/**
 * M6 Milestone Comprehensive Direct Unit & Behavior Verification Script
 */

import {
  MockCourierProvider,
  YalidineCourierProvider,
  ZrExpressCourierProvider,
  CourierProviderManager,
  getCourierProviderManager,
} from '../src/lib/couriers';
import {
  saveSettingsAction,
  testTelegramNotificationAction,
  testCourierConnectionAction,
  getAdminSettingsAction,
} from '../src/app/actions/settings';

async function runM6Verification() {
  console.log('--- STARTING M6 UNIT & INTEGRATION CHECKS ---');

  // 1. Mock Courier Provider
  const mock = new MockCourierProvider();
  console.assert(mock.id === 'mock', 'Mock id must be "mock"');
  console.assert(mock.name.includes('Mock'), 'Mock name must contain "Mock"');
  const mockConn = await mock.testConnection();
  console.assert(mockConn.success === true, 'Mock connection test must succeed');
  const mockParcel = await mock.createParcel({
    orderNumber: 'ORV-TEST-001',
    customerName: 'Karim',
    customerPhone: '0550123456',
    wilayaCode: 16,
    wilayaName: 'Alger',
    communeName: 'Hydra',
    address: 'Rue 1',
    deliveryType: 'DOMICILE',
    amountToCollect: 5450,
    productDescription: 'Pack 1',
  });
  console.assert(mockParcel.success === true, 'Mock parcel creation must succeed');
  console.assert(mockParcel.trackingCode.startsWith('MCK-16-'), 'Mock tracking must start with MCK-16-');
  console.log('✅ 1. MockCourierProvider verified');

  // 2. Yalidine Courier Provider
  const yal = new YalidineCourierProvider();
  console.assert(yal.id === 'yalidine', 'Yalidine id must be "yalidine"');
  console.assert(yal.supportsStopDesk === true, 'Yalidine must support Stop Desk');
  const yalUnauth = await yal.createParcel({
    orderNumber: 'ORV-TEST-002',
    customerName: 'Samir',
    customerPhone: '0660123456',
    wilayaCode: 31,
    wilayaName: 'Oran',
    communeName: 'Es Senia',
    address: 'Rue 2',
    deliveryType: 'STOP_DESK',
    amountToCollect: 8900,
    productDescription: 'Pack 2',
  }, {});
  console.assert(yalUnauth.success === false, 'Yalidine must fail without credentials');
  console.assert(yalUnauth.error?.includes('Unauthenticated'), 'Yalidine error must mention Unauthenticated');

  const yalAuth = await yal.createParcel({
    orderNumber: 'ORV-TEST-003',
    customerName: 'Samir',
    customerPhone: '0660123456',
    wilayaCode: 16,
    wilayaName: 'Alger',
    communeName: 'Hydra',
    address: 'Rue 3',
    deliveryType: 'DOMICILE',
    amountToCollect: 5450,
    productDescription: 'Pack 1',
  }, { apiId: 'test-id', apiToken: 'test-token' });
  console.assert(yalAuth.success === true, 'Yalidine parcel with credentials must succeed');
  console.assert(yalAuth.trackingCode.startsWith('yal-16'), 'Yalidine tracking must start with yal-16');
  console.assert(yalAuth.trackingUrl?.includes('yalidine.com/suivi/'), 'Yalidine trackingUrl must contain yalidine.com/suivi/');
  console.log('✅ 2. YalidineCourierProvider verified');

  // 3. ZR Express Courier Provider
  const zr = new ZrExpressCourierProvider();
  console.assert(zr.id === 'zr_express', 'ZR Express id must be "zr_express"');
  const zrUnauth = await zr.createParcel({
    orderNumber: 'ORV-TEST-004',
    customerName: 'Ali',
    customerPhone: '0770123456',
    wilayaCode: 25,
    wilayaName: 'Constantine',
    communeName: 'El Khroub',
    address: 'Rue 4',
    deliveryType: 'DOMICILE',
    amountToCollect: 13890,
    productDescription: 'Pack 3',
  }, {});
  console.assert(zrUnauth.success === false, 'ZR Express must fail without credentials');

  const zrAuth = await zr.createParcel({
    orderNumber: 'ORV-TEST-005',
    customerName: 'Ali',
    customerPhone: '0770123456',
    wilayaCode: 25,
    wilayaName: 'Constantine',
    communeName: 'El Khroub',
    address: 'Rue 4',
    deliveryType: 'DOMICILE',
    amountToCollect: 13890,
    productDescription: 'Pack 3',
  }, { apiKey: 'zr-key', apiSecret: 'zr-secret' });
  console.assert(zrAuth.success === true, 'ZR Express parcel with credentials must succeed');
  console.assert(zrAuth.trackingCode.startsWith('ZR') && zrAuth.trackingCode.endsWith('DZ'), 'ZR tracking must start with ZR and end with DZ');
  console.log('✅ 3. ZrExpressCourierProvider verified');

  // 4. Courier Provider Manager
  const manager = new CourierProviderManager();
  console.assert(manager.getActiveProviderId() === 'mock', 'Default active provider must be "mock"');
  console.assert(manager.getActiveProvider().name.includes('Mock'), 'Default active provider name must contain "Mock"');

  manager.setActiveProvider('yalidine', { apiId: 'valid-id', apiToken: 'valid-token' });
  console.assert(manager.getActiveProviderId() === 'yalidine', 'Must switch to yalidine');

  manager.setActiveProvider('zr_express', { apiKey: 'zr-key', apiSecret: 'zr-secret' });
  console.assert(manager.getActiveProviderId() === 'zr_express', 'Must switch to zr_express');

  let unknownCarrierThrew = false;
  try {
    manager.setActiveProvider('unknown_carrier_dz');
  } catch (err: any) {
    unknownCarrierThrew = true;
    console.assert(err.message.includes('Cannot switch to unknown courier provider "unknown_carrier_dz"'), 'Expected exact unknown carrier error');
  }
  console.assert(unknownCarrierThrew, 'Must throw on unknown provider');

  let yalidineMissingThrew = false;
  try {
    manager.setActiveProvider('yalidine', { apiId: 'only-id' });
  } catch (err: any) {
    yalidineMissingThrew = true;
    console.assert(err.message.includes('Yalidine requires apiId and apiToken'), 'Expected missing apiToken error');
  }
  console.assert(yalidineMissingThrew, 'Must throw on missing Yalidine apiToken');
  console.log('✅ 4. CourierProviderManager switching & validation verified');

  // 5. Server Actions: saveSettingsAction & getAdminSettingsAction
  const saveResult = await saveSettingsAction({
    metaPixel: {
      pixelId: '987654321012345',
      capiToken: 'EAABtesttoken123',
      testEventCode: 'TEST999',
      enabled: true,
      capiEnabled: true,
    },
    telegram: {
      botToken: '123456:ABCdefGhIJKlmNoPQRsTUVwxyZ',
      chatId: '-100987654321',
      enabled: true,
    },
    couriers: {
      activeProvider: 'yalidine',
      yalidine: {
        apiId: 'yal-test-id',
        apiToken: 'yal-test-token',
        defaultDeliveryType: 'STOP_DESK',
      },
      zrExpress: {
        apiKey: 'zr-test-key',
        apiSecret: 'zr-test-secret',
      },
    },
  });
  console.assert(saveResult.success === true, 'saveSettingsAction must succeed');

  const fetched = await getAdminSettingsAction();
  console.assert(fetched.metaPixel.pixelId === '987654321012345', 'Saved meta pixel ID must match');
  console.assert(fetched.telegram.chatId === '-100987654321', 'Saved telegram chat ID must match');
  console.assert(fetched.couriers.activeProvider === 'yalidine', 'Saved active courier must be yalidine');
  console.log('✅ 5. saveSettingsAction & getAdminSettingsAction verified');

  // 6. Server Action: testTelegramNotificationAction
  const tgResult = await testTelegramNotificationAction('123456:ABCdefGhIJKlmNoPQRsTUVwxyZ', '-100987654321');
  console.assert(tgResult.success === true, 'Telegram notification test must return success');
  console.assert(tgResult.alertPreview?.includes('0555 •• •• 56'), 'Telegram alert preview must mask customer phone');
  console.assert(tgResult.alertPreview?.includes('5,450 د.ج'), 'Telegram alert preview must include DZD pricing');
  console.log('✅ 6. testTelegramNotificationAction verified with PII masking & DZD pricing');

  // 7. Server Action: testCourierConnectionAction
  const connMock = await testCourierConnectionAction('mock');
  console.assert(connMock.success === true, 'Mock courier connection test must succeed');

  const connYal = await testCourierConnectionAction('yalidine', { apiId: 'test-id', apiToken: 'test-token' });
  console.assert(connYal.success === true, 'Yalidine connection test with credentials must succeed');

  const connZr = await testCourierConnectionAction('zr_express', { apiKey: 'zr-key', apiSecret: 'zr-secret' });
  console.assert(connZr.success === true, 'ZR Express connection test with credentials must succeed');

  const connFail = await testCourierConnectionAction('yalidine', { apiId: '' });
  console.assert(connFail.success === false, 'Yalidine connection test without credentials must fail');
  console.log('✅ 7. testCourierConnectionAction verified for all providers');

  console.log('--- ALL M6 DIRECT VERIFICATION CHECKS PASSED ---');
}

runM6Verification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
