/**
 * ORVA Store — TikTok Advertiser Account & Webhook Subscription Service (Phase A2)
 *
 * Official TikTok Business API v1.3 Endpoints Verified:
 * - Authorized Advertisers: GET  /open_api/v1.3/oauth2/advertiser/get/
 * - Advertiser Metadata:    GET  /open_api/v1.3/advertiser/info/ (optional enrichment)
 * - Lead Permission Probe:  GET  /open_api/v1.3/page/get/?business_type=LEAD_GEN&page=1&page_size=1
 * - Webhook Subscribe:      POST /open_api/v1.3/subscription/subscribe/
 * - Webhook Unsubscribe:    POST /open_api/v1.3/subscription/unsubscribe/
 *
 * Security & Reliability Invariants:
 * - Never assumes every authorized advertiser permits Lead retrieval; verifies permissions explicitly.
 * - Marks upstream 40105 token errors on tiktok_connections cleanly without leaking secrets.
 * - Marks advertisers revoked upstream as STATUS_REVOKED and deselects them safely.
 * - Returns strictly sanitized PublicTikTokAdAccountDto records (zero tokens).
 *
 * SERVER-ONLY MODULE: Never import into Client Components.
 */

import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { TikTokApiClient } from "./client";
import {
  type TikTokOAuthConfigOverrides,
  createTikTokRefreshHandler,
  resolveTikTokOAuthConfig,
  validateTikTokRedirectUri,
} from "./oauth";
import { TikTokTokenManager } from "./token-manager";
import {
  DEFAULT_ORVA_STORE_ID,
  type PublicTikTokAdAccountDto,
  type TikTokAdAccountRow,
  TikTokApiError,
  tikTokAdvertiserListDataSchema,
  toPublicTikTokAdAccountDto,
} from "./types";

const tikTokAdvertiserInfoItemSchema = z.object({
  advertiser_id: z.union([z.string(), z.number()]).transform(String),
  name: z.string().optional(),
  advertiser_name: z.string().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  status: z.string().optional(),
  country: z.string().optional(),
  company: z.string().optional(),
});

const tikTokAdvertiserInfoDataSchema = z.object({
  list: z.array(tikTokAdvertiserInfoItemSchema).default([]),
});

const tikTokSubscriptionResponseSchema = z
  .object({
    subscription_id: z.union([z.string(), z.number()]).transform(String).optional(),
    subscribe_id: z.union([z.string(), z.number()]).transform(String).optional(),
  })
  .passthrough()
  .optional();

function getDb(): any {
  try {
    return getSupabaseServerClient() as any;
  } catch (err) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: "Supabase service-role client unavailable for TikTok advertiser operations (fail-closed).",
      retryable: false,
      cause: err,
    });
  }
}

/**
 * Transitions tiktok_connections status when TikTok returns 40105 / revoked token errors.
 */
async function propagateUpstreamAuthFailure(
  err: unknown,
  storeId: string,
  tokenManager: TikTokTokenManager,
): Promise<never> {
  if (err instanceof TikTokApiError && err.category === "AUTH_TOKEN_EXPIRED") {
    const nextStatus = /revok/i.test(err.message) ? "revoked" : "token_expired";
    try {
      await tokenManager.markConnectionStatus(storeId, nextStatus, err.message);
    } catch {
      // Preserve primary upstream error even if status mark fails
    }
  }
  throw err;
}

export interface TikTokAdvertiserServiceDeps {
  storeId?: string;
  client?: TikTokApiClient;
  tokenManager?: TikTokTokenManager;
  configOverrides?: TikTokOAuthConfigOverrides;
  nowMs?: () => number;
}

export interface SyncAuthorizedAdvertisersResult {
  accounts: PublicTikTokAdAccountDto[];
  authorizedIds: string[];
  revokedIds: string[];
  metadataWarning: string | null;
}

/**
 * Retrieves all TikTok advertiser accounts authorized by the active encrypted OAuth token,
 * enriches currency/timezone/status via /advertiser/info/ when permitted, upserts into
 * public.tiktok_ad_accounts, and flags previously stored accounts that were revoked upstream.
 */
export async function syncAuthorizedAdvertisers(
  deps?: TikTokAdvertiserServiceDeps,
): Promise<SyncAuthorizedAdvertisersResult> {
  const storeId = (deps?.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const client = deps?.client ?? new TikTokApiClient();
  const tokenManager = deps?.tokenManager ?? new TikTokTokenManager();
  const config = resolveTikTokOAuthConfig(deps?.configOverrides);
  const nowIso = new Date((deps?.nowMs ?? Date.now)()).toISOString();

  const { accessToken, connection } = await tokenManager.getValidAccessToken({
    storeId,
    refreshHandler: createTikTokRefreshHandler({
      client,
      configOverrides: deps?.configOverrides,
      nowMs: deps?.nowMs,
    }),
  });

  // 1. Fetch authorized advertiser list
  let authorizedList: Array<{ advertiser_id: string; advertiser_name: string }>;
  try {
    const listRes = await client.requestJson({
      method: "GET",
      path: "/oauth2/advertiser/get/",
      accessToken,
      query: {
        app_id: config.appId,
        secret: config.appSecret,
      },
      dataSchema: tikTokAdvertiserListDataSchema,
    });
    authorizedList = listRes.data.list;
  } catch (err) {
    return propagateUpstreamAuthFailure(err, storeId, tokenManager);
  }

  // 2. Optional metadata enrichment via /advertiser/info/ (non-fatal on permission denial)
  const infoMap = new Map<
    string,
    { name?: string; currency?: string; timezone?: string; status?: string; raw: Record<string, unknown> }
  >();
  let metadataWarning: string | null = null;

  if (authorizedList.length > 0) {
    try {
      const infoRes = await client.requestJson({
        method: "GET",
        path: "/advertiser/info/",
        accessToken,
        query: {
          advertiser_ids: JSON.stringify(authorizedList.map((item) => item.advertiser_id)),
        },
        dataSchema: tikTokAdvertiserInfoDataSchema,
      });

      for (const info of infoRes.data.list) {
        infoMap.set(info.advertiser_id, {
          name: info.advertiser_name || info.name,
          currency: info.currency,
          timezone: info.timezone,
          status: info.status,
          raw: {
            country: info.country ?? null,
            company: info.company ?? null,
            status: info.status ?? null,
          },
        });
      }
    } catch (infoErr) {
      if (infoErr instanceof TikTokApiError && infoErr.category === "AUTH_TOKEN_EXPIRED") {
        return propagateUpstreamAuthFailure(infoErr, storeId, tokenManager);
      }
      metadataWarning =
        infoErr instanceof Error
          ? `Advertiser metadata enrichment skipped: ${infoErr.message}`
          : "Advertiser metadata enrichment unavailable.";
    }
  }

  // 3. Load existing persisted accounts to preserve selection & webhook flags
  const db = getDb();
  const { data: existingRows, error: readErr } = await db
    .from("tiktok_ad_accounts")
    .select("*")
    .eq("store_id", storeId);

  if (readErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to read stored TikTok ad accounts: ${readErr.message}`,
      cause: readErr,
    });
  }

  const existingById = new Map<string, TikTokAdAccountRow>();
  for (const row of (existingRows ?? []) as TikTokAdAccountRow[]) {
    existingById.set(row.advertiser_id, row);
  }

  const authorizedIdSet = new Set<string>();
  const upsertPayloads: Array<Record<string, unknown>> = [];

  for (const item of authorizedList) {
    const advId = item.advertiser_id.trim();
    if (!advId) continue;
    authorizedIdSet.add(advId);

    const prev = existingById.get(advId);
    const enriched = infoMap.get(advId);
    const normalizedName = (enriched?.name || item.advertiser_name || `Advertiser ${advId}`).trim();

    upsertPayloads.push({
      store_id: storeId,
      connection_id: connection.id,
      advertiser_id: advId,
      advertiser_name: normalizedName,
      currency: (enriched?.currency || prev?.currency || "DZD").trim() || "DZD",
      timezone: (enriched?.timezone || prev?.timezone || "Africa/Algiers").trim() || "Africa/Algiers",
      account_status: (enriched?.status || "STATUS_ENABLE").trim() || "STATUS_ENABLE",
      is_selected: prev ? Boolean(prev.is_selected) : connection.selectedAdvertiserId === advId,
      webhook_subscribed: prev ? Boolean(prev.webhook_subscribed) : false,
      webhook_subscription_id: prev?.webhook_subscription_id ?? null,
      raw_metadata: enriched?.raw ?? prev?.raw_metadata ?? {},
      updated_at: nowIso,
    });
  }

  if (upsertPayloads.length > 0) {
    const { error: upsertErr } = await db
      .from("tiktok_ad_accounts")
      .upsert(upsertPayloads, { onConflict: "advertiser_id" });

    if (upsertErr) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Failed to upsert TikTok ad accounts: ${upsertErr.message}`,
        cause: upsertErr,
      });
    }
  }

  // 4. Mark previously authorized accounts that are no longer returned by TikTok as STATUS_REVOKED
  const revokedIds: string[] = [];
  for (const prev of existingById.values()) {
    if (!authorizedIdSet.has(prev.advertiser_id)) {
      revokedIds.push(prev.advertiser_id);
      await db
        .from("tiktok_ad_accounts")
        .update({
          account_status: "STATUS_REVOKED",
          is_selected: false,
          webhook_subscribed: false,
          updated_at: nowIso,
        })
        .eq("store_id", storeId)
        .eq("advertiser_id", prev.advertiser_id);

      if (connection.selectedAdvertiserId === prev.advertiser_id) {
        await db
          .from("tiktok_connections")
          .update({ selected_advertiser_id: null, updated_at: nowIso })
          .eq("store_id", storeId);
      }
    }
  }

  const accounts = await listStoredAdvertisers(storeId);
  return {
    accounts,
    authorizedIds: Array.from(authorizedIdSet),
    revokedIds,
    metadataWarning,
  };
}

/**
 * Lists sanitized advertiser accounts persisted in Supabase for a store.
 */
export async function listStoredAdvertisers(
  storeId = DEFAULT_ORVA_STORE_ID,
): Promise<PublicTikTokAdAccountDto[]> {
  const db = getDb();
  const { data, error } = await db
    .from("tiktok_ad_accounts")
    .select("*")
    .eq("store_id", storeId.trim());

  if (error) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to list stored TikTok advertisers: ${error.message}`,
      cause: error,
    });
  }

  const rows = ((data ?? []) as TikTokAdAccountRow[]).slice().sort((a, b) => {
    if (a.is_selected !== b.is_selected) return a.is_selected ? -1 : 1;
    return a.advertiser_name.localeCompare(b.advertiser_name);
  });

  return rows.map(toPublicTikTokAdAccountDto);
}

export interface LeadPermissionProbeResult {
  permitted: boolean;
  reason?: string;
  tiktokCode?: number | null;
}

/**
 * Verifies that a specific advertiser account actually grants Lead Retrieval permission
 * (scope 12010100) by issuing a lightweight read-only probe against /page/get/?business_type=LEAD_GEN.
 */
export async function verifyAdvertiserLeadPermission(
  params: TikTokAdvertiserServiceDeps & { advertiserId: string },
): Promise<LeadPermissionProbeResult> {
  const storeId = (params.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const advertiserId = (params.advertiserId || "").trim();
  if (!advertiserId) {
    return { permitted: false, reason: "advertiserId is required." };
  }

  const client = params.client ?? new TikTokApiClient();
  const tokenManager = params.tokenManager ?? new TikTokTokenManager();

  const { accessToken } = await tokenManager.getValidAccessToken({
    storeId,
    refreshHandler: createTikTokRefreshHandler({
      client,
      configOverrides: params.configOverrides,
      nowMs: params.nowMs,
    }),
  });

  try {
    await client.requestJson({
      method: "GET",
      path: "/page/get/",
      accessToken,
      query: {
        advertiser_id: advertiserId,
        business_type: "LEAD_GEN",
        page: 1,
        page_size: 1,
      },
    });
    return { permitted: true };
  } catch (err) {
    if (err instanceof TikTokApiError) {
      if (err.category === "AUTH_TOKEN_EXPIRED") {
        return propagateUpstreamAuthFailure(err, storeId, tokenManager);
      }
      if (err.category === "AUTH_PERMISSION_DENIED" || err.category === "INVALID_PARAMETERS") {
        return {
          permitted: false,
          reason: err.message || "Advertiser does not grant Leads Retrieval (12010100) access.",
          tiktokCode: err.tiktokCode,
        };
      }
    }
    throw err;
  }
}

export interface SelectAdvertiserResult {
  selectedAccount: PublicTikTokAdAccountDto;
  leadPermissionVerified: boolean;
}

/**
 * Validates and persists the active selected advertiser account for ORVA Store.
 * Refuses revoked accounts and (by default) verifies Lead Retrieval permission before selection.
 */
export async function selectAdvertiserAccount(
  params: TikTokAdvertiserServiceDeps & {
    advertiserId: string;
    verifyLeadAccess?: boolean;
  },
): Promise<SelectAdvertiserResult> {
  const storeId = (params.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const advertiserId = (params.advertiserId || "").trim();
  if (!advertiserId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "advertiserId is required to select an active TikTok ad account.",
    });
  }

  const db = getDb();
  const { data: targetRow, error: lookupErr } = await db
    .from("tiktok_ad_accounts")
    .select("*")
    .eq("store_id", storeId)
    .eq("advertiser_id", advertiserId)
    .maybeSingle();

  if (lookupErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to verify TikTok advertiser account: ${lookupErr.message}`,
      cause: lookupErr,
    });
  }

  if (!targetRow) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `TikTok advertiser '${advertiserId}' is not authorized for this store.`,
    });
  }

  const typedRow = targetRow as TikTokAdAccountRow;
  if (typedRow.account_status === "STATUS_REVOKED") {
    throw new TikTokApiError({
      category: "AUTH_PERMISSION_DENIED",
      message: `TikTok advertiser '${advertiserId}' access has been revoked and cannot be selected.`,
    });
  }

  let leadPermissionVerified = false;
  if (params.verifyLeadAccess !== false) {
    const probe = await verifyAdvertiserLeadPermission({
      storeId,
      advertiserId,
      client: params.client,
      tokenManager: params.tokenManager,
      configOverrides: params.configOverrides,
      nowMs: params.nowMs,
    });

    if (!probe.permitted) {
      throw new TikTokApiError({
        category: "AUTH_PERMISSION_DENIED",
        tiktokCode: probe.tiktokCode ?? null,
        message:
          probe.reason ||
          `Advertiser '${advertiserId}' does not have Leads Retrieval permission (scope 12010100).`,
      });
    }
    leadPermissionVerified = true;
  }

  const nowIso = new Date((params.nowMs ?? Date.now)()).toISOString();

  // Deselect all accounts for store, then select the chosen advertiser
  const { error: clearErr } = await db
    .from("tiktok_ad_accounts")
    .update({ is_selected: false, updated_at: nowIso })
    .eq("store_id", storeId);

  if (clearErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to reset advertiser selection: ${clearErr.message}`,
      cause: clearErr,
    });
  }

  const { data: updatedAccount, error: selectErr } = await db
    .from("tiktok_ad_accounts")
    .update({ is_selected: true, updated_at: nowIso })
    .eq("store_id", storeId)
    .eq("advertiser_id", advertiserId)
    .select("*")
    .single();

  if (selectErr || !updatedAccount) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to persist selected advertiser: ${selectErr?.message ?? "empty result"}`,
      cause: selectErr,
    });
  }

  const { error: connErr } = await db
    .from("tiktok_connections")
    .update({ selected_advertiser_id: advertiserId, updated_at: nowIso })
    .eq("store_id", storeId);

  if (connErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to update connection selected_advertiser_id: ${connErr.message}`,
      cause: connErr,
    });
  }

  return {
    selectedAccount: toPublicTikTokAdAccountDto(updatedAccount as TikTokAdAccountRow),
    leadPermissionVerified,
  };
}

export interface ManageWebhookSubscriptionResult {
  supported: boolean;
  webhookSubscribed: boolean;
  subscriptionId: string | null;
  account: PublicTikTokAdAccountDto;
  warningMessage: string | null;
}

/**
 * Subscribes or unsubscribes an advertiser to TikTok real-time LEAD webhooks
 * using POST /open_api/v1.3/subscription/subscribe/ & /unsubscribe/.
 *
 * Handles missing webhook approval / permission denial (40001/40002) transparently
 * without corrupting advertiser records.
 */
export async function manageAdvertiserWebhookSubscription(
  params: TikTokAdvertiserServiceDeps & {
    advertiserId: string;
    action: "subscribe" | "unsubscribe";
    callbackUrl?: string;
    subscriptionId?: string | null;
  },
): Promise<ManageWebhookSubscriptionResult> {
  const storeId = (params.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const advertiserId = (params.advertiserId || "").trim();
  if (!advertiserId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "advertiserId is required for webhook subscription management.",
    });
  }

  const db = getDb();
  const { data: existingRow, error: lookupErr } = await db
    .from("tiktok_ad_accounts")
    .select("*")
    .eq("store_id", storeId)
    .eq("advertiser_id", advertiserId)
    .maybeSingle();

  if (lookupErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to load TikTok advertiser for webhook update: ${lookupErr.message}`,
      cause: lookupErr,
    });
  }
  if (!existingRow) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `TikTok advertiser '${advertiserId}' not found for store '${storeId}'.`,
    });
  }

  const typedAccount = existingRow as TikTokAdAccountRow;
  if (typedAccount.account_status === "STATUS_REVOKED") {
    throw new TikTokApiError({
      category: "AUTH_PERMISSION_DENIED",
      message: `Cannot manage webhooks for revoked advertiser '${advertiserId}'.`,
    });
  }

  const config = resolveTikTokOAuthConfig(params.configOverrides);
  const client = params.client ?? new TikTokApiClient();
  const tokenManager = params.tokenManager ?? new TikTokTokenManager();
  const nowIso = new Date((params.nowMs ?? Date.now)()).toISOString();

  const { accessToken } = await tokenManager.getValidAccessToken({
    storeId,
    refreshHandler: createTikTokRefreshHandler({
      client,
      configOverrides: params.configOverrides,
      nowMs: params.nowMs,
    }),
  });

  if (params.action === "subscribe") {
    const uriCheck = validateTikTokRedirectUri(params.callbackUrl, {
      nodeEnv: params.configOverrides?.nodeEnv,
    });
    if (!uriCheck.valid || !uriCheck.normalizedUri) {
      throw new TikTokApiError({
        category: "INVALID_PARAMETERS",
        message: uriCheck.reason || "A valid HTTPS webhook callbackUrl is required.",
      });
    }

    try {
      const res = await client.requestJson({
        method: "POST",
        path: "/subscription/subscribe/",
        accessToken,
        body: {
          app_id: config.appId,
          secret: config.appSecret,
          subscribe_entity: "LEAD",
          callback_url: uriCheck.normalizedUri,
          subscription_detail: {
            access_token: accessToken,
            advertiser_id: advertiserId,
          },
        },
        dataSchema: tikTokSubscriptionResponseSchema,
        idempotent: false,
      });

      const subId = res.data?.subscription_id ?? res.data?.subscribe_id ?? null;
      const { data: updated, error: updateErr } = await db
        .from("tiktok_ad_accounts")
        .update({
          webhook_subscribed: true,
          webhook_subscription_id: subId,
          updated_at: nowIso,
        })
        .eq("store_id", storeId)
        .eq("advertiser_id", advertiserId)
        .select("*")
        .single();

      if (updateErr || !updated) {
        throw new TikTokApiError({
          category: "DATABASE_ERROR",
          message: `Failed to persist webhook subscription state: ${updateErr?.message ?? "empty"}`,
          cause: updateErr,
        });
      }

      return {
        supported: true,
        webhookSubscribed: true,
        subscriptionId: subId,
        account: toPublicTikTokAdAccountDto(updated as TikTokAdAccountRow),
        warningMessage: null,
      };
    } catch (err) {
      if (err instanceof TikTokApiError) {
        if (err.category === "AUTH_TOKEN_EXPIRED") {
          return propagateUpstreamAuthFailure(err, storeId, tokenManager);
        }
        if (err.category === "AUTH_PERMISSION_DENIED" || err.category === "INVALID_PARAMETERS") {
          const { data: updated } = await db
            .from("tiktok_ad_accounts")
            .update({
              webhook_subscribed: false,
              webhook_subscription_id: null,
              updated_at: nowIso,
            })
            .eq("store_id", storeId)
            .eq("advertiser_id", advertiserId)
            .select("*")
            .single();

          return {
            supported: false,
            webhookSubscribed: false,
            subscriptionId: null,
            account: toPublicTikTokAdAccountDto((updated ?? typedAccount) as TikTokAdAccountRow),
            warningMessage: err.message,
          };
        }
      }
      throw err;
    }
  }

  // action === "unsubscribe"
  const targetSubId = params.subscriptionId ?? typedAccount.webhook_subscription_id;
  try {
    await client.requestJson({
      method: "POST",
      path: "/subscription/unsubscribe/",
      accessToken,
      body: {
        app_id: config.appId,
        secret: config.appSecret,
        subscribe_entity: "LEAD",
        ...(targetSubId ? { subscription_id: targetSubId } : {}),
        subscription_detail: {
          access_token: accessToken,
          advertiser_id: advertiserId,
        },
      },
      idempotent: false,
    });
  } catch (err) {
    if (err instanceof TikTokApiError && err.category === "AUTH_TOKEN_EXPIRED") {
      return propagateUpstreamAuthFailure(err, storeId, tokenManager);
    }
    if (!(err instanceof TikTokApiError && err.category === "INVALID_PARAMETERS")) {
      throw err;
    }
  }

  const { data: updated, error: updateErr } = await db
    .from("tiktok_ad_accounts")
    .update({
      webhook_subscribed: false,
      webhook_subscription_id: null,
      updated_at: nowIso,
    })
    .eq("store_id", storeId)
    .eq("advertiser_id", advertiserId)
    .select("*")
    .single();

  if (updateErr || !updated) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to clear webhook subscription state: ${updateErr?.message ?? "empty"}`,
      cause: updateErr,
    });
  }

  return {
    supported: true,
    webhookSubscribed: false,
    subscriptionId: null,
    account: toPublicTikTokAdAccountDto(updated as TikTokAdAccountRow),
    warningMessage: null,
  };
}
