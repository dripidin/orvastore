// =============================================================================
// Risk Engine - Core Evaluation Module (Google Sheets backend)
// =============================================================================
// Usage:
//   const { evaluateRequest, recordRiskEvent, hashIp } = require('./riskEngine');
//   const result = await evaluateRequest(context);
//   // result: { score, level, decision, reasons }
// =============================================================================

'use strict';

const crypto = require('crypto');
const gs     = require('./googleSheets');
const config = require('./riskConfig');

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashValue(value) {
    if (!value) return null;
    return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
}

function windowStart(minutes) {
    return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function scoreToLevel(score) {
    if (score >= config.THRESHOLDS.HIGH)   return 'HIGH';
    if (score >= config.THRESHOLDS.MEDIUM) return 'MEDIUM';
    return 'LOW';
}

function levelToDecision(level, score) {
    if (score >= 80)          return 'BLOCK';
    if (level === 'HIGH')     return 'REVIEW';
    return 'ALLOW';
}

// ── Individual Risk Rules ─────────────────────────────────────────────────────

async function ruleHoneypot(ctx) {
    if (ctx.honeypotValue && ctx.honeypotValue.trim() !== '') {
        return { score: config.SCORE_WEIGHTS.HONEYPOT_TRIGGERED, reason: 'Honeypot field triggered (automated submission detected)' };
    }
    return null;
}

async function ruleRapidSubmission(ctx) {
    const secs = ctx.formDurationMs ? ctx.formDurationMs / 1000 : null;
    if (secs !== null && secs < config.MIN_FORM_SECONDS) {
        return { score: config.SCORE_WEIGHTS.RAPID_SUBMISSION, reason: `Form submitted in ${secs.toFixed(1)}s (suspiciously fast)` };
    }
    return null;
}

async function ruleInvalidPhone(ctx) {
    if (!ctx.actorPhone) return null;
    const regex = new RegExp(config.PHONE_REGEX_STRING);
    const clean = ctx.actorPhone.replace(/\s/g, '');
    if (!regex.test(clean)) {
        return { score: config.SCORE_WEIGHTS.INVALID_PHONE_PATTERN, reason: 'Phone number does not match Algerian format' };
    }
    return null;
}

async function ruleRateLimit(ctx) {
    try {
        const since = windowStart(config.RATE_LIMIT.windowMinutes || 1440);
        const { getAllOrdersFromDb } = require('./db');
        const orders = await getAllOrdersFromDb();
        const matching = orders.filter(o => {
            const createdAt = o.createdAt || o.date || '';
            if (createdAt && createdAt < since) return false;
            return (ctx.actorIpHash && o.clientIpHash && o.clientIpHash === ctx.actorIpHash) ||
                   (ctx.deviceId && o.deviceId && o.deviceId === ctx.deviceId);
        });
        if (matching.length >= (config.RATE_LIMIT.maxRequests || 2)) {
            return { score: config.SCORE_WEIGHTS.RATE_LIMIT_HIT, reason: `Rate limit exceeded (${matching.length} orders in ${Math.round((config.RATE_LIMIT.windowMinutes || 1440) / 60)}h window)` };
        }
    } catch (e) {
        console.warn('[RiskEngine] ruleRateLimit error:', e.message);
    }
    return null;
}

async function ruleRepeatedPhone(ctx) {
    if (!ctx.actorPhone) return null;
    const cleanPhone = ctx.actorPhone.replace(/\D/g, '');
    try {
        const since = windowStart(config.RATE_LIMIT.windowMinutes || 1440);
        const { getAllOrdersFromDb } = require('./db');
        const orders = await getAllOrdersFromDb();
        const matching = orders.filter(o => {
            const oPhone = String(o.phone || '').replace(/\D/g, '');
            const createdAt = o.createdAt || o.date || '';
            if (createdAt && createdAt < since) return false;
            return oPhone === cleanPhone || (cleanPhone.length >= 8 && oPhone.endsWith(cleanPhone.slice(-8)));
        });
        if (matching.length >= (config.RATE_LIMIT.maxRequests || 2)) {
            return { score: config.SCORE_WEIGHTS.REPEATED_PHONE, reason: `Phone ${cleanPhone} reached max 2 allowed attempts (${matching.length} orders found)` };
        } else if (matching.length === 1) {
            return { score: 15, reason: `Second attempt for phone ${cleanPhone} (1 prior order found)` };
        }
    } catch (e) {
        console.warn('[RiskEngine] ruleRepeatedPhone error:', e.message);
    }
    return null;
}

async function rulePreviousRejection(ctx) {
    if (!gs.isConfigured()) return null;
    try {
        const rows = await gs.findRows(gs.SHEETS.RISK_EVENTS, r => {
            if (!['REQUEST_REJECTED', 'ACTOR_BLOCKED'].includes(r.event_type)) return false;
            return (ctx.actorPhone && r.actor_phone === ctx.actorPhone) ||
                   (ctx.deviceId   && r.device_id === ctx.deviceId);
        });
        if (rows.length > 0) {
            return { score: config.SCORE_WEIGHTS.PREVIOUS_REJECTION, reason: 'Actor has prior rejected/blocked requests' };
        }
    } catch (e) {
        console.warn('[RiskEngine] rulePreviousRejection error:', e.message);
    }
    return null;
}

async function ruleMultiDeviceIdentity(ctx) {
    if (!gs.isConfigured() || !ctx.deviceId) return null;
    try {
        const rows = await gs.findRows(gs.SHEETS.RISK_EVENTS, r =>
            r.device_id === ctx.deviceId &&
            r.event_type === 'REQUEST_CREATED' &&
            r.actor_phone
        );
        const uniquePhones = new Set(rows.map(r => r.actor_phone).filter(Boolean));
        if (uniquePhones.size >= config.MULTI_DEVICE_THRESHOLD) {
            return { score: config.SCORE_WEIGHTS.MULTI_DEVICE_IDENTITY, reason: `Device linked to ${uniquePhones.size} different phone numbers` };
        }
    } catch (e) {
        console.warn('[RiskEngine] ruleMultiDeviceIdentity error:', e.message);
    }
    return null;
}

async function ruleWatchlist(ctx) {
    if (!gs.isConfigured()) return null;
    try {
        const nowISO = new Date().toISOString();
        const identifiers = [
            ctx.actorPhone,
            ctx.deviceId,
            ctx.actorIpHash
        ].filter(Boolean);

        const rows = await gs.findRows(gs.SHEETS.WATCHLIST, r => {
            if (!identifiers.includes(r.identifier)) return false;
            if (r.expires_at && r.expires_at < nowISO) return false; // expired
            return true;
        });

        for (const row of rows) {
            if (row.status === 'blocked') {
                return { score: 80, reason: `Identifier on blocklist (${row.reason || 'admin block'})` };
            }
            if (row.status === 'watchlist') {
                return { score: config.SCORE_WEIGHTS.PREVIOUS_REJECTION, reason: `Identifier on watchlist (${row.reason || 'flagged'})` };
            }
            if (row.status === 'trusted') {
                return { score: -20, reason: 'Trusted actor' }; // negative = reduce risk
            }
        }
    } catch (e) {
        console.warn('[RiskEngine] ruleWatchlist error:', e.message);
    }
    return null;
}

// ── Main Evaluation Function ──────────────────────────────────────────────────

async function evaluateRequest(ctx) {
    // ── TEMPORARY BYPASS: Risk system disabled as requested by admin ──
    console.log(`[RiskEngine] ${ctx.storeId || '?'} | Risk system temporarily DISABLED by admin. Returning ALLOW.`);
    return {
        score: 0,
        level: 'LOW',
        decision: 'ALLOW',
        reasons: ['نظام الخطورة معطل مؤقتاً بأمر الإدارة (Risk shield paused)']
    };
}

// ── Record a Risk Event (call after evaluateRequest) ─────────────────────────

async function recordRiskEvent(ctx, evaluation) {
    if (!gs.isConfigured()) return;
    try {
        await gs.appendRow(gs.SHEETS.RISK_EVENTS, {
            event_id:    'EVT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            event_type:  'REQUEST_CREATED',
            store_id:    ctx.storeId || '',
            order_id:    ctx.orderId || '',
            actor_phone: ctx.actorPhone || '',
            device_id:   ctx.deviceId || '',
            ip_hash:     ctx.actorIpHash || '',
            metadata:    JSON.stringify({ requestType: ctx.requestType || 'order', score: evaluation.score, decision: evaluation.decision }),
            created_at:  new Date().toISOString()
        });
    } catch (e) {
        console.warn('[RiskEngine] recordRiskEvent error:', e.message);
    }
}

// ── Hash IP for privacy-preserving storage ────────────────────────────────────

function hashIp(ip) {
    return hashValue(ip);
}

module.exports = { evaluateRequest, recordRiskEvent, hashIp };
