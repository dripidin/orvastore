// =============================================================================
// Risk Engine - Core Evaluation Module
// =============================================================================
// Usage:
//   const { evaluateRequest } = require('./riskEngine');
//   const result = await evaluateRequest(context);
//   // result: { score, level, decision, reasons }
// =============================================================================

const crypto = require('crypto');
const { getSupabase } = require('./supabaseServer');
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
    if (score >= config.THRESHOLDS.LOW)    return 'LOW';
    return 'LOW';
}

function levelToDecision(level, score) {
    if (score >= 80) return 'BLOCK';
    if (level === 'HIGH') return 'REVIEW';
    return 'ALLOW';
}

// ── Individual Risk Rules (pure, deterministic) ───────────────────────────────

async function ruleHoneypot(ctx) {
    if (ctx.honeypotValue && ctx.honeypotValue.trim() !== '') {
        return { score: config.SCORE_WEIGHTS.HONEYPOT_TRIGGERED, reason: 'Honeypot field triggered (automated submission detected)' };
    }
    return null;
}

async function ruleRapidSubmission(ctx) {
    const secs = ctx.formDurationMs ? ctx.formDurationMs / 1000 : null;
    if (secs !== null && secs < config.MIN_FORM_SECONDS) {
        return { score: config.SCORE_WEIGHTS.RAPID_SUBMISSION, reason: Form submitted in s (suspiciously fast) };
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

async function ruleRateLimit(ctx, supabase) {
    if (!supabase) return null;
    try {
        const since = windowStart(config.RATE_LIMIT.windowMinutes);
        const conditions = [];
        if (ctx.actorIpHash)  conditions.push(ip_hash.eq.);
        if (ctx.deviceId)     conditions.push(device_id.eq.);
        if (conditions.length === 0) return null;

        const { data, error } = await supabase
            .from('risk_events')
            .select('id')
            .eq('event_type', 'REQUEST_CREATED')
            .eq('store_id', ctx.storeId || '')
            .gte('created_at', since)
            .or(conditions.join(','));

        if (!error && data && data.length >= config.RATE_LIMIT.maxRequests) {
            return { score: config.SCORE_WEIGHTS.RATE_LIMIT_HIT, reason: Rate limit exceeded ( requests in h window) };
        }
    } catch (e) {
        console.warn('[RiskEngine] ruleRateLimit error:', e.message);
    }
    return null;
}

async function ruleRepeatedPhone(ctx, supabase) {
    if (!supabase || !ctx.actorPhone) return null;
    try {
        const since = windowStart(config.RATE_LIMIT.windowMinutes);
        const { data, error } = await supabase
            .from('risk_events')
            .select('id')
            .eq('event_type', 'REQUEST_CREATED')
            .eq('actor_phone', ctx.actorPhone)
            .eq('store_id', ctx.storeId || '')
            .gte('created_at', since);

        if (!error && data && data.length >= 1) {
            return { score: config.SCORE_WEIGHTS.REPEATED_PHONE, reason: Same phone submitted  time(s) in window };
        }
    } catch (e) {
        console.warn('[RiskEngine] ruleRepeatedPhone error:', e.message);
    }
    return null;
}

async function rulePreviousRejection(ctx, supabase) {
    if (!supabase) return null;
    try {
        const conditions = [];
        if (ctx.actorPhone) conditions.push(ctor_phone.eq.);
        if (ctx.deviceId)   conditions.push(device_id.eq.);
        if (conditions.length === 0) return null;

        const { data, error } = await supabase
            .from('risk_events')
            .select('id')
            .in('event_type', ['REQUEST_REJECTED', 'ACTOR_BLOCKED'])
            .or(conditions.join(','));

        if (!error && data && data.length > 0) {
            return { score: config.SCORE_WEIGHTS.PREVIOUS_REJECTION, reason: 'Actor has prior rejected/blocked requests' };
        }
    } catch (e) {
        console.warn('[RiskEngine] rulePreviousRejection error:', e.message);
    }
    return null;
}

async function ruleMultiDeviceIdentity(ctx, supabase) {
    if (!supabase || !ctx.deviceId) return null;
    try {
        const { data, error } = await supabase
            .from('risk_events')
            .select('actor_phone')
            .eq('device_id', ctx.deviceId)
            .eq('event_type', 'REQUEST_CREATED')
            .not('actor_phone', 'is', null);

        if (!error && data) {
            const uniquePhones = new Set(data.map(r => r.actor_phone));
            if (uniquePhones.size >= config.MULTI_DEVICE_THRESHOLD) {
                return { score: config.SCORE_WEIGHTS.MULTI_DEVICE_IDENTITY, reason: Device linked to  different phone numbers };
            }
        }
    } catch (e) {
        console.warn('[RiskEngine] ruleMultiDeviceIdentity error:', e.message);
    }
    return null;
}

// ── Main Evaluation Function ───────────────────────────────────────────────────

async function evaluateRequest(ctx) {
    const supabase = getSupabase();
    const triggered = [];
    let totalScore = 0;

    // Run all rules
    const rules = [
        ruleHoneypot(ctx),
        ruleRapidSubmission(ctx),
        ruleInvalidPhone(ctx),
        ruleRateLimit(ctx, supabase),
        ruleRepeatedPhone(ctx, supabase),
        rulePreviousRejection(ctx, supabase),
        ruleMultiDeviceIdentity(ctx, supabase),
    ];

    const results = await Promise.allSettled(rules);
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
            totalScore += r.value.score;
            triggered.push(r.value.reason);
        }
    }

    const score = Math.min(totalScore, 100);
    const level = scoreToLevel(score);
    const decision = levelToDecision(level, score);

    const evaluation = { score, level, decision, reasons: triggered };

    console.log([RiskEngine]  | score= level= decision= | reasons=);

    return evaluation;
}

// ── Record a Risk Event (call after evaluateRequest) ──────────────────────────

async function recordRiskEvent(ctx, evaluation) {
    const supabase = getSupabase();
    if (!supabase) return;
    try {
        await supabase.from('risk_events').insert({
            event_type:  'REQUEST_CREATED',
            store_id:    ctx.storeId || null,
            actor_phone: ctx.actorPhone || null,
            device_id:   ctx.deviceId || null,
            ip_hash:     ctx.actorIpHash || null,
            order_id:    ctx.orderId || null,
            metadata:    { requestType: ctx.requestType, score: evaluation.score, decision: evaluation.decision }
        });
    } catch (e) {
        console.warn('[RiskEngine] recordRiskEvent error:', e.message);
    }
}

// ── Hash an IP for privacy-preserving storage ─────────────────────────────────

function hashIp(ip) {
    return hashValue(ip);
}

module.exports = { evaluateRequest, recordRiskEvent, hashIp };
