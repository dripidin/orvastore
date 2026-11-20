/**
 * ORVA Store — TikTok Integration API Route Shared Security & Response Helpers (Phase B)
 *
 * Private App Router module (_lib) — never exposed as an HTTP route.
 * Centralizes:
 * - Authoritative admin session + CSRF origin gate (getVerifiedAdminSession + 401/403 separation)
 * - Timing-safe cron bearer secret verification (TIKTOK_SYNC_CRON_SECRET)
 * - Strict `Cache-Control: no-store` headers on every response
 * - Safe Zod JSON parsing & zero-leak TikTokApiError -> HTTP status mapping
 * - Vercel-compatible Next.js `after()` non-blocking task scheduling (e.g., opt-in Telegram alerts)
 */

import crypto from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import type { ZodType } from "zod";
import {
  type AdminSessionPayload,
  SESSION_COOKIE_NAME,
  extractSessionToken,
  getVerifiedAdminSession,
  verifyCsrfOrigin,
  verifySessionToken,
} from "@/lib/auth/admin-auth";
import { TIKTOK_OAUTH_STATE_COOKIE_NAME } from "@/lib/integrations/tiktok/oauth";
import type { SyncMetricsSummary } from "@/lib/integrations/tiktok/sync";
import { TikTokApiError, redactSensitiveForLog } from "@/lib/integrations/tiktok/types";

export const NO_STORE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
};

/**
 * Returns a JSON response with strict no-store headers so tokens, connection state,
 * and customer lead metadata are never cached by browsers or intermediate proxies.
 */
export function jsonNoStore(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...(extraHeaders ?? {}),
    },
  });
}

export type AdminRouteAuthResult =
  | { ok: true; session: AdminSessionPayload }
  | { ok: false; response: NextResponse };

/**
 * Master Admin Route Auth & CSRF Gate:
 * - Calls getVerifiedAdminSession(request) as the authoritative check (HMAC + durable revocation + CSRF).
 * - Differentiates 403 Forbidden (CSRF origin failure on an authenticated mutating request)
 *   from 401 Unauthorized (missing, malformed, expired, or revoked admin session).
 */
export async function requireAdminRouteSession(
  request: NextRequest,
): Promise<AdminRouteAuthResult> {
  const session = await getVerifiedAdminSession(request);
  if (session) {
    return { ok: true, session };
  }

  const isMutating = !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
  if (isMutating && !verifyCsrfOrigin(request)) {
    const token = extractSessionToken(request);
    if (token && (await verifySessionToken(token))) {
      return {
        ok: false,
        response: jsonNoStore(
          {
            success: false,
            error: "Forbidden: CSRF origin validation failed.",
            code: "CSRF_ORIGIN_MISMATCH",
          },
          403,
        ),
      };
    }
  }

  return {
    ok: false,
    response: jsonNoStore(
      {
        success: false,
        error: "Unauthorized: Valid admin session required.",
        code: "UNAUTHORIZED",
      },
      401,
    ),
  };
}

/**
 * Timing-safe verification of `Authorization: Bearer <TIKTOK_SYNC_CRON_SECRET>` for
 * scheduled sync / reconciliation invocations.
 * Strictly rejects requests carrying an ambient admin cookie (prevents CSRF bypass)
 * and fails closed if TIKTOK_SYNC_CRON_SECRET is unset or shorter than 16 characters.
 */
export function verifyCronBearerSecret(request: NextRequest): boolean {
  const configured = (process.env.TIKTOK_SYNC_CRON_SECRET || "").trim();
  if (configured.length < 16) return false;

  // Never permit cron bearer bypass when browser admin cookie is attached
  if (request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    return false;
  }

  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return false;
  }

  const provided = authHeader.slice(7).trim();
  if (!provided) return false;

  const bufA = Buffer.from(provided, "utf8");
  const bufB = Buffer.from(configured, "utf8");
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Parses and validates JSON request body against a Zod schema, rejecting malformed JSON
 * or schema violations with HTTP 400 Bad Request.
 */
export async function parseValidatedJsonBody<T>(
  request: NextRequest,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let rawJson: unknown;
  try {
    rawJson = await request.json();
  } catch {
    return {
      ok: false,
      response: jsonNoStore(
        {
          success: false,
          error: "Invalid JSON request body.",
          code: "INVALID_JSON",
        },
        400,
      ),
    };
  }

  const parsed = schema.safeParse(rawJson);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      ok: false,
      response: jsonNoStore(
        {
          success: false,
          error: firstIssue?.message || "Invalid request payload.",
          code: "INVALID_PARAMETERS",
        },
        400,
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

/**
 * Maps TikTokApiError and unexpected exceptions into sanitized HTTP responses.
 * Never leaks secrets, access tokens, encryption keys, or raw database stack traces.
 */
export function mapTikTokErrorToResponse(err: unknown, routeContext: string): NextResponse {
  if (err instanceof TikTokApiError) {
    console.warn(`[${routeContext}]`, redactSensitiveForLog(err.toLogObject()));

    switch (err.category) {
      case "INVALID_PARAMETERS":
        return jsonNoStore(
          { success: false, error: err.message, code: err.category },
          400,
        );
      case "AUTH_TOKEN_EXPIRED":
        return jsonNoStore(
          { success: false, error: err.message, code: err.category },
          401,
        );
      case "AUTH_PERMISSION_DENIED":
        return jsonNoStore(
          { success: false, error: err.message, code: err.category },
          403,
        );
      case "RATE_LIMITED": {
        const retrySec = err.retryAfterMs ? Math.max(1, Math.ceil(err.retryAfterMs / 1000)) : 5;
        return jsonNoStore(
          { success: false, error: err.message, code: err.category },
          429,
          { "Retry-After": String(retrySec) },
        );
      }
      case "ENCRYPTION_CONFIG_ERROR":
        return jsonNoStore(
          {
            success: false,
            error: "TikTok token encryption configuration is missing or invalid on the server.",
            code: err.category,
          },
          503,
        );
      case "DATABASE_ERROR":
        return jsonNoStore(
          {
            success: false,
            error: "TikTok persistence service is temporarily unavailable.",
            code: err.category,
          },
          503,
        );
      case "UPSTREAM_SERVER_ERROR":
      case "NETWORK_ERROR":
      case "RESPONSE_VALIDATION_ERROR":
        return jsonNoStore(
          { success: false, error: err.message, code: err.category },
          502,
        );
      default:
        return jsonNoStore(
          { success: false, error: err.message || "TikTok API request failed.", code: err.category },
          502,
        );
    }
  }

  console.error(
    `[${routeContext}] Unexpected error:`,
    err instanceof Error ? err.message : "unknown_error",
  );
  return jsonNoStore(
    {
      success: false,
      error: "Internal TikTok integration error.",
      code: "INTERNAL_ERROR",
    },
    500,
  );
}

/**
 * Sets the hardened HttpOnly OAuth CSRF state double-submit cookie (10-minute lifetime).
 */
export function setOAuthStateCookie(response: NextResponse, state: string): void {
  response.cookies.set({
    name: TIKTOK_OAUTH_STATE_COOKIE_NAME,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

/**
 * Immediately clears the one-time-use OAuth CSRF state cookie.
 */
export function clearOAuthStateCookie(response: NextResponse): void {
  response.cookies.set({
    name: TIKTOK_OAUTH_STATE_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Resolves the safe canonical app origin for same-origin redirects and webhook URL construction.
 */
export function resolveCanonicalAppOrigin(request: NextRequest): string {
  const configured = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall back to request origin below
    }
  }
  return request.nextUrl.origin;
}

/**
 * Strips non-serializable `backgroundTasks` promises from SyncMetricsSummary before JSON output.
 */
export function sanitizeSyncSummaryForJson(
  summary: SyncMetricsSummary,
): Omit<SyncMetricsSummary, "backgroundTasks"> {
  const { backgroundTasks: _omit, ...publicSummary } = summary;
  return publicSummary;
}

/**
 * Schedules non-blocking post-response promises (e.g., opt-in Telegram alerts <= 2500ms)
 * via Next.js 15 `after()` on Vercel, gracefully falling back outside request AsyncLocalStorage
 * (such as direct `tsx` route unit tests) so execution never throws or blocks the HTTP response.
 */
export function scheduleNonBlockingTasks(tasks?: Array<Promise<unknown>>): void {
  if (!tasks || tasks.length === 0) return;

  const settledWork = () =>
    Promise.allSettled(tasks).then(() => undefined);

  try {
    after(settledWork);
  } catch {
    // Invoked outside Next.js request context (e.g., unit tests): run detached cleanly
    void settledWork();
  }
}
