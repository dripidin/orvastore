'use strict';
// =============================================================================
// Database Abstraction Layer — Supabase & Google Sheets (ORVA Store)
// =============================================================================

const crypto = require('crypto');
const { getSupabase } = require('./supabaseServer');
const gs = require('./googleSheets');

function hashValue(value) {
    if (!value) return null;
    return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}
function nowISO() { return new Date().toISOString(); }
function parseIntSafe(val, def) { const n = parseInt(val, 10); return isNaN(n) ? def : n; }
function parseBool(val) { if (typeof val === 'boolean') return val; return val === 'true' || val === '1' || val === true; }

// ── Store defaults ────────────────────────────────────────────────────────────
const STORE_ID       = 'orvastore';
const DEFAULT_PRODUCT = 'Pack 1 Pro';
const DEFAULT_PRICE   = 4950;

function mapOrderFromRow(row) {
    if (!row) return null;
    let remarks = [];
    if (typeof row.remarks === 'string') {
        try { remarks = JSON.parse(row.remarks); } catch (e) { remarks = []; }
    } else if (Array.isArray(row.remarks)) {
        remarks = row.remarks;
    }

    const created = row.created_at || nowISO();
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
        riskReasons:        row.risk_reasons ? (Array.isArray(row.risk_reasons) ? row.risk_reasons : String(row.risk_reasons).split('|')) : [],
        date:               created.split('T')[0],
        createdAt:          created
    };
}

function mapOrderToDb(order, extra) {
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
        quantity:            parseIntSafe(order.quantity, 1),
        product_name:        order.productName || DEFAULT_PRODUCT,
        product_total:       order.productTotal || (numPrice + ' د.ج'),
        shipping_fee:        order.shippingFee || '500 د.ج',
        price_num:           numPrice,
        grand_total:         order.grandTotal || (numPrice + ' د.ج'),
        status:              order.status || 'pending',
        in_redex:            parseBool(order.in_redex),
        redex_tracking_code: order.redex_tracking_code || null,
        remarks:             order.remarks || [],
        client_ip:           order.clientIp || null,
        client_ip_hash:      order.clientIpHash || (order.clientIp ? hashValue(order.clientIp) : null),
        device_id:           order.deviceId || null,
        risk_score:          parseIntSafe(extra && extra.riskScore !== undefined ? extra.riskScore : 0, 0),
        risk_level:          (extra && extra.riskLevel) || 'LOW',
        risk_decision:       (extra && extra.riskDecision) || 'ALLOW',
        risk_reasons:        (extra && extra.riskReasons) ? (Array.isArray(extra.riskReasons) ? extra.riskReasons.join('|') : String(extra.riskReasons)) : '',
        created_at:          order.createdAt || nowISO()
    };
}

// ── Orders CRUD ───────────────────────────────────────────────────────────────

async function saveOrderToDb(order, riskResult) {
    const supabase = getSupabase();
    const existing = await findOrderById(order.orderId);
    if (existing) {
        console.log('[DB] Order already exists:', order.orderId);
        return existing;
    }

    const row = mapOrderToDb(order, riskResult);

    if (supabase) {
        try {
            const { error } = await supabase.from('orders').insert([row]);
            if (error) {
                console.error('[DB-Supabase] Insert error:', error.message);
                throw error;
            }
            console.log('[DB] Order saved to Supabase:', order.orderId);
        } catch (sbErr) {
            console.warn('[DB] Supabase save error, attempting Google Sheets fallback:', sbErr.message);
            // Fallback to Google Sheets if Supabase throws
            try {
                const sheetRow = { ...row, quantity: String(row.quantity), price_num: String(row.price_num), in_redex: String(row.in_redex), remarks: JSON.stringify(row.remarks) };
                await gs.appendRow(gs.SHEETS.ORDERS, sheetRow);
            } catch (gsErr) {
                console.error('[DB] Google Sheets fallback error:', gsErr.message);
            }
            return mapOrderFromRow(row);
        }
    } else {
        // Fallback if Supabase not configured
        const sheetRow = { ...row, quantity: String(row.quantity), price_num: String(row.price_num), in_redex: String(row.in_redex), remarks: JSON.stringify(row.remarks) };
        await gs.appendRow(gs.SHEETS.ORDERS, sheetRow);
    }

    // Background optional sync to Google Sheets if configured
    if (process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SHEET_ID !== 'PASTE_YOUR_SPREADSHEET_ID_HERE') {
        const sheetRow = { ...row, quantity: String(row.quantity), price_num: String(row.price_num), in_redex: String(row.in_redex), remarks: JSON.stringify(row.remarks) };
        gs.appendRow(gs.SHEETS.ORDERS, sheetRow).catch(err => console.warn('[DB] GS background sync warning:', err.message));
    }

    return mapOrderFromRow(row);
}

async function getAllOrdersFromDb() {
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .neq('status', 'deleted')
                .order('created_at', { ascending: false });

            if (!error && Array.isArray(data)) {
                return data.map(mapOrderFromRow).filter(Boolean);
            }
            console.warn('[DB-Supabase] getAllOrdersFromDb error, falling back:', error ? error.message : 'Unknown');
        } catch (e) {
            console.warn('[DB] getAllOrdersFromDb Supabase exception, trying Google Sheets:', e.message);
        }
    }

    // Google Sheets Fallback
    try {
        const rows = await gs.getRows(gs.SHEETS.ORDERS);
        return rows.map(mapOrderFromRow).filter(Boolean).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (e) {
        console.warn('[DB] getAllOrdersFromDb GS fallback failed:', e.message);
        return [];
    }
}

async function findOrderById(orderId) {
    if (!orderId) return null;
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .or(`order_id.eq.${orderId},redex_tracking_code.eq.${orderId}`)
                .limit(1);

            if (!error && data && data.length > 0) {
                return mapOrderFromRow(data[0]);
            }
        } catch (e) {
            console.warn('[DB] findOrderById Supabase exception:', e.message);
        }
    }

    try {
        const rows = await gs.findRows(gs.SHEETS.ORDERS, r => r.order_id === orderId || r.redex_tracking_code === orderId);
        return rows[0] ? mapOrderFromRow(rows[0]) : null;
    } catch (e) {
        return null;
    }
}

async function updateOrderInDb(orderId, updateFields) {
    const supabase = getSupabase();
    const dbUpdate = {};
    if (updateFields.status !== undefined)              dbUpdate.status = updateFields.status;
    if (updateFields.in_redex !== undefined)            dbUpdate.in_redex = parseBool(updateFields.in_redex);
    if (updateFields.redex_tracking_code !== undefined) dbUpdate.redex_tracking_code = updateFields.redex_tracking_code || null;
    if (updateFields.remarks !== undefined)             dbUpdate.remarks = updateFields.remarks;
    if (updateFields.fullName !== undefined)            dbUpdate.full_name = updateFields.fullName;
    if (updateFields.phone !== undefined)               dbUpdate.phone = updateFields.phone;
    if (updateFields.wilaya !== undefined)              dbUpdate.wilaya = updateFields.wilaya;
    if (updateFields.riskScore !== undefined)           dbUpdate.risk_score = parseIntSafe(updateFields.riskScore, 0);
    if (updateFields.riskLevel !== undefined)           dbUpdate.risk_level = updateFields.riskLevel;
    if (updateFields.riskDecision !== undefined)        dbUpdate.risk_decision = updateFields.riskDecision;
    if (updateFields.riskReasons !== undefined)         dbUpdate.risk_reasons = Array.isArray(updateFields.riskReasons) ? updateFields.riskReasons.join('|') : String(updateFields.riskReasons);

    dbUpdate.updated_at = nowISO();

    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('orders')
                .update(dbUpdate)
                .eq('order_id', orderId)
                .select();

            if (!error && data && data.length > 0) {
                return mapOrderFromRow(data[0]);
            }
        } catch (e) {
            console.warn('[DB] updateOrderInDb Supabase exception:', e.message);
        }
    }

    // Google Sheets Fallback sync
    try {
        const sheetUpdate = { ...dbUpdate };
        if (sheetUpdate.in_redex !== undefined) sheetUpdate.in_redex = String(sheetUpdate.in_redex);
        if (sheetUpdate.remarks !== undefined) sheetUpdate.remarks = JSON.stringify(sheetUpdate.remarks);
        await gs.findAndUpdateRow(gs.SHEETS.ORDERS, r => r.order_id === orderId || r.redex_tracking_code === orderId, sheetUpdate);
    } catch (e) {}

    return findOrderById(orderId);
}

async function deleteOrderFromDb(orderId) {
    const supabase = getSupabase();
    if (supabase) {
        try {
            await supabase.from('orders').update({ status: 'deleted', updated_at: nowISO() }).eq('order_id', orderId);
        } catch (e) {
            console.warn('[DB] deleteOrderFromDb Supabase exception:', e.message);
        }
    }
    try {
        await gs.findAndUpdateRow(gs.SHEETS.ORDERS, r => r.order_id === orderId || r.redex_tracking_code === orderId, { status: 'deleted' });
    } catch (e) {}
    return true;
}

// ── Rate Limiting & Fraud Tracking ───────────────────────────────────────────

async function checkAndRecordRateLimit(ip, deviceId, phone) {
    const ipHash = hashValue(ip);
    const cleanPhone = phone ? String(phone).replace(/\D/g, '') : null;
    const WINDOW_MS = 24 * 60 * 60 * 1000;
    const since = new Date(Date.now() - WINDOW_MS).toISOString();

    try {
        const orders = await getAllOrdersFromDb();
        const matching = orders.filter(o => {
            if (o.status === 'deleted') return false;
            const createdAt = o.createdAt || o.date || '';
            if (createdAt && createdAt < since) return false;

            const oPhone = String(o.phone || '').replace(/\D/g, '');
            const phoneMatch = cleanPhone && (oPhone === cleanPhone || (cleanPhone.length >= 8 && oPhone.endsWith(cleanPhone.slice(-8))));
            const deviceMatch = deviceId && o.deviceId && o.deviceId === deviceId;
            const ipMatch = ipHash && o.clientIpHash && o.clientIpHash === ipHash;

            return phoneMatch || deviceMatch || ipMatch;
        });

        if (matching.length >= 2) {
            return { 
                allowed: false, 
                count: matching.length,
                message: 'عذراً، لقد تم تسجيل طلبك مسبقاً (الحد الأقصى محاولتين). سيتصل بك فريقنا لتأكيد طلبك.'
            };
        }
        return { allowed: true, count: matching.length + 1 };
    } catch (e) {
        console.warn('[DB] checkAndRecordRateLimit error:', e.message);
        return { allowed: true, count: 1 };
    }
}

async function saveRiskEvaluation({ orderId, score, level, decision, reasons }) {
    return updateOrderInDb(orderId, { riskScore: score, riskLevel: level, riskDecision: decision, riskReasons: reasons || [] });
}

async function getRiskEvaluationByOrderId(orderId) {
    const row = await findOrderById(orderId);
    if (!row) return null;
    return {
        orderId: row.orderId,
        score: parseIntSafe(row.riskScore, 0),
        level: row.riskLevel || 'LOW',
        decision: row.riskDecision || 'ALLOW',
        reasons: row.riskReasons || []
    };
}

async function updateRiskOverride(orderId, overrideAction) {
    const decisionMap = { trust: 'ALLOW', confirm: 'ALLOW', reject: 'BLOCK', block: 'BLOCK', unblock: 'ALLOW' };
    const newDecision = decisionMap[overrideAction] || 'ALLOW';
    const newStatus   = overrideAction === 'reject' ? 'rejected' : overrideAction === 'confirm' ? 'confirmed' : undefined;
    const updateData  = { riskDecision: newDecision };
    if (newStatus) updateData.status = newStatus;
    const updated = await updateOrderInDb(orderId, updateData);
    
    const eventType = overrideAction === 'block' ? 'ACTOR_BLOCKED' : overrideAction === 'reject' ? 'REQUEST_REJECTED' : overrideAction === 'trust' ? 'ACTOR_TRUSTED' : 'ADMIN_OVERRIDE';
    
    const supabase = getSupabase();
    if (supabase) {
        supabase.from('risk_events').insert([{
            event_id: 'ADM-' + Date.now(),
            event_type: eventType,
            store_id: STORE_ID,
            order_id: orderId,
            actor_phone: updated ? updated.phone || '' : '',
            metadata: { action: overrideAction, by: 'admin' },
            created_at: nowISO()
        }]).then(() => {}).catch(err => console.warn('[DB] Risk event insert warning:', err.message));
    }

    if (overrideAction === 'block' && updated && updated.phone) {
        await addToWatchlist(updated.phone, 'PHONE', 'Admin block', 'blocked');
    }
    return updated;
}

// ── Customer Trust & Watchlist ───────────────────────────────────────────────

async function findOrCreateCustomer(phone, name) {
    if (!phone) return null;
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data } = await supabase.from('customers').select('*').eq('phone', phone).limit(1);
            if (data && data.length > 0) return data[0];

            const newCust = {
                customer_id: 'CUST-' + hashValue(phone).slice(0, 12),
                phone,
                name: name || '',
                total_orders: 0,
                completed: 0,
                cancelled: 0,
                rejected: 0,
                no_response: 0,
                trust_score: 50,
                risk_level: 'LOW',
                created_at: nowISO(),
                updated_at: nowISO()
            };
            const { data: inserted } = await supabase.from('customers').insert([newCust]).select();
            if (inserted && inserted.length > 0) return inserted[0];
            return newCust;
        } catch (e) {
            console.warn('[DB] findOrCreateCustomer Supabase exception:', e.message);
        }
    }
    return { phone, name: name || '', trust_score: 50, risk_level: 'LOW' };
}

async function updateCustomerStats(phone, outcome) {
    if (!phone) return null;
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data } = await supabase.from('customers').select('*').eq('phone', phone).limit(1);
            if (data && data.length > 0) {
                const c = data[0];
                const update = { updated_at: nowISO() };
                if (outcome === 'ordered')    update.total_orders = (c.total_orders || 0) + 1;
                if (outcome === 'completed') { update.completed = (c.completed || 0) + 1; update.trust_score = Math.min(100, (c.trust_score || 50) + 5); }
                if (outcome === 'cancelled') { update.cancelled = (c.cancelled || 0) + 1; update.trust_score = Math.max(0, (c.trust_score || 50) - 5); }
                if (outcome === 'rejected')  { update.rejected = (c.rejected || 0) + 1; update.trust_score = Math.max(0, (c.trust_score || 50) - 15); update.risk_level = 'HIGH'; }
                const { data: res } = await supabase.from('customers').update(update).eq('phone', phone).select();
                return res ? res[0] : null;
            }
        } catch (e) {
            console.warn('[DB] updateCustomerStats exception:', e.message);
        }
    }
    return null;
}

async function getWatchlistEntry(identifier) {
    if (!identifier) return null;
    const supabase = getSupabase();
    if (supabase) {
        try {
            const { data } = await supabase.from('watchlist').select('*').eq('identifier', identifier).limit(1);
            if (data && data.length > 0) {
                const entry = data[0];
                if (entry.expires_at && new Date(entry.expires_at) < new Date()) return null;
                return entry;
            }
        } catch (e) {
            console.warn('[DB] getWatchlistEntry exception:', e.message);
        }
    }
    return null;
}

async function addToWatchlist(identifier, identifierType, reason, status, expiresAt) {
    const supabase = getSupabase();
    const entry = {
        identifier,
        identifier_type: identifierType || 'PHONE',
        reason: reason || '',
        status: status || 'watchlist',
        created_at: nowISO(),
        expires_at: expiresAt || null
    };

    if (supabase) {
        try {
            await supabase.from('watchlist').insert([entry]);
            return entry;
        } catch (e) {
            console.warn('[DB] addToWatchlist exception:', e.message);
        }
    }
    return entry;
}

function mapFromDbRecord(row) { return mapOrderFromRow(row); }
function mapToDbRecord(order) { return mapOrderToDb(order); }

module.exports = {
    saveOrderToDb,
    getAllOrdersFromDb,
    findOrderById,
    updateOrderInDb,
    deleteOrderFromDb,
    checkAndRecordRateLimit,
    saveRiskEvaluation,
    getRiskEvaluationByOrderId,
    updateRiskOverride,
    findOrCreateCustomer,
    updateCustomerStats,
    getWatchlistEntry,
    addToWatchlist,
    mapFromDbRecord,
    mapToDbRecord,
    hashValue,
    STORE_ID
};
