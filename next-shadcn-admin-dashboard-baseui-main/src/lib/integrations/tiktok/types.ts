/**
 * ORVA Store — TikTok Lead Generation Integration (Phase A1)
 * Shared TypeScript contracts, Zod validation schemas, error taxonomy,
 * and strict token-redacting Public DTO serializers.
 *
 * SERVER-ONLY MODULE: Never import into Client Components.
 */

import { z } from "zod";

// ── 1. Official TikTok Business API v1.3 Constants ───────────────────────────

export const TIKTOK_API_BASE_URL = "https://business-api.tiktok.com/open_api/v1.3";
export const TIKTOK_SANDBOX_API_BASE_URL = "https://sandbox-ads.tiktok.com/open_api/v1.3";
export const TIKTOK_OAUTH_AUTHORIZE_URL = "https://business-api.tiktok.com/portal/auth";
export const CANONICAL_ORVA_PRODUCTION_ORIGIN = "https://orva-store.com";
export const DEFAULT_TIKTOK_API_VERSION = "v1.3";
export const SUPPORTED_TIKTOK_API_VERSIONS = ["v1.3"] as const;
export const DEFAULT_ORVA_STORE_ID = "orvastore";

/**
 * Resolves and validates the configured TikTok Business API version (defaults to v1.3).
 */
export function resolveTikTokApiVersion(override?: string | null): string {
  const raw = (override ?? process.env.TIKTOK_API_VERSION ?? DEFAULT_TIKTOK_API_VERSION)
    .trim()
    .toLowerCase();
  if (!raw) return DEFAULT_TIKTOK_API_VERSION;
  const normalized = raw.startsWith("v") ? raw : `v${raw}`;
  if (!(SUPPORTED_TIKTOK_API_VERSIONS as readonly string[]).includes(normalized)) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `Unsupported TIKTOK_API_VERSION '${raw}'. Supported versions: ${SUPPORTED_TIKTOK_API_VERSIONS.join(", ")}.`,
    });
  }
  return normalized;
}

/**
 * Returns true when TIKTOK_SANDBOX_MODE is explicitly enabled on the server.
 */
export function isTikTokSandboxModeEnabled(override?: boolean): boolean {
  if (override !== undefined) return Boolean(override);
  return ["true", "1", "yes"].includes(
    (process.env.TIKTOK_SANDBOX_MODE ?? "").trim().toLowerCase(),
  );
}

/**
 * Resolves the active TikTok open API base URL (Sandbox vs Production) and validated version.
 */
export function resolveTikTokApiBaseUrl(options?: {
  baseUrl?: string;
  sandboxMode?: boolean;
  apiVersion?: string;
}): string {
  if (options?.baseUrl && options.baseUrl.trim()) {
    return options.baseUrl.trim().replace(/\/+$/, "");
  }
  const version = resolveTikTokApiVersion(options?.apiVersion);
  const sandbox = isTikTokSandboxModeEnabled(options?.sandboxMode);
  if (version === "v1.3") {
    return sandbox ? TIKTOK_SANDBOX_API_BASE_URL : TIKTOK_API_BASE_URL;
  }
  const host = sandbox ? "sandbox-ads.tiktok.com" : "business-api.tiktok.com";
  return `https://${host}/open_api/${version}`;
}

/**
 * Verified TikTok Business API permission scope IDs for Lead Management.
 * Reference: https://business-api.tiktok.com/portal/docs
 */
export const TIKTOK_REQUIRED_SCOPES = {
  LEADS_RETRIEVAL: 12010100,
  TEST_LEADS: 12020100,
} as const;

/**
 * Verified TikTok Marketing API v1.3 numeric return codes.
 */
export const TIKTOK_RETURN_CODES = {
  OK: 0,
  NO_PERMISSION: 40001,
  INVALID_PARAMETERS: 40002,
  RATE_LIMITED: 40100,
  TOKEN_INVALID_OR_EXPIRED: 40105,
  UPSTREAM_INTERNAL_ERROR: 50000,
} as const;

// ── 2. Domain Enums & Status Schemas ─────────────────────────────────────────

export const tikTokConnectionStatusSchema = z.enum([
  "connected",
  "token_expired",
  "revoked",
  "disconnected",
  "error",
]);
export type TikTokConnectionStatus = z.infer<typeof tikTokConnectionStatusSchema>;

export const tikTokFormStatusSchema = z.enum([
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
  "DELETED",
  "UNKNOWN",
]);
export type TikTokFormStatus = z.infer<typeof tikTokFormStatusSchema>;

export const tikTokDeliveryTypeSchema = z.enum(["DOMICILE", "STOP_DESK"]);
export type TikTokDeliveryType = z.infer<typeof tikTokDeliveryTypeSchema>;

export const tikTokLeadSyncStatusSchema = z.enum([
  "pending",
  "order_created",
  "lead_saved_no_order",
  "duplicate_skipped",
  "invalid_phone",
  "unmapped_form",
  "order_creation_failed",
]);
export type TikTokLeadSyncStatus = z.infer<typeof tikTokLeadSyncStatusSchema>;

export const tikTokSyncTriggerSourceSchema = z.enum([
  "manual",
  "webhook",
  "scheduled",
  "reconciliation",
]);
export type TikTokSyncTriggerSource = z.infer<typeof tikTokSyncTriggerSourceSchema>;

export const tikTokSyncRunStatusSchema = z.enum(["success", "partial", "failed"]);
export type TikTokSyncRunStatus = z.infer<typeof tikTokSyncRunStatusSchema>;

// ── 3. Error Classification & Structured Error Class ─────────────────────────

export type TikTokErrorCategory =
  | "AUTH_TOKEN_EXPIRED"
  | "AUTH_PERMISSION_DENIED"
  | "INVALID_PARAMETERS"
  | "RATE_LIMITED"
  | "UPSTREAM_SERVER_ERROR"
  | "NETWORK_ERROR"
  | "RESPONSE_VALIDATION_ERROR"
  | "ENCRYPTION_CONFIG_ERROR"
  | "DATABASE_ERROR"
  | "UNKNOWN_API_ERROR";

export interface TikTokApiErrorOptions {
  category: TikTokErrorCategory;
  message: string;
  tiktokCode?: number | null;
  httpStatus?: number | null;
  requestId?: string | null;
  retryable?: boolean;
  retryAfterMs?: number | null;
  cause?: unknown;
}

/**
 * Redacts any sensitive key names recursively before writing structured logs.
 */
const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|cookie|signature|key|phone|address)/i;
const SENSITIVE_ENV_SECRET_KEYS = [
  "TIKTOK_APP_SECRET",
  "TIKTOK_WEBHOOK_SECRET",
  "TIKTOK_TOKEN_ENCRYPTION_KEY",
  "TIKTOK_SYNC_CRON_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TELEGRAM_BOT_TOKEN",
  "ADMIN_JWT_SECRET",
  "ADMIN_PASSWORD",
  "REDEX_API_TOKEN",
  "META_CAPI_TOKEN",
] as const;

function sanitizeSensitiveString(raw: string): string {
  let clean = raw.replace(/\bBearer\s+[A-Za-z0-9._+/=-]{6,}/gi, "Bearer [REDACTED]");
  for (const envKey of SENSITIVE_ENV_SECRET_KEYS) {
    const secretVal = process.env[envKey]?.trim();
    if (secretVal && secretVal.length >= 8 && clean.includes(secretVal)) {
      clean = clean.split(secretVal).join("[REDACTED]");
    }
  }
  return clean.length > 512 ? `${clean.slice(0, 512)}...[truncated]` : clean;
}

export function redactSensitiveForLog(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || value === undefined) return value;
  if (typeof value === "string") {
    return sanitizeSensitiveString(value);
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveForLog(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = redactSensitiveForLog(v, depth + 1);
    }
  }
  return out;
}

export class TikTokApiError extends Error {
  public readonly category: TikTokErrorCategory;
  public readonly tiktokCode: number | null;
  public readonly httpStatus: number | null;
  public readonly requestId: string | null;
  public readonly retryable: boolean;
  public readonly retryAfterMs: number | null;

  constructor(options: TikTokApiErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "TikTokApiError";
    this.category = options.category;
    this.tiktokCode = options.tiktokCode ?? null;
    this.httpStatus = options.httpStatus ?? null;
    this.requestId = options.requestId ?? null;
    this.retryable = Boolean(options.retryable);
    this.retryAfterMs = options.retryAfterMs ?? null;
  }

  public toLogObject(): Record<string, unknown> {
    return {
      name: this.name,
      category: this.category,
      message: this.message,
      tiktokCode: this.tiktokCode,
      httpStatus: this.httpStatus,
      requestId: this.requestId,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
    };
  }
}

export class TikTokEncryptionConfigError extends TikTokApiError {
  constructor(message: string, cause?: unknown) {
    super({
      category: "ENCRYPTION_CONFIG_ERROR",
      message,
      retryable: false,
      cause,
    });
    this.name = "TikTokEncryptionConfigError";
  }
}

// ── 4. TikTok Business API v1.3 Response Zod Schemas ─────────────────────────

/** Standard TikTok Business API v1.3 JSON response envelope. */
export const tikTokApiEnvelopeSchema = z.object({
  code: z.number().int(),
  message: z.string().default(""),
  request_id: z.string().optional(),
  data: z.unknown().optional(),
});
export type TikTokApiEnvelope = z.infer<typeof tikTokApiEnvelopeSchema>;

/** Response payload for POST /open_api/v1.3/oauth2/access_token/ */
export const tikTokAccessTokenDataSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
  advertiser_ids: z.array(z.union([z.string(), z.number()]).transform(String)).default([]),
  scope: z.array(z.union([z.number(), z.string()])).default([]),
});
export type TikTokAccessTokenData = z.infer<typeof tikTokAccessTokenDataSchema>;

/** Item returned by GET /open_api/v1.3/oauth2/advertiser/get/ */
export const tikTokAdvertiserItemSchema = z.object({
  advertiser_id: z.union([z.string(), z.number()]).transform(String),
  advertiser_name: z.string().min(1),
});
export type TikTokAdvertiserItem = z.infer<typeof tikTokAdvertiserItemSchema>;

export const tikTokAdvertiserListDataSchema = z.object({
  list: z.array(tikTokAdvertiserItemSchema).default([]),
});

/** Form field metadata returned by GET /open_api/v1.3/page/field/get/ */
export const tikTokFormFieldSchema = z.object({
  field_id: z.string().optional(),
  field_name: z.string().min(1),
  field_type: z.string().default("TEXT"),
  required: z.boolean().default(false),
});
export type TikTokFormField = z.infer<typeof tikTokFormFieldSchema>;

/** Instant Form (Page) item returned by GET /open_api/v1.3/page/get/ */
export const tikTokInstantFormItemSchema = z.object({
  page_id: z.union([z.string(), z.number()]).transform(String),
  page_name: z.string().default("Untitled Form"),
  business_type: z.string().optional(),
  status: z.string().default("ACTIVE"),
  create_time: z.union([z.string(), z.number()]).optional(),
  modify_time: z.union([z.string(), z.number()]).optional(),
});
export type TikTokInstantFormItem = z.infer<typeof tikTokInstantFormItemSchema>;

/** Mock/Test Lead response returned by /open_api/v1.3/page/lead/mock/{create,get}/ (Scope 12020100) */
export const tikTokMockLeadDataSchema = z
  .object({
    lead_id: z.union([z.string(), z.number()]).transform(String).optional(),
    page_id: z.union([z.string(), z.number()]).transform(String).optional(),
    advertiser_id: z.union([z.string(), z.number()]).transform(String).optional(),
    create_time: z.union([z.string(), z.number()]).optional(),
    lead_data: z.unknown().optional(),
    field_data: z.unknown().optional(),
  })
  .passthrough();
export type TikTokMockLeadData = z.infer<typeof tikTokMockLeadDataSchema>;

/** Form-to-product mapping validation input (used in future admin mapping endpoints). */
export const tikTokFormProductMappingInputSchema = z.object({
  formId: z.string().trim().min(1),
  productId: z.string().uuid(),
  packId: z.string().trim().min(1),
  productName: z.string().trim().min(1),
  productPrice: z.number().nonnegative(),
  defaultWilayaCode: z.number().int().min(1).max(58).default(16),
  defaultDeliveryType: tikTokDeliveryTypeSchema.default("DOMICILE"),
  autoCreateOrder: z.boolean().default(true),
  syncEnabled: z.boolean().default(true),
  leadSourceLabel: z.string().trim().min(1).default("tiktok_ads"),
});
export type TikTokFormProductMappingInput = z.infer<typeof tikTokFormProductMappingInputSchema>;

// ── 5. Database Row Contracts & Strict Public DTOs ───────────────────────────

export interface TikTokConnectionRow {
  id: string;
  store_id: string;
  app_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_encryption_version: number;
  scopes: Array<number | string>;
  status: TikTokConnectionStatus;
  token_expires_at: string | null;
  refresh_expires_at: string | null;
  selected_advertiser_id: string | null;
  connected_by: string;
  last_error: string | null;
  connected_at: string;
  created_at: string;
  updated_at: string;
}

export interface TikTokAdAccountRow {
  id: string;
  store_id: string;
  connection_id: string;
  advertiser_id: string;
  advertiser_name: string;
  currency: string;
  timezone: string;
  account_status: string;
  is_selected: boolean;
  webhook_subscribed: boolean;
  webhook_subscription_id: string | null;
  raw_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TikTokFormRow {
  id: string;
  store_id: string;
  advertiser_id: string;
  form_id: string;
  form_name: string;
  status: TikTokFormStatus;
  fields_schema: TikTokFormField[];
  sync_enabled: boolean;
  last_synced_at: string | null;
  total_leads_imported: number;
  created_at: string;
  updated_at: string;
}

export interface TikTokFormProductMappingRow {
  id: string;
  store_id: string;
  form_id: string;
  product_id: string;
  pack_id: string;
  product_name: string;
  product_price: number;
  default_wilaya_code: number;
  default_delivery_type: TikTokDeliveryType;
  auto_create_order: boolean;
  lead_source_label: string;
  created_at: string;
  updated_at: string;
}

export interface TikTokLeadRow {
  id: string;
  store_id: string;
  external_lead_id: string;
  form_id: string;
  advertiser_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  adgroup_id: string | null;
  ad_id: string | null;
  customer_name: string | null;
  customer_phone_raw: string | null;
  customer_phone_normalized: string | null;
  phone_valid: boolean;
  wilaya_code: number | null;
  wilaya_name: string | null;
  commune_name: string | null;
  delivery_address: string | null;
  mapped_product_id: string | null;
  mapped_product_name: string | null;
  order_id: string | null;
  sync_status: TikTokLeadSyncStatus;
  retry_count: number;
  error_message: string | null;
  raw_field_data: Record<string, unknown>;
  lead_created_at: string | null;
  imported_at: string;
  created_at: string;
  updated_at: string;
}

export interface TikTokSyncLogRow {
  id: string;
  store_id: string;
  advertiser_id: string | null;
  form_id: string | null;
  trigger_source: TikTokSyncTriggerSource;
  status: TikTokSyncRunStatus;
  leads_fetched: number;
  leads_imported: number;
  orders_created: number;
  duplicates_skipped: number;
  leads_failed: number;
  duration_ms: number;
  error_message: string | null;
  details: Record<string, unknown>;
  started_at: string;
  completed_at: string;
  created_at: string;
}

/**
 * Safe browser-facing DTO for a TikTok connection.
 * Guaranteed to NEVER expose access_token_encrypted, refresh_token_encrypted,
 * or raw tokens.
 */
export interface PublicTikTokConnectionDto {
  id: string;
  storeId: string;
  appId: string;
  status: TikTokConnectionStatus;
  scopes: Array<number | string>;
  hasRefreshToken: boolean;
  tokenExpiresAt: string | null;
  refreshExpiresAt: string | null;
  selectedAdvertiserId: string | null;
  connectedBy: string;
  lastError: string | null;
  connectedAt: string;
  updatedAt: string;
}

export interface PublicTikTokAdAccountDto {
  id: string;
  advertiserId: string;
  advertiserName: string;
  currency: string;
  timezone: string;
  accountStatus: string;
  isSelected: boolean;
  webhookSubscribed: boolean;
  updatedAt: string;
}

export interface PublicTikTokFormDto {
  id: string;
  advertiserId: string;
  formId: string;
  formName: string;
  status: TikTokFormStatus;
  fields: TikTokFormField[];
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  totalLeadsImported: number;
  mapping: {
    productId: string;
    packId: string;
    productName: string;
    productPrice: number;
    defaultWilayaCode: number;
    defaultDeliveryType: TikTokDeliveryType;
    autoCreateOrder: boolean;
    leadSourceLabel: string;
  } | null;
}

export function toPublicTikTokConnectionDto(row: TikTokConnectionRow): PublicTikTokConnectionDto {
  return {
    id: row.id,
    storeId: row.store_id,
    appId: row.app_id,
    status: row.status,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    hasRefreshToken: Boolean(row.refresh_token_encrypted && row.refresh_token_encrypted.trim().length > 0),
    tokenExpiresAt: row.token_expires_at ?? null,
    refreshExpiresAt: row.refresh_expires_at ?? null,
    selectedAdvertiserId: row.selected_advertiser_id ?? null,
    connectedBy: row.connected_by,
    lastError: row.last_error ?? null,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicTikTokAdAccountDto(row: TikTokAdAccountRow): PublicTikTokAdAccountDto {
  return {
    id: row.id,
    advertiserId: row.advertiser_id,
    advertiserName: row.advertiser_name,
    currency: row.currency,
    timezone: row.timezone,
    accountStatus: row.account_status,
    isSelected: Boolean(row.is_selected),
    webhookSubscribed: Boolean(row.webhook_subscribed),
    updatedAt: row.updated_at,
  };
}
