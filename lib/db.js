const fs = require('fs');
const path = require('path');
const { getSupabase } = require('./supabaseServer');

// Database Storage Abstraction Layer (Supabase PostgreSQL + Serverless /tmp Fallback)
const DB_FILE = path.join('/tmp', 'yamaha_db_orders.json');
const RATE_LIMIT_FILE = path.join('/tmp', 'yamaha_rate_limit.json');

function readLocalDb() {
    try {
        if (fs.existsSync(DB_FILE)) {
            return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        }
    } catch (e) { }
    return [];
}

function writeLocalDb(orders) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(orders, null, 2), 'utf8');
    } catch (e) { }
}

// Convert Supabase DB record to application order format
function mapFromDbRecord(row) {
    if (!row) return null;
    return {
        orderId: row.order_id || row.orderId,
        storeId: row.store_id || 'yamahasac',
        fullName: row.full_name || row.fullName,
        phone: row.phone,
        wilaya: row.wilaya,
        commune: row.commune || 'الجزائر',
        deliveryType: row.delivery_type || row.deliveryType || 'توصيل للمنزل',
        deliveryTime: row.delivery_time || '24 - 48 H',
        quantity: row.quantity || 1,
        productName: row.product_name || 'Sac Banane Moto Yamaha',
        productTotal: row.product_total || (row.price_num + ' د.ج'),
        shippingFee: row.shipping_fee || '500 د.ج',
        priceNum: parseInt(row.price_num || row.price) || 3900,
        grandTotal: row.grand_total || ((row.price_num || 3900) + ' د.ج'),
        status: row.status || 'pending',
        in_redex: !!row.in_redex,
        redex_tracking_code: row.redex_tracking_code || null,
        remarks: row.remarks || [],
        date: row.created_at ? row.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
        createdAt: row.created_at || new Date().toISOString()
    };
}

// Convert application order to Supabase DB record
function mapToDbRecord(order) {
    const numPrice = parseInt(order.priceNum || order.price || order.grandTotal) || 3900;
    return {
        order_id: order.orderId,
        store_id: order.storeId || 'yamahasac',
        full_name: order.fullName || order.name || '',
        phone: order.phone || '',
        wilaya: order.wilaya || '',
        commune: order.commune || 'الجزائر',
        delivery_type: order.deliveryType || 'توصيل للمنزل',
        delivery_time: order.deliveryTime || '24 - 48 H',
        quantity: parseInt(order.quantity) || 1,
        product_name: order.productName || 'Sac Banane Moto Yamaha',
        product_total: order.productTotal || (numPrice + ' د.ج'),
        shipping_fee: order.shippingFee || '500 د.ج',
        price_num: numPrice,
        grand_total: order.grandTotal || (numPrice + ' د.ج'),
        status: order.status || 'pending',
        in_redex: !!order.in_redex,
        redex_tracking_code: order.redex_tracking_code || null,
        remarks: order.remarks || [],
        client_ip: order.clientIp || null,
        device_id: order.deviceId || null
    };
}

// ─── 1. Save Order to Database (Supabase + Local Fallback) ───────────────────
async function saveOrderToDb(order) {
    const dbRecord = mapToDbRecord(order);
    const standardized = mapFromDbRecord(dbRecord);
    const supabase = getSupabase();

    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('orders')
                .upsert(dbRecord, { onConflict: 'order_id' })
                .select()
                .single();

            if (error) {
                console.warn('Supabase saveOrder error, falling back to local storage:', error.message);
            } else if (data) {
                console.log('Successfully saved order to Supabase PostgreSQL:', data.order_id);
            }
        } catch (err) {
            console.warn('Supabase saveOrder exception:', err.message);
        }
    }

    // Always keep local storage updated as redundancy cache
    const orders = readLocalDb();
    const existingIndex = orders.findIndex(o => o.orderId === standardized.orderId);
    if (existingIndex >= 0) {
        orders[existingIndex] = { ...orders[existingIndex], ...standardized };
    } else {
        orders.unshift(standardized);
    }
    writeLocalDb(orders);

    return standardized;
}

// ─── 2. Get All Orders from Database (Supabase + Local Cache) ────────────────
async function getAllOrdersFromDb() {
    const supabase = getSupabase();

    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && Array.isArray(data) && data.length > 0) {
                const mapped = data.map(mapFromDbRecord);
                // Refresh local cache with latest Supabase records
                writeLocalDb(mapped);
                return mapped;
            }
        } catch (err) {
            console.warn('Supabase getAllOrders error, reading local cache:', err.message);
        }
    }

    return readLocalDb();
}

// ─── 3. Update Order in Database ────────────────────────────────────────────
async function updateOrderInDb(orderId, updateFields) {
    const supabase = getSupabase();

    if (supabase) {
        try {
            const dbUpdates = {};
            if (updateFields.status !== undefined) dbUpdates.status = updateFields.status;
            if (updateFields.in_redex !== undefined) dbUpdates.in_redex = updateFields.in_redex;
            if (updateFields.redex_tracking_code !== undefined) dbUpdates.redex_tracking_code = updateFields.redex_tracking_code;
            if (updateFields.remarks !== undefined) dbUpdates.remarks = updateFields.remarks;
            if (updateFields.fullName !== undefined) dbUpdates.full_name = updateFields.fullName;
            if (updateFields.phone !== undefined) dbUpdates.phone = updateFields.phone;
            if (updateFields.wilaya !== undefined) dbUpdates.wilaya = updateFields.wilaya;

            await supabase
                .from('orders')
                .update(dbUpdates)
                .or(`order_id.eq.${orderId},redex_tracking_code.eq.${orderId}`);
        } catch (err) {
            console.warn('Supabase updateOrder error:', err.message);
        }
    }

    const orders = readLocalDb();
    const order = orders.find(o => o.orderId === orderId || o.redex_tracking_code === orderId);
    if (order) {
        Object.assign(order, updateFields);
        writeLocalDb(orders);
        return order;
    }
    return null;
}

// ─── 4. Delete Order from Database ──────────────────────────────────────────
async function deleteOrderFromDb(orderId) {
    const supabase = getSupabase();

    if (supabase) {
        try {
            await supabase
                .from('orders')
                .delete()
                .or(`order_id.eq.${orderId},redex_tracking_code.eq.${orderId}`);
        } catch (err) {
            console.warn('Supabase deleteOrder error:', err.message);
        }
    }

    let orders = readLocalDb();
    orders = orders.filter(o => o.orderId !== orderId && o.redex_tracking_code !== orderId);
    writeLocalDb(orders);
    return true;
}

// ─── 5. Rate Limit Checker (IP + Device ID with Supabase & Local Cache) ─────
async function checkAndRecordRateLimit(ip, deviceId) {
    const now = Date.now();
    const WINDOW_MS = 6 * 60 * 60 * 1000; // 6 Hours
    const WINDOW_ISO = new Date(now - WINDOW_MS).toISOString();
    const supabase = getSupabase();

    if (supabase) {
        try {
            // Check past 6 hours attempts in Supabase
            let query = supabase
                .from('rate_limits')
                .select('id, ip, device_id, created_at')
                .gte('created_at', WINDOW_ISO);

            if (ip && deviceId) {
                query = query.or(`ip.eq.${ip},device_id.eq.${deviceId}`);
            } else if (ip) {
                query = query.eq('ip', ip);
            } else if (deviceId) {
                query = query.eq('device_id', deviceId);
            }

            const { data, error } = await query;

            if (!error && Array.isArray(data)) {
                if (data.length >= 2) {
                    return { allowed: false, count: data.length };
                }

                // Insert new attempt
                await supabase.from('rate_limits').insert({
                    ip: ip || '',
                    device_id: deviceId || ''
                });

                return { allowed: true, count: data.length + 1 };
            }
        } catch (err) {
            console.warn('Supabase rate limit check warning:', err.message);
        }
    }

    // Fallback to local /tmp rate limit file
    try {
        let records = [];
        if (fs.existsSync(RATE_LIMIT_FILE)) {
            records = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf8'));
        }
        records = records.filter(r => (now - r.timestamp) < WINDOW_MS);

        const attempts = records.filter(r =>
            (ip && r.ip === ip) || (deviceId && r.deviceId === deviceId)
        );

        if (attempts.length >= 2) {
            return { allowed: false, count: attempts.length };
        }

        records.push({ ip: ip || '', deviceId: deviceId || '', timestamp: now });
        fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(records), 'utf8');

        return { allowed: true, count: attempts.length + 1 };
    } catch (e) {
        return { allowed: true, count: 1 };
    }
}

module.exports = {
    saveOrderToDb,
    getAllOrdersFromDb,
    updateOrderInDb,
    deleteOrderFromDb,
    checkAndRecordRateLimit,
    mapFromDbRecord,
    mapToDbRecord
};
