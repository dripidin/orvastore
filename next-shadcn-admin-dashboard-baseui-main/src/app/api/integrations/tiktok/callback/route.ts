/**
 * ORVA Store — TikTok OAuth 2.0 Callback Route (Phase B)
 * Endpoint: /api/integrations/tiktok/callback/
 *
 * Security Invariants:
 * 1. Requires an active, verified ORVA admin session (prevents login CSRF / account swap).
 * 2. Validates BOTH the signed `state` query parameter AND the HttpOnly double-submit cookie
 *    `orva_tiktok_oauth_state` via constant-time comparison before exchanging `auth_code`.
 * 3. Always clears `orva_tiktok_oauth_state` (one-time-use nonce, preventing replay).
 * 4. Never reflects raw query errors, authorization codes, or tokens in responses or redirects.
 * 5. Serves JSON status responses to API callers and safe same-origin redirects to browser flows.
 */

import { NextRequest, NextResponse } from "next/server";
import { syncAuthorizedAdvertisers } from "@/lib/integrations/tiktok/accounts";
import {
  TIKTOK_OAUTH_STATE_COOKIE_NAME,
  exchangeAuthorizationCode,
} from "@/lib/integrations/tiktok/oauth";
import { DEFAULT_ORVA_STORE_ID, TikTokApiError } from "@/lib/integrations/tiktok/types";
import {
  NO_STORE_HEADERS,
  clearOAuthStateCookie,
  jsonNoStore,
  mapTikTokErrorToResponse,
  requireAdminRouteSession,
  resolveCanonicalAppOrigin,
} from "../_lib/route-helpers";

export const dynamic = "force-dynamic";

function prefersBrowserRedirect(request: NextRequest): boolean {
  const accept = (request.headers.get("accept") || "").toLowerCase();
  return accept.includes("text/html") && !accept.includes("application/json");
}

function buildSettingsRedirect(
  request: NextRequest,
  params: { status: "connected" | "error"; errorCode?: string },
): NextResponse {
  const origin = resolveCanonicalAppOrigin(request);
  const url = new URL("/dashboard/settings/", origin);
  url.searchParams.set("tab", "tiktok");
  url.searchParams.set("tiktok_status", params.status);
  if (params.errorCode) {
    url.searchParams.set("tiktok_error", params.errorCode);
  }

  const res = NextResponse.redirect(url, { status: 302, headers: NO_STORE_HEADERS });
  clearOAuthStateCookie(res, request);
  return res;
}

export async function GET(request: NextRequest) {
  const browserRedirect = prefersBrowserRedirect(request);

  // 1. Admin session MUST be active before accepting any OAuth callback
  const auth = await requireAdminRouteSession(request);
  if (!auth.ok) {
    if (browserRedirect) {
      return buildSettingsRedirect(request, { status: "error", errorCode: "admin_session_required" });
    }
    return auth.response;
  }
  const searchParams = request.nextUrl.searchParams;
  const upstreamError = (searchParams.get("error") || "").trim();
  const authCode = (searchParams.get("auth_code") || searchParams.get("code") || "").trim();
  const state = (searchParams.get("state") || "").trim();
  const cookieState = request.cookies.get(TIKTOK_OAUTH_STATE_COOKIE_NAME)?.value ?? null;

  // 2. Handle explicit upstream OAuth cancellation / denial
  if (upstreamError) {
    if (browserRedirect) {
      return buildSettingsRedirect(request, { status: "error", errorCode: "oauth_denied" });
    }
    const res = jsonNoStore(
      {
        success: false,
        error: "TikTok authorization was denied or cancelled.",
        code: "OAUTH_DENIED",
      },
      400,
    );
    clearOAuthStateCookie(res, request);
    return res;
  }

  // 3. Require both auth_code and state + double-submit cookie
  if (!authCode || !state) {
    if (browserRedirect) {
      return buildSettingsRedirect(request, { status: "error", errorCode: "missing_callback_params" });
    }
    const res = jsonNoStore(
      {
        success: false,
        error: "Missing required auth_code or state query parameter.",
        code: "INVALID_PARAMETERS",
      },
      400,
    );
    clearOAuthStateCookie(res, request);
    return res;
  }

  if (!cookieState) {
    if (browserRedirect) {
      return buildSettingsRedirect(request, { status: "error", errorCode: "missing_state_cookie" });
    }
    const res = jsonNoStore(
      {
        success: false,
        error: "Missing OAuth CSRF state cookie. Please restart authorization.",
        code: "OAUTH_STATE_COOKIE_MISSING",
      },
      403,
    );
    clearOAuthStateCookie(res, request);
    return res;
  }

  // 4. Verify state + double-submit cookie and exchange auth_code for encrypted tokens
  try {
    const exchanged = await exchangeAuthorizationCode({
      authCode,
      state,
      expectedCookieState: cookieState,
      storeId: DEFAULT_ORVA_STORE_ID,
      connectedBy: auth.session.sub,
    });

    // 5. Best-effort initial advertiser discovery (never fails OAuth completion)
    let advertisersSynced = 0;
    let advertiserSyncWarning: string | null = null;
    try {
      const synced = await syncAuthorizedAdvertisers({ storeId: DEFAULT_ORVA_STORE_ID });
      advertisersSynced = synced.accounts.length;
    } catch (advErr) {
      advertiserSyncWarning =
        advErr instanceof Error
          ? advErr.message
          : "Connected successfully, but initial advertiser sync requires manual refresh.";
    }

    if (browserRedirect) {
      return buildSettingsRedirect(request, { status: "connected" });
    }

    const response = jsonNoStore({
      success: true,
      connection: exchanged.connection,
      advertiserIds: exchanged.advertiserIds,
      advertisersSynced,
      advertiserSyncWarning,
      redirectTo: "/dashboard/settings/?tab=tiktok&tiktok_status=connected",
    });
    clearOAuthStateCookie(response, request);
    return response;
  } catch (err) {
    if (browserRedirect) {
      const safeCode =
        err instanceof TikTokApiError && err.category === "AUTH_PERMISSION_DENIED"
          ? "invalid_state"
          : "token_exchange_failed";
      return buildSettingsRedirect(request, { status: "error", errorCode: safeCode });
    }

    const res = mapTikTokErrorToResponse(err, "API /api/integrations/tiktok/callback GET");
    clearOAuthStateCookie(res, request);
    return res;
  }
}
