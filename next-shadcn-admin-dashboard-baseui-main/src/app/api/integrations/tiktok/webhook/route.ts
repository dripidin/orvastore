/**
 * ORVA Store — TikTok Real-Time Lead Webhook Receiver Route (Phase B + Env Hardening)
 * Endpoint: /api/integrations/tiktok/webhook/
 *
 * Security & Reliability Invariants:
 * 1. Fails closed (HTTP 503) if webhook verification secret is missing, placeholder, or too short (< 16 chars).
 * 2. Two-tier single-process sliding-window rate limiter (global non-spoofable cap + per-client bucket
 *    that avoids blind trust of client-supplied X-Forwarded-For[0] unless TIKTOK_TRUSTED_IP_HEADER is verified).
 * 3. Reads the UNTOUCHED raw request text (`await request.text()`) BEFORE any JSON parsing; caps at 1 MB (413).
 * 4. Verifies `TikTok-Signature: t=<unix_ts>,s=<hmac_sha256_hex>` via constant-time HMAC-SHA256
 *    and bounded replay window; rejects invalid/missing/stale signatures with HTTP 401.
 * 5. Primary idempotency lives in PostgreSQL (`UNIQUE(external_lead_id)` + `UNIQUE(orders.idempotency_key)` +
 *    `withLeadProcessingLock`). An in-memory post-completion replay cache ONLY caches deliveries AFTER
 *    `processWebhookLeadEvent()` finishes cleanly (never while in-flight), preventing concurrent
 *    premature `replayed: true` acknowledgements before durable DB persistence.
 * 6. Hands any opt-in Telegram alert promises to Next.js `after()` so webhook acknowledgement
 *    never blocks on external notification latency.
 */

import { NextRequest } from "next/server";
import {
  resolveWebhookSecurityConfig,
  validateTikTokEnvironment,
} from "@/lib/integrations/tiktok/env";
import {
  processWebhookLeadEvent,
  verifyTikTokWebhookSignature,
} from "@/lib/integrations/tiktok/sync";
import { DEFAULT_ORVA_STORE_ID } from "@/lib/integrations/tiktok/types";
import {
  jsonNoStore,
  mapTikTokErrorToResponse,
  sanitizeSyncSummaryForJson,
  scheduleNonBlockingTasks,
} from "../_lib/route-helpers";
import {
  checkWebhookRateLimit,
  clearReplayCacheEntry,
  computeReplayCacheKey,
  getCompletedReplayEntry,
  getWebhookRateLimitMode,
  parseSignatureHex,
  recordCompletedReplayEntry,
} from "../_lib/webhook-guards";

export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BODY_BYTES = 1_048_576; // 1 MB safety cap
const SAFE_CHALLENGE_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export async function GET(request: NextRequest) {
  const challenge = (request.nextUrl.searchParams.get("challenge") || "").trim();
  if (challenge) {
    if (!SAFE_CHALLENGE_PATTERN.test(challenge)) {
      return jsonNoStore(
        { success: false, error: "Invalid verification challenge format.", code: "INVALID_CHALLENGE" },
        400,
      );
    }
    return jsonNoStore({ success: true, challenge });
  }

  const security = resolveWebhookSecurityConfig();
  const envReport = validateTikTokEnvironment();

  return jsonNoStore({
    success: true,
    status: "ready",
    configured: Boolean(security.secret),
    configurationStatus: envReport.configurationStatus,
    environmentMode: envReport.environmentMode,
    webhookSecretDedicated: security.dedicatedSecretValid,
    rateLimitBackend: getWebhookRateLimitMode(),
  });
}

export async function POST(request: NextRequest) {
  // 1. Resolve webhook verification secret & fail closed if missing, placeholder, weak, or env mode conflicted
  const security = resolveWebhookSecurityConfig();
  if (!security.secret) {
    return jsonNoStore(
      {
        success: false,
        error: security.secretInvalidReason || "TikTok webhook verification secret is not configured on the server.",
        code: security.secretMissing ? "WEBHOOK_SECRET_MISSING" : "WEBHOOK_SECRET_INVALID",
      },
      503,
    );
  }

  // 2. Two-tier sliding-window rate limiter (429 + Retry-After)
  const nowMs = Date.now();
  const rateCheck = checkWebhookRateLimit(
    request,
    {
      perClientMax: security.rateLimitMax,
      globalMax: security.globalRateLimitMax,
      trustedIpHeader: security.trustedIpHeader,
    },
    nowMs,
  );
  if (rateCheck.limited) {
    return jsonNoStore(
      {
        success: false,
        error: "Rate limit exceeded on TikTok webhook receiver.",
        code: "WEBHOOK_RATE_LIMITED",
      },
      429,
      { "Retry-After": String(rateCheck.retryAfterSec) },
    );
  }

  // 3. Fast pre-read Content-Length check + raw untouched body read before parsing JSON
  const declaredLengthRaw = (request.headers.get("content-length") || "").trim();
  if (declaredLengthRaw && /^\d+$/.test(declaredLengthRaw)) {
    const declaredBytes = Number.parseInt(declaredLengthRaw, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_WEBHOOK_BODY_BYTES) {
      return jsonNoStore(
        { success: false, error: "Webhook payload exceeds maximum allowed size.", code: "PAYLOAD_TOO_LARGE" },
        413,
      );
    }
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonNoStore(
      { success: false, error: "Unable to read webhook request body.", code: "INVALID_BODY" },
      400,
    );
  }

  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return jsonNoStore(
      { success: false, error: "Webhook payload exceeds maximum allowed size.", code: "PAYLOAD_TOO_LARGE" },
      413,
    );
  }

  // 4. Mandatory constant-time HMAC-SHA256 + timestamp replay check BEFORE JSON parsing
  const signatureHeader = request.headers.get("tiktok-signature");
  const verification = verifyTikTokWebhookSignature({
    rawBody,
    signatureHeader,
    secret: security.secret,
    maxAgeSeconds: security.maxAgeSeconds,
    nowSec: Math.floor(nowMs / 1000),
  });

  if (!verification.valid) {
    return jsonNoStore(
      {
        success: false,
        error: "Unauthorized: Invalid or expired TikTok webhook signature.",
        code: "INVALID_WEBHOOK_SIGNATURE",
      },
      401,
    );
  }

  // 5. Post-completion optimization cache ONLY (never populated while another request is in-flight)
  const signatureHex = parseSignatureHex(signatureHeader);
  const replayKey =
    verification.timestamp !== undefined && signatureHex
      ? computeReplayCacheKey(verification.timestamp, signatureHex, rawBody)
      : null;

  if (replayKey) {
    const cached = getCompletedReplayEntry(replayKey, nowMs);
    if (cached) {
      return jsonNoStore({
        success: true,
        received: true,
        replayed: true,
        summary: {
          leadsFetched: cached.leadsCount,
          leadsImported: 0,
          ordersCreated: 0,
          duplicatesSkipped: cached.leadsCount,
          leadsFailed: 0,
          durationMs: 0,
          status: "success",
          errorMessage: null,
        },
      });
    }
  }

  // 6. Parse verified JSON payload safely
  let payload: unknown;
  try {
    payload = rawBody.trim().length > 0 ? JSON.parse(rawBody) : null;
  } catch {
    return jsonNoStore(
      { success: false, error: "Malformed JSON webhook payload.", code: "INVALID_JSON" },
      400,
    );
  }

  if (!payload || typeof payload !== "object") {
    return jsonNoStore(
      { success: false, error: "Webhook payload must be a JSON object or array.", code: "INVALID_PARAMETERS" },
      400,
    );
  }

  // 7. Prompt idempotent inline processing backed by PostgreSQL locks & UNIQUE constraints
  try {
    const summary = await processWebhookLeadEvent({
      storeId: DEFAULT_ORVA_STORE_ID,
      payload,
    });

    // Only cache AFTER durable processing completed cleanly with zero failed leads
    if (replayKey) {
      if (summary.leadsFailed === 0 && summary.status === "success") {
        recordCompletedReplayEntry(replayKey, summary.leadsFetched, security.maxAgeSeconds, Date.now());
      } else {
        clearReplayCacheEntry(replayKey);
      }
    }

    scheduleNonBlockingTasks(summary.backgroundTasks);

    return jsonNoStore({
      success: true,
      received: true,
      summary: sanitizeSyncSummaryForJson(summary),
    });
  } catch (err) {
    if (replayKey) {
      clearReplayCacheEntry(replayKey);
    }
    return mapTikTokErrorToResponse(err, "API /api/integrations/tiktok/webhook POST");
  }
}
