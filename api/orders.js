const {
    saveOrderToDb,
    getAllOrdersFromDb,
    updateOrderInDb,
    deleteOrderFromDb
} = require('../lib/db');

module.exports = async (req, res) => {
    // Enable CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, token, api-token'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { method } = req;
    const { id, orderId, search, status, limit } = req.query || {};

    try {
        // ─── 1. GET Orders (List & Filter) ──────────────────────────────────
        if (method === 'GET') {
            let orders = await getAllOrdersFromDb();

            // Filter by search (orderId, phone, fullName)
            if (search) {
                const s = search.toLowerCase().trim();
                orders = orders.filter(o =>
                    (o.orderId && o.orderId.toLowerCase().includes(s)) ||
                    (o.phone && o.phone.includes(s)) ||
                    (o.fullName && o.fullName.toLowerCase().includes(s)) ||
                    (o.redex_tracking_code && o.redex_tracking_code.toLowerCase().includes(s))
                );
            }

            // Filter by status
            if (status && status !== 'all') {
                orders = orders.filter(o => o.status === status);
            }

            if (limit) {
                orders = orders.slice(0, parseInt(limit));
            }

            return res.status(200).json({
                success: true,
                count: orders.length,
                data: orders
            });
        }

        // ─── 2. POST (Create / Upsert Order) ────────────────────────────────
        if (method === 'POST') {
            const body = req.body || {};
            if (!body.fullName || !body.phone || !body.wilaya) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required order fields (fullName, phone, wilaya)'
                });
            }

            const cleanOrderId = body.orderId || ('ORVA-' + Math.floor(10000 + Math.random() * 90000));
            const saved = await saveOrderToDb({
                ...body,
                storeId: 'orvastore',
                orderId: cleanOrderId
            });

            return res.status(201).json({
                success: true,
                message: 'Order persisted successfully in Supabase PostgreSQL',
                data: saved
            });
        }

        // ─── 3. PUT / PATCH (Update Order) ──────────────────────────────────
        if (method === 'PUT' || method === 'PATCH') {
            const body = req.body || {};
            const targetId = id || orderId || body.orderId || body.id;

            if (!targetId) {
                return res.status(400).json({ success: false, error: 'Missing orderId to update' });
            }

            const updated = await updateOrderInDb(targetId, body);
            return res.status(200).json({
                success: true,
                message: 'Order updated successfully in Supabase',
                data: updated
            });
        }

        // ─── 4. DELETE (Remove Order) ───────────────────────────────────────
        if (method === 'DELETE') {
            const targetId = id || orderId || (req.body && (req.body.orderId || req.body.id));

            if (!targetId) {
                return res.status(400).json({ success: false, error: 'Missing orderId to delete' });
            }

            await deleteOrderFromDb(targetId);
            return res.status(200).json({
                success: true,
                message: `Order ${targetId} deleted successfully from Supabase and cache.`
            });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (err) {
        console.error('API /api/orders error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
};
