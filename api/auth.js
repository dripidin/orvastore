'use strict';
// =============================================================================
// ORVA Store — Admin Authentication API Gateway (/api/auth)
// Validates credentials against Vercel Environment Variable: ADMIN_PASSWORD
// =============================================================================

module.exports = async (req, res) => {
    // Enable CORS for dashboard
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'METHOD_NOT_ALLOWED' });
    }

    try {
        const body = req.body || {};
        const inputPassword = (body.password || '').toString().trim();

        // 1. Read admin password from Vercel environment variables
        // Priority: ADMIN_PASSWORD -> ADMIN_API_TOKEN -> fallback 'orva2026'
        const expectedPassword = (process.env.ADMIN_PASSWORD || process.env.ADMIN_API_TOKEN || 'orva2026').toString().trim();

        if (!inputPassword) {
            return res.status(400).json({ success: false, error: 'MISSING_PASSWORD' });
        }

        // 2. Timing-safe comparison or strict check
        if (inputPassword === expectedPassword) {
            const adminToken = process.env.ADMIN_API_TOKEN || 'orva-admin-2026-secure';
            return res.status(200).json({
                success: true,
                message: 'AUTHENTICATED',
                token: adminToken
            });
        } else {
            return res.status(401).json({
                success: false,
                error: 'INVALID_PASSWORD'
            });
        }
    } catch (err) {
        console.error('[Auth API Error]:', err);
        return res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
};
