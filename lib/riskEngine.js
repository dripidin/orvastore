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
const { getSupabase, getPgPool } = require('./supabaseServer');
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
            if (o.status === 'deleted') return false;
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
            if (o.status === 'deleted') return false;
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
    const supabase = getSupabase();
    if (!supabase) return null;
    try {
        let query = supabase.from('risk_events').select('*').in('event_type', ['REQUEST_REJECTED', 'ACTOR_BLOCKED']);
        if (ctx.actorPhone && ctx.deviceId) {
            query = query.or(`actor_phone.eq.${ctx.actorPhone},device_id.eq.${ctx.deviceId}`);
        } else if (ctx.actorPhone) {
            query = query.eq('actor_phone', ctx.actorPhone);
        } else if (ctx.deviceId) {
            query = query.eq('device_id', ctx.deviceId);
        } else {
            return null;
        }
        const { data } = await query.limit(5);
        if (data && data.length > 0) {
            return { score: config.SCORE_WEIGHTS.PREVIOUS_REJECTION, reason: 'Actor has prior rejected/blocked requests' };
        }
    } catch (e) {
        console.warn('[RiskEngine] rulePreviousRejection error:', e.message);
    }
    return null;
}

async function ruleMultiDeviceIdentity(ctx) {
    if (!ctx.deviceId) return null;
    const supabase = getSupabase();
    if (!supabase) return null;
    try {
        const { data } = await supabase.from('risk_events')
            .select('actor_phone')
            .eq('device_id', ctx.deviceId)
            .eq('event_type', 'REQUEST_CREATED')
            .not('actor_phone', 'is', null);
        if (data && data.length > 0) {
            const uniquePhones = new Set(data.map(r => r.actor_phone).filter(Boolean));
            if (uniquePhones.size >= config.MULTI_DEVICE_THRESHOLD) {
                return { score: config.SCORE_WEIGHTS.MULTI_DEVICE_IDENTITY, reason: `Device linked to ${uniquePhones.size} different phone numbers` };
            }
        }
    } catch (e) {
        console.warn('[RiskEngine] ruleMultiDeviceIdentity error:', e.message);
    }
    return null;
}

async function ruleWatchlist(ctx) {
    const supabase = getSupabase();
    const nowISO = new Date().toISOString();
    const identifiers = [
        ctx.actorPhone,
        ctx.deviceId,
        ctx.actorIpHash
    ].filter(Boolean);

    if (identifiers.length === 0) return null;

    if (supabase) {
        try {
            const { data } = await supabase.from('watchlist')
                .select('*')
                .in('identifier', identifiers);
            if (data && data.length > 0) {
                for (const row of data) {
                    if (row.expires_at && row.expires_at < nowISO) continue; // expired
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
            }
        } catch (e) {
            console.warn('[RiskEngine] ruleWatchlist error:', e.message);
        }
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
    const eventRow = {
        event_id:    'EVT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        event_type:  'REQUEST_CREATED',
        store_id:    ctx.storeId || 'orvastore',
        order_id:    ctx.orderId || '',
        actor_phone: ctx.actorPhone || '',
        device_id:   ctx.deviceId || '',
        ip_hash:     ctx.actorIpHash || '',
        metadata:    { requestType: ctx.requestType || 'order', score: evaluation.score, decision: evaluation.decision },
        created_at:  new Date().toISOString()
    };

    const supabase = getSupabase();
    if (supabase) {
        try {
            await supabase.from('risk_events').insert([eventRow]);
            return;
        } catch (e) {
            console.warn('[RiskEngine] Supabase REST risk event error:', e.message);
        }
    }

    const pool = getPgPool();
    if (pool) {
        try {
            await pool.query(`
                INSERT INTO public.risk_events (
                    event_id, event_type, store_id, order_id, actor_phone, device_id, ip_hash, metadata, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (event_id) DO NOTHING;
            `, [
                eventRow.event_id, eventRow.event_type, eventRow.store_id, eventRow.order_id,
                eventRow.actor_phone, eventRow.device_id, eventRow.ip_hash,
                JSON.stringify(eventRow.metadata), eventRow.created_at
            ]);
        } catch (pgErr) {
            console.warn('[RiskEngine] PG pool risk event error:', pgErr.message);
        }
    }
}

// ── Hash IP for privacy-preserving storage ────────────────────────────────────

function hashIp(ip) {
    return hashValue(ip);
}

module.exports = { evaluateRequest, recordRiskEvent, hashIp };
