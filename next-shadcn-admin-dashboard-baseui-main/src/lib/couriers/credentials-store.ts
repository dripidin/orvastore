/**
 * Server-only Encrypted Courier Credentials Store
 * - Uses AES-256-GCM to protect courier tokens/keys in public.courier_configurations
 * - Exposes write-only public DTOs so raw tokens never reach the browser
 */

import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";

import crypto from "node:crypto";

const ENC_PREFIX = "enc:v1:";

function getEncryptionKey(): Buffer {
  const secretSource =
    process.env.COURIER_ENCRYPTION_KEY ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "orva-default-local-courier-secret-v1";
  return crypto.createHash("sha256").update(secretSource).digest();
}

export function encryptSecret(plainText: string | null | undefined): string | null {
  const clean = (plainText || "").trim();
  if (!clean) return null;
  if (clean.startsWith(ENC_PREFIX)) return clean;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(stored: string | null | undefined): string {
  const raw = (stored || "").trim();
  if (!raw) return "";
  if (!raw.startsWith(ENC_PREFIX)) {
    // Support legacy plaintext DB rows transparently until next write
    return raw;
  }

  const parts = raw.slice(ENC_PREFIX.length).split(":");
  if (parts.length !== 3) return "";
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], "base64");
    const tag = Buffer.from(parts[1], "base64");
    const ciphertext = Buffer.from(parts[2], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export interface StoredCourierConfig {
  id: string;
  name: string;
  nameAr: string;
  family: string;
  baseUrl: string;
  isActive: boolean;
  isDefault: boolean;
  supportsStopDesk: boolean;
  autoValidate: boolean;
  isExternalExcelOnly: boolean;
  originHub: string;
  trackingUrlTemplate: string | null;
  apiKey: string;
  apiToken: string;
  apiSecret: string;
  accountId: string;
  webhookSecret: string;
  storeIdentifiers: string[];
  rateLimitSnapshot: Record<string, unknown>;
  lastSyncedAt: string | null;
  config: Record<string, unknown>;
}

export interface PublicCourierConfigDTO {
  id: string;
  name: string;
  nameAr: string;
  family: string;
  baseUrl: string;
  isActive: boolean;
  isDefault: boolean;
  supportsStopDesk: boolean;
  autoValidate: boolean;
  isExternalExcelOnly: boolean;
  originHub: string;
  trackingUrlTemplate: string | null;
  hasApiKey: boolean;
  hasApiToken: boolean;
  hasApiSecret: boolean;
  hasAccountId: boolean;
  maskedTokenPreview: string | null;
  storeIdentifiers: string[];
  rateLimitSnapshot: Record<string, unknown>;
  lastSyncedAt: string | null;
}

const DEFAULT_STORE_IDENTIFIERS = ["ORVA", "ORV-", "PACK1-", "PACK2-", "PACK3-", "REROUTE-", "ORD-"];

function maskPreview(secret: string): string | null {
  if (!secret) return null;
  if (secret.length <= 6) return "••••••";
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

function normalizeRow(row: any): StoredCourierConfig {
  const id = String(row.id);
  const envFallbackToken =
    id === "redex"
      ? process.env.REDEX_API_TOKEN || process.env.ECOTRACK_API_TOKEN || ""
      : id === "yalidine"
        ? process.env.YALIDINE_API_TOKEN || ""
        : id === "zrexpress"
          ? process.env.ZR_EXPRESS_API_SECRET || ""
          : "";
  const envFallbackKey =
    id === "yalidine"
      ? process.env.YALIDINE_API_ID || ""
      : id === "zrexpress"
        ? process.env.ZR_EXPRESS_API_KEY || ""
        : "";
  const envFallbackBaseUrl = id === "redex" ? process.env.REDEX_BASE_URL || process.env.ECOTRACK_BASE_URL || "" : "";

  const apiToken = decryptSecret(row.api_token) || envFallbackToken;
  const apiKey = decryptSecret(row.api_key) || envFallbackKey;
  const apiSecret = decryptSecret(row.api_secret);
  const webhookSecret = decryptSecret(row.webhook_secret);

  return {
    id,
    name: String(row.name || id),
    nameAr: String(row.name_ar || row.name || id),
    family: String(row.family || "ecotrack"),
    baseUrl: String(row.base_url || envFallbackBaseUrl || "https://redex.ecotrack.dz").replace(/\/+$/, ""),
    isActive: Boolean(row.is_active),
    isDefault: Boolean(row.is_default),
    supportsStopDesk: Boolean(row.supports_stop_desk ?? true),
    autoValidate: Boolean(row.auto_validate ?? false),
    isExternalExcelOnly: Boolean(row.is_external_excel_only ?? false),
    originHub: String(row.origin_hub || "07"),
    trackingUrlTemplate: row.tracking_url_template || null,
    apiKey,
    apiToken,
    apiSecret,
    accountId: String(row.account_id || ""),
    webhookSecret,
    storeIdentifiers:
      Array.isArray(row.store_identifiers) && row.store_identifiers.length > 0
        ? row.store_identifiers.map(String)
        : DEFAULT_STORE_IDENTIFIERS,
    rateLimitSnapshot:
      row.rate_limit_snapshot && typeof row.rate_limit_snapshot === "object" ? row.rate_limit_snapshot : {},
    lastSyncedAt: row.last_synced_at || null,
    config: row.config && typeof row.config === "object" ? row.config : {},
  };
}

export function toPublicCourierDTO(item: StoredCourierConfig): PublicCourierConfigDTO {
  return {
    id: item.id,
    name: item.name,
    nameAr: item.nameAr,
    family: item.family,
    baseUrl: item.baseUrl,
    isActive: item.isActive,
    isDefault: item.isDefault,
    supportsStopDesk: item.supportsStopDesk,
    autoValidate: item.autoValidate,
    isExternalExcelOnly: item.isExternalExcelOnly,
    originHub: item.originHub,
    trackingUrlTemplate: item.trackingUrlTemplate,
    hasApiKey: Boolean(item.apiKey),
    hasApiToken: Boolean(item.apiToken),
    hasApiSecret: Boolean(item.apiSecret),
    hasAccountId: Boolean(item.accountId),
    maskedTokenPreview: maskPreview(item.apiToken || item.apiKey),
    storeIdentifiers: item.storeIdentifiers,
    rateLimitSnapshot: item.rateLimitSnapshot,
    lastSyncedAt: item.lastSyncedAt,
  };
}

function defaultRedexFallback(): StoredCourierConfig {
  return {
    id: "redex",
    name: "Redex Delivery DZ",
    nameAr: "ريديكس للتوصيل (Redex)",
    family: "ecotrack",
    baseUrl: (process.env.REDEX_BASE_URL || process.env.ECOTRACK_BASE_URL || "https://redex.ecotrack.dz").replace(
      /\/+$/,
      "",
    ),
    isActive: true,
    isDefault: true,
    supportsStopDesk: true,
    autoValidate: false,
    isExternalExcelOnly: false,
    originHub: "07",
    trackingUrlTemplate: "https://redex.ecotrack.dz/tracking?tracking={tracking}",
    apiKey: "",
    apiToken: (process.env.REDEX_API_TOKEN || process.env.ECOTRACK_API_TOKEN || "").trim(),
    apiSecret: "",
    accountId: "",
    webhookSecret: "",
    storeIdentifiers: DEFAULT_STORE_IDENTIFIERS,
    rateLimitSnapshot: {},
    lastSyncedAt: null,
    config: {},
  };
}

export async function listCourierConfigs(): Promise<StoredCourierConfig[]> {
  if (!isServiceRoleConfigured()) {
    return [defaultRedexFallback()];
  }
  try {
    const supabase = getSupabaseServerClient() as any;
    const { data, error } = await supabase
      .from("courier_configurations")
      .select("*")
      .order("is_default", { ascending: false })
      .order("name", { ascending: true });
    if (error || !Array.isArray(data) || data.length === 0) {
      return [defaultRedexFallback()];
    }
    return data.map(normalizeRow);
  } catch {
    return [defaultRedexFallback()];
  }
}

export async function listCourierConfigsPublic(): Promise<PublicCourierConfigDTO[]> {
  const list = await listCourierConfigs();
  return list.map(toPublicCourierDTO);
}

export async function loadCourierConfig(courierId: string): Promise<StoredCourierConfig | null> {
  const cleanId = (courierId || "redex").trim().toLowerCase();
  const all = await listCourierConfigs();
  return all.find((c) => c.id.toLowerCase() === cleanId) || (cleanId === "redex" ? defaultRedexFallback() : null);
}

export async function upsertCourierConfig(input: {
  id: string;
  name?: string;
  nameAr?: string;
  family?: string;
  baseUrl?: string;
  isActive?: boolean;
  isDefault?: boolean;
  supportsStopDesk?: boolean;
  autoValidate?: boolean;
  isExternalExcelOnly?: boolean;
  originHub?: string;
  trackingUrlTemplate?: string | null;
  apiKey?: string | null;
  apiToken?: string | null;
  apiSecret?: string | null;
  accountId?: string | null;
  webhookSecret?: string | null;
  storeIdentifiers?: string[];
}): Promise<PublicCourierConfigDTO> {
  const cleanId = input.id
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_");
  const existing = await loadCourierConfig(cleanId);

  if (isServiceRoleConfigured()) {
    const supabase = getSupabaseServerClient() as any;
    if (input.isDefault) {
      await supabase.from("courier_configurations").update({ is_default: false }).neq("id", cleanId);
    }

    const row: Record<string, unknown> = {
      id: cleanId,
      name: input.name ?? existing?.name ?? cleanId,
      name_ar: input.nameAr ?? existing?.nameAr ?? input.name ?? cleanId,
      family: input.family ?? existing?.family ?? "ecotrack",
      base_url: (input.baseUrl ?? existing?.baseUrl ?? "https://redex.ecotrack.dz").replace(/\/+$/, ""),
      is_active: input.isActive ?? existing?.isActive ?? true,
      is_default: input.isDefault ?? existing?.isDefault ?? false,
      supports_stop_desk: input.supportsStopDesk ?? existing?.supportsStopDesk ?? true,
      origin_hub: input.originHub ?? existing?.originHub ?? "07",
      updated_at: new Date().toISOString(),
    };

    // Optional migration columns (safe fallback if migration pending)
    const extendedFields: Record<string, unknown> = {
      auto_validate: input.autoValidate ?? existing?.autoValidate ?? false,
      is_external_excel_only: input.isExternalExcelOnly ?? existing?.isExternalExcelOnly ?? false,
      tracking_url_template:
        input.trackingUrlTemplate !== undefined ? input.trackingUrlTemplate : (existing?.trackingUrlTemplate ?? null),
      store_identifiers: input.storeIdentifiers ?? existing?.storeIdentifiers ?? DEFAULT_STORE_IDENTIFIERS,
    };

    if (input.apiToken !== undefined) row.api_token = encryptSecret(input.apiToken);
    else if (existing?.apiToken) row.api_token = encryptSecret(existing.apiToken);

    if (input.apiKey !== undefined) row.api_key = encryptSecret(input.apiKey);
    else if (existing?.apiKey) row.api_key = encryptSecret(existing.apiKey);

    if (input.apiSecret !== undefined) row.api_secret = encryptSecret(input.apiSecret);
    else if (existing?.apiSecret) row.api_secret = encryptSecret(existing.apiSecret);

    if (input.accountId !== undefined) row.account_id = input.accountId || null;
    if (input.webhookSecret !== undefined) row.webhook_secret = encryptSecret(input.webhookSecret);

    const attempt = await supabase
      .from("courier_configurations")
      .upsert({ ...row, ...extendedFields }, { onConflict: "id" })
      .select()
      .maybeSingle();

    if (attempt.error) {
      // Retry without extended columns if SQL migration hasn't been applied yet
      const retry = await supabase
        .from("courier_configurations")
        .upsert(row, { onConflict: "id" })
        .select()
        .maybeSingle();
      if (retry.data) return toPublicCourierDTO(normalizeRow(retry.data));
    } else if (attempt.data) {
      return toPublicCourierDTO(normalizeRow(attempt.data));
    }
  }

  return toPublicCourierDTO({
    id: cleanId,
    name: String(input.name ?? existing?.name ?? cleanId),
    nameAr: String(input.nameAr ?? existing?.nameAr ?? input.name ?? cleanId),
    family: String(input.family ?? existing?.family ?? "ecotrack"),
    baseUrl: (input.baseUrl ?? existing?.baseUrl ?? "https://redex.ecotrack.dz").replace(/\/+$/, ""),
    isActive: input.isActive ?? existing?.isActive ?? true,
    isDefault: input.isDefault ?? existing?.isDefault ?? false,
    supportsStopDesk: input.supportsStopDesk ?? existing?.supportsStopDesk ?? true,
    autoValidate: input.autoValidate ?? existing?.autoValidate ?? false,
    isExternalExcelOnly: input.isExternalExcelOnly ?? existing?.isExternalExcelOnly ?? false,
    originHub: input.originHub ?? existing?.originHub ?? "07",
    trackingUrlTemplate: input.trackingUrlTemplate ?? existing?.trackingUrlTemplate ?? null,
    apiKey: input.apiKey ?? existing?.apiKey ?? "",
    apiToken: input.apiToken ?? existing?.apiToken ?? "",
    apiSecret: input.apiSecret ?? existing?.apiSecret ?? "",
    accountId: input.accountId ?? existing?.accountId ?? "",
    webhookSecret: input.webhookSecret ?? existing?.webhookSecret ?? "",
    storeIdentifiers: input.storeIdentifiers ?? existing?.storeIdentifiers ?? DEFAULT_STORE_IDENTIFIERS,
    rateLimitSnapshot: existing?.rateLimitSnapshot ?? {},
    lastSyncedAt: existing?.lastSyncedAt ?? null,
    config: existing?.config ?? {},
  });
}

/**
 * Auto-registers an external courier encountered during Excel reconciliation when not yet saved in DB.
 */
export async function autoRegisterExternalCourier(params: {
  courierId?: string;
  courierName: string;
  family?: string;
  baseUrl?: string;
}): Promise<PublicCourierConfigDTO> {
  const cleanName = params.courierName.trim() || "External Courier";
  const slug =
    (params.courierId || cleanName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || `ext_${Date.now()}`;

  const existing = await loadCourierConfig(slug);
  if (existing) return toPublicCourierDTO(existing);

  return upsertCourierConfig({
    id: slug,
    name: cleanName,
    nameAr: cleanName,
    family: params.family || "excel_only",
    baseUrl: params.baseUrl || `https://excel-import.local/${slug}`,
    isActive: true,
    isDefault: false,
    supportsStopDesk: true,
    isExternalExcelOnly: true,
  });
}
