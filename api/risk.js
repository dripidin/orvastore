'use strict';
// =============================================================================
// Admin Risk Override API — /api/risk
// =============================================================================
// GET  /api/risk?orderId=XYZ          → return risk evaluation for order
// GET  /api/risk?action=health        → Google Sheets connection status
// POST /api/risk { orderId, action }  → override risk decision
// Protected by ADMIN_API_TOKEN in Authorization header.
// =============================================================================

const { getRiskEvaluationByOrderId, updateRiskOverride, addToWatchlist } = require('../lib/db');
const { verifyConnection } = require('../lib/googleSheets');

const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || '';

function isAuthorized(req) {
    const auth = (req.headers['authorization'] || req.headers['token'] || req.headers['api-token'] || '');
    const token = auth.replace(/^bearer\s+/i, '').trim();
    return ADMIN_TOKEN && token === ADMIN_TOKEN;
}

async function handleGet(req, res) {
    const { orderId, action } = req.query || {};

    // Public health endpoint (no auth required)
    if (action === 'health') {
        const conn = await verifyConnection();
        return res.status(200).json({
            ok:     conn.ok,
            sheets: conn.sheetNames || [],
            title:  conn.spreadsheetTitle || '',
            error:  conn.error || null
        });
    }

    if (!isAuthorized(req)) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (!orderId)            return res.status(400).json({ error: 'MISSING_ORDER_ID' });

    const evalData = await getRiskEvaluationByOrderId(orderId);
    if (!evalData) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json(evalData);
}

async function handlePost(req, res) {
    if (!isAuthorized(req)) return res.status(401).json({ error: 'UNAUTHORIZED' });

    const { orderId, action, identifier, identifierType, reason, expiresAt } = req.body || {};
    if (!action) return res.status(400).json({ error: 'MISSING_ACTION' });

    const VALID_ACTIONS = ['trust', 'block', 'reject', 'confirm', 'unblock', 'watchlist'];
    if (!VALID_ACTIONS.includes(action)) {
        return res.status(400).json({ error: `INVALID_ACTION. Must be one of: ${VALID_ACTIONS.join(', ')}` });
    }

    // Watchlist: add arbitrary identifier
    if (action === 'watchlist') {
        if (!identifier) return res.status(400).json({ error: 'MISSING_IDENTIFIER' });
        const entry = await addToWatchlist(identifier, identifierType || 'PHONE', reason || 'Manual watchlist', 'watchlist', expiresAt || '');
        return res.json({ success: true, action, entry });
    }

    if (!orderId) return res.status(400).json({ error: 'MISSING_ORDER_ID' });
    const result = await updateRiskOverride(orderId, action);
    return res.json({ success: true, updated: result });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, token, api-token');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method === 'GET')     return handleGet(req, res);
    if (req.method === 'POST')    return handlePost(req, res);
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
};
