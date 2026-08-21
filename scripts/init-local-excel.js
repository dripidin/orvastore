'use strict';
// =============================================================================
// Local Excel Database Initializer — Yamaha Sac / ORVA Store
// Generates simulated Google Sheets as real local .xlsx files
// =============================================================================

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EXCEL_DIR = path.join(DATA_DIR, 'excel');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(EXCEL_DIR)) fs.mkdirSync(EXCEL_DIR, { recursive: true });

// ── 1. Headers Definition (Exact match to Google Cloud Schema) ────────────────
const HEADERS = {
    ORDERS: [
        'order_id', 'store_id', 'full_name', 'phone', 'wilaya', 'commune',
        'delivery_type', 'delivery_time', 'quantity', 'product_name', 'product_total',
        'shipping_fee', 'price_num', 'grand_total', 'status', 'in_redex',
        'redex_tracking_code', 'remarks', 'client_ip_hash', 'device_id',
        'risk_score', 'risk_level', 'risk_decision', 'risk_reasons', 'created_at'
    ],
    CUSTOMERS: [
        'customer_id', 'phone', 'name', 'total_orders', 'completed',
        'cancelled', 'rejected', 'no_response', 'trust_score', 'risk_level',
        'created_at', 'updated_at'
    ],
    WATCHLIST: [
        'identifier', 'identifier_type', 'reason', 'status', 'created_at', 'expires_at'
    ],
    RISK_EVENTS: [
        'event_id', 'event_type', 'store_id', 'order_id', 'actor_phone',
        'device_id', 'ip_hash', 'metadata', 'created_at'
    ]
};

// ── 2. Realistic Initial Mock Data ───────────────────────────────────────────
const now = new Date();
const isoMinusDays = (days, hours = 0) => {
    const d = new Date(now.getTime() - (days * 24 * 60 + hours * 60) * 60 * 1000);
    return d.toISOString();
};

const SAMPLE_ORDERS = [
    {
        order_id: 'ORVA-1045',
        store_id: 'yamahasac',
        full_name: 'أحمد بن علي',
        phone: '0555123456',
        wilaya: '07 - بسكرة',
        commune: 'بسكرة',
        delivery_type: 'توصيل للمنزل',
        delivery_time: '24 - 48 H',
        quantity: '1',
        product_name: 'Sac Banane Moto Yamaha (كرطابل يماها) + AirPods + Watch هدية',
        product_total: '3900 د.ج',
        shipping_fee: '500 د.ج',
        price_num: '3900',
        grand_total: '4400 د.ج',
        status: 'pending',
        in_redex: 'false',
        redex_tracking_code: '',
        remarks: JSON.stringify([{ text: 'اتصل قبل التوصيل', time: isoMinusDays(0, 1) }]),
        client_ip_hash: 'a1b2c3d4e5f678901234567890abcdef',
        device_id: 'dev_mock_001',
        risk_score: '10',
        risk_level: 'LOW',
        risk_decision: 'ALLOW',
        risk_reasons: 'NORMAL_BEHAVIOR',
        created_at: isoMinusDays(0, 2)
    },
    {
        order_id: 'ORVA-1044',
        store_id: 'yamahasac',
        full_name: 'ياسمين مرابط',
        phone: '0661987654',
        wilaya: '16 - الجزائر',
        commune: 'باب الزوار',
        delivery_type: 'توصيل للمنزل',
        delivery_time: '24 - 48 H',
        quantity: '1',
        product_name: 'Sac Banane Moto Yamaha (كرطابل يماها) + AirPods + Watch هدية',
        product_total: '3900 د.ج',
        shipping_fee: '400 د.ج',
        price_num: '3900',
        grand_total: '4300 د.ج',
        status: 'shipped',
        in_redex: 'true',
        redex_tracking_code: 'ECEOSK26081844001',
        remarks: JSON.stringify([]),
        client_ip_hash: 'b2c3d4e5f6a178901234567890abcdef',
        device_id: 'dev_mock_002',
        risk_score: '5',
        risk_level: 'LOW',
        risk_decision: 'ALLOW',
        risk_reasons: 'FREQUENT_CUSTOMER',
        created_at: isoMinusDays(1, 4)
    },
    {
        order_id: 'ORVA-1043',
        store_id: 'yamahasac',
        full_name: 'كريم قاسم',
        phone: '0770334455',
        wilaya: '31 - وهران',
        commune: 'وهران',
        delivery_type: 'توصيل للمكتب (Stop Desk)',
        delivery_time: '48 - 72 H',
        quantity: '2',
        product_name: 'Sac Banane Moto Yamaha (كرطابل يماها) + AirPods + Watch هدية',
        product_total: '7800 د.ج',
        shipping_fee: '400 د.ج',
        price_num: '7800',
        grand_total: '8200 د.ج',
        status: 'delivered',
        in_redex: 'true',
        redex_tracking_code: 'ECEOSK26081843990',
        remarks: JSON.stringify([{ text: 'تم الدفع والاستلام بنجاح', time: isoMinusDays(2) }]),
        client_ip_hash: 'c3d4e5f6a1b278901234567890abcdef',
        device_id: 'dev_mock_003',
        risk_score: '0',
        risk_level: 'LOW',
        risk_decision: 'ALLOW',
        risk_reasons: 'TRUSTED',
        created_at: isoMinusDays(3, 8)
    },
    {
        order_id: 'ORVA-1042',
        store_id: 'yamahasac',
        full_name: 'محمد بوعبد الله',
        phone: '0560778899',
        wilaya: '25 - قسنطينة',
        commune: 'الخروب',
        delivery_type: 'توصيل للمنزل',
        delivery_time: '24 - 48 H',
        quantity: '1',
        product_name: 'Sac Banane Moto Yamaha (كرطابل يماها) + AirPods + Watch هدية',
        product_total: '3900 د.ج',
        shipping_fee: '500 د.ج',
        price_num: '3900',
        grand_total: '4400 د.ج',
        status: 'returned',
        in_redex: 'true',
        redex_tracking_code: 'ECEOSK26081843552',
        remarks: JSON.stringify([{ text: 'الزبون لم يرد على الهاتف', time: isoMinusDays(4) }]),
        client_ip_hash: 'd4e5f6a1b2c378901234567890abcdef',
        device_id: 'dev_mock_004',
        risk_score: '65',
        risk_level: 'HIGH',
        risk_decision: 'REVIEW',
        risk_reasons: 'NO_RESPONSE_HISTORY',
        created_at: isoMinusDays(5, 3)
    },
    {
        order_id: 'ORVA-1041',
        store_id: 'yamahasac',
        full_name: 'سامي دراجي',
        phone: '0670112233',
        wilaya: '19 - سطيف',
        commune: 'العلمة',
        delivery_type: 'توصيل للمنزل',
        delivery_time: '24 - 48 H',
        quantity: '1',
        product_name: 'Sac Banane Moto Yamaha (كرطابل يماها) + AirPods + Watch هدية',
        product_total: '3900 د.ج',
        shipping_fee: '450 د.ج',
        price_num: '3900',
        grand_total: '4350 د.ج',
        status: 'pending',
        in_redex: 'false',
        redex_tracking_code: '',
        remarks: JSON.stringify([]),
        client_ip_hash: 'e5f6a1b2c3d478901234567890abcdef',
        device_id: 'dev_mock_005',
        risk_score: '15',
        risk_level: 'LOW',
        risk_decision: 'ALLOW',
        risk_reasons: 'NORMAL_BEHAVIOR',
        created_at: isoMinusDays(0, 5)
    }
];

const SAMPLE_CUSTOMERS = [
    {
        customer_id: 'CUST-0555123456',
        phone: '0555123456',
        name: 'أحمد بن علي',
        total_orders: '1',
        completed: '0',
        cancelled: '0',
        rejected: '0',
        no_response: '0',
        trust_score: '50',
        risk_level: 'LOW',
        created_at: isoMinusDays(0, 2),
        updated_at: isoMinusDays(0, 2)
    },
    {
        customer_id: 'CUST-0770334455',
        phone: '0770334455',
        name: 'كريم قاسم',
        total_orders: '3',
        completed: '3',
        cancelled: '0',
        rejected: '0',
        no_response: '0',
        trust_score: '75',
        risk_level: 'LOW',
        created_at: isoMinusDays(30),
        updated_at: isoMinusDays(3, 8)
    },
    {
        customer_id: 'CUST-0560778899',
        phone: '0560778899',
        name: 'محمد بوعبد الله',
        total_orders: '2',
        completed: '0',
        cancelled: '1',
        rejected: '0',
        no_response: '1',
        trust_score: '30',
        risk_level: 'HIGH',
        created_at: isoMinusDays(15),
        updated_at: isoMinusDays(5, 3)
    }
];

const SAMPLE_WATCHLIST = [
    {
        identifier: '0560778899',
        identifier_type: 'PHONE',
        reason: 'تكرار عدم الرد على الموزع',
        status: 'watchlist',
        created_at: isoMinusDays(5),
        expires_at: ''
    }
];

const SAMPLE_RISK_EVENTS = [
    {
        event_id: 'EVT-001',
        event_type: 'ORDER_EVALUATION',
        store_id: 'yamahasac',
        order_id: 'ORVA-1045',
        actor_phone: '0555123456',
        device_id: 'dev_mock_001',
        ip_hash: 'a1b2c3d4e5f678901234567890abcdef',
        metadata: JSON.stringify({ score: 10, decision: 'ALLOW' }),
        created_at: isoMinusDays(0, 2)
    },
    {
        event_id: 'EVT-002',
        event_type: 'ORDER_EVALUATION',
        store_id: 'yamahasac',
        order_id: 'ORVA-1042',
        actor_phone: '0560778899',
        device_id: 'dev_mock_004',
        ip_hash: 'd4e5f6a1b2c378901234567890abcdef',
        metadata: JSON.stringify({ score: 65, decision: 'REVIEW' }),
        created_at: isoMinusDays(5, 3)
    }
];

function createExcelFile(filename, sheetName, headers, data) {
    const filePath = path.join(EXCEL_DIR, filename);
    const wb = XLSX.utils.book_new();
    
    // Format data rows with headers
    const rows = [headers];
    data.forEach(item => {
        const row = headers.map(h => item[h] !== undefined ? item[h] : '');
        rows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filePath);
    console.log(`✅ Created Excel file: ${filename} (${data.length} rows)`);
    return filePath;
}

function createUnifiedWorkbook() {
    const unifiedPath = path.join(EXCEL_DIR, 'GoogleSheets_Simulated.xlsx');
    const wb = XLSX.utils.book_new();

    // 1. Orders Tab
    const orderRows = [HEADERS.ORDERS, ...SAMPLE_ORDERS.map(o => HEADERS.ORDERS.map(h => o[h] || ''))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(orderRows), 'Orders');

    // 2. Customers Tab
    const custRows = [HEADERS.CUSTOMERS, ...SAMPLE_CUSTOMERS.map(c => HEADERS.CUSTOMERS.map(h => c[h] || ''))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(custRows), 'Customers');

    // 3. Watchlist Tab
    const watchRows = [HEADERS.WATCHLIST, ...SAMPLE_WATCHLIST.map(w => HEADERS.WATCHLIST.map(h => w[h] || ''))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(watchRows), 'Watchlist');

    // 4. RiskEvents Tab
    const riskRows = [HEADERS.RISK_EVENTS, ...SAMPLE_RISK_EVENTS.map(r => HEADERS.RISK_EVENTS.map(h => r[h] || ''))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(riskRows), 'RiskEvents');

    XLSX.writeFile(wb, unifiedPath);
    console.log(`⭐ Created Unified Multi-Tab Workbook: GoogleSheets_Simulated.xlsx`);
}

function init() {
    console.log('\n🚀 Initializing Local Excel Files for Yamaha Sac / ORVA Store...');
    
    // Create individual Excel spreadsheets
    createExcelFile('Orders.xlsx', 'Orders', HEADERS.ORDERS, SAMPLE_ORDERS);
    createExcelFile('Customers.xlsx', 'Customers', HEADERS.CUSTOMERS, SAMPLE_CUSTOMERS);
    createExcelFile('Watchlist.xlsx', 'Watchlist', HEADERS.WATCHLIST, SAMPLE_WATCHLIST);
    createExcelFile('RiskEvents.xlsx', 'RiskEvents', HEADERS.RISK_EVENTS, SAMPLE_RISK_EVENTS);

    // Create single unified multi-tab workbook
    createUnifiedWorkbook();

    console.log('\n✨ All Excel files generated successfully in data/excel/\n');
}

if (require.main === module) {
    init();
}

module.exports = { init, HEADERS, SAMPLE_ORDERS, SAMPLE_CUSTOMERS, SAMPLE_WATCHLIST, SAMPLE_RISK_EVENTS };
