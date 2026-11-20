/**
 * ORVA Store — Webhook Rate-Limiting & Post-Completion Replay Optimization Helpers
 *
 * Private App Router module (_lib) — never exposed as an HTTP route or extra route export.
 * Extracted cleanly from webhook/route.ts so Next.js 15 App Router route type checking
 * passes strictly with zero non-route exports on route.ts.
 */

import crypto from "node:crypto";
import type { NextRequest } from "next/server";

const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_IP_BUCKETS = 2_000;
const MAX_REPLAY_CACHE_ENTRIES = 5_000;

export interface ReplayCacheEntry {
  expiresAtMs: number;
  leadsCount: number;
}

export interface WebhookRateLimitLimits {
  perClientMax: number;
  globalMax: number;
  trustedIpHeader: string | null;
}

export interface WebhookRateLimitDecision {
  limited: boolean;
  retryAfterSec: number;
  bucketKey: string;
  mode: "single_process_in_memory" | "custom_backend";
}

export type WebhookRateLimitBackend = (
  clientKey: string,
  limits: WebhookRateLimitLimits,
  nowMs: number,
) => { limited: boolean; retryAfterSec: number };

const ipHitsMap = new Map<string, number[]>();
let globalHits: number[] = [];
const completedReplayCache = new Map<string, ReplayCacheEntry>();
let customRateLimitBackend: WebhookRateLimitBackend | null = null;

/**
 * Resets in-memory rate-limit & post-completion optimization caches (deterministic tests only).
 */
export function __testResetTikTokWebhookGuards(): void {
  ipHitsMap.clear();
  globalHits = [];
  completedReplayCache.clear();
  customRateLimitBackend = null;
}

/**
 * Allows injecting an external/shared rate-limit backend in tests or future verified Redis/Upstash adapters.
 */
export function __testSetWebhookRateLimitBackend(backend: WebhookRateLimitBackend | null): void {
  customRateLimitBackend = backend;
}

export function getWebhookRateLimitMode(): "single_process_in_memory" | "custom_backend" {
  return customRateLimitBackend ? "custom_backend" : "single_process_in_memory";
}

const SAFE_IP_TOKEN_PATTERN = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]{2,45})$/;

function isValidIpToken(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.length > 45 || !SAFE_IP_TOKEN_PATTERN.test(trimmed)) {
    return false;
  }
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");
    if (parts.length !== 4) return false;
    return parts.every((p) => {
      const n = Number(p);
      return Number.isInteger(n) && n >= 0 && n <= 255 && String(n) === p;
    });
  }
  return trimmed.includes(":");
}

/**
 * Extracts a client rate-limit bucket key ONLY when a verified reverse-proxy IP header
 * (`TIKTOK_TRUSTED_IP_HEADER`) is explicitly configured.
 *
 * Security Invariants:
 * - When `trustedHeader` is null (unverified proxy environment), NEVER trusts client-supplied
 *   `x-forwarded-for` or `x-real-ip` headers (preventing attackers from rotating spoofed IPs to
 *   bypass per-client rate limits). All unverified traffic shares `"unattributed-proxy-client"`.
 * - When `trustedHeader === "x-forwarded-for"`, uses the RIGHTMOST valid proxy hop (`hops[hops.length - 1]`),
 *   never the spoofable leftmost `[0]` entry.
 * - For single-value trusted headers (e.g. `cf-connecting-ip`, `x-real-ip`), validates strict IPv4/IPv6
 *   format and falls back to `"unattributed-proxy-client"` if missing or malformed.
 */
export function extractClientBucketKey(request: NextRequest, trustedHeader: string | null): string {
  const normalizedHeader = (trustedHeader || "").trim().toLowerCase();
  if (!normalizedHeader) {
    return "unattributed-proxy-client";
  }

  const rawHeaderVal = (request.headers.get(normalizedHeader) || "").trim();
  if (!rawHeaderVal) {
    return "unattributed-proxy-client";
  }

  if (normalizedHeader === "x-forwarded-for") {
    const hops = rawHeaderVal
      .split(",")
      .map((s) => s.trim())
      .filter((s) => isValidIpToken(s));
    if (hops.length > 0) {
      return `xff-hop:${hops[hops.length - 1]}`;
    }
    return "unattributed-proxy-client";
  }

  const firstToken = rawHeaderVal.split(",")[0]?.trim() || "";
  if (isValidIpToken(firstToken)) {
    return `hdr:${normalizedHeader}:${firstToken}`;
  }

  return "unattributed-proxy-client";
}

export function checkWebhookRateLimit(
  request: NextRequest,
  limits: WebhookRateLimitLimits,
  nowMs = Date.now(),
): WebhookRateLimitDecision {
  const clientKey = extractClientBucketKey(request, limits.trustedIpHeader);

  if (customRateLimitBackend) {
    const res = customRateLimitBackend(clientKey, limits, nowMs);
    return {
      ...res,
      bucketKey: clientKey,
      mode: "custom_backend",
    };
  }

  const cutoff = nowMs - RATE_LIMIT_WINDOW_MS;

  globalHits = globalHits.filter((ts) => ts > cutoff);
  if (globalHits.length >= limits.globalMax) {
    const oldest = globalHits[0] ?? nowMs;
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - nowMs) / 1000)),
      bucketKey: clientKey,
      mode: "single_process_in_memory",
    };
  }

  const recentClientHits = (ipHitsMap.get(clientKey) ?? []).filter((ts) => ts > cutoff);
  if (recentClientHits.length >= limits.perClientMax) {
    ipHitsMap.set(clientKey, recentClientHits);
    const oldest = recentClientHits[0] ?? nowMs;
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - nowMs) / 1000)),
      bucketKey: clientKey,
      mode: "single_process_in_memory",
    };
  }

  recentClientHits.push(nowMs);
  ipHitsMap.set(clientKey, recentClientHits);
  globalHits.push(nowMs);

  if (ipHitsMap.size > MAX_IP_BUCKETS) {
    for (const [key, timestamps] of ipHitsMap.entries()) {
      const fresh = timestamps.filter((ts) => ts > cutoff);
      if (fresh.length === 0) {
        ipHitsMap.delete(key);
      }
      if (ipHitsMap.size <= MAX_IP_BUCKETS) break;
    }
    while (ipHitsMap.size > MAX_IP_BUCKETS) {
      const oldestKey = ipHitsMap.keys().next().value;
      if (!oldestKey) break;
      ipHitsMap.delete(oldestKey);
    }
  }

  return {
    limited: false,
    retryAfterSec: 0,
    bucketKey: clientKey,
    mode: "single_process_in_memory",
  };
}

export function parseSignatureHex(signatureHeader: string | null): string {
  for (const part of (signatureHeader || "").split(",")) {
    const [k, ...rest] = part.trim().split("=");
    if ((k || "").trim().toLowerCase() === "s") {
      return rest.join("=").trim().toLowerCase();
    }
  }
  return "";
}

export function computeReplayCacheKey(
  timestamp: number,
  signatureHex: string,
  rawBody: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`${timestamp}:${signatureHex}:${rawBody}`, "utf8")
    .digest("hex");
}

export function getCompletedReplayEntry(cacheKey: string, nowMs: number): ReplayCacheEntry | null {
  const entry = completedReplayCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAtMs <= nowMs) {
    completedReplayCache.delete(cacheKey);
    return null;
  }
  return entry;
}

export function recordCompletedReplayEntry(
  cacheKey: string,
  leadsCount: number,
  maxAgeSeconds: number,
  nowMs: number,
): void {
  if (completedReplayCache.size >= MAX_REPLAY_CACHE_ENTRIES) {
    for (const [k, v] of completedReplayCache.entries()) {
      if (v.expiresAtMs <= nowMs) {
        completedReplayCache.delete(k);
      }
      if (completedReplayCache.size < MAX_REPLAY_CACHE_ENTRIES) break;
    }
    while (completedReplayCache.size >= MAX_REPLAY_CACHE_ENTRIES) {
      const oldestKey = completedReplayCache.keys().next().value;
      if (!oldestKey) break;
      completedReplayCache.delete(oldestKey);
    }
  }
  completedReplayCache.set(cacheKey, {
    expiresAtMs: nowMs + maxAgeSeconds * 1000,
    leadsCount: Math.max(0, leadsCount),
  });
}

export function clearReplayCacheEntry(cacheKey: string): void {
  completedReplayCache.delete(cacheKey);
}
