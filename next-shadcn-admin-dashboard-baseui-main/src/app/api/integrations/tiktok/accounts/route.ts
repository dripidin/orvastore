/**
 * ORVA Store — TikTok Advertiser Accounts & Webhook Subscription Route (Phase B)
 * Endpoint: /api/integrations/tiktok/accounts/
 *
 * - GET:  Returns stored sanitized PublicTikTokAdAccountDto[] (or refreshes from TikTok with ?refresh=1).
 * - POST: { action: "refresh" }
 *         { action: "select", advertiserId }               -> validates ownership, active status & Lead permission (12010100)
 *         { action: "subscribe_webhook", advertiserId }    -> registers canonical server trailing-slash webhook URL
 *         { action: "unsubscribe_webhook", advertiserId }  -> unsubscribes LEAD webhook
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import {
  listStoredAdvertisers,
  manageAdvertiserWebhookSubscription,
  selectAdvertiserAccount,
  syncAuthorizedAdvertisers,
} from "@/lib/integrations/tiktok/accounts";
import { DEFAULT_ORVA_STORE_ID } from "@/lib/integrations/tiktok/types";
import {
  jsonNoStore,
  mapTikTokErrorToResponse,
  parseValidatedJsonBody,
  requireAdminRouteSession,
  resolveCanonicalAppOrigin,
} from "../_lib/route-helpers";

export const dynamic = "force-dynamic";

const accountsPostBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }).strict(),
  z
    .object({
      action: z.literal("select"),
      advertiserId: z.string().trim().min(1, "advertiserId is required.").max(64),
    })
    .strict(),
  z
    .object({
      action: z.literal("subscribe_webhook"),
      advertiserId: z.string().trim().min(1, "advertiserId is required.").max(64),
    })
    .strict(),
  z
    .object({
      action: z.literal("unsubscribe_webhook"),
      advertiserId: z.string().trim().min(1, "advertiserId is required.").max(64),
    })
    .strict(),
]);

export async function GET(request: NextRequest) {
  const auth = await requireAdminRouteSession(request);
  if (!auth.ok) return auth.response;

  const shouldRefresh = ["1", "true"].includes(
    (request.nextUrl.searchParams.get("refresh") || "").trim().toLowerCase(),
  );

  try {
    if (shouldRefresh) {
      const synced = await syncAuthorizedAdvertisers({
        storeId: DEFAULT_ORVA_STORE_ID,
      });
      return jsonNoStore({
        success: true,
        refreshed: true,
        accounts: synced.accounts,
        authorizedIds: synced.authorizedIds,
        revokedIds: synced.revokedIds,
        metadataWarning: synced.metadataWarning,
      });
    }

    const accounts = await listStoredAdvertisers(DEFAULT_ORVA_STORE_ID);
    return jsonNoStore({
      success: true,
      refreshed: false,
      accounts,
    });
  } catch (err) {
    return mapTikTokErrorToResponse(err, "API /api/integrations/tiktok/accounts GET");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminRouteSession(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseValidatedJsonBody(request, accountsPostBodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const body = parsed.data;

    if (body.action === "refresh") {
      const synced = await syncAuthorizedAdvertisers({
        storeId: DEFAULT_ORVA_STORE_ID,
      });
      return jsonNoStore({
        success: true,
        accounts: synced.accounts,
        authorizedIds: synced.authorizedIds,
        revokedIds: synced.revokedIds,
        metadataWarning: synced.metadataWarning,
      });
    }

    if (body.action === "select") {
      // Server ALWAYS verifies advertiser ownership, non-revoked status, and Lead Retrieval permission
      const selected = await selectAdvertiserAccount({
        storeId: DEFAULT_ORVA_STORE_ID,
        advertiserId: body.advertiserId,
        verifyLeadAccess: true,
      });
      return jsonNoStore({
        success: true,
        selectedAccount: selected.selectedAccount,
        leadPermissionVerified: selected.leadPermissionVerified,
      });
    }

    if (body.action === "subscribe_webhook") {
      // Canonical server-derived trailing-slash webhook URL (prevents SSRF / client URL spoofing)
      const origin = resolveCanonicalAppOrigin(request);
      const callbackUrl = `${origin}/api/integrations/tiktok/webhook/`;

      const result = await manageAdvertiserWebhookSubscription({
        storeId: DEFAULT_ORVA_STORE_ID,
        advertiserId: body.advertiserId,
        action: "subscribe",
        callbackUrl,
      });

      return jsonNoStore({
        success: true,
        supported: result.supported,
        webhookSubscribed: result.webhookSubscribed,
        subscriptionId: result.subscriptionId,
        account: result.account,
        warningMessage: result.warningMessage,
        webhookUrl: callbackUrl,
      });
    }

    // action === "unsubscribe_webhook"
    const result = await manageAdvertiserWebhookSubscription({
      storeId: DEFAULT_ORVA_STORE_ID,
      advertiserId: body.advertiserId,
      action: "unsubscribe",
    });

    return jsonNoStore({
      success: true,
      supported: result.supported,
      webhookSubscribed: result.webhookSubscribed,
      subscriptionId: result.subscriptionId,
      account: result.account,
      warningMessage: result.warningMessage,
    });
  } catch (err) {
    return mapTikTokErrorToResponse(err, "API /api/integrations/tiktok/accounts POST");
  }
}
