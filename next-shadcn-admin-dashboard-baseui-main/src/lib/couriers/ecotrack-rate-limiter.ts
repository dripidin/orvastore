/**
 * EcoTrack Rate Limiter & Quota Telemetry (`Taux limite`)
 * Official limits: 50 req/min, 1,500 req/hour, 15,000 req/day.
 * - Parses X-RateLimit-* and Retry-After headers
 * - Paces bursts safely below 45 req/min per courier
 * - Handles HTTP 429 with bounded exponential backoff
 * - Persists lightweight rate-limit snapshot + API telemetry log (non-blocking)
 */

import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";

export interface RateLimitSnapshot {
  courierId: string;
  limitMinute: number;
  remainingMinute: number | null;
  limitHour: number;
  remainingHour: number | null;
  limitDay: number;
  remainingDay: number | null;
  resetAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  updatedAt: string;
  windowRequestsLastMinute: number;
}

interface CacheEntry<T> {
  expiresAt: number;
  data: T;
}

const MINUTE_WINDOW_MS = 60_000;
const SAFE_RPM_CEILING = 45;

const requestTimestampsByCourier = new Map<string, number[]>();
const snapshotByCourier = new Map<string, RateLimitSnapshot>();
const responseCache = new Map<string, CacheEntry<unknown>>();

function pruneMinuteWindow(courierId: string, now: number): number[] {
  const existing = requestTimestampsByCourier.get(courierId) ?? [];
  const filtered = existing.filter((ts) => now - ts < MINUTE_WINDOW_MS);
  requestTimestampsByCourier.set(courierId, filtered);
  return filtered;
}

export function getRateLimitSnapshot(courierId = "redex"): RateLimitSnapshot {
  const existing = snapshotByCourier.get(courierId);
  const now = Date.now();
  const windowCount = pruneMinuteWindow(courierId, now).length;
  if (existing) {
    return {
      ...existing,
      windowRequestsLastMinute: windowCount,
    };
  }
  return {
    courierId,
    limitMinute: 50,
    remainingMinute: Math.max(0, 50 - windowCount),
    limitHour: 1500,
    remainingHour: null,
    limitDay: 15000,
    remainingDay: null,
    resetAt: null,
    lastStatusCode: null,
    lastError: null,
    updatedAt: new Date(now).toISOString(),
    windowRequestsLastMinute: windowCount,
  };
}

function parseIntHeader(headers: Headers, ...names: string[]): number | null {
  for (const name of names) {
    const raw = headers.get(name);
    if (raw !== null && raw !== "") {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function updateSnapshotFromHeaders(
  courierId: string,
  headers: Headers,
  statusCode: number,
  errorMessage?: string | null,
): RateLimitSnapshot {
  const now = Date.now();
  const prev = getRateLimitSnapshot(courierId);

  const limitMinute = parseIntHeader(headers, "x-ratelimit-limit", "x-ratelimit-limit-minute") ?? prev.limitMinute;
  const remainingMinute =
    parseIntHeader(headers, "x-ratelimit-remaining", "x-ratelimit-limit-remaining", "x-ratelimit-remaining-minute") ??
    prev.remainingMinute;
  const limitHour = parseIntHeader(headers, "x-ratelimit-limit-hour") ?? prev.limitHour;
  const remainingHour = parseIntHeader(headers, "x-ratelimit-remaining-hour") ?? prev.remainingHour;
  const limitDay = parseIntHeader(headers, "x-ratelimit-limit-day") ?? prev.limitDay;
  const remainingDay = parseIntHeader(headers, "x-ratelimit-remaining-day") ?? prev.remainingDay;
  const resetRaw = headers.get("x-ratelimit-reset") || headers.get("retry-after") || prev.resetAt;

  const snap: RateLimitSnapshot = {
    courierId,
    limitMinute,
    remainingMinute,
    limitHour,
    remainingHour,
    limitDay,
    remainingDay,
    resetAt: resetRaw || null,
    lastStatusCode: statusCode,
    lastError: errorMessage ?? null,
    updatedAt: new Date(now).toISOString(),
    windowRequestsLastMinute: pruneMinuteWindow(courierId, now).length,
  };

  snapshotByCourier.set(courierId, snap);
  return snap;
}

async function persistTelemetry(params: {
  courierId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  snapshot: RateLimitSnapshot;
}) {
  if (!isServiceRoleConfigured()) return;
  try {
    const supabase = getSupabaseServerClient() as any;
    await Promise.allSettled([
      supabase.from("courier_api_logs").insert({
        courier_id: params.courierId,
        endpoint: params.endpoint.slice(0, 300),
        method: params.method,
        status_code: params.statusCode,
        latency_ms: params.latencyMs,
        rate_limit_remaining: params.snapshot.remainingMinute,
        rate_limit_reset: params.snapshot.resetAt,
        success: params.success,
        error_message: params.errorMessage?.slice(0, 500) || null,
      }),
      supabase
        .from("courier_configurations")
        .update({
          rate_limit_snapshot: params.snapshot,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.courierId),
    ]);
  } catch {
    // Telemetry failures never break courier operations
  }
}

function getRetryDelayMs(headers: Headers, attempt: number): number {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const sec = Number.parseFloat(retryAfter);
    if (Number.isFinite(sec) && sec > 0) {
      return Math.min(15_000, Math.max(500, Math.round(sec * 1000)));
    }
  }
  return Math.min(8_000, 1000 * 2 ** attempt);
}

export function getCachedCourierData<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCachedCourierData<T>(key: string, data: T, ttlMs: number): void {
  responseCache.set(key, { expiresAt: Date.now() + ttlMs, data });
}

export function invalidateCourierCache(prefix?: string): void {
  if (!prefix) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
}

export async function throttledCourierFetch(params: {
  courierId: string;
  url: string;
  endpointLabel: string;
  init?: RequestInit;
  maxRetries429?: number;
  skipTelemetry?: boolean;
}): Promise<Response> {
  const { courierId, url, endpointLabel, init, maxRetries429 = 2, skipTelemetry = false } = params;

  for (let attempt = 0; attempt <= maxRetries429; attempt += 1) {
    const now = Date.now();
    const stamps = pruneMinuteWindow(courierId, now);
    if (stamps.length >= SAFE_RPM_CEILING) {
      const oldest = stamps[0];
      const waitMs = Math.max(150, Math.min(4_000, oldest + MINUTE_WINDOW_MS - now + 50));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    const reqStart = Date.now();
    const list = pruneMinuteWindow(courierId, reqStart);
    list.push(reqStart);
    requestTimestampsByCourier.set(courierId, list);

    const res = await fetch(url, init);
    const latencyMs = Date.now() - reqStart;
    const snap = updateSnapshotFromHeaders(
      courierId,
      res.headers,
      res.status,
      res.ok ? null : `HTTP ${res.status} ${res.statusText}`,
    );

    if (res.status === 429 && attempt < maxRetries429) {
      const delayMs = getRetryDelayMs(res.headers, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    if (!skipTelemetry) {
      void persistTelemetry({
        courierId,
        endpoint: endpointLabel,
        method: init?.method || "GET",
        statusCode: res.status,
        latencyMs,
        success: res.ok,
        errorMessage: res.ok ? null : `HTTP ${res.status}`,
        snapshot: snap,
      });
    }

    return res;
  }

  throw new Error("Courier request exceeded retry limit");
}
