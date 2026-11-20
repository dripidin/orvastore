/**
 * ORVA Store — TikTok Instant Forms & ORVA Catalog Product Mapping Route (Phase B)
 * Endpoint: /api/integrations/tiktok/forms/
 *
 * - GET:  Lists persisted forms + mappings (or refreshes via TikTok API with ?refresh=1)
 *         alongside live mappable products from ORVA's real Supabase catalog.
 * - POST: { action: "refresh", advertiserId? }
 *         { action: "map_product", formId, productId, ... } -> strictly rejects spoofed prices/names;
 *                                                              derives authoritative price/name/packId from DB.
 *         { action: "toggle_sync", formId, syncEnabled }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { listStoredAdvertisers } from "@/lib/integrations/tiktok/accounts";
import {
  listMappableCatalogProducts,
  listStoredFormsWithMappings,
  saveFormProductMapping,
  setFormSyncEnabled,
  syncAdvertiserInstantForms,
} from "@/lib/integrations/tiktok/forms";
import { TikTokTokenManager } from "@/lib/integrations/tiktok/token-manager";
import {
  DEFAULT_ORVA_STORE_ID,
  TikTokApiError,
  tikTokDeliveryTypeSchema,
} from "@/lib/integrations/tiktok/types";
import {
  jsonNoStore,
  mapTikTokErrorToResponse,
  parseValidatedJsonBody,
  requireAdminRouteSession,
} from "../_lib/route-helpers";

export const dynamic = "force-dynamic";

const formsPostBodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("refresh"),
      advertiserId: z.string().trim().min(1).max(64).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("map_product"),
      formId: z.string().trim().min(1, "formId is required.").max(64),
      productId: z.string().uuid("productId must be a valid ORVA product UUID."),
      defaultWilayaCode: z.number().int().min(1).max(58).optional(),
      defaultDeliveryType: tikTokDeliveryTypeSchema.optional(),
      autoCreateOrder: z.boolean().optional(),
      syncEnabled: z.boolean().optional(),
      leadSourceLabel: z.string().trim().min(1).max(100).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("toggle_sync"),
      formId: z.string().trim().min(1, "formId is required.").max(64),
      syncEnabled: z.boolean(),
    })
    .strict(),
]);

/**
 * Resolves and validates that the target advertiserId belongs to ORVA Store and is not revoked.
 */
async function resolveAuthorizedAdvertiserId(requestedId?: string | null): Promise<string> {
  const accounts = await listStoredAdvertisers(DEFAULT_ORVA_STORE_ID);
  const cleanRequested = (requestedId || "").trim();

  if (cleanRequested) {
    const found = accounts.find((acc) => acc.advertiserId === cleanRequested);
    if (!found) {
      throw new TikTokApiError({
        category: "AUTH_PERMISSION_DENIED",
        message: `Advertiser '${cleanRequested}' is not authorized for this store.`,
      });
    }
    if (found.accountStatus === "STATUS_REVOKED") {
      throw new TikTokApiError({
        category: "AUTH_PERMISSION_DENIED",
        message: `Advertiser '${cleanRequested}' access has been revoked.`,
      });
    }
    return found.advertiserId;
  }

  const tokenManager = new TikTokTokenManager();
  const conn = await tokenManager.getPublicConnection(DEFAULT_ORVA_STORE_ID);
  const selectedId = (conn?.selectedAdvertiserId || "").trim();
  if (!selectedId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "No TikTok advertiser account is selected. Select an advertiser first.",
    });
  }

  const foundSelected = accounts.find(
    (acc) => acc.advertiserId === selectedId && acc.accountStatus !== "STATUS_REVOKED",
  );
  if (!foundSelected) {
    throw new TikTokApiError({
      category: "AUTH_PERMISSION_DENIED",
      message: `Selected advertiser '${selectedId}' is unavailable or revoked.`,
    });
  }

  return foundSelected.advertiserId;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRouteSession(request);
  if (!auth.ok) return auth.response;

  const search = request.nextUrl.searchParams;
  const advertiserParam = (search.get("advertiserId") || "").trim() || undefined;
  const shouldRefresh = ["1", "true"].includes((search.get("refresh") || "").trim().toLowerCase());
  const includeCatalog = !["0", "false"].includes(
    (search.get("includeCatalog") || "1").trim().toLowerCase(),
  );

  try {
    let syncMeta: {
      createdFormIds: string[];
      updatedFormIds: string[];
      removedFormIds: string[];
      permissionWarnings: Array<{ formId: string; message: string }>;
    } | null = null;

    let forms;
    if (shouldRefresh) {
      const advertiserId = await resolveAuthorizedAdvertiserId(advertiserParam);
      const synced = await syncAdvertiserInstantForms({
        storeId: DEFAULT_ORVA_STORE_ID,
        advertiserId,
      });
      forms = synced.forms;
      syncMeta = {
        createdFormIds: synced.createdFormIds,
        updatedFormIds: synced.updatedFormIds,
        removedFormIds: synced.removedFormIds,
        permissionWarnings: synced.permissionWarnings,
      };
    } else {
      if (advertiserParam) {
        await resolveAuthorizedAdvertiserId(advertiserParam);
      }
      forms = await listStoredFormsWithMappings({
        storeId: DEFAULT_ORVA_STORE_ID,
        advertiserId: advertiserParam,
      });
    }

    const catalogProducts = includeCatalog ? await listMappableCatalogProducts() : undefined;

    return jsonNoStore({
      success: true,
      refreshed: shouldRefresh,
      forms,
      ...(catalogProducts !== undefined ? { catalogProducts } : {}),
      ...(syncMeta ? { syncMeta } : {}),
    });
  } catch (err) {
    return mapTikTokErrorToResponse(err, "API /api/integrations/tiktok/forms GET");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminRouteSession(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseValidatedJsonBody(request, formsPostBodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const body = parsed.data;

    if (body.action === "refresh") {
      const advertiserId = await resolveAuthorizedAdvertiserId(body.advertiserId);
      const synced = await syncAdvertiserInstantForms({
        storeId: DEFAULT_ORVA_STORE_ID,
        advertiserId,
      });
      return jsonNoStore({
        success: true,
        advertiserId,
        forms: synced.forms,
        createdFormIds: synced.createdFormIds,
        updatedFormIds: synced.updatedFormIds,
        removedFormIds: synced.removedFormIds,
        permissionWarnings: synced.permissionWarnings,
      });
    }

    if (body.action === "map_product") {
      // Authoritative product title, packId, and sellingPrice are always read server-side from public.products
      const updatedForm = await saveFormProductMapping({
        storeId: DEFAULT_ORVA_STORE_ID,
        formId: body.formId,
        productId: body.productId,
        defaultWilayaCode: body.defaultWilayaCode,
        defaultDeliveryType: body.defaultDeliveryType,
        autoCreateOrder: body.autoCreateOrder,
        syncEnabled: body.syncEnabled,
        leadSourceLabel: body.leadSourceLabel,
      });
      return jsonNoStore({
        success: true,
        form: updatedForm,
      });
    }

    // action === "toggle_sync"
    const updatedForm = await setFormSyncEnabled({
      storeId: DEFAULT_ORVA_STORE_ID,
      formId: body.formId,
      syncEnabled: body.syncEnabled,
      requireMapping: true,
    });
    return jsonNoStore({
      success: true,
      form: updatedForm,
    });
  } catch (err) {
    return mapTikTokErrorToResponse(err, "API /api/integrations/tiktok/forms POST");
  }
}
