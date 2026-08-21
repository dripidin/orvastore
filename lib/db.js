'use strict';
// =============================================================================
// Database Abstraction Layer — Google Sheets Backend (yamahasac / ORVA Store)
// =============================================================================

const crypto = require('crypto');
const gs = require('./googleSheets');

function hashValue(value) {
    if (!value) return null;
    return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}
function nowISO() { return new Date().toISOString(); }
function parseIntSafe(val, def) { const n = parseInt(val); return isNaN(n) ? def : n; }
function parseBool(val) { if (typeof val === 'boolean') return val; return val === 'true' || val === '1' || val === true; }

// ── Store defaults ────────────────────────────────────────────────────────────
const STORE_ID       = 'yamahasac';
const DEFAULT_PRODUCT = 'Sac Banane Moto Yamaha (كرطابل يماها)';
const DEFAULT_PRICE   = 3900;

function mapOrderFromSheet(row) {
    if (!row) return null;
    let remarks = [];
    try { remarks = row.remarks ? JSON.parse(row.remarks) : []; } catch (e) { remarks = []; }
    return {
        orderId:            row.order_id || '',
        storeId:            row.store_id || STORE_ID,
        fullName:           row.full_name || '',
        phone:              row.phone || '',
        wilaya:             row.wilaya || '',
        commune:            row.commune || 'الجزائر',
        deliveryType:       row.delivery_type || 'توصيل للمنزل',
        deliveryTime:       row.delivery_time || '24 - 48 H',
        quantity:           parseIntSafe(row.quantity, 1),
        productName:        row.product_name || DEFAULT_PRODUCT,
        productTotal:       row.product_total || '',
        shippingFee:        row.shipping_fee || '500 د.ج',
        priceNum:           parseIntSafe(row.price_num, DEFAULT_PRICE),
        grandTotal:         row.grand_total || '',
        status:             row.status || 'pending',
        in_redex:           parseBool(row.in_redex),
        redex_tracking_code: row.redex_tracking_code || null,
        remarks:            remarks,
        riskScore:          parseIntSafe(row.risk_score, 0),
        riskLevel:          row.risk_level || 'LOW',
        riskDecision:       row.risk_decision || 'ALLOW',
        riskReasons:        row.risk_reasons ? row.risk_reasons.split('|') : [],
        date:               row.created_at ? row.created_at.split('T')[0] : nowISO().split('T')[0],
        createdAt:          row.created_at || nowISO()
    };
}

function mapOrderToSheet(order, extra) {
    const numPrice = parseIntSafe(order.priceNum || order.price || order.grandTotal, DEFAULT_PRICE);
    return {
        order_id:            order.orderId || '',
        store_id:            order.storeId || STORE_ID,
        full_name:           order.fullName || order.name || '',
        phone:               order.phone || '',
        wilaya:              order.wilaya || '',
        commune:             order.commune || 'الجزائر',
        delivery_type:       order.deliveryType || 'توصيل للمنزل',
        delivery_time:       order.deliveryTime || '24 - 48 H',
        quantity:            String(parseIntSafe(order.quantity, 1)),
        product_name:        order.productName || DEFAULT_PRODUCT,
        product_total:       order.productTotal || (numPrice + ' د.ج'),
        shipping_fee:        order.shippingFee || '500 د.ج',
        price_num:           String(numPrice),
        grand_total:         order.grandTotal || (numPrice + ' د.ج'),
        status:              order.status || 'pending',
        in_redex:            String(!!order.in_redex),
        redex_tracking_code: order.redex_tracking_code || '',
        remarks:             JSON.stringify(order.remarks || []),
        client_ip_hash:      order.clientIpHash || (order.clientIp ? hashValue(order.clientIp) : ''),
        device_id:           order.deviceId || '',
        risk_score:          String(extra && extra.riskScore !== undefined ? extra.riskScore : 0),
        risk_level:          (extra && extra.riskLevel) || 'LOW',
        risk_decision:       (extra && extra.riskDecision) || 'ALLOW',
        risk_reasons:        (extra && extra.riskReasons) ? extra.riskReasons.join('|') : '',
        created_at:          order.createdAt || nowISO()
    };
}

async function saveOrderToDb(order, riskResult) {
    const existing = await findOrderById(order.orderId);
    if (existing) { console.log('[DB] Order already exists:', order.orderId); return mapOrderFromSheet(existing); }
    const row = mapOrderToSheet(order, riskResult);
    const ok = await gs.appendRow(gs.SHEETS.ORDERS, row);
    if (!ok) throw new Error('Failed to save order to Google Sheets');
    console.log('[DB] Order saved:', order.orderId);
    return mapOrderFromSheet(row);
}

async function getAllOrdersFromDb() {
    const rows = await gs.getRows(gs.SHEETS.ORDERS);
    return rows.map(mapOrderFromSheet).filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function findOrderById(orderId) {
    if (!orderId) return null;
    const rows = await gs.findRows(gs.SHEETS.ORDERS, r => r.order_id === orderId || r.redex_tracking_code === orderId);
    return rows[0] || null;
}

async function updateOrderInDb(orderId, updateFields) {
    const sheetUpdate = {};
    if (updateFields.status !== undefined)              sheetUpdate.status = updateFields.status;
    if (updateFields.in_redex !== undefined)            sheetUpdate.in_redex = String(!!updateFields.in_redex);
    if (updateFields.redex_tracking_code !== undefined) sheetUpdate.redex_tracking_code = updateFields.redex_tracking_code || '';
    if (updateFields.remarks !== undefined)             sheetUpdate.remarks = JSON.stringify(updateFields.remarks || []);
    if (updateFields.fullName !== undefined)            sheetUpdate.full_name = updateFields.fullName;
    if (updateFields.phone !== undefined)               sheetUpdate.phone = updateFields.phone;
    if (updateFields.wilaya !== undefined)              sheetUpdate.wilaya = updateFields.wilaya;
    if (updateFields.riskScore !== undefined)           sheetUpdate.risk_score = String(updateFields.riskScore);
    if (updateFields.riskLevel !== undefined)           sheetUpdate.risk_level = updateFields.riskLevel;
    if (updateFields.riskDecision !== undefined)        sheetUpdate.risk_decision = updateFields.riskDecision;
    if (updateFields.riskReasons !== undefined)         sheetUpdate.risk_reasons = (updateFields.riskReasons || []).join('|');

    const updated = await gs.findAndUpdateRow(gs.SHEETS.ORDERS, r => r.order_id === orderId || r.redex_tracking_code === orderId, sheetUpdate);
    if (!updated) { console.warn('[DB] updateOrderInDb: not found:', orderId); return null; }
    return mapOrderFromSheet({ ...updated, ...sheetUpdate });
}

async function deleteOrderFromDb(orderId) {
    await gs.findAndUpdateRow(gs.SHEETS.ORDERS, r => r.order_id === orderId || r.redex_tracking_code === orderId, { status: 'deleted' });
    return true;
}

async function checkAndRecordRateLimit(ip, deviceId) {
    const ipHash = hashValue(ip);
    const WINDOW_MS = 6 * 60 * 60 * 1000;
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const rows = await gs.findRows(gs.SHEETS.RISK_EVENTS, r => {
        if (r.event_type !== 'REQUEST_CREATED') return false;
        if (r.created_at < since) return false;
        return (ipHash && r.ip_hash === ipHash) || (deviceId && r.device_id === deviceId);
    });
    if (rows.length >= 2) return { allowed: false, count: rows.length };
    await gs.appendRow(gs.SHEETS.RISK_EVENTS, {
        event_id: 'RL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        event_type: 'RATE_LIMIT_PROBE', store_id: STORE_ID, order_id: '', actor_phone: '',
        device_id: deviceId || '', ip_hash: ipHash || '',
        metadata: JSON.stringify({ reason: 'rate_limit_probe' }), created_at: nowISO()
    });
    return { allowed: true, count: rows.length + 1 };
}

async function saveRiskEvaluation({ orderId, score, level, decision, reasons }) {
    return updateOrderInDb(orderId, { riskScore: score, riskLevel: level, riskDecision: decision, riskReasons: reasons || [] });
}

async function getRiskEvaluationByOrderId(orderId) {
    const row = await findOrderById(orderId);
    if (!row) return null;
    return { orderId: row.order_id, score: parseIntSafe(row.risk_score, 0), level: row.risk_level || 'LOW', decision: row.risk_decision || 'ALLOW', reasons: row.risk_reasons ? row.risk_reasons.split('|').filter(Boolean) : [] };
}

async function updateRiskOverride(orderId, overrideAction) {
    const decisionMap = { trust: 'ALLOW', confirm: 'ALLOW', reject: 'BLOCK', block: 'BLOCK', unblock: 'ALLOW' };
    const newDecision = decisionMap[overrideAction] || 'ALLOW';
    const newStatus   = overrideAction === 'reject' ? 'rejected' : overrideAction === 'confirm' ? 'confirmed' : undefined;
    const updateData  = { riskDecision: newDecision };
    if (newStatus) updateData.status = newStatus;
    const updated = await updateOrderInDb(orderId, updateData);
    const eventType = overrideAction === 'block' ? 'ACTOR_BLOCKED' : overrideAction === 'reject' ? 'REQUEST_REJECTED' : overrideAction === 'trust' ? 'ACTOR_TRUSTED' : 'ADMIN_OVERRIDE';
    await gs.appendRow(gs.SHEETS.RISK_EVENTS, { event_id: 'ADM-' + Date.now(), event_type: eventType, store_id: STORE_ID, order_id: orderId, actor_phone: updated ? updated.phone || '' : '', device_id: '', ip_hash: '', metadata: JSON.stringify({ action: overrideAction, by: 'admin' }), created_at: nowISO() });
    if (overrideAction === 'block' && updated && updated.phone) await addToWatchlist(updated.phone, 'PHONE', 'Admin block', 'blocked');
    return updated;
}

async function findOrCreateCustomer(phone, name) {
    if (!phone) return null;
    const existing = await gs.findRows(gs.SHEETS.CUSTOMERS, r => r.phone === phone);
    if (existing.length > 0) return existing[0];
    const customer = { customer_id: 'CUST-' + hashValue(phone).slice(0, 12), phone, name: name || '', total_orders: '0', completed: '0', cancelled: '0', rejected: '0', no_response: '0', trust_score: '50', risk_level: 'LOW', created_at: nowISO(), updated_at: nowISO() };
    await gs.appendRow(gs.SHEETS.CUSTOMERS, customer);
    return customer;
}

async function updateCustomerStats(phone, outcome) {
    if (!phone) return null;
    const rows = await gs.findRows(gs.SHEETS.CUSTOMERS, r => r.phone === phone);
    if (rows.length === 0) return null;
    const c = rows[0];
    const update = { updated_at: nowISO() };
    if (outcome === 'ordered')    update.total_orders = String(parseIntSafe(c.total_orders, 0) + 1);
    if (outcome === 'completed') { update.completed = String(parseIntSafe(c.completed, 0) + 1); update.trust_score = String(Math.min(100, parseIntSafe(c.trust_score, 50) + 5)); }
    if (outcome === 'cancelled') { update.cancelled = String(parseIntSafe(c.cancelled, 0) + 1); update.trust_score = String(Math.max(0, parseIntSafe(c.trust_score, 50) - 5)); }
    if (outcome === 'rejected')  { update.rejected = String(parseIntSafe(c.rejected, 0) + 1); update.trust_score = String(Math.max(0, parseIntSafe(c.trust_score, 50) - 15)); update.risk_level = 'HIGH'; }
    return gs.findAndUpdateRow(gs.SHEETS.CUSTOMERS, r => r.phone === phone, update);
}

async function getWatchlistEntry(identifier) {
    if (!identifier) return null;
    const rows = await gs.findRows(gs.SHEETS.WATCHLIST, r => r.identifier === identifier);
    if (rows.length === 0) return null;
    const entry = rows[0];
    if (entry.expires_at && entry.expires_at < nowISO()) return null;
    return entry;
}

async function addToWatchlist(identifier, identifierType, reason, status, expiresAt) {
    const existing = await gs.findRows(gs.SHEETS.WATCHLIST, r => r.identifier === identifier);
    const entry = { identifier, identifier_type: identifierType || 'PHONE', reason: reason || '', status: status || 'watchlist', created_at: nowISO(), expires_at: expiresAt || '' };
    if (existing.length > 0) return gs.findAndUpdateRow(gs.SHEETS.WATCHLIST, r => r.identifier === identifier, entry);
    await gs.appendRow(gs.SHEETS.WATCHLIST, entry);
    return entry;
}

function mapFromDbRecord(row) { return mapOrderFromSheet(row); }
function mapToDbRecord(order) { return mapOrderToSheet(order); }

module.exports = { saveOrderToDb, getAllOrdersFromDb, findOrderById, updateOrderInDb, deleteOrderFromDb, checkAndRecordRateLimit, saveRiskEvaluation, getRiskEvaluationByOrderId, updateRiskOverride, findOrCreateCustomer, updateCustomerStats, getWatchlistEntry, addToWatchlist, mapFromDbRecord, mapToDbRecord, hashValue };
