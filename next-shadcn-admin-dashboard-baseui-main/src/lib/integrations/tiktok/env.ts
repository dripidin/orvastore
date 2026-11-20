/**
 * ORVA Store — Centralized TikTok Lead Generation Environment Contract & Validator
 *
 * Single server-only source of truth extending existing TIKTOK_* variables without
 * replacing existing services. Enforces:
 * - Explicit 5-mode separation: local | test | mocked_sandbox | tiktok_sandbox | production
 * - Deterministic precedence & fail-closed conflict matrix across NODE_ENV, TIKTOK_ENV, TIKTOK_SANDBOX_MODE
 * - Separation of internal configuration errors (NOT_CONFIGURED / MISCONFIGURED / READY)
 *   from external OAuth / authorization state
 * - Configurable unverified TikTok portal constraints (marked REQUIRES VERIFICATION):
 *   * TIKTOK_STRICT_NUMERIC_APP_ID (default false; advisory when non-numeric)
 *   * TIKTOK_REQUIRE_DEDICATED_WEBHOOK_SECRET (default false; advisory when sharing App Secret)
 * - Zero secret values ever emitted in validation issues or readiness payloads
 *
 * SERVER-ONLY MODULE: Never import into Client Components.
 */

import { resolveTikTokEncryptionKey } from "./token-manager";
import {
  CANONICAL_ORVA_PRODUCTION_ORIGIN,
  DEFAULT_TIKTOK_API_VERSION,
  SUPPORTED_TIKTOK_API_VERSIONS,
  TIKTOK_REQUIRED_SCOPES,
  TikTokApiError,
  resolveTikTokApiBaseUrl,
} from "./types";

export const TIKTOK_CALLBACK_PATH = "/api/integrations/tiktok/callback/";
export const TIKTOK_WEBHOOK_PATH = "/api/integrations/tiktok/webhook/";

export const DEFAULT_WEBHOOK_MAX_AGE_SECONDS = 300;
export const DEFAULT_WEBHOOK_RATE_LIMIT_MAX = 60;
export const DEFAULT_WEBHOOK_GLOBAL_RATE_LIMIT_MAX = 300;

export const TIKTOK_ENVIRONMENT_MODES = [
  "local",
  "test",
  "mocked_sandbox",
  "tiktok_sandbox",
  "production",
] as const;
export type TikTokEnvironmentMode = (typeof TIKTOK_ENVIRONMENT_MODES)[number];

export type TikTokConfigurationStatus = "NOT_CONFIGURED" | "MISCONFIGURED" | "READY";

export interface TikTokConfigurationIssue {
  key: string;
  code: string;
  message: string;
}

export interface TikTokEnvValidationOverrides {
  environmentMode?: TikTokEnvironmentMode;
  tiktokEnvRaw?: string;
  strictProduction?: boolean;
  strictNumericAppId?: boolean;
  requireDedicatedWebhookSecret?: boolean;
  appId?: string;
  appSecret?: string;
  apiVersion?: string;
  redirectUri?: string;
  webhookSecret?: string;
  encryptionKey?: string;
  cronSecret?: string;
  advertiserId?: string;
  sandboxMode?: boolean;
  sandboxModeRaw?: string;
  telegramAlertsEnabled?: string | boolean;
  webhookMaxAgeSeconds?: string | number;
  webhookRateLimitMax?: string | number;
  webhookGlobalRateLimitMax?: string | number;
  trustedIpHeader?: string;
  appUrl?: string;
  nodeEnv?: string;
}

export interface TikTokEnvironmentResolutionResult {
  valid: boolean;
  mode: TikTokEnvironmentMode;
  sandboxMode: boolean;
  externalNetworkAllowed: boolean;
  explicitMode: boolean;
  explicitNodeEnv: string;
  issues: TikTokConfigurationIssue[];
}

export interface TikTokEnvironmentValidationReport {
  environmentMode: TikTokEnvironmentMode;
  configurationStatus: TikTokConfigurationStatus;
  configured: boolean;
  productionReady: boolean;
  apiVersion: string;
  apiBaseUrl: string;
  sandboxMode: boolean;
  externalNetworkAllowed: boolean;
  requiredScopes: {
    leadsRetrieval: number;
    testLeads: number;
  };
  missingKeys: string[];
  configurationErrors: TikTokConfigurationIssue[];
  warnings: string[];
  appIdValid: boolean;
  appIdNumeric: boolean;
  appSecretValid: boolean;
  redirectUriValid: boolean;
  redirectUriHttps: boolean;
  redirectUriPathValid: boolean;
  redirectUriOriginMatchesApp: boolean;
  encryptionKeyValid: boolean;
  webhookSecretConfigured: boolean;
  webhookSecretDedicated: boolean;
  cronSecretConfigured: boolean;
  configuredAdvertiserId: string | null;
  webhookMaxAgeSeconds: number;
  webhookRateLimitMax: number;
  webhookGlobalRateLimitMax: number;
  trustedIpHeader: string | null;
  telegramAlertsOptIn: boolean;
}

const KNOWN_PLACEHOLDER_PATTERNS: RegExp[] = [
  /your[_-]?tiktok/i,
  /your[_-]?(?:app[_-]?id|app[_-]?secret|webhook[_-]?secret|encryption[_-]?key|secret|token|domain)/i,
  /replace[_-]?me/i,
  /change[_-]?me/i,
  /^placeholder/i,
  /placeholder[_-]?(?:secret|key|id|uri)/i,
  /^example(?:[_-]|$)/i,
  /example\.com/i,
  /your-domain\.com/i,
  /^dummy[_-]/i,
  /^<[^>]+>$/,
  /^x{8,}$/i,
  /^\*{8,}$/,
];

/**
 * Detects common placeholder / template literals so unconfigured example values
 * fail closed as MISCONFIGURED without echoing the input string.
 */
export function isPlaceholderSecretValue(raw: string | null | undefined): boolean {
  const trimmed = (raw || "").trim();
  if (!trimmed) return false;
  return KNOWN_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function parseOptionalBooleanFlag(
  explicit: boolean | undefined,
  rawString: string | undefined,
  keyName: string,
): { provided: boolean; valid: boolean; value: boolean | undefined; issue?: TikTokConfigurationIssue } {
  if (explicit !== undefined) {
    return { provided: true, valid: true, value: Boolean(explicit) };
  }
  const clean = (rawString ?? "").trim().toLowerCase();
  if (!clean) {
    return { provided: false, valid: true, value: undefined };
  }
  if (clean === "true" || clean === "1" || clean === "yes") {
    return { provided: true, valid: true, value: true };
  }
  if (clean === "false" || clean === "0" || clean === "no") {
    return { provided: true, valid: true, value: false };
  }
  return {
    provided: true,
    valid: false,
    value: undefined,
    issue: {
      key: keyName,
      code: `${keyName}_INVALID`,
      message: `${keyName} must be a valid boolean literal (true/false/1/0).`,
    },
  };
}

/**
 * Deterministic 5-mode precedence & fail-closed conflict resolution across
 * NODE_ENV, TIKTOK_ENV, and TIKTOK_SANDBOX_MODE.
 */
export function resolveTikTokEnvironmentMode(options?: {
  environmentMode?: TikTokEnvironmentMode;
  tiktokEnvRaw?: string;
  sandboxMode?: boolean;
  sandboxModeRaw?: string;
  nodeEnv?: string;
}): TikTokEnvironmentResolutionResult {
  const issues: TikTokConfigurationIssue[] = [];

  const rawTikTokEnv = (
    options?.environmentMode ??
    options?.tiktokEnvRaw ??
    process.env.TIKTOK_ENV ??
    ""
  )
    .trim()
    .toLowerCase();

  let parsedTikTokEnv: TikTokEnvironmentMode | undefined;
  if (rawTikTokEnv) {
    if ((TIKTOK_ENVIRONMENT_MODES as readonly string[]).includes(rawTikTokEnv)) {
      parsedTikTokEnv = rawTikTokEnv as TikTokEnvironmentMode;
    } else {
      issues.push({
        key: "TIKTOK_ENV",
        code: "TIKTOK_ENV_INVALID",
        message: `TIKTOK_ENV must be one of: ${TIKTOK_ENVIRONMENT_MODES.join(", ")}.`,
      });
    }
  }

  const sandboxFlag = parseOptionalBooleanFlag(
    options?.sandboxMode,
    options?.sandboxModeRaw ?? process.env.TIKTOK_SANDBOX_MODE,
    "TIKTOK_SANDBOX_MODE",
  );
  if (!sandboxFlag.valid && sandboxFlag.issue) {
    issues.push(sandboxFlag.issue);
  }

  const rawNodeEnv = (options?.nodeEnv ?? process.env.NODE_ENV ?? "").trim().toLowerCase();

  // Fail-closed conflict matrix (never guess when runtime flags contradict)
  if (parsedTikTokEnv === "production" && sandboxFlag.value === true) {
    issues.push({
      key: "TIKTOK_SANDBOX_MODE",
      code: "ENV_CONFLICT_PRODUCTION_WITH_SANDBOX_MODE",
      message: "Conflict: TIKTOK_ENV=production cannot be combined with TIKTOK_SANDBOX_MODE=true.",
    });
  }

  if (
    (parsedTikTokEnv === "tiktok_sandbox" || parsedTikTokEnv === "mocked_sandbox") &&
    sandboxFlag.provided &&
    sandboxFlag.value === false
  ) {
    issues.push({
      key: "TIKTOK_SANDBOX_MODE",
      code: "ENV_CONFLICT_SANDBOX_ENV_WITH_SANDBOX_DISABLED",
      message: `Conflict: TIKTOK_ENV=${parsedTikTokEnv} cannot be combined with TIKTOK_SANDBOX_MODE=false.`,
    });
  }

  if (
    rawNodeEnv === "production" &&
    (parsedTikTokEnv === "local" || parsedTikTokEnv === "test" || parsedTikTokEnv === "mocked_sandbox")
  ) {
    issues.push({
      key: "TIKTOK_ENV",
      code: "ENV_CONFLICT_NODE_PROD_WITH_NON_PROD_MODE",
      message: `Conflict: NODE_ENV=production forbids TIKTOK_ENV=${parsedTikTokEnv}.`,
    });
  }

  if (rawNodeEnv === "production" && !parsedTikTokEnv && sandboxFlag.value === true) {
    issues.push({
      key: "TIKTOK_ENV",
      code: "ENV_CONFLICT_AMBIGUOUS_SANDBOX_IN_NODE_PROD",
      message:
        "Ambiguous runtime: NODE_ENV=production with TIKTOK_SANDBOX_MODE=true requires explicit TIKTOK_ENV=tiktok_sandbox.",
    });
  }

  if (
    rawNodeEnv === "test" &&
    (parsedTikTokEnv === "production" || parsedTikTokEnv === "tiktok_sandbox")
  ) {
    issues.push({
      key: "TIKTOK_ENV",
      code: "ENV_CONFLICT_NODE_TEST_WITH_LIVE_MODE",
      message: `Conflict: NODE_ENV=test forbids live mode TIKTOK_ENV=${parsedTikTokEnv}.`,
    });
  }

  if (rawNodeEnv === "development" && parsedTikTokEnv === "production") {
    issues.push({
      key: "TIKTOK_ENV",
      code: "ENV_CONFLICT_NODE_DEV_WITH_PRODUCTION_MODE",
      message: "Conflict: NODE_ENV=development cannot run TIKTOK_ENV=production.",
    });
  }

  // Deterministic resolution order when valid (fail-safe to non-production if conflicted)
  let mode: TikTokEnvironmentMode;
  if (parsedTikTokEnv) {
    mode = parsedTikTokEnv;
  } else if (rawNodeEnv === "test") {
    mode = "test";
  } else if (sandboxFlag.value === true) {
    mode = "tiktok_sandbox";
  } else if (rawNodeEnv === "production") {
    mode = "production";
  } else {
    mode = "local";
  }

  const sandboxMode =
    mode === "tiktok_sandbox" || mode === "mocked_sandbox" || sandboxFlag.value === true;
  const externalNetworkAllowed = mode !== "test" && mode !== "mocked_sandbox";

  return {
    valid: issues.length === 0,
    mode,
    sandboxMode,
    externalNetworkAllowed,
    explicitMode: Boolean(parsedTikTokEnv),
    explicitNodeEnv: rawNodeEnv,
    issues,
  };
}

export function validateTikTokAppId(
  rawAppId: string | null | undefined,
  options?: { strictNumeric?: boolean },
): { valid: boolean; numeric: boolean; value: string; issue?: TikTokConfigurationIssue; warning?: string } {
  const value = (rawAppId || "").trim();
  if (!value) {
    return { valid: false, numeric: false, value: "" };
  }
  if (isPlaceholderSecretValue(value)) {
    return {
      valid: false,
      numeric: false,
      value,
      issue: {
        key: "TIKTOK_APP_ID",
        code: "APP_ID_PLACEHOLDER",
        message: "TIKTOK_APP_ID contains a placeholder value instead of a valid TikTok App ID.",
      },
    };
  }
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(value)) {
    return {
      valid: false,
      numeric: false,
      value,
      issue: {
        key: "TIKTOK_APP_ID",
        code: "APP_ID_INVALID_FORMAT",
        message: "TIKTOK_APP_ID must be 6-64 alphanumeric/underscore/hyphen characters with no spaces or URLs.",
      },
    };
  }
  const numeric = /^\d{8,25}$/.test(value);
  if (options?.strictNumeric && !numeric) {
    return {
      valid: false,
      numeric: false,
      value,
      issue: {
        key: "TIKTOK_APP_ID",
        code: "APP_ID_NOT_NUMERIC",
        message: "TIKTOK_APP_ID must be numeric (8-25 digits) when TIKTOK_STRICT_NUMERIC_APP_ID=true.",
      },
    };
  }
  const warning = !numeric
    ? "TIKTOK_APP_ID is non-numeric; live TikTok Developer Portal numeric App ID parity REQUIRES VERIFICATION."
    : undefined;
  return { valid: true, numeric, value, warning };
}

export function validateTikTokSecret(
  rawSecret: string | null | undefined,
  keyName: string,
  options?: { minLength?: number },
): { valid: boolean; present: boolean; value: string; issue?: TikTokConfigurationIssue } {
  const value = (rawSecret || "").trim();
  const minLength = options?.minLength ?? 16;
  if (!value) {
    return { valid: false, present: false, value: "" };
  }
  if (isPlaceholderSecretValue(value)) {
    return {
      valid: false,
      present: true,
      value,
      issue: {
        key: keyName,
        code: `${keyName}_PLACEHOLDER`,
        message: `${keyName} appears to contain a template placeholder value.`,
      },
    };
  }
  if (value.length < minLength) {
    return {
      valid: false,
      present: true,
      value,
      issue: {
        key: keyName,
        code: `${keyName}_TOO_SHORT`,
        message: `${keyName} must be at least ${minLength} characters long.`,
      },
    };
  }
  return { valid: true, present: true, value };
}

export interface RedirectUriCheckResult {
  valid: boolean;
  normalizedUri?: string;
  https: boolean;
  pathValid: boolean;
  originMatchesApp: boolean;
  reason?: string;
  code?: string;
}

export function validateTikTokCallbackUrl(
  rawUri: string | undefined | null,
  options?: {
    nodeEnv?: string;
    expectedPath?: string;
    expectedOrigin?: string | null;
    enforceOriginMatch?: boolean;
  },
): RedirectUriCheckResult {
  const trimmed = (rawUri || "").trim();
  if (!trimmed) {
    return {
      valid: false,
      https: false,
      pathValid: false,
      originMatchesApp: false,
      code: "REDIRECT_URI_MISSING",
      reason: "TIKTOK_REDIRECT_URI is required.",
    };
  }

  if (isPlaceholderSecretValue(trimmed)) {
    return {
      valid: false,
      https: false,
      pathValid: false,
      originMatchesApp: false,
      code: "REDIRECT_URI_PLACEHOLDER",
      reason: "TIKTOK_REDIRECT_URI cannot use a placeholder host or URL.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      https: false,
      pathValid: false,
      originMatchesApp: false,
      code: "REDIRECT_URI_MALFORMED",
      reason: "TIKTOK_REDIRECT_URI is not a valid absolute URL.",
    };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      valid: false,
      https: false,
      pathValid: false,
      originMatchesApp: false,
      code: "REDIRECT_URI_UNSUPPORTED_SCHEME",
      reason: `Unsupported redirect URI scheme '${parsed.protocol}'.`,
    };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      https: parsed.protocol === "https:",
      pathValid: false,
      originMatchesApp: false,
      code: "REDIRECT_URI_EMBEDDED_CREDENTIALS",
      reason: "Redirect URI must not embed credentials.",
    };
  }

  if (parsed.hash) {
    return {
      valid: false,
      https: parsed.protocol === "https:",
      pathValid: false,
      originMatchesApp: false,
      code: "REDIRECT_URI_CONTAINS_HASH",
      reason: "Redirect URI must not contain a URL fragment (#).",
    };
  }

  const nodeEnv = (options?.nodeEnv ?? process.env.NODE_ENV ?? "development").trim().toLowerCase();
  const hostLower = parsed.hostname.toLowerCase();
  const isLocalhost = hostLower === "localhost" || hostLower === "127.0.0.1";
  const https = parsed.protocol === "https:";

  if (!https && (nodeEnv === "production" || !isLocalhost)) {
    return {
      valid: false,
      https: false,
      pathValid: false,
      originMatchesApp: false,
      code: "REDIRECT_URI_HTTPS_REQUIRED",
      reason: "TIKTOK_REDIRECT_URI must use HTTPS (HTTP is permitted only for localhost in non-production).",
    };
  }

  const pathValid = options?.expectedPath ? parsed.pathname === options.expectedPath : true;
  if (!pathValid) {
    return {
      valid: false,
      https,
      pathValid: false,
      originMatchesApp: false,
      code: "REDIRECT_URI_INVALID_PATH",
      reason: `TIKTOK_REDIRECT_URI path must match '${options?.expectedPath}' (trailing slash required).`,
    };
  }

  const expectedOrigin = options?.expectedOrigin?.trim() || null;
  const originMatchesApp = expectedOrigin ? parsed.origin === expectedOrigin : true;
  if (options?.enforceOriginMatch && expectedOrigin && !originMatchesApp) {
    return {
      valid: false,
      https,
      pathValid,
      originMatchesApp: false,
      code: "REDIRECT_URI_ORIGIN_MISMATCH",
      reason: `TIKTOK_REDIRECT_URI origin '${parsed.origin}' does not match configured app origin '${expectedOrigin}'.`,
    };
  }

  return {
    valid: true,
    normalizedUri: parsed.toString(),
    https,
    pathValid,
    originMatchesApp,
  };
}

function parseBoundedInt(
  raw: string | number | undefined,
  defaultVal: number,
  minVal: number,
  maxVal: number,
  keyName: string,
): { value: number; issue?: TikTokConfigurationIssue } {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { value: defaultVal };
  }
  const num = Number(String(raw).trim());
  if (!Number.isInteger(num) || num < minVal || num > maxVal) {
    return {
      value: defaultVal,
      issue: {
        key: keyName,
        code: `${keyName}_OUT_OF_RANGE`,
        message: `${keyName} must be an integer between ${minVal} and ${maxVal}.`,
      },
    };
  }
  return { value: num };
}

export function resolveWebhookSecurityConfig(overrides?: TikTokEnvValidationOverrides): {
  mode: TikTokEnvironmentMode;
  secret: string;
  dedicatedSecretValid: boolean;
  secretMissing: boolean;
  secretInvalidReason: string | null;
  maxAgeSeconds: number;
  rateLimitMax: number;
  globalRateLimitMax: number;
  trustedIpHeader: string | null;
} {
  const envRes = resolveTikTokEnvironmentMode({
    environmentMode: overrides?.environmentMode,
    tiktokEnvRaw: overrides?.tiktokEnvRaw,
    sandboxMode: overrides?.sandboxMode,
    sandboxModeRaw: overrides?.sandboxModeRaw,
    nodeEnv: overrides?.nodeEnv,
  });

  if (!envRes.valid) {
    return {
      mode: envRes.mode,
      secret: "",
      dedicatedSecretValid: false,
      secretMissing: false,
      secretInvalidReason:
        envRes.issues[0]?.message || "Ambiguous or conflicting TikTok environment mode.",
      maxAgeSeconds: DEFAULT_WEBHOOK_MAX_AGE_SECONDS,
      rateLimitMax: DEFAULT_WEBHOOK_RATE_LIMIT_MAX,
      globalRateLimitMax: DEFAULT_WEBHOOK_GLOBAL_RATE_LIMIT_MAX,
      trustedIpHeader: null,
    };
  }

  const requireDedicatedFlag = parseOptionalBooleanFlag(
    overrides?.requireDedicatedWebhookSecret,
    process.env.TIKTOK_REQUIRE_DEDICATED_WEBHOOK_SECRET,
    "TIKTOK_REQUIRE_DEDICATED_WEBHOOK_SECRET",
  );
  const requireDedicated = requireDedicatedFlag.value === true;

  const rawWebhookSecret = (overrides?.webhookSecret ?? process.env.TIKTOK_WEBHOOK_SECRET ?? "").trim();
  const rawAppSecret = (overrides?.appSecret ?? process.env.TIKTOK_APP_SECRET ?? "").trim();

  const whCheck = validateTikTokSecret(rawWebhookSecret, "TIKTOK_WEBHOOK_SECRET", { minLength: 16 });
  const appCheck = validateTikTokSecret(rawAppSecret, "TIKTOK_APP_SECRET", { minLength: 16 });

  let activeSecret = "";
  let secretMissing = false;
  let secretInvalidReason: string | null = null;

  if (rawWebhookSecret) {
    if (whCheck.valid) {
      activeSecret = whCheck.value;
    } else {
      secretInvalidReason = whCheck.issue?.message || "Invalid TIKTOK_WEBHOOK_SECRET configuration.";
    }
  } else if (requireDedicated) {
    secretMissing = true;
    secretInvalidReason =
      "Dedicated TIKTOK_WEBHOOK_SECRET is required when TIKTOK_REQUIRE_DEDICATED_WEBHOOK_SECRET=true.";
  } else if (rawAppSecret) {
    if (appCheck.valid) {
      activeSecret = appCheck.value;
    } else {
      secretInvalidReason = appCheck.issue?.message || "Invalid fallback TIKTOK_APP_SECRET configuration.";
    }
  } else {
    secretMissing = true;
    secretInvalidReason = "TikTok webhook verification secret is not configured on the server.";
  }

  const maxAge = parseBoundedInt(
    overrides?.webhookMaxAgeSeconds ?? process.env.TIKTOK_WEBHOOK_MAX_AGE_SECONDS,
    DEFAULT_WEBHOOK_MAX_AGE_SECONDS,
    30,
    900,
    "TIKTOK_WEBHOOK_MAX_AGE_SECONDS",
  );
  const rateLimit = parseBoundedInt(
    overrides?.webhookRateLimitMax ?? process.env.TIKTOK_WEBHOOK_RATE_LIMIT_MAX,
    DEFAULT_WEBHOOK_RATE_LIMIT_MAX,
    5,
    1000,
    "TIKTOK_WEBHOOK_RATE_LIMIT_MAX",
  );
  const globalLimit = parseBoundedInt(
    overrides?.webhookGlobalRateLimitMax ?? process.env.TIKTOK_WEBHOOK_GLOBAL_RATE_LIMIT_MAX,
    DEFAULT_WEBHOOK_GLOBAL_RATE_LIMIT_MAX,
    10,
    5000,
    "TIKTOK_WEBHOOK_GLOBAL_RATE_LIMIT_MAX",
  );

  const rawTrustedHeader = (overrides?.trustedIpHeader ?? process.env.TIKTOK_TRUSTED_IP_HEADER ?? "")
    .trim()
    .toLowerCase();
  const trustedIpHeader =
    rawTrustedHeader && /^[a-z0-9-]+$/.test(rawTrustedHeader) ? rawTrustedHeader : null;

  return {
    mode: envRes.mode,
    secret: activeSecret,
    dedicatedSecretValid: whCheck.valid,
    secretMissing,
    secretInvalidReason,
    maxAgeSeconds: maxAge.value,
    rateLimitMax: rateLimit.value,
    globalRateLimitMax: globalLimit.value,
    trustedIpHeader,
  };
}

/**
 * Centralized, zero-secret environment contract validation for health/readiness endpoints
 * and startup/runtime configuration verification.
 */
export function validateTikTokEnvironment(
  overrides?: TikTokEnvValidationOverrides,
): TikTokEnvironmentValidationReport {
  const modeResolution = resolveTikTokEnvironmentMode({
    environmentMode: overrides?.environmentMode,
    tiktokEnvRaw: overrides?.tiktokEnvRaw,
    sandboxMode: overrides?.sandboxMode,
    sandboxModeRaw: overrides?.sandboxModeRaw,
    nodeEnv: overrides?.nodeEnv,
  });

  const missingKeys: string[] = [];
  const configurationErrors: TikTokConfigurationIssue[] = [...modeResolution.issues];
  const warnings: string[] = [];

  const strictNumericFlag = parseOptionalBooleanFlag(
    overrides?.strictNumericAppId,
    process.env.TIKTOK_STRICT_NUMERIC_APP_ID,
    "TIKTOK_STRICT_NUMERIC_APP_ID",
  );
  if (!strictNumericFlag.valid && strictNumericFlag.issue) {
    configurationErrors.push(strictNumericFlag.issue);
  }
  const strictNumericAppId = strictNumericFlag.value === true;

  const requireDedicatedWebhookFlag = parseOptionalBooleanFlag(
    overrides?.requireDedicatedWebhookSecret,
    process.env.TIKTOK_REQUIRE_DEDICATED_WEBHOOK_SECRET,
    "TIKTOK_REQUIRE_DEDICATED_WEBHOOK_SECRET",
  );
  if (!requireDedicatedWebhookFlag.valid && requireDedicatedWebhookFlag.issue) {
    configurationErrors.push(requireDedicatedWebhookFlag.issue);
  }
  const requireDedicatedWebhook = requireDedicatedWebhookFlag.value === true;

  // 1. Application Identity: App ID, App Secret, API Version
  const rawAppId = (overrides?.appId ?? process.env.TIKTOK_APP_ID ?? "").trim();
  if (!rawAppId) missingKeys.push("TIKTOK_APP_ID");
  const appIdCheck = validateTikTokAppId(rawAppId, { strictNumeric: strictNumericAppId });
  if (rawAppId && !appIdCheck.valid && appIdCheck.issue) {
    configurationErrors.push(appIdCheck.issue);
  } else if (appIdCheck.warning) {
    warnings.push(appIdCheck.warning);
  }

  const rawAppSecret = (overrides?.appSecret ?? process.env.TIKTOK_APP_SECRET ?? "").trim();
  if (!rawAppSecret) missingKeys.push("TIKTOK_APP_SECRET");
  const appSecretCheck = validateTikTokSecret(rawAppSecret, "TIKTOK_APP_SECRET", { minLength: 16 });
  if (rawAppSecret && !appSecretCheck.valid && appSecretCheck.issue) {
    configurationErrors.push(appSecretCheck.issue);
  }

  let apiVersion = DEFAULT_TIKTOK_API_VERSION;
  let apiBaseUrl = "https://business-api.tiktok.com/open_api/v1.3";
  const rawApiVersion = (overrides?.apiVersion ?? process.env.TIKTOK_API_VERSION ?? "").trim().toLowerCase();
  if (rawApiVersion) {
    const normalizedVer = rawApiVersion.startsWith("v") ? rawApiVersion : `v${rawApiVersion}`;
    if (!(SUPPORTED_TIKTOK_API_VERSIONS as readonly string[]).includes(normalizedVer)) {
      configurationErrors.push({
        key: "TIKTOK_API_VERSION",
        code: "API_VERSION_UNSUPPORTED",
        message: `TIKTOK_API_VERSION must be one of: ${SUPPORTED_TIKTOK_API_VERSIONS.join(", ")}.`,
      });
    } else {
      apiVersion = normalizedVer;
    }
  }
  try {
    apiBaseUrl = resolveTikTokApiBaseUrl({
      sandboxMode: modeResolution.sandboxMode,
      apiVersion,
    });
  } catch {
    // Error already captured in configurationErrors
  }

  // 2. OAuth Redirect URI + Path + Origin + Local-Dev Production Guard
  const rawRedirect = (overrides?.redirectUri ?? process.env.TIKTOK_REDIRECT_URI ?? "").trim();
  if (!rawRedirect) missingKeys.push("TIKTOK_REDIRECT_URI");

  const rawAppUrl = (
    overrides?.appUrl ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    ""
  ).trim();
  let expectedOrigin: string | null = null;
  if (rawAppUrl) {
    try {
      expectedOrigin = new URL(rawAppUrl).origin;
    } catch {
      if (modeResolution.mode === "production" || overrides?.strictProduction) {
        configurationErrors.push({
          key: "APP_URL",
          code: "APP_URL_INVALID",
          message: "APP_URL / NEXT_PUBLIC_APP_URL is not a valid URL.",
        });
      }
    }
  }

  const effectiveNodeEnvForRedirect =
    overrides?.nodeEnv ??
    (modeResolution.mode === "production" ? "production" : process.env.NODE_ENV ?? "development");

  const redirectCheck = validateTikTokCallbackUrl(rawRedirect, {
    nodeEnv: effectiveNodeEnvForRedirect,
    expectedPath: TIKTOK_CALLBACK_PATH,
    expectedOrigin,
    enforceOriginMatch: modeResolution.mode === "production" && Boolean(expectedOrigin),
  });

  if (rawRedirect && !redirectCheck.valid) {
    configurationErrors.push({
      key: "TIKTOK_REDIRECT_URI",
      code: redirectCheck.code || "REDIRECT_URI_INVALID",
      message: redirectCheck.reason || "Invalid TIKTOK_REDIRECT_URI.",
    });
  }

  // Guard local dev from accidentally pointing at live orva-store.com production endpoints
  const explicitLocalDev =
    modeResolution.mode === "local" &&
    (modeResolution.explicitNodeEnv === "development" ||
      (overrides?.environmentMode ?? process.env.TIKTOK_ENV?.trim().toLowerCase()) === "local");
  if (explicitLocalDev && rawRedirect && /orva-store\.com/i.test(rawRedirect) && !modeResolution.sandboxMode) {
    configurationErrors.push({
      key: "TIKTOK_REDIRECT_URI",
      code: "LOCAL_PRODUCTION_CREDENTIAL_RISK",
      message:
        "Local development must not point TIKTOK_REDIRECT_URI at production orva-store.com without sandbox mode.",
    });
  }

  // 3. Encryption Key (distinguish NOT_CONFIGURED vs MISCONFIGURED)
  const rawEncryptionKey = (
    overrides?.encryptionKey !== undefined
      ? overrides.encryptionKey
      : process.env.TIKTOK_TOKEN_ENCRYPTION_KEY ?? ""
  ).trim();
  let encryptionKeyValid = false;
  if (!rawEncryptionKey) {
    missingKeys.push("TIKTOK_TOKEN_ENCRYPTION_KEY");
  } else {
    try {
      resolveTikTokEncryptionKey(rawEncryptionKey);
      encryptionKeyValid = true;
    } catch (err) {
      configurationErrors.push({
        key: "TIKTOK_TOKEN_ENCRYPTION_KEY",
        code: "ENCRYPTION_KEY_INVALID",
        message:
          err instanceof Error
            ? err.message
            : "TIKTOK_TOKEN_ENCRYPTION_KEY failed 32-byte key or entropy validation.",
      });
    }
  }

  // 4. Webhooks & Rate Limiting
  const rawWebhookSecret = (overrides?.webhookSecret ?? process.env.TIKTOK_WEBHOOK_SECRET ?? "").trim();
  const webhookCheck = validateTikTokSecret(rawWebhookSecret, "TIKTOK_WEBHOOK_SECRET", { minLength: 16 });
  if (rawWebhookSecret && !webhookCheck.valid && webhookCheck.issue) {
    configurationErrors.push(webhookCheck.issue);
  }
  if (!rawWebhookSecret && requireDedicatedWebhook) {
    missingKeys.push("TIKTOK_WEBHOOK_SECRET");
    configurationErrors.push({
      key: "TIKTOK_WEBHOOK_SECRET",
      code: "WEBHOOK_SECRET_DEDICATED_REQUIRED",
      message: "Dedicated TIKTOK_WEBHOOK_SECRET is required when TIKTOK_REQUIRE_DEDICATED_WEBHOOK_SECRET=true.",
    });
  } else if (!rawWebhookSecret && appSecretCheck.valid && modeResolution.mode === "production") {
    warnings.push(
      "TIKTOK_WEBHOOK_SECRET is not set separately (falling back to TIKTOK_APP_SECRET; portal contract REQUIRES VERIFICATION).",
    );
  }

  const webhookSecretDedicated = webhookCheck.valid;
  const webhookSecretConfigured =
    webhookSecretDedicated || (!rawWebhookSecret && !requireDedicatedWebhook && appSecretCheck.valid);

  const maxAgeParsed = parseBoundedInt(
    overrides?.webhookMaxAgeSeconds ?? process.env.TIKTOK_WEBHOOK_MAX_AGE_SECONDS,
    DEFAULT_WEBHOOK_MAX_AGE_SECONDS,
    30,
    900,
    "TIKTOK_WEBHOOK_MAX_AGE_SECONDS",
  );
  if (maxAgeParsed.issue) configurationErrors.push(maxAgeParsed.issue);

  const rateLimitParsed = parseBoundedInt(
    overrides?.webhookRateLimitMax ?? process.env.TIKTOK_WEBHOOK_RATE_LIMIT_MAX,
    DEFAULT_WEBHOOK_RATE_LIMIT_MAX,
    5,
    1000,
    "TIKTOK_WEBHOOK_RATE_LIMIT_MAX",
  );
  if (rateLimitParsed.issue) configurationErrors.push(rateLimitParsed.issue);

  const globalRateLimitParsed = parseBoundedInt(
    overrides?.webhookGlobalRateLimitMax ?? process.env.TIKTOK_WEBHOOK_GLOBAL_RATE_LIMIT_MAX,
    DEFAULT_WEBHOOK_GLOBAL_RATE_LIMIT_MAX,
    10,
    5000,
    "TIKTOK_WEBHOOK_GLOBAL_RATE_LIMIT_MAX",
  );
  if (globalRateLimitParsed.issue) configurationErrors.push(globalRateLimitParsed.issue);

  const rawTrustedIpHeader = (overrides?.trustedIpHeader ?? process.env.TIKTOK_TRUSTED_IP_HEADER ?? "")
    .trim()
    .toLowerCase();
  if (rawTrustedIpHeader && !/^[a-z0-9-]+$/.test(rawTrustedIpHeader)) {
    configurationErrors.push({
      key: "TIKTOK_TRUSTED_IP_HEADER",
      code: "TRUSTED_IP_HEADER_INVALID",
      message: "TIKTOK_TRUSTED_IP_HEADER must be a valid HTTP header name (lowercase letters, digits, hyphens).",
    });
  }

  // 5. Optional Business Authorization & Scheduled Cron Secrets
  const rawAdvId = (overrides?.advertiserId ?? process.env.TIKTOK_ADVERTISER_ID ?? "").trim();
  let configuredAdvertiserId: string | null = null;
  if (rawAdvId) {
    if (isPlaceholderSecretValue(rawAdvId) || !/^\d{5,30}$/.test(rawAdvId)) {
      configurationErrors.push({
        key: "TIKTOK_ADVERTISER_ID",
        code: "ADVERTISER_ID_INVALID",
        message: "TIKTOK_ADVERTISER_ID must be a valid numeric TikTok Advertiser ID when specified.",
      });
    } else {
      configuredAdvertiserId = rawAdvId;
    }
  }

  const rawCronSecret = (overrides?.cronSecret ?? process.env.TIKTOK_SYNC_CRON_SECRET ?? "").trim();
  const cronCheck = validateTikTokSecret(rawCronSecret, "TIKTOK_SYNC_CRON_SECRET", { minLength: 16 });
  if (rawCronSecret && !cronCheck.valid && cronCheck.issue) {
    configurationErrors.push(cronCheck.issue);
  } else if (cronCheck.valid && rawCronSecret.length < 32) {
    warnings.push("TIKTOK_SYNC_CRON_SECRET is shorter than recommended 32 characters (64 hex recommended).");
  } else if (!rawCronSecret) {
    warnings.push("TIKTOK_SYNC_CRON_SECRET is unset; scheduled cron bearer sync remains disabled (fail-closed).");
  }

  // 6. Telegram Opt-In Flag (default false)
  const tgFlag = parseOptionalBooleanFlag(
    typeof overrides?.telegramAlertsEnabled === "boolean"
      ? overrides.telegramAlertsEnabled
      : undefined,
    typeof overrides?.telegramAlertsEnabled === "string"
      ? overrides.telegramAlertsEnabled
      : process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED,
    "TIKTOK_TELEGRAM_ALERTS_ENABLED",
  );
  if (!tgFlag.valid && tgFlag.issue) {
    configurationErrors.push(tgFlag.issue);
  }

  // 7. Determine overall status & backward-compatible `configured` vs strict `productionReady`
  const hasErrors = configurationErrors.length > 0;
  const hasMissing = missingKeys.length > 0;

  let configurationStatus: TikTokConfigurationStatus;
  if (hasErrors) {
    configurationStatus = "MISCONFIGURED";
  } else if (hasMissing) {
    configurationStatus = "NOT_CONFIGURED";
  } else {
    configurationStatus = "READY";
  }

  const configured =
    !hasMissing &&
    !hasErrors &&
    appIdCheck.valid &&
    appSecretCheck.valid &&
    redirectCheck.valid &&
    encryptionKeyValid;

  const productionReady =
    configured &&
    modeResolution.mode === "production" &&
    !modeResolution.sandboxMode &&
    redirectCheck.https &&
    redirectCheck.pathValid &&
    redirectCheck.originMatchesApp &&
    webhookSecretConfigured;

  if (modeResolution.mode === "production" && rawAppUrl && expectedOrigin && expectedOrigin !== CANONICAL_ORVA_PRODUCTION_ORIGIN) {
    warnings.push(
      `Configured APP_URL origin '${expectedOrigin}' differs from canonical Hostinger origin '${CANONICAL_ORVA_PRODUCTION_ORIGIN}'.`,
    );
  }

  return {
    environmentMode: modeResolution.mode,
    configurationStatus,
    configured,
    productionReady,
    apiVersion,
    apiBaseUrl,
    sandboxMode: modeResolution.sandboxMode,
    externalNetworkAllowed: modeResolution.externalNetworkAllowed,
    requiredScopes: {
      leadsRetrieval: TIKTOK_REQUIRED_SCOPES.LEADS_RETRIEVAL,
      testLeads: TIKTOK_REQUIRED_SCOPES.TEST_LEADS,
    },
    missingKeys,
    configurationErrors,
    warnings,
    appIdValid: appIdCheck.valid,
    appIdNumeric: appIdCheck.numeric,
    appSecretValid: appSecretCheck.valid,
    redirectUriValid: redirectCheck.valid,
    redirectUriHttps: redirectCheck.https,
    redirectUriPathValid: redirectCheck.pathValid,
    redirectUriOriginMatchesApp: redirectCheck.originMatchesApp,
    encryptionKeyValid,
    webhookSecretConfigured,
    webhookSecretDedicated,
    cronSecretConfigured: cronCheck.valid,
    configuredAdvertiserId,
    webhookMaxAgeSeconds: maxAgeParsed.value,
    webhookRateLimitMax: rateLimitParsed.value,
    webhookGlobalRateLimitMax: globalRateLimitParsed.value,
    trustedIpHeader: rawTrustedIpHeader && /^[a-z0-9-]+$/.test(rawTrustedIpHeader) ? rawTrustedIpHeader : null,
    telegramAlertsOptIn: tgFlag.value === true,
  };
}

/**
 * Throws a structured fail-closed TikTokApiError if environment mode is conflicted or invalid.
 */
export function assertValidTikTokEnvironmentMode(options?: {
  environmentMode?: TikTokEnvironmentMode;
  sandboxMode?: boolean;
  nodeEnv?: string;
}): TikTokEnvironmentResolutionResult {
  const res = resolveTikTokEnvironmentMode(options);
  if (!res.valid) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: res.issues[0]?.message || "Ambiguous or conflicting TikTok environment configuration.",
    });
  }
  return res;
}
