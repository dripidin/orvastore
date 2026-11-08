/**
 * Milestone M5 Verification: Admin Dashboard Operations & Order Re-routing ('تحويل الطلبية')
 */

import assert from 'node:assert';
import { rerouteOrderAction } from '../src/app/actions/reroute';
import { fallbackOrdersStore } from '../src/lib/orders-store';
import {
  generateCourierInstructionNote,
  orderReRoutingSchema,
} from '../src/lib/types/re-routing';
import { calculateDeliveryTariff, isStopDeskAllowed } from '../src/lib/types/checkout';

async function runM5Verification() {
  console.log('════════════════════════════════════════════════════════════════════');
  console.log('  MILESTONE M5 VERIFICATION SUITE — ORVA COD RE-ROUTING & ADMIN OPS');
  console.log('════════════════════════════════════════════════════════════════════\n');

  // Seed an order into fallbackOrdersStore
  const testOrderId = 'ORV-261107-M5TEST';
  fallbackOrdersStore.push({
    id: testOrderId,
    orderNumber: testOrderId,
    customerName: 'Karim Brahimi',
    customerPhone: '0555123456',
    customerPhone2: null,
    wilayaCode: 5,
    wilayaName: 'Batna',
    communeName: 'Arris',
    deliveryType: 'DOMICILE',
    deliveryAddress: 'Cité El Amir',
    packId: 'PACK1',
    productName: 'Pack 1 Pro 4-in-1',
    productPrice: 4950,
    shippingFee: 450,
    totalPayable: 5400,
    status: 'RETURNED' as any,
    originHub: 'BISKRA_07',
    createdAt: new Date().toISOString(),
  });

  // Test 1: Re-routing a RETURNED order to a new buyer in Setif (Zone 2)
  console.log('Test 1: Re-routing a RETURNED order to a new buyer...');
  const res1 = await rerouteOrderAction({
    orderId: testOrderId,
    sourceOrderId: testOrderId,
    newCustomerName: 'Mounir Khelil',
    newCustomerPhone: '0770987654',
    newWilayaCode: 19,
    newWilayaName: 'Sétif',
    newCommuneName: 'El Eulma',
    newDeliveryType: 'DOMICILE',
    newDeliveryAddress: 'Boulevard 1er Novembre',
    reason: 'Original client refused package; transferred to active customer in El Eulma',
    operator: 'Admin Salim',
    shippedOverrideConfirmed: false,
  });

  assert.strictEqual(res1.success, true, 'Re-route result must be success');
  assert.ok(res1.orderId.includes(`REROUTE-${testOrderId}`), 'Order ID must include REROUTE prefix');
  assert.strictEqual(res1.updatedShippingFee, 500, 'Setif Domicile tariff must be 500 DZD from Biskra Hub');
  assert.strictEqual(res1.updatedTotal, 4950 + 500, 'Updated total must equal product price + new shipping fee');
  assert.ok(res1.sequence > 0, 'Sequence number must be positive');
  assert.ok(res1.formattedCourierNote.includes('طلب تحويل طرد (Réacheminement de Colis)'), 'Note must contain header');
  assert.ok(res1.formattedCourierNote.includes('Mounir Khelil'), 'Note must contain new buyer name');
  assert.ok(res1.formattedCourierNote.includes('0770987654'), 'Note must contain new phone');
  assert.ok(res1.formattedCourierNote.includes('5,450 د.ج'), 'Note must contain formatted COD total');
  console.log('✅ Test 1 Passed: Order re-routed successfully with accurate Biskra tariffs and note generation.');

  // Test 2: Child order exists in fallback store with linked conversion history
  console.log('\nTest 2: Verifying child order persistence and source order conversion tracking...');
  const childOrder = fallbackOrdersStore.find((o) => o.orderNumber === res1.orderId);
  assert.ok(childOrder, 'Child order must be persisted in store');
  assert.strictEqual(childOrder.customerName, 'Mounir Khelil');
  assert.strictEqual(childOrder.totalPayable, 5450);
  assert.strictEqual(childOrder.status, 'PENDING');

  const sourceOrder = fallbackOrdersStore.find((o) => o.orderNumber === testOrderId);
  assert.ok((sourceOrder as any)?.isSwitched, 'Source order must be flagged as switched');
  assert.ok((sourceOrder as any)?.remarks?.length > 0, 'Source order must have conversion logs');
  console.log('✅ Test 2 Passed: Hierarchical order linkage and conversion history verified.');

  // Test 3: Stop-Desk Zone 5 barrier enforcement
  console.log('\nTest 3: Enforcing Stop-Desk barrier on Far South Zone 5 Wilayas (e.g. 54 In Guezzam)...');
  assert.strictEqual(isStopDeskAllowed(54), false, 'Wilaya 54 must NOT allow Stop-Desk');
  assert.strictEqual(isStopDeskAllowed(16), true, 'Wilaya 16 (Alger) must allow Stop-Desk');

  let barrierTriggered = false;
  try {
    await rerouteOrderAction({
      orderId: testOrderId,
      newCustomerName: 'Ahmed South',
      newCustomerPhone: '0661223344',
      newWilayaCode: 54,
      newWilayaName: 'In Guezzam',
      newCommuneName: 'In Guezzam',
      newDeliveryType: 'STOP_DESK',
      reason: 'Attempt stop desk in zone 5',
      operator: 'Tester',
      shippedOverrideConfirmed: false,
    });
  } catch (err: any) {
    barrierTriggered = true;
    assert.ok(
      err.message.includes('Stop-Desk is restricted in Wilaya 54') ||
        err.message.includes('Stop-Desk'),
      'Error message must indicate Stop-Desk restriction'
    );
  }
  assert.ok(barrierTriggered, 'Stop-Desk barrier in Zone 5 must throw error');
  console.log('✅ Test 3 Passed: Zone 5 Stop-Desk barrier strictly enforced.');

  // Test 4: Terminal status barrier (DELIVERED orders cannot be re-routed)
  console.log('\nTest 4: Terminal status safety barrier (DELIVERED status)...');
  const deliveredId = 'ORV-261107-DELIVERED';
  fallbackOrdersStore.push({
    id: deliveredId,
    orderNumber: deliveredId,
    customerName: 'Delivered Customer',
    customerPhone: '0555998877',
    customerPhone2: null,
    wilayaCode: 16,
    wilayaName: 'Alger',
    communeName: 'Bab Ezzouar',
    deliveryType: 'DOMICILE',
    deliveryAddress: 'Rue 1',
    packId: 'PACK2',
    productName: 'Pack 2 Elite',
    productPrice: 12950,
    shippingFee: 500,
    totalPayable: 13450,
    status: 'DELIVERED' as any,
    originHub: 'BISKRA_07',
    createdAt: new Date().toISOString(),
  });

  let deliveredBlocked = false;
  try {
    await rerouteOrderAction({
      orderId: deliveredId,
      newCustomerName: 'New Person',
      newCustomerPhone: '0555112233',
      newWilayaCode: 31,
      newWilayaName: 'Oran',
      newCommuneName: 'Es Senia',
      newDeliveryType: 'DOMICILE',
      newDeliveryAddress: 'Cité 2',
      reason: 'Illegal reroute of delivered order',
      operator: 'Tester',
      shippedOverrideConfirmed: true,
    });
  } catch (err: any) {
    deliveredBlocked = true;
    assert.ok(
      err.message.includes('terminal status') && err.message.includes('prohibits modification'),
      'Must contain terminal status prohibitions message'
    );
  }
  assert.ok(deliveredBlocked, 'DELIVERED orders must be blocked from re-routing');
  console.log('✅ Test 4 Passed: Terminal status barrier blocks modification of delivered orders.');

  // Test 5: Courier support note character fidelity & clipboard format
  console.log('\nTest 5: Structured Courier Note Format & Escaping Fidelity...');
  const note = generateCourierInstructionNote({
    originalOrderNumber: 'ORV-261107-101',
    originalCustomerName: 'Ahmed Brahimi',
    originalWilaya: 'Batna',
    newCustomerName: 'Khaled Mansour',
    newCustomerPhone: '0661234567',
    newWilayaCode: 16,
    newWilayaName: 'Alger',
    newCommuneName: 'Bab Ezzouar',
    newDeliveryType: 'STOP_DESK',
    updatedCodAmount: 5350,
    operator: 'Supervisor Samy',
    reason: 'Client change of recipient while parcel is held at hub',
  });

  assert.ok(note.includes('*** تحويل مسار الطرد / INSTRUCTION RE-ROUTING COLIS ***'));
  assert.ok(note.includes('طلب تحويل طرد (Réacheminement de Colis)'));
  assert.ok(note.includes('ORV-261107-101'));
  assert.ok(note.includes('Ahmed Brahimi'));
  assert.ok(note.includes('Khaled Mansour'));
  assert.ok(note.includes('0661234567'));
  assert.ok(note.includes('[16] Alger'));
  assert.ok(note.includes('Bab Ezzouar'));
  assert.ok(note.includes('5,350 د.ج'));
  assert.ok(note.includes('Supervisor Samy'));
  console.log('✅ Test 5 Passed: Courier support note conforms to both prompt and carrier formats.');

  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('  🌟 ALL 5 MILESTONE M5 VERIFICATION CHECKS PASSED WITH 100% SUCCESS');
  console.log('════════════════════════════════════════════════════════════════════\n');
}

runM5Verification().catch((err) => {
  console.error('❌ M5 Verification Failed:', err);
  process.exit(1);
});
