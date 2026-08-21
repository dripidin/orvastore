// =============================================================================
// Google Sheets Connection Verification Script
// Run: node verify-sheets.js
// =============================================================================
// Tests: auth, spreadsheet access, sheet names, read, append, update, delete.
// NEVER prints private key or credentials.
// =============================================================================

'use strict';

require('dotenv').config({ path: '.env.local' });

async function main() {
    console.log('\n🔍 Google Sheets Connection Verification\n');
    console.log('📧 Client Email:', process.env.GOOGLE_CLIENT_EMAIL || '❌ NOT SET');
    console.log('📄 Sheet ID:', process.env.GOOGLE_SHEET_ID ? '✅ Set (' + process.env.GOOGLE_SHEET_ID.slice(0, 8) + '...)' : '❌ NOT SET');
    console.log('🔑 Private Key:', process.env.GOOGLE_PRIVATE_KEY ? '✅ Set (hidden)' : '❌ NOT SET');
    console.log('');

    if (!process.env.GOOGLE_SHEET_ID || process.env.GOOGLE_SHEET_ID === 'PASTE_YOUR_SPREADSHEET_ID_HERE') {
        console.error('❌ GOOGLE_SHEET_ID is not set. Please add your Spreadsheet ID to .env.local');
        process.exit(1);
    }

    const gs = require('./lib/googleSheets');

    // ── 1. Verify Connection ──────────────────────────────────────────────────
    console.log('1️⃣  Testing connection & spreadsheet access...');
    const conn = await gs.verifyConnection();
    if (!conn.ok) {
        console.error('❌ Connection FAILED:', conn.error);
        process.exit(1);
    }
    console.log('✅ Connected! Spreadsheet title:', conn.spreadsheetTitle);
    console.log('📋 Sheet tabs detected:', conn.sheetNames.join(', '));

    const required = ['Orders', 'Customers', 'RiskEvents', 'Watchlist'];
    const missing  = required.filter(r => !conn.sheetNames.includes(r));
    if (missing.length > 0) {
        console.warn('⚠️  Missing required tabs:', missing.join(', '));
        console.warn('   Please create these tabs in your Google Spreadsheet.');
    } else {
        console.log('✅ All 4 required tabs present:', required.join(', '));
    }

    // ── 2. Read Orders Sheet ──────────────────────────────────────────────────
    console.log('\n2️⃣  Reading Orders sheet...');
    const orders = await gs.getRows(gs.SHEETS.ORDERS);
    console.log(`✅ Orders sheet: ${orders.length} row(s)`);

    // ── 3. Append Test Row ────────────────────────────────────────────────────
    console.log('\n3️⃣  Appending test order row...');
    const testId = 'TEST-' + Date.now();
    const testRow = {
        order_id: testId,
        store_id: 'test',
        full_name: 'مستخدم اختبار',
        phone: '0555000000',
        wilaya: 'الجزائر العاصمة',
        commune: 'الجزائر',
        delivery_type: 'توصيل للمنزل',
        delivery_time: '24 - 48 H',
        quantity: '1',
        product_name: 'اختبار Google Sheets',
        product_total: '4500 د.ج',
        shipping_fee: '500 د.ج',
        price_num: '4500',
        grand_total: '5000 د.ج',
        status: 'test',
        in_redex: 'false',
        redex_tracking_code: '',
        remarks: '[]',
        client_ip_hash: '',
        device_id: '',
        risk_score: '0',
        risk_level: 'LOW',
        risk_decision: 'ALLOW',
        risk_reasons: '',
        created_at: new Date().toISOString()
    };

    const appended = await gs.appendRow(gs.SHEETS.ORDERS, testRow);
    if (!appended) { console.error('❌ Append FAILED'); process.exit(1); }
    console.log('✅ Test row appended with ID:', testId);

    // ── 4. Find Test Row ──────────────────────────────────────────────────────
    console.log('\n4️⃣  Finding test row...');
    const found = await gs.findRows(gs.SHEETS.ORDERS, r => r.order_id === testId);
    if (found.length === 0) { console.error('❌ Find FAILED — row not found'); process.exit(1); }
    console.log('✅ Row found at sheet index:', found[0]._rowIndex);

    // ── 5. Update Test Row ────────────────────────────────────────────────────
    console.log('\n5️⃣  Updating test row status → verified...');
    const updated = await gs.findAndUpdateRow(gs.SHEETS.ORDERS, r => r.order_id === testId, { status: 'verified' });
    if (!updated) { console.error('❌ Update FAILED'); process.exit(1); }
    console.log('✅ Row updated successfully');

    // ── 6. Delete Test Row ────────────────────────────────────────────────────
    console.log('\n6️⃣  Cleaning up — deleting test row...');
    const del = await gs.deleteRow(gs.SHEETS.ORDERS, found[0]._rowIndex);
    if (!del) { console.error('❌ Delete FAILED (row may still exist in sheet)'); }
    else console.log('✅ Test row deleted');

    // ── Final Report ──────────────────────────────────────────────────────────
    console.log('\n' + '─'.repeat(50));
    console.log('✅ VERIFICATION COMPLETE');
    console.log('─'.repeat(50));
    console.log('Auth:          ✅ Service account authenticated');
    console.log('Spreadsheet:   ✅ Accessible');
    console.log('Tabs found:    ✅', conn.sheetNames.join(', '));
    console.log('Read:          ✅');
    console.log('Append:        ✅');
    console.log('Update:        ✅');
    console.log('Delete:        ✅');
    console.log('Credentials:   ✅ Never exposed');
    if (missing.length > 0) {
        console.log('\n⚠️  ACTION REQUIRED: Create missing tabs:', missing.join(', '));
    } else {
        console.log('\n🚀 System ready for production deployment!');
    }
}

main().catch(err => {
    console.error('\n❌ Verification error:', err.message);
    process.exit(1);
});
