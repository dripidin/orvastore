/**
 * ORVA Store — TikTok Instant Forms & Product Mapping Service (Phase A2)
 *
 * Official TikTok Business API v1.3 Endpoints Verified:
 * - Instant Forms List:    GET /open_api/v1.3/page/get/?advertiser_id=...&business_type=LEAD_GEN
 * - Instant Form Fields:   GET /open_api/v1.3/page/field/get/?advertiser_id=...&page_id=...
 *
 * Product Catalog Rules:
 * - Uses the REAL ORVA server catalog (adminGetProduct / adminListProducts from @/lib/catalog/server).
 * - Never hardcodes products or trusts client-submitted prices.
 * - Preserves real PostgreSQL UUID FK relationships to public.products(id).
 * - Detects newly created AND removed forms (marks removed forms DELETED & disables sync
 *   without breaking historical lead references).
 *
 * SERVER-ONLY MODULE: Never import into Client Components.
 */

import { z } from "zod";

import { adminGetProduct, adminListProducts } from "@/lib/catalog/server";
import { packIdFromSlug } from "@/lib/catalog/types";
import type { Product } from "@/lib/repository/product-types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

import { TikTokApiClient } from "./client";
import { createTikTokRefreshHandler, type TikTokOAuthConfigOverrides } from "./oauth";
import { TikTokTokenManager } from "./token-manager";
import {
  DEFAULT_ORVA_STORE_ID,
  type PublicTikTokFormDto,
  TikTokApiError,
  type TikTokDeliveryType,
  type TikTokFormField,
  type TikTokFormProductMappingRow,
  type TikTokFormRow,
  type TikTokFormStatus,
  tikTokDeliveryTypeSchema,
  tikTokFormFieldSchema,
  tikTokInstantFormItemSchema,
} from "./types";

const tikTokPageGetDataSchema = z.object({
  list: z.array(tikTokInstantFormItemSchema).default([]),
  page_info: z
    .object({
      page: z.number().int().positive().optional(),
      page_size: z.number().int().positive().optional(),
      total_number: z.number().int().nonnegative().optional(),
      total_page: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const rawFormFieldItemSchema = z
  .object({
    field_id: z.union([z.string(), z.number()]).transform(String).optional(),
    id: z.union([z.string(), z.number()]).transform(String).optional(),
    field_name: z.string().optional(),
    name: z.string().optional(),
    label: z.string().optional(),
    question: z.string().optional(),
    field_type: z.string().optional(),
    type: z.string().optional(),
    required: z.union([z.boolean(), z.number()]).optional(),
    is_required: z.union([z.boolean(), z.number()]).optional(),
  })
  .passthrough();

const saveMappingParamsSchema = z.object({
  storeId: z.string().trim().min(1).default(DEFAULT_ORVA_STORE_ID),
  formId: z.string().trim().min(1),
  productId: z.string().uuid("ORVA productId must be a valid catalog product UUID."),
  defaultWilayaCode: z.number().int().min(1).max(69).default(16),
  defaultDeliveryType: tikTokDeliveryTypeSchema.default("DOMICILE"),
  autoCreateOrder: z.boolean().default(true),
  syncEnabled: z.boolean().optional(),
  leadSourceLabel: z.string().trim().min(1).max(100).default("tiktok_ads"),
});

function getDb(): any {
  try {
    return getSupabaseServerClient() as any;
  } catch (err) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: "Supabase service-role client unavailable for TikTok forms operations (fail-closed).",
      retryable: false,
      cause: err,
    });
  }
}

async function handleAuthError(err: unknown, storeId: string, tokenManager: TikTokTokenManager): Promise<never> {
  if (err instanceof TikTokApiError && err.category === "AUTH_TOKEN_EXPIRED") {
    const nextStatus = /revok/i.test(err.message) ? "revoked" : "token_expired";
    try {
      await tokenManager.markConnectionStatus(storeId, nextStatus, err.message);
    } catch {
      // Preserve upstream error
    }
  }
  throw err;
}

// ── 1. Normalization & Public DTO Serialization ──────────────────────────────

export function normalizeTikTokFormStatus(rawStatus: string | null | undefined): TikTokFormStatus {
  const upper = (rawStatus || "").trim().toUpperCase();
  if (!upper) return "UNKNOWN";
  if (["ACTIVE", "ENABLE", "ENABLED", "PUBLISHED", "OPEN", "STATUS_ENABLE", "ONLINE"].includes(upper)) {
    return "ACTIVE";
  }
  if (["PAUSED", "DISABLE", "DISABLED", "INACTIVE", "STATUS_DISABLE", "OFFLINE"].includes(upper)) {
    return "PAUSED";
  }
  if (["ARCHIVED", "ARCHIVE"].includes(upper)) {
    return "ARCHIVED";
  }
  if (["DELETED", "DELETE", "REMOVED", "STATUS_DELETE"].includes(upper)) {
    return "DELETED";
  }
  return "UNKNOWN";
}

/**
 * Normalizes TikTok /page/field/get/ response shapes into validated TikTokFormField[].
 */
export function normalizeTikTokFormFields(rawData: unknown): TikTokFormField[] {
  let rawItems: unknown[] = [];
  if (Array.isArray(rawData)) {
    rawItems = rawData;
  } else if (rawData && typeof rawData === "object") {
    const record = rawData as Record<string, unknown>;
    if (Array.isArray(record.list)) rawItems = record.list;
    else if (Array.isArray(record.fields)) rawItems = record.fields;
    else if (Array.isArray(record.form_fields)) rawItems = record.form_fields;
    else if (Array.isArray(record.questions)) rawItems = record.questions;
  }

  const normalized: TikTokFormField[] = [];
  const seen = new Set<string>();

  for (const rawItem of rawItems) {
    const parsed = rawFormFieldItemSchema.safeParse(rawItem);
    if (!parsed.success) continue;

    const item = parsed.data;
    const fieldName = (item.field_name || item.label || item.question || item.name || "").trim();
    if (!fieldName) continue;

    const fieldId = item.field_id || item.id || undefined;
    const dedupKey = `${fieldId ?? ""}:${fieldName.toLowerCase()}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const fieldType = (item.field_type || item.type || "TEXT").trim().toUpperCase() || "TEXT";
    const required = Boolean(item.required ?? item.is_required ?? false);

    const validated = tikTokFormFieldSchema.safeParse({
      ...(fieldId ? { field_id: fieldId } : {}),
      field_name: fieldName,
      field_type: fieldType,
      required,
    });
    if (validated.success) {
      normalized.push(validated.data);
    }
  }

  return normalized;
}

export function toPublicTikTokFormDto(
  formRow: TikTokFormRow,
  mappingRow?: TikTokFormProductMappingRow | null,
): PublicTikTokFormDto {
  return {
    id: formRow.id,
    advertiserId: formRow.advertiser_id,
    formId: formRow.form_id,
    formName: formRow.form_name,
    status: formRow.status,
    fields: Array.isArray(formRow.fields_schema) ? formRow.fields_schema : [],
    syncEnabled: Boolean(formRow.sync_enabled),
    lastSyncedAt: formRow.last_synced_at ?? null,
    totalLeadsImported: Number(formRow.total_leads_imported ?? 0),
    mapping: mappingRow
      ? {
          productId: mappingRow.product_id,
          packId: mappingRow.pack_id,
          productName: mappingRow.product_name,
          productPrice: Number(mappingRow.product_price),
          defaultWilayaCode: Number(mappingRow.default_wilaya_code),
          defaultDeliveryType: mappingRow.default_delivery_type,
          autoCreateOrder: Boolean(mappingRow.auto_create_order),
          leadSourceLabel: mappingRow.lead_source_label,
        }
      : null,
  };
}

// ── 2. Instant Forms Retrieval & Synchronization ─────────────────────────────

export async function fetchFormFieldDefinitions(params: {
  accessToken: string;
  advertiserId: string;
  pageId: string;
  client?: TikTokApiClient;
}): Promise<TikTokFormField[]> {
  const client = params.client ?? new TikTokApiClient();
  const res = await client.requestJson({
    method: "GET",
    path: "/page/field/get/",
    accessToken: params.accessToken,
    query: {
      advertiser_id: params.advertiserId,
      page_id: params.pageId,
    },
  });

  return normalizeTikTokFormFields(res.data);
}

export interface SyncAdvertiserFormsParams {
  storeId?: string;
  advertiserId: string;
  includeFields?: boolean;
  pageSize?: number;
  maxPages?: number;
  client?: TikTokApiClient;
  tokenManager?: TikTokTokenManager;
  configOverrides?: TikTokOAuthConfigOverrides;
  nowMs?: () => number;
}

export interface SyncAdvertiserFormsResult {
  forms: PublicTikTokFormDto[];
  createdFormIds: string[];
  updatedFormIds: string[];
  removedFormIds: string[];
  permissionWarnings: Array<{ formId: string; message: string }>;
}

/**
 * Retrieves all LEAD_GEN Instant Forms and their field schemas for an advertiser,
 * persists metadata in public.tiktok_forms, detects newly created & removed forms,
 * and marks removed forms as DELETED + sync_enabled=false while preserving lead history.
 */
export async function syncAdvertiserInstantForms(
  params: SyncAdvertiserFormsParams,
): Promise<SyncAdvertiserFormsResult> {
  const storeId = (params.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const advertiserId = (params.advertiserId || "").trim();
  if (!advertiserId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "advertiserId is required to synchronize TikTok Instant Forms.",
    });
  }

  const client = params.client ?? new TikTokApiClient();
  const tokenManager = params.tokenManager ?? new TikTokTokenManager();
  const includeFields = params.includeFields !== false;
  const pageSize = Math.min(Math.max(params.pageSize ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(params.maxPages ?? 20, 1), 50);
  const nowIso = new Date((params.nowMs ?? Date.now)()).toISOString();

  const { accessToken } = await tokenManager.getValidAccessToken({
    storeId,
    refreshHandler: createTikTokRefreshHandler({
      client,
      configOverrides: params.configOverrides,
      nowMs: params.nowMs,
    }),
  });

  // 1. Paginate through GET /open_api/v1.3/page/get/?business_type=LEAD_GEN
  const remoteForms: Array<{
    page_id: string;
    page_name: string;
    status: TikTokFormStatus;
  }> = [];
  const seenRemoteIds = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    let pageRes;
    try {
      pageRes = await client.requestJson({
        method: "GET",
        path: "/page/get/",
        accessToken,
        query: {
          advertiser_id: advertiserId,
          business_type: "LEAD_GEN",
          page,
          page_size: pageSize,
        },
        dataSchema: tikTokPageGetDataSchema,
      });
    } catch (err) {
      return handleAuthError(err, storeId, tokenManager);
    }

    const list = pageRes.data.list;
    for (const item of list) {
      const formId = item.page_id.trim();
      if (!formId || seenRemoteIds.has(formId)) continue;
      seenRemoteIds.add(formId);

      remoteForms.push({
        page_id: formId,
        page_name: (item.page_name || `Form ${formId}`).trim() || `Form ${formId}`,
        status: normalizeTikTokFormStatus(item.status),
      });
    }

    const totalPage = pageRes.data.page_info?.total_page;
    if (list.length === 0) {
      break;
    }
    if (totalPage !== undefined) {
      if (page >= totalPage) break;
    } else if (list.length < pageSize) {
      break;
    }
  }

  // 2. Load existing forms for this advertiser to detect created / updated / removed forms
  const db = getDb();
  const { data: existingData, error: readErr } = await db
    .from("tiktok_forms")
    .select("*")
    .eq("store_id", storeId)
    .eq("advertiser_id", advertiserId);

  if (readErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to read existing tiktok_forms: ${readErr.message}`,
      cause: readErr,
    });
  }

  const existingByFormId = new Map<string, TikTokFormRow>();
  for (const row of (existingData ?? []) as TikTokFormRow[]) {
    existingByFormId.set(row.form_id, row);
  }

  const createdFormIds: string[] = [];
  const updatedFormIds: string[] = [];
  const removedFormIds: string[] = [];
  const permissionWarnings: Array<{ formId: string; message: string }> = [];
  const upsertRows: Array<Record<string, unknown>> = [];

  for (const remote of remoteForms) {
    const prev = existingByFormId.get(remote.page_id);
    if (prev) {
      updatedFormIds.push(remote.page_id);
    } else {
      createdFormIds.push(remote.page_id);
    }

    let fieldsSchema: TikTokFormField[] = prev?.fields_schema ?? [];
    if (includeFields) {
      try {
        fieldsSchema = await fetchFormFieldDefinitions({
          accessToken,
          advertiserId,
          pageId: remote.page_id,
          client,
        });
      } catch (fieldErr) {
        if (fieldErr instanceof TikTokApiError && fieldErr.category === "AUTH_TOKEN_EXPIRED") {
          return handleAuthError(fieldErr, storeId, tokenManager);
        }
        permissionWarnings.push({
          formId: remote.page_id,
          message: fieldErr instanceof Error ? fieldErr.message : "Could not load form field definitions from TikTok.",
        });
      }
    }

    upsertRows.push({
      store_id: storeId,
      advertiser_id: advertiserId,
      form_id: remote.page_id,
      form_name: remote.page_name,
      status: remote.status,
      fields_schema: fieldsSchema,
      sync_enabled: prev ? Boolean(prev.sync_enabled) && remote.status !== "DELETED" : false,
      last_synced_at: prev?.last_synced_at ?? null,
      total_leads_imported: prev?.total_leads_imported ?? 0,
      updated_at: nowIso,
    });
  }

  if (upsertRows.length > 0) {
    const { error: upsertErr } = await db.from("tiktok_forms").upsert(upsertRows, { onConflict: "form_id" });

    if (upsertErr) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Failed to upsert tiktok_forms: ${upsertErr.message}`,
        cause: upsertErr,
      });
    }
  }

  // 3. Detect removed forms (present locally, absent from TikTok's current list)
  for (const prev of existingByFormId.values()) {
    if (!seenRemoteIds.has(prev.form_id) && prev.status !== "DELETED") {
      removedFormIds.push(prev.form_id);
      const { error: delErr } = await db
        .from("tiktok_forms")
        .update({
          status: "DELETED",
          sync_enabled: false,
          updated_at: nowIso,
        })
        .eq("store_id", storeId)
        .eq("form_id", prev.form_id);

      if (delErr) {
        throw new TikTokApiError({
          category: "DATABASE_ERROR",
          message: `Failed to mark removed TikTok form '${prev.form_id}': ${delErr.message}`,
          cause: delErr,
        });
      }
    }
  }

  const forms = await listStoredFormsWithMappings({ storeId, advertiserId });
  return {
    forms,
    createdFormIds,
    updatedFormIds,
    removedFormIds,
    permissionWarnings,
  };
}

/**
 * Reads persisted Instant Forms joined with their ORVA product mappings.
 */
export async function listStoredFormsWithMappings(params?: {
  storeId?: string;
  advertiserId?: string;
}): Promise<PublicTikTokFormDto[]> {
  const storeId = (params?.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const db = getDb();

  let formsQuery = db.from("tiktok_forms").select("*").eq("store_id", storeId);
  if (params?.advertiserId) {
    formsQuery = formsQuery.eq("advertiser_id", params.advertiserId.trim());
  }

  const { data: formRows, error: formErr } = await formsQuery;
  if (formErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to query tiktok_forms: ${formErr.message}`,
      cause: formErr,
    });
  }

  const typedForms = ((formRows ?? []) as TikTokFormRow[])
    .slice()
    .sort((a, b) => a.form_name.localeCompare(b.form_name));
  if (typedForms.length === 0) return [];

  const { data: mappingRows, error: mapErr } = await db
    .from("tiktok_form_product_mappings")
    .select("*")
    .eq("store_id", storeId);

  if (mapErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to query tiktok_form_product_mappings: ${mapErr.message}`,
      cause: mapErr,
    });
  }

  const mappingByFormId = new Map<string, TikTokFormProductMappingRow>();
  for (const row of (mappingRows ?? []) as TikTokFormProductMappingRow[]) {
    mappingByFormId.set(row.form_id, row);
  }

  return typedForms.map((form) => toPublicTikTokFormDto(form, mappingByFormId.get(form.form_id) ?? null));
}

// ── 3. Per-Form Sync Toggle & Real ORVA Catalog Product Mapping ──────────────

export interface MappableCatalogProductDto {
  id: string;
  slug: string;
  packId: string;
  title: string;
  sellingPrice: number;
  stockQuantity: number;
  status: Product["status"];
  showOutOfStock: boolean;
}

/**
 * Lists live non-archived products from ORVA's real server catalog for form mapping.
 */
export async function listMappableCatalogProducts(options?: {
  catalogListProducts?: () => Promise<Product[]>;
}): Promise<MappableCatalogProductDto[]> {
  const loader = options?.catalogListProducts ?? adminListProducts;
  const products = await loader();

  return products
    .filter((p) => p.status !== "archived" && p.sellingPrice > 0)
    .map((p) => {
      const slug = (p.slug || p.sku || p.id).trim();
      return {
        id: p.id,
        slug,
        packId: packIdFromSlug(slug),
        title: p.title,
        sellingPrice: p.sellingPrice,
        stockQuantity: p.stockQuantity,
        status: p.status,
        showOutOfStock: Boolean(p.showOutOfStock),
      };
    });
}

/**
 * Enables or disables synchronization for a specific Instant Form.
 * Refuses enabling sync on DELETED forms or (by default) unmapped forms.
 */
export async function setFormSyncEnabled(params: {
  storeId?: string;
  formId: string;
  syncEnabled: boolean;
  requireMapping?: boolean;
  nowMs?: () => number;
}): Promise<PublicTikTokFormDto> {
  const storeId = (params.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const formId = (params.formId || "").trim();
  if (!formId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "formId is required to toggle synchronization.",
    });
  }

  const db = getDb();
  const { data: formRow, error: formErr } = await db
    .from("tiktok_forms")
    .select("*")
    .eq("store_id", storeId)
    .eq("form_id", formId)
    .maybeSingle();

  if (formErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to lookup TikTok form '${formId}': ${formErr.message}`,
      cause: formErr,
    });
  }
  if (!formRow) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `TikTok form '${formId}' not found.`,
    });
  }

  const typedForm = formRow as TikTokFormRow;
  if (params.syncEnabled && typedForm.status === "DELETED") {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `Cannot enable synchronization on removed/deleted TikTok form '${formId}'.`,
    });
  }

  const { data: mappingRow, error: mapErr } = await db
    .from("tiktok_form_product_mappings")
    .select("*")
    .eq("store_id", storeId)
    .eq("form_id", formId)
    .maybeSingle();

  if (mapErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to lookup product mapping for form '${formId}': ${mapErr.message}`,
      cause: mapErr,
    });
  }

  if (params.syncEnabled && params.requireMapping !== false && !mappingRow) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `Form '${formId}' must be mapped to an ORVA catalog product before enabling synchronization.`,
    });
  }

  const nowIso = new Date((params.nowMs ?? Date.now)()).toISOString();
  const { data: updatedForm, error: updateErr } = await db
    .from("tiktok_forms")
    .update({
      sync_enabled: Boolean(params.syncEnabled),
      updated_at: nowIso,
    })
    .eq("store_id", storeId)
    .eq("form_id", formId)
    .select("*")
    .single();

  if (updateErr || !updatedForm) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to update sync_enabled for form '${formId}': ${updateErr?.message ?? "empty"}`,
      cause: updateErr,
    });
  }

  return toPublicTikTokFormDto(
    updatedForm as TikTokFormRow,
    (mappingRow as TikTokFormProductMappingRow | null) ?? null,
  );
}

export interface SaveFormProductMappingInput {
  storeId?: string;
  formId: string;
  productId: string;
  defaultWilayaCode?: number;
  defaultDeliveryType?: TikTokDeliveryType;
  autoCreateOrder?: boolean;
  syncEnabled?: boolean;
  leadSourceLabel?: string;
  catalogGetProduct?: (id: string) => Promise<Product | null>;
  nowMs?: () => number;
}

/**
 * Maps an existing TikTok Instant Form to an authoritative product from ORVA's real
 * Supabase product catalog (public.products UUID). Never trusts hardcoded products or
 * client-supplied prices; always derives packId, productName, and productPrice from the DB catalog.
 */
export async function saveFormProductMapping(input: SaveFormProductMappingInput): Promise<PublicTikTokFormDto> {
  const parsed = saveMappingParamsSchema.safeParse({
    storeId: input.storeId ?? DEFAULT_ORVA_STORE_ID,
    formId: input.formId,
    productId: input.productId,
    defaultWilayaCode: input.defaultWilayaCode ?? 16,
    defaultDeliveryType: input.defaultDeliveryType ?? "DOMICILE",
    autoCreateOrder: input.autoCreateOrder ?? true,
    syncEnabled: input.syncEnabled,
    leadSourceLabel: input.leadSourceLabel ?? "tiktok_ads",
  });

  if (!parsed.success) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: parsed.error.issues[0]?.message || "Invalid form-to-product mapping parameters.",
    });
  }

  const valid = parsed.data;
  const db = getDb();

  // 1. Verify form exists and is not DELETED
  const { data: formRow, error: formErr } = await db
    .from("tiktok_forms")
    .select("*")
    .eq("store_id", valid.storeId)
    .eq("form_id", valid.formId)
    .maybeSingle();

  if (formErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to verify TikTok form '${valid.formId}': ${formErr.message}`,
      cause: formErr,
    });
  }
  if (!formRow) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `TikTok form '${valid.formId}' does not exist.`,
    });
  }
  const typedForm = formRow as TikTokFormRow;
  if (typedForm.status === "DELETED") {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `Cannot map a removed/deleted TikTok form ('${valid.formId}').`,
    });
  }

  // 2. Validate product against real server-side ORVA product catalog (preserves UUID FK)
  const getProduct = input.catalogGetProduct ?? adminGetProduct;
  const product = await getProduct(valid.productId);

  if (!product) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `ORVA catalog product '${valid.productId}' was not found.`,
    });
  }
  if (product.status === "archived") {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `ORVA catalog product '${product.title}' is archived and cannot be mapped to a TikTok form.`,
    });
  }
  if (!Number.isFinite(product.sellingPrice) || product.sellingPrice <= 0) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `ORVA catalog product '${product.title}' has an invalid selling price.`,
    });
  }

  const productSlug = (product.slug || product.sku || product.id).trim();
  const packId = packIdFromSlug(productSlug);
  const nowIso = new Date((input.nowMs ?? Date.now)()).toISOString();

  // 3. Upsert authoritative mapping row
  const { data: savedMapping, error: mapErr } = await db
    .from("tiktok_form_product_mappings")
    .upsert(
      {
        store_id: valid.storeId,
        form_id: valid.formId,
        product_id: product.id,
        pack_id: packId,
        product_name: product.title,
        product_price: product.sellingPrice,
        default_wilaya_code: valid.defaultWilayaCode,
        default_delivery_type: valid.defaultDeliveryType,
        auto_create_order: valid.autoCreateOrder,
        lead_source_label: valid.leadSourceLabel,
        updated_at: nowIso,
      },
      { onConflict: "form_id" },
    )
    .select("*")
    .single();

  if (mapErr || !savedMapping) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to save TikTok form product mapping: ${mapErr?.message ?? "empty result"}`,
      cause: mapErr,
    });
  }

  // 4. Optionally update sync_enabled on tiktok_forms
  let finalForm = typedForm;
  if (valid.syncEnabled !== undefined && valid.syncEnabled !== typedForm.sync_enabled) {
    const { data: updatedForm, error: updateErr } = await db
      .from("tiktok_forms")
      .update({
        sync_enabled: valid.syncEnabled,
        updated_at: nowIso,
      })
      .eq("store_id", valid.storeId)
      .eq("form_id", valid.formId)
      .select("*")
      .single();

    if (updateErr || !updatedForm) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Saved mapping but failed to update sync_enabled: ${updateErr?.message ?? "empty"}`,
        cause: updateErr,
      });
    }
    finalForm = updatedForm as TikTokFormRow;
  }

  return toPublicTikTokFormDto(finalForm, savedMapping as TikTokFormProductMappingRow);
}
