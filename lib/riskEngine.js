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
    if (!gs.isConfigured()) return null;
    try {
        const since = windowStart(config.RATE_LIMIT.windowMinutes);
        const rows = await gs.findRows(gs.SHEETS.RISK_EVENTS, r => {
            if (r.event_type !== 'REQUEST_CREATED') return false;
            if (r.created_at < since) return false;
            if (ctx.storeId && r.store_id && r.store_id !== ctx.storeId) return false;
            return (ctx.actorIpHash && r.ip_hash === ctx.actorIpHash) ||
                   (ctx.deviceId   && r.device_id === ctx.deviceId);
        });
        if (rows.length >= config.RATE_LIMIT.maxRequests) {
            return { score: config.SCORE_WEIGHTS.RATE_LIMIT_HIT, reason: `Rate limit exceeded (${rows.length} requests in ${config.RATE_LIMIT.windowMinutes / 60}h window)` };
        }
    } catch (e) {
        console.warn('[RiskEngine] ruleRateLimit error:', e.message);
    }
    return null;
}

async function ruleRepeatedPhone(ctx) {
    if (!gs.isConfigured() || !ctx.actorPhone) return null;
    try {
        const since = windowStart(config.RATE_LIMIT.windowMinutes);
        const rows = await gs.findRows(gs.SHEETS.RISK_EVENTS, r =>
            r.event_type === 'REQUEST_CREATED' &&
            r.actor_phone === ctx.actorPhone &&
            r.created_at >= since &&
            (!ctx.storeId || !r.store_id || r.store_id === ctx.storeId)
        );
        if (rows.length >= 1) {
            return { score: config.SCORE_WEIGHTS.REPEATED_PHONE, reason: `Same phone submitted ${rows.length + 1} time(s) in window` };
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
    const triggered = [];
    let totalScore = 0;

    const rules = [
        ruleHoneypot(ctx),
        ruleRapidSubmission(ctx),
        ruleInvalidPhone(ctx),
        ruleRateLimit(ctx),
        ruleRepeatedPhone(ctx),
        rulePreviousRejection(ctx),
        ruleMultiDeviceIdentity(ctx),
        ruleWatchlist(ctx)
    ];

    const results = await Promise.allSettled(rules);
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
            totalScore += r.value.score;
            triggered.push(r.value.reason);
        }
    }

    const score    = Math.min(Math.max(totalScore, 0), 100);
    const level    = scoreToLevel(score);
    const decision = levelToDecision(level, score);

    const evaluation = { score, level, decision, reasons: triggered };
    console.log(`[RiskEngine] ${ctx.storeId || '?'} | score=${score} level=${level} decision=${decision} | reasons=${triggered.join('; ')}`);

    return evaluation;
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
