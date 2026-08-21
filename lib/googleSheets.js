'use strict';

try {
    require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
} catch (e) {}

// ── Local Excel Service Adapter (Simulation Mode) ─────────────────────────────
const localExcel = require('./localExcelService');

// ── Per-Spreadsheet Configuration ─────────────────────────────────────────────
const SHEET_CONFIG = {
    ORDERS: {
        get id() { return process.env.GOOGLE_SHEET_ID_ORDERS || process.env.GOOGLE_SHEET_ID || ''; },
        tab: process.env.GOOGLE_SHEET_TAB_ORDERS || 'Orders',
        defaultHeaders: [
            'order_id', 'store_id', 'full_name', 'phone', 'wilaya', 'commune',
            'delivery_type', 'delivery_time', 'quantity', 'product_name', 'product_total',
            'shipping_fee', 'price_num', 'grand_total', 'status', 'in_redex',
            'redex_tracking_code', 'remarks', 'client_ip_hash', 'device_id',
            'risk_score', 'risk_level', 'risk_decision', 'risk_reasons', 'created_at'
        ]
    },
    CUSTOMERS: {
        get id() { return process.env.GOOGLE_SHEET_ID_CUSTOMERS || process.env.GOOGLE_SHEET_ID || ''; },
        tab: process.env.GOOGLE_SHEET_TAB_CUSTOMERS || 'Customers',
        defaultHeaders: [
            'customer_id', 'phone', 'name', 'total_orders', 'completed',
            'cancelled', 'rejected', 'no_response', 'trust_score', 'risk_level',
            'created_at', 'updated_at'
        ]
    },
    WATCHLIST: {
        get id() { return process.env.GOOGLE_SHEET_ID_WATCHLIST || process.env.GOOGLE_SHEET_ID || ''; },
        tab: process.env.GOOGLE_SHEET_TAB_WATCHLIST || 'Watchlist',
        defaultHeaders: [
            'identifier', 'identifier_type', 'reason', 'status', 'created_at', 'expires_at'
        ]
    },
    RISK_EVENTS: {
        get id() { return process.env.GOOGLE_SHEET_ID_RISK || process.env.GOOGLE_SHEET_ID || ''; },
        tab: process.env.GOOGLE_SHEET_TAB_RISK || 'RiskEvents',
        defaultHeaders: [
            'event_id', 'event_type', 'store_id', 'order_id', 'actor_phone',
            'device_id', 'ip_hash', 'metadata', 'created_at'
        ]
    }
};

const SHEETS = SHEET_CONFIG;

function isLocalMode() {
    if (process.env.USE_LOCAL_EXCEL === 'true') return true;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey  = process.env.GOOGLE_PRIVATE_KEY;
    const orderSheetId = SHEET_CONFIG.ORDERS.id;
    if (!clientEmail || !privateKey) return true;
    if (!orderSheetId || orderSheetId.includes('your-') || orderSheetId.includes('PASTE_')) return true;
    return false;
}

// ── Auth ───────────────────────────────────────────────────────────────────────
let _auth    = null;
let _sheets  = null;
const _tabNameCache = new Map();

function getAuth() {
    if (_auth) return _auth;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || '';
    const privateKey  = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!clientEmail || !privateKey) {
        return null;
    }
    try {
        const { google } = require('googleapis');
        _auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: clientEmail,
                private_key: privateKey
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        return _auth;
    } catch (e) {
        console.warn('[GoogleSheets] Auth init error:', e.message);
        return null;
    }
}

function getSheetsClient() {
    if (_sheets) return _sheets;
    const auth = getAuth();
    if (!auth) return null;
    try {
        const { google } = require('googleapis');
        _sheets = google.sheets({ version: 'v4', auth });
        return _sheets;
    } catch (e) {
        console.warn('[GoogleSheets] Sheets client init error:', e.message);
        return null;
    }
}

// ── Resolve Actual Tab Name ───────────────────────────────────────────────────
async function resolveTabName(sheetConfig) {
    if (!sheetConfig || !sheetConfig.id) return sheetConfig?.tab || 'Sheet1';
    if (_tabNameCache.has(sheetConfig.id)) {
        return _tabNameCache.get(sheetConfig.id);
    }
    const sheets = getSheetsClient();
    if (!sheets) return sheetConfig.tab;
    try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetConfig.id });
        const tabs = (meta.data.sheets || []).map(s => s.properties.title);
        let resolved = sheetConfig.tab;
        if (!tabs.includes(resolved)) {
            const found = tabs.find(t => t.toLowerCase() === resolved.toLowerCase());
            resolved = found || tabs[0] || resolved;
        }
        _tabNameCache.set(sheetConfig.id, resolved);
        return resolved;
    } catch (e) {
        return sheetConfig.tab;
    }
}


// ── Low-level helpers ──────────────────────────────────────────────────────────

async function getRows(sheetConfig) {
    if (isLocalMode()) {
        return localExcel.getRows(sheetConfig);
    }
    const sheets = getSheetsClient();
    if (!sheets || !sheetConfig || !sheetConfig.id) return [];
    const tabName = await resolveTabName(sheetConfig);
    try {
        const resp = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetConfig.id,
            range: tabName
        });
        const rows = resp.data.values || [];
        if (rows.length === 0) return [];
        const headers = rows[0];
        return rows.slice(1).map((row, idx) => {
            const obj = { _rowIndex: idx + 2 };
            headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
            return obj;
        });
    } catch (e) {
        console.warn(`[GoogleSheets] getRows(${tabName}) error:`, e.message);
        return [];
    }
}

async function getHeaders(sheetConfig) {
    if (isLocalMode()) {
        return localExcel.getHeaders(sheetConfig);
    }
    const sheets = getSheetsClient();
    if (!sheets || !sheetConfig || !sheetConfig.id) return [];
    const tabName = await resolveTabName(sheetConfig);
    try {
        const resp = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetConfig.id,
            range: `${tabName}!1:1`
        });
        const headers = (resp.data.values || [[]])[0] || [];
        if (headers.length === 0 && sheetConfig.defaultHeaders) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: sheetConfig.id,
                range: `${tabName}!A1`,
                valueInputOption: 'RAW',
                requestBody: { values: [sheetConfig.defaultHeaders] }
            });
            return sheetConfig.defaultHeaders;
        }
        return headers;
    } catch (e) {
        console.warn(`[GoogleSheets] getHeaders(${tabName}) error:`, e.message);
        return sheetConfig.defaultHeaders || [];
    }
}

async function appendRow(sheetConfig, rowData) {
    if (isLocalMode()) {
        return localExcel.appendRow(sheetConfig, rowData);
    }
    const sheets = getSheetsClient();
    if (!sheets || !sheetConfig || !sheetConfig.id) return false;
    const tabName = await resolveTabName(sheetConfig);
    try {
        const headers = await getHeaders(sheetConfig);
        if (headers.length === 0) return false;
        const row = headers.map(h => {
            const val = rowData[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
        });
        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetConfig.id,
            range: tabName,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: [row] }
        });
        return true;
    } catch (e) {
        console.warn(`[GoogleSheets] appendRow(${tabName}) error:`, e.message);
        return false;
    }
}

async function updateRow(sheetConfig, rowIndex, updateData) {
    if (isLocalMode()) {
        return localExcel.updateRow(sheetConfig, rowIndex, updateData);
    }
    const sheets = getSheetsClient();
    if (!sheets || !sheetConfig || !sheetConfig.id) return false;
    const tabName = await resolveTabName(sheetConfig);
    try {
        const headers = await getHeaders(sheetConfig);
        if (headers.length === 0) return false;
        const requests = [];
        headers.forEach((h, colIdx) => {
            if (Object.prototype.hasOwnProperty.call(updateData, h)) {
                let val = updateData[h];
                if (val === null || val === undefined) val = '';
                else if (typeof val === 'object') val = JSON.stringify(val);
                else val = String(val);
                requests.push(
                    sheets.spreadsheets.values.update({
                        spreadsheetId: sheetConfig.id,
                        range: `${tabName}!${columnToLetter(colIdx + 1)}${rowIndex}`,
                        valueInputOption: 'RAW',
                        requestBody: { values: [[val]] }
                    })
                );
            }
        });
        if (requests.length > 0) await Promise.all(requests);
        return true;
    } catch (e) {
        console.warn(`[GoogleSheets] updateRow(${tabName}, ${rowIndex}) error:`, e.message);
        return false;
    }
}

async function findAndUpdateRow(sheetConfig, matchFn, updateData) {
    if (isLocalMode()) {
        return localExcel.findAndUpdateRow(sheetConfig, matchFn, updateData);
    }
    const rows = await getRows(sheetConfig);
    const target = rows.find(matchFn);
    if (!target) return null;
    const ok = await updateRow(sheetConfig, target._rowIndex, updateData);
    return ok ? { ...target, ...updateData } : null;
}

async function findRows(sheetConfig, matchFn) {
    if (isLocalMode()) {
        return localExcel.findRows(sheetConfig, matchFn);
    }
    const rows = await getRows(sheetConfig);
    return rows.filter(matchFn);
}

async function deleteRow(sheetConfig, rowIndex) {
    if (isLocalMode()) {
        return localExcel.deleteRow(sheetConfig, rowIndex);
    }
    const sheets = getSheetsClient();
    if (!sheets || !sheetConfig || !sheetConfig.id) return false;
    const tabName = await resolveTabName(sheetConfig);
    try {
        const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetConfig.id });
        const tab  = (meta.data.sheets || []).find(s => s.properties.title === tabName);
        if (!tab) return false;
        const sheetId = tab.properties.sheetId;
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetConfig.id,
            requestBody: {
                requests: [{
                    deleteDimension: {
                        range: { sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex }
                    }
                }]
            }
        });
        return true;
    } catch (e) {
        console.warn(`[GoogleSheets] deleteRow(${tabName}, ${rowIndex}) error:`, e.message);
        return false;
    }
}

// ── Health / Connectivity ──────────────────────────────────────────────────────

async function verifyConnection() {
    if (isLocalMode()) {
        return localExcel.verifyConnection();
    }

    const sheets = getSheetsClient();
    if (!sheets) {
        return { ok: false, error: 'Google Sheets client could not initialize. Check credentials.' };
    }

    const results = [];
    for (const [name, config] of Object.entries(SHEET_CONFIG)) {
        if (!config.id) {
            results.push({ name, id: '', ok: false, error: `Spreadsheet ID not set` });
            continue;
        }
        try {
            const meta = await sheets.spreadsheets.get({ spreadsheetId: config.id });
            const tabNames = (meta.data.sheets || []).map(s => s.properties.title);
            const resolved = await resolveTabName(config);
            results.push({
                name,
                id: config.id.slice(0, 8) + '...',
                ok: true,
                resolvedTab: resolved,
                tabNames,
                title: meta.data.properties.title
            });
        } catch (e) {
            results.push({ name, id: config.id.slice(0, 8) + '...', ok: false, error: e.message });
        }
    }

    const allOk = results.length > 0 && results.every(r => r.ok);
    return { ok: allOk, results };
}

function columnToLetter(col) {
    let letter = '';
    while (col > 0) {
        const rem = (col - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        col = Math.floor((col - 1) / 26);
    }
    return letter;
}

function isConfigured() {
    if (isLocalMode()) return true;
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey  = process.env.GOOGLE_PRIVATE_KEY;
    return !!(clientEmail && privateKey &&
        SHEET_CONFIG.ORDERS.id &&
        SHEET_CONFIG.CUSTOMERS.id &&
        SHEET_CONFIG.WATCHLIST.id &&
        SHEET_CONFIG.RISK_EVENTS.id);
}

module.exports = {
    SHEETS,
    SHEET_CONFIG,
    isConfigured,
    isLocalMode,
    resolveTabName,
    getRows,
    getHeaders,
    appendRow,
    updateRow,
    findAndUpdateRow,
    findRows,
    deleteRow,
    verifyConnection
};
