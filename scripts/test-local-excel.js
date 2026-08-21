'use strict';
require('dotenv').config({ path: '.env.local' });
const db = require('../lib/db');
const gs = require('../lib/googleSheets');

async function test() {
    console.log('--- Testing Local Excel DB Integration ---');
    console.log('Is Local Mode:', gs.isLocalMode());

    // 1. Verify Connection
    const conn = await gs.verifyConnection();
    console.log('Connection Verification:', conn);

    // 2. Read Orders
    const orders = await db.getAllOrdersFromDb();
    console.log(`Read ${orders.length} orders from local Excel:`);
    orders.forEach(o => {
        console.log(`  - [${o.orderId}] ${o.fullName} | ${o.wilaya} | ${o.status} | Total: ${o.grandTotal}`);
    });

    // 3. Create a Test Order
    const newOrder = {
        orderId: 'ORVA-LOCAL-999',
        fullName: 'فاروق تواتي',
        phone: '0655443322',
        wilaya: '16 - الجزائر',
        commune: 'القبة',
        deliveryType: 'توصيل للمنزل',
        quantity: 1,
        productName: 'Sac Banane Moto Yamaha',
        productTotal: '3900 د.ج',
        shippingFee: '400 د.ج',
        priceNum: 3900,
        grandTotal: '4300 د.ج',
        status: 'pending'
    };

    console.log('\nAppending test order...');
    const saved = await db.saveOrderToDb(newOrder, { riskScore: 5, riskLevel: 'LOW', riskDecision: 'ALLOW' });
    console.log('Saved order:', saved.orderId, saved.fullName);

    // 4. Update the Test Order
    console.log('\nUpdating test order status to confirmed...');
    const updated = await db.updateOrderInDb('ORVA-LOCAL-999', { status: 'confirmed', in_redex: true, redex_tracking_code: 'TRK-TEST-123' });
    console.log('Updated order:', updated.orderId, 'new status:', updated.status, 'tracking:', updated.redex_tracking_code);

    // 5. Delete Test Order
    console.log('\nDeleting test order...');
    await db.deleteOrderFromDb('ORVA-LOCAL-999');
    console.log('Deleted successfully.');

    console.log('\n✅ All Local Excel tests completed successfully!');
}

test().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
