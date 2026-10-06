'use strict';
// =============================================================================
// Meta Conversions API (CAPI) Client — Server-side Purchase Event Tracking
// =============================================================================
// Sends server-side events to Meta Graph API for deduplication with Browser Pixel.
// Meta Pixel ID: process.env.META_PIXEL_ID || '1617383883230571'
// Meta Access Token: process.env.META_ACCESS_TOKEN (server-side only)
// =============================================================================

const crypto = require('crypto');
const https = require('https');

const GRAPH_API_VERSION = 'v19.0';
const DEFAULT_PIXEL_ID  = '2340414976777036';

/**
 * SHA-256 hash helper (hex output, trimmed, lowercase).
 */
function sha256(val) {
    if (!val) return null;
    const clean = String(val).trim().toLowerCase();
    if (!clean) return null;
    return crypto.createHash('sha256').update(clean).digest('hex');
}

/**
 * Normalize and hash Algerian phone number according to Meta guidelines.
 * Expected Meta format: Country code + Number without leading 0 or symbols (e.g. 213555123456).
 */
function hashPhone(phone) {
    if (!phone) return null;
    let digits = String(phone).replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 10) {
        digits = '213' + digits.substring(1);
    } else if (!digits.startsWith('213') && digits.length === 9) {
        digits = '213' + digits;
    }
    return sha256(digits);
}

/**
 * Extract first and last name from full name string and hash them.
 */
function hashNames(fullName) {
    if (!fullName) return { fn: null, ln: null };
    const parts = String(fullName).trim().split(/\s+/);
    const fn = parts[0] ? sha256(parts[0]) : null;
    const ln = parts.length > 1 ? sha256(parts.slice(1).join(' ')) : null;
    return { fn, ln };
}

/**
 * Send Purchase event to Meta Conversions API.
 *
 * @param {Object} params
 * @param {string} params.eventId         - Exact matching eventID (e.g. orderId)
 * @param {number} params.value           - Final total amount (e.g. 4950)
 * @param {string} [params.currency='DZD'] - Currency code
 * @param {string} [params.orderId]       - Order identifier
 * @param {string} [params.fullName]      - Customer full name
 * @param {string} [params.phone]         - Customer phone number
 * @param {string} [params.wilaya]        - Customer wilaya/state
 * @param {string} [params.commune]       - Customer commune/city
 * @param {string} [params.clientIp]      - Client IP address
 * @param {string} [params.userAgent]     - Client User Agent
 * @param {string} [params.eventSourceUrl]- Request origin / referrer URL
 * @param {string} [params.fbp]           - _fbp cookie value
 * @param {string} [params.fbc]           - _fbc cookie value
 * @param {number} [params.quantity=1]    - Quantity purchased
 * @param {string} [params.productName]   - Product name
 * @returns {Promise<{success: boolean, response?: any, skipped?: boolean, error?: string}>}
 */
async function sendMetaPurchaseEvent(params) {
    const pixelId     = params.pixelId || process.env.META_PIXEL_ID || DEFAULT_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN || '';

    if (!accessToken) {
        console.warn('[Meta CAPI] META_ACCESS_TOKEN is not configured in environment. Skipping server-side event dispatch.');
        return { success: false, skipped: true, reason: 'NO_ACCESS_TOKEN' };
    }

    if (!params.eventId) {
        console.warn('[Meta CAPI] Missing eventId for Purchase deduplication.');
        return { success: false, error: 'MISSING_EVENT_ID' };
    }

    const { fn, ln } = hashNames(params.fullName);
    const hashedPhone = hashPhone(params.phone);
    const hashedWilaya = params.wilaya ? sha256(params.wilaya) : null;
    const hashedCommune = params.commune ? sha256(params.commune) : null;

    const userData = {
        client_ip_address: params.clientIp || undefined,
        client_user_agent: params.userAgent || undefined,
        country:           [sha256('dz')]
    };

    if (hashedPhone) userData.ph = [hashedPhone];
    if (fn) userData.fn = [fn];
    if (ln) userData.ln = [ln];
    if (hashedWilaya) userData.st = [hashedWilaya];
    if (hashedCommune) userData.ct = [hashedCommune];
    if (params.fbp) userData.fbp = params.fbp;
    if (params.fbc) userData.fbc = params.fbc;

    const finalValue = typeof params.value === 'number' ? params.value : (parseFloat(params.value) || 0);
    const eventTime  = Math.floor(Date.now() / 1000);

    const eventPayload = {
        event_name:       'Purchase',
        event_time:       eventTime,
        event_id:         String(params.eventId),
        event_source_url: params.eventSourceUrl || 'https://orvastore.vercel.app',
        action_source:    'website',
        user_data:        userData,
        custom_data: {
            currency:     params.currency || 'DZD',
            value:        finalValue,
            content_type: 'product',
            content_name: params.productName || 'Pack 1 Pro',
            num_items:    Number(params.quantity) || 1
        }
    };

    const requestBody = {
        data: [eventPayload]
    };

    const testEventCode = process.env.META_TEST_EVENT_CODE || 'TEST63244';
    if (testEventCode) {
        requestBody.test_event_code = testEventCode;
    }

    const payloadString = JSON.stringify(requestBody);

    return new Promise((resolve) => {
        const options = {
            hostname: 'graph.facebook.com',
            port: 443,
            path: `/${GRAPH_API_VERSION}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payloadString)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`[Meta CAPI] Purchase event sent successfully! (eventId: ${params.eventId}, events_received: ${parsed.events_received || 1})`);
                        resolve({ success: true, response: parsed });
                    } else {
                        console.warn(`[Meta CAPI] Facebook Graph API response error (${res.statusCode}):`, parsed.error ? parsed.error.message : data);
                        resolve({ success: false, error: parsed.error ? parsed.error.message : data });
                    }
                } catch (e) {
                    console.warn('[Meta CAPI] Error parsing response from Graph API:', data);
                    resolve({ success: false, error: 'JSON_PARSE_ERROR' });
                }
            });
        });

        req.on('error', (err) => {
            console.warn('[Meta CAPI] Network error sending event to Meta:', err.message);
            resolve({ success: false, error: err.message });
        });

        req.write(payloadString);
        req.end();
    });
}

module.exports = {
    sendMetaPurchaseEvent,
    sha256,
    hashPhone,
    hashNames
};
