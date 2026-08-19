// =============================================================================
// Risk Admin API – serverless endpoint
// =============================================================================
// GET /api/risk?orderId=XYZ   → return risk evaluation (score, level, decision, reasons)
// POST /api/risk/override     → admin can set override: trust|block|reject
// Protected by ADMIN_API_TOKEN header.
// =============================================================================

const { getSupabase } = require('../lib/supabaseServer');
const { getRiskEvaluationByOrderId, updateRiskOverride } = require('../lib/db');

function isAuthorized(req) {
    const token = req.headers['authorization']?.replace('Bearer ', '').trim();
    return token && token === process.env.ADMIN_API_TOKEN;
}

async function handleGet(req, res) {
    if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    const orderId = req.query.orderId;
    if (!orderId) {
        return res.status(400).json({ error: 'MISSING_ORDER_ID' });
    }
    const evalData = await getRiskEvaluationByOrderId(orderId);
    if (!evalData) {
        return res.status(404).json({ error: 'NOT_FOUND' });
    }
    res.json(evalData);
}

async function handlePost(req, res) {
    if (!isAuthorized(req)) {
        return res.status(401).json({ error: 'UNAUTHORIZED' });
    }
    const { orderId, action } = req.body;
    if (!orderId || !action) {
        return res.status(400).json({ error: 'MISSING_PARAMS' });
    }
    const allowed = ['trust', 'block', 'reject'];
    if (!allowed.includes(action)) {
        return res.status(400).json({ error: 'INVALID_ACTION' });
    }
    const result = await updateRiskOverride(orderId, action);
    res.json({ success: true, updated: result });
}

module.exports = async (req, res) => {
    if (req.method === 'GET') {
        await handleGet(req, res);
    } else if (req.method === 'POST') {
        await handlePost(req, res);
    } else {
        res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
};
