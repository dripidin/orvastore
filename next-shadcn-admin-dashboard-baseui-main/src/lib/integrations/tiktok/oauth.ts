/**
 * ORVA Store — TikTok Lead Generation OAuth 2.0 Service (Phase A2)
 *
 * Official TikTok Business API v1.3 Endpoints Verified:
 * - Authorization Portal: GET  https://business-api.tiktok.com/portal/auth
 * - Access Token / Refresh: POST https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/
 * - Token Revocation:      POST https://business-api.tiktok.com/open_api/v1.3/oauth2/revoke_token/
 *
 * Security Invariants:
 * - Fails closed on missing/invalid TIKTOK_APP_ID, TIKTOK_APP_SECRET, or TIKTOK_REDIRECT_URI.
 * - Cryptographically random 256-bit CSRF state signed with HMAC-SHA256 + timingSafeEqual.
 * - Never logs authorization codes, app secrets, access tokens, or refresh tokens.
 * - Integrates directly with Phase A1 TikTokTokenManager (AES-256-GCM at rest).
 * - Refreshes tokens ONLY when TikTok issued a refresh_token (non-speculative).
 *
 * SERVER-ONLY MODULE: Never import into Client Components.
 */

import crypto from "node:crypto";
import { TikTokApiClient } from "./client";
import {
  CANONICAL_ORVA_PRODUCTION_ORIGIN,
  TIKTOK_CALLBACK_PATH,
  type TikTokConfigurationIssue,
  type TikTokConfigurationStatus,
  type TikTokEnvValidationOverrides,
  type TikTokEnvironmentMode,
  assertValidTikTokEnvironmentMode,
  validateTikTokAppId,
  validateTikTokCallbackUrl,
  validateTikTokEnvironment,
  validateTikTokSecret,
} from "./env";
import {
  TikTokTokenManager,
  type TikTokRefreshHandler,
} from "./token-manager";
import {
  DEFAULT_ORVA_STORE_ID,
  type PublicTikTokConnectionDto,
  TIKTOK_OAUTH_AUTHORIZE_URL,
  TikTokApiError,
  tikTokAccessTokenDataSchema,
} from "./types";

export const TIKTOK_OAUTH_STATE_COOKIE_NAME = "orva_tiktok_oauth_state";
export const DEFAULT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_STATE_CLOCK_SKEW_MS = 60 * 1000; // 1 minute
const STATE_SIGNING_CONTEXT = "orva:tiktok:oauth:state:v1";

// ── 1. Configuration & Redirect URI Validation (Fail-Closed) ─────────────────

export interface TikTokOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  sandboxMode: boolean;
  environmentMode: TikTokEnvironmentMode;
}

export interface TikTokOAuthConfigOverrides {
  appId?: string;
  appSecret?: string;
  redirectUri?: string;
  sandboxMode?: boolean;
  environmentMode?: TikTokEnvironmentMode;
  nodeEnv?: string;
}

export interface RedirectUriValidationResult {
  valid: boolean;
  normalizedUri?: string;
  reason?: string;
}

/**
 * Validates OAuth / webhook callback URIs strictly to prevent open redirects or insecure transport.
 * Enforces HTTPS in production; allows http://localhost or http://127.0.0.1 only in non-production.
 */
export function validateTikTokRedirectUri(
  rawUri: string | undefined | null,
  options?: { nodeEnv?: string; expectedPath?: string; expectedOrigin?: string | null },
): RedirectUriValidationResult {
  const checked = validateTikTokCallbackUrl(rawUri, {
    nodeEnv: options?.nodeEnv,
    expectedPath: options?.expectedPath,
    expectedOrigin: options?.expectedOrigin,
  });
  return {
    valid: checked.valid,
    normalizedUri: checked.normalizedUri,
    reason: checked.reason,
  };
}

/**
 * Resolves and validates required TikTok OAuth configuration via centralized env contract.
 * Fails closed with TikTokApiError(INVALID_PARAMETERS) if any setting is missing, conflicted, or unsafe.
 */
export function resolveTikTokOAuthConfig(overrides?: TikTokOAuthConfigOverrides): TikTokOAuthConfig {
  const effectiveNodeEnvForMode =
    overrides?.environmentMode !== undefined || overrides?.nodeEnv === undefined
      ? overrides?.nodeEnv
      : process.env.NODE_ENV;

  const modeResolution = assertValidTikTokEnvironmentMode({
    environmentMode: overrides?.environmentMode,
    sandboxMode: overrides?.sandboxMode,
    nodeEnv: effectiveNodeEnvForMode,
  });

  const rawAppId = (overrides?.appId ?? process.env.TIKTOK_APP_ID ?? "").trim();
  if (!rawAppId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "TIKTOK_APP_ID is required for TikTok OAuth operations.",
    });
  }
  const appIdCheck = validateTikTokAppId(rawAppId, {
    strictNumeric: ["true", "1", "yes"].includes(
      (process.env.TIKTOK_STRICT_NUMERIC_APP_ID ?? "").trim().toLowerCase(),
    ),
  });
  if (!appIdCheck.valid) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: appIdCheck.issue?.message || "Invalid TIKTOK_APP_ID format.",
    });
  }

  const rawAppSecret = (overrides?.appSecret ?? process.env.TIKTOK_APP_SECRET ?? "").trim();
  if (!rawAppSecret) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "TIKTOK_APP_SECRET is required for TikTok OAuth operations.",
    });
  }
  const appSecretCheck = validateTikTokSecret(rawAppSecret, "TIKTOK_APP_SECRET", { minLength: 16 });
  if (!appSecretCheck.valid) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: appSecretCheck.issue?.message || "Invalid TIKTOK_APP_SECRET format.",
    });
  }

  const rawRedirectUri = (overrides?.redirectUri ?? process.env.TIKTOK_REDIRECT_URI ?? "").trim();
  const rawAppUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  let expectedOrigin: string | null = null;
  if (rawAppUrl) {
    try {
      expectedOrigin = new URL(rawAppUrl).origin;
    } catch {
      expectedOrigin = null;
    }
  }

  // In production mode, override missing or stale localhost defaults with canonical store origin
  if (modeResolution.mode === "production") {
    if (!expectedOrigin || /localhost|127\.0\.0\.1/i.test(expectedOrigin)) {
      expectedOrigin = CANONICAL_ORVA_PRODUCTION_ORIGIN;
    }
    if (expectedOrigin && expectedOrigin.startsWith("http://")) {
      expectedOrigin = expectedOrigin.replace(/^http:\/\//i, "https://");
    }
  }

  const uriCheck = validateTikTokCallbackUrl(rawRedirectUri, {
    nodeEnv: overrides?.nodeEnv ?? (modeResolution.mode === "production" ? "production" : undefined),
    expectedPath: TIKTOK_CALLBACK_PATH,
    expectedOrigin,
    enforceOriginMatch: modeResolution.mode === "production" && Boolean(expectedOrigin),
  });
  if (!uriCheck.valid || !uriCheck.normalizedUri) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: uriCheck.reason || "Invalid TIKTOK_REDIRECT_URI configuration.",
    });
  }

  const explicitLocalDev =
    modeResolution.mode === "local" &&
    (modeResolution.explicitNodeEnv === "development" ||
      (overrides?.environmentMode ?? process.env.TIKTOK_ENV?.trim().toLowerCase()) === "local");
  if (explicitLocalDev && /orva-store\.com/i.test(uriCheck.normalizedUri) && !modeResolution.sandboxMode) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message:
        "Local development must not load production orva-store.com TIKTOK_REDIRECT_URI without sandbox mode.",
    });
  }

  return {
    appId: appIdCheck.value,
    appSecret: appSecretCheck.value,
    redirectUri: uriCheck.normalizedUri,
    sandboxMode: modeResolution.sandboxMode,
    environmentMode: modeResolution.mode,
  };
}

export interface TikTokConfigurationReadiness {
  configured: boolean;
  configurationStatus: TikTokConfigurationStatus;
  environmentMode: TikTokEnvironmentMode;
  productionReady: boolean;
  apiVersion: string;
  missingKeys: string[];
  configurationErrors: TikTokConfigurationIssue[];
  warnings: string[];
  redirectUriValid: boolean;
  redirectUriHttps: boolean;
  redirectUriPathValid: boolean;
  redirectUriOriginMatchesApp: boolean;
  appIdValid: boolean;
  encryptionKeyValid: boolean;
  webhookSecretConfigured: boolean;
  webhookSecretDedicated: boolean;
  cronSecretConfigured: boolean;
  configuredAdvertiserId: string | null;
  sandboxMode: boolean;
  apiBaseUrl: string;
  telegramAlertsOptIn: boolean;
}

/**
 * Safe, zero-secret readiness check delegating to the centralized env validator.
 */
export function getTikTokConfigurationReadiness(
  overrides?: TikTokEnvValidationOverrides,
): TikTokConfigurationReadiness {
  const report = validateTikTokEnvironment(overrides);
  return {
    configured: report.configured,
    configurationStatus: report.configurationStatus,
    environmentMode: report.environmentMode,
    productionReady: report.productionReady,
    apiVersion: report.apiVersion,
    missingKeys: report.missingKeys,
    configurationErrors: report.configurationErrors,
    warnings: report.warnings,
    redirectUriValid: report.redirectUriValid,
    redirectUriHttps: report.redirectUriHttps,
    redirectUriPathValid: report.redirectUriPathValid,
    redirectUriOriginMatchesApp: report.redirectUriOriginMatchesApp,
    appIdValid: report.appIdValid,
    encryptionKeyValid: report.encryptionKeyValid,
    webhookSecretConfigured: report.webhookSecretConfigured,
    webhookSecretDedicated: report.webhookSecretDedicated,
    cronSecretConfigured: report.cronSecretConfigured,
    configuredAdvertiserId: report.configuredAdvertiserId,
    sandboxMode: report.sandboxMode,
    apiBaseUrl: report.apiBaseUrl,
    telegramAlertsOptIn: report.telegramAlertsOptIn,
  };
}

// ── 2. Cryptographically Secure OAuth CSRF State ─────────────────────────────

export interface TikTokOAuthStatePayload {
  v: 1;
  nonce: string;
  storeId: string;
  actor: string;
  iat: number;
  exp: number;
}

export interface GeneratedOAuthState {
  state: string;
  payload: TikTokOAuthStatePayload;
  expiresAt: string;
}

export interface VerifyOAuthStateResult {
  valid: boolean;
  payload?: TikTokOAuthStatePayload;
  reason?: string;
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function deriveStateSigningKey(appSecret: string): Buffer {
  return crypto.createHmac("sha256", appSecret).update(STATE_SIGNING_CONTEXT).digest();
}

/**
 * Generates an HMAC-SHA256 signed OAuth state token containing a 256-bit cryptographic nonce.
 */
export function generateOAuthState(params?: {
  storeId?: string;
  actor?: string;
  ttlMs?: number;
  nowMs?: number;
  configOverrides?: TikTokOAuthConfigOverrides;
}): GeneratedOAuthState {
  const config = resolveTikTokOAuthConfig(params?.configOverrides);
  const now = params?.nowMs ?? Date.now();
  const ttlMs = Math.max(30_000, Math.min(params?.ttlMs ?? DEFAULT_OAUTH_STATE_TTL_MS, 30 * 60 * 1000));

  const payload: TikTokOAuthStatePayload = {
    v: 1,
    nonce: crypto.randomBytes(32).toString("hex"),
    storeId: (params?.storeId || DEFAULT_ORVA_STORE_ID).trim(),
    actor: (params?.actor || "admin").trim(),
    iat: now,
    exp: now + ttlMs,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signingKey = deriveStateSigningKey(config.appSecret);
  const signature = crypto.createHmac("sha256", signingKey).update(encodedPayload).digest("base64url");

  return {
    state: `${encodedPayload}.${signature}`,
    payload,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

/**
 * Validates OAuth CSRF state integrity, constant-time HMAC signature, optional cookie binding,
 * store scope, and expiration window.
 */
export function verifyOAuthState(
  rawState: string | null | undefined,
  options?: {
    expectedCookieState?: string | null;
    expectedStoreId?: string;
    nowMs?: number;
    configOverrides?: TikTokOAuthConfigOverrides;
  },
): VerifyOAuthStateResult {
  const state = typeof rawState === "string" ? rawState.trim() : "";
  if (!state) {
    return { valid: false, reason: "Missing OAuth state parameter." };
  }

  // Optional double-submit cookie match (used by Phase B /callback route)
  if (options?.expectedCookieState !== undefined) {
    const cookieVal = typeof options.expectedCookieState === "string" ? options.expectedCookieState.trim() : "";
    if (!cookieVal || !timingSafeEqualStrings(state, cookieVal)) {
      return { valid: false, reason: "OAuth state does not match session CSRF cookie." };
    }
  }

  let config: TikTokOAuthConfig;
  try {
    config = resolveTikTokOAuthConfig(options?.configOverrides);
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : "OAuth configuration unavailable.",
    };
  }

  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: "Malformed OAuth state structure." };
  }

  const [encodedPayload, providedSig] = parts;
  const signingKey = deriveStateSigningKey(config.appSecret);
  const expectedSig = crypto.createHmac("sha256", signingKey).update(encodedPayload).digest("base64url");

  if (!timingSafeEqualStrings(providedSig, expectedSig)) {
    return { valid: false, reason: "Invalid OAuth state signature." };
  }

  let parsed: TikTokOAuthStatePayload;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TikTokOAuthStatePayload;
  } catch {
    return { valid: false, reason: "Corrupted OAuth state payload." };
  }

  if (
    !parsed ||
    parsed.v !== 1 ||
    typeof parsed.nonce !== "string" ||
    !/^[0-9a-f]{64}$/i.test(parsed.nonce) ||
    typeof parsed.storeId !== "string" ||
    !parsed.storeId.trim() ||
    typeof parsed.actor !== "string" ||
    !parsed.actor.trim() ||
    typeof parsed.iat !== "number" ||
    typeof parsed.exp !== "number" ||
    !Number.isFinite(parsed.iat) ||
    !Number.isFinite(parsed.exp) ||
    parsed.exp <= parsed.iat
  ) {
    return { valid: false, reason: "Invalid OAuth state payload fields." };
  }

  const now = options?.nowMs ?? Date.now();
  if (now > parsed.exp) {
    return { valid: false, reason: "OAuth state has expired. Please restart authorization." };
  }
  if (parsed.iat > now + MAX_STATE_CLOCK_SKEW_MS) {
    return { valid: false, reason: "OAuth state issued-at timestamp is invalid." };
  }

  if (options?.expectedStoreId && parsed.storeId !== options.expectedStoreId.trim()) {
    return { valid: false, reason: "OAuth state store scope mismatch." };
  }

  return { valid: true, payload: parsed };
}

// ── 3. Authorization URL Builder ─────────────────────────────────────────────

export interface BuildAuthorizationUrlResult {
  authorizationUrl: string;
  state: string;
  expiresAt: string;
  redirectUri: string;
}

/**
 * Generates the official TikTok Business Portal OAuth authorization redirect URL
 * alongside its signed CSRF state token.
 */
export function buildTikTokAuthorizationUrl(params?: {
  storeId?: string;
  actor?: string;
  ttlMs?: number;
  nowMs?: number;
  configOverrides?: TikTokOAuthConfigOverrides;
}): BuildAuthorizationUrlResult {
  const config = resolveTikTokOAuthConfig(params?.configOverrides);
  const generated = generateOAuthState({
    storeId: params?.storeId,
    actor: params?.actor,
    ttlMs: params?.ttlMs,
    nowMs: params?.nowMs,
    configOverrides: params?.configOverrides,
  });

  const url = new URL(TIKTOK_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("app_id", config.appId);
  url.searchParams.set("state", generated.state);
  url.searchParams.set("redirect_uri", config.redirectUri);

  return {
    authorizationUrl: url.toString(),
    state: generated.state,
    expiresAt: generated.expiresAt,
    redirectUri: config.redirectUri,
  };
}

// ── 4. Token Exchange, Conditional Refresh & Revocation ──────────────────────

function computeExpiryIso(expiresInSeconds: number | undefined, nowMs: number): string | null {
  if (!expiresInSeconds || !Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    return null;
  }
  return new Date(nowMs + expiresInSeconds * 1000).toISOString();
}

export interface ExchangeAuthCodeParams {
  authCode: string;
  state: string;
  expectedCookieState?: string | null;
  storeId?: string;
  connectedBy?: string;
  nowMs?: number;
  configOverrides?: TikTokOAuthConfigOverrides;
  client?: TikTokApiClient;
  tokenManager?: TikTokTokenManager;
}

export interface ExchangeAuthCodeResult {
  connection: PublicTikTokConnectionDto;
  advertiserIds: string[];
  scopes: Array<number | string>;
  requestId: string | null;
}

/**
 * Verifies the OAuth CSRF state, exchanges TikTok's temporary `auth_code` for tokens via
 * POST /open_api/v1.3/oauth2/access_token/, and encrypts & persists them via TikTokTokenManager.
 *
 * Returns only strictly sanitized PublicTikTokConnectionDto (never raw or encrypted tokens).
 */
export async function exchangeAuthorizationCode(
  params: ExchangeAuthCodeParams,
): Promise<ExchangeAuthCodeResult> {
  const cleanCode = (params.authCode || "").trim();
  if (!cleanCode) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "Authorization code (auth_code) is required.",
    });
  }

  const targetStoreId = (params.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const stateCheck = verifyOAuthState(params.state, {
    expectedCookieState: params.expectedCookieState,
    expectedStoreId: targetStoreId,
    nowMs: params.nowMs,
    configOverrides: params.configOverrides,
  });

  if (!stateCheck.valid || !stateCheck.payload) {
    throw new TikTokApiError({
      category: "AUTH_PERMISSION_DENIED",
      message: stateCheck.reason || "OAuth CSRF state validation failed.",
    });
  }

  const config = resolveTikTokOAuthConfig(params.configOverrides);
  const client = params.client ?? new TikTokApiClient({ sandboxMode: config.sandboxMode });
  const tokenManager = params.tokenManager ?? new TikTokTokenManager();
  const nowMs = params.nowMs ?? Date.now();

  // Official TikTok Business API v1.3 token exchange
  const response = await client.requestJson({
    method: "POST",
    path: "/oauth2/access_token/",
    body: {
      app_id: config.appId,
      secret: config.appSecret,
      auth_code: cleanCode,
      grant_type: "authorization_code",
    },
    dataSchema: tikTokAccessTokenDataSchema,
    idempotent: false,
  });

  const tokenData = response.data;
  const connection = await tokenManager.saveConnectionTokens({
    storeId: stateCheck.payload.storeId,
    appId: config.appId,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    scopes: tokenData.scope,
    tokenExpiresAt: computeExpiryIso(tokenData.expires_in, nowMs),
    refreshExpiresAt: computeExpiryIso(tokenData.refresh_token_expires_in, nowMs),
    connectedBy: (params.connectedBy || stateCheck.payload.actor || "admin").trim(),
  });

  return {
    connection,
    advertiserIds: tokenData.advertiser_ids,
    scopes: tokenData.scope,
    requestId: response.requestId,
  };
}

/**
 * Builds a TikTokRefreshHandler for TikTokTokenManager.getValidAccessToken().
 * IMPORTANT: TikTokTokenManager invokes this handler ONLY when a refresh_token was
 * actually issued by TikTok (never speculative for long-lived Marketing API tokens).
 */
export function createTikTokRefreshHandler(options?: {
  client?: TikTokApiClient;
  configOverrides?: TikTokOAuthConfigOverrides;
  nowMs?: () => number;
}): TikTokRefreshHandler {
  return async ({ appId, refreshToken }) => {
    const config = resolveTikTokOAuthConfig(options?.configOverrides);
    const client = options?.client ?? new TikTokApiClient({ sandboxMode: config.sandboxMode });
    const now = options?.nowMs ? options.nowMs() : Date.now();

    const response = await client.requestJson({
      method: "POST",
      path: "/oauth2/access_token/",
      body: {
        app_id: appId || config.appId,
        secret: config.appSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      },
      dataSchema: tikTokAccessTokenDataSchema,
      idempotent: false,
    });

    const data = response.data;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      tokenExpiresAt: computeExpiryIso(data.expires_in, now),
      refreshExpiresAt: computeExpiryIso(data.refresh_token_expires_in, now),
      scopes: data.scope.length > 0 ? data.scope : undefined,
    };
  };
}

/**
 * Explicitly revokes an active access token via POST /open_api/v1.3/oauth2/revoke_token/.
 */
export async function revokeTikTokAccessToken(params: {
  accessToken: string;
  appId?: string;
  client?: TikTokApiClient;
  configOverrides?: TikTokOAuthConfigOverrides;
}): Promise<{ revoked: boolean; requestId: string | null }> {
  const cleanToken = (params.accessToken || "").trim();
  if (!cleanToken) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "Access token is required for revocation.",
    });
  }

  const config = resolveTikTokOAuthConfig(params.configOverrides);
  const client = params.client ?? new TikTokApiClient({ sandboxMode: config.sandboxMode });

  const res = await client.requestJson({
    method: "POST",
    path: "/oauth2/revoke_token/",
    body: {
      app_id: params.appId || config.appId,
      secret: config.appSecret,
      access_token: cleanToken,
    },
    idempotent: false,
  });

  return { revoked: true, requestId: res.requestId };
}

/**
 * Disconnects the connected TikTok Business account for a store:
 * 1. Attempts upstream revocation via POST /open_api/v1.3/oauth2/revoke_token/.
 * 2. Purges local encrypted tokens & cascades connection-owned advertiser records via TikTokTokenManager.
 */
export async function disconnectTikTokAccount(params?: {
  storeId?: string;
  client?: TikTokApiClient;
  tokenManager?: TikTokTokenManager;
  configOverrides?: TikTokOAuthConfigOverrides;
}): Promise<{ disconnected: boolean; upstreamRevoked: boolean }> {
  const storeId = (params?.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const tokenManager = params?.tokenManager ?? new TikTokTokenManager();

  return tokenManager.disconnectConnection(storeId, async (plainAccessToken, appId) => {
    await revokeTikTokAccessToken({
      accessToken: plainAccessToken,
      appId,
      client: params?.client,
      configOverrides: params?.configOverrides,
    });
  });
}
