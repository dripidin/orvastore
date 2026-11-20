/**
 * ORVA Store — TikTok Lead Synchronization, Retry & Audit History Route (Phase B)
 * Endpoint: /api/integrations/tiktok/sync/
 *
 * - GET:  Admin-only. Returns recent tiktok_sync_logs, lead status breakdown, and
 *         sanitized recoverable leads (customer phones strictly masked via maskPhoneForPrivacy).
 * - POST: Authorized via Admin Session (with CSRF) OR timing-safe TIKTOK_SYNC_CRON_SECRET
 *         Bearer token (cron restricted strictly to `sync_all` & `reconcile`).
 *         Supports: `sync_form`, `sync_all`, `retry_failed`, `reconcile`.
 *         Schedules optional opt-in Telegram promises via Next.js `after()` without blocking HTTP response.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { listStoredAdvertisers } from "@/lib/integrations/tiktok/accounts";
import {
  reconcileHistoricalLeads,
  retryFailedTikTokLeads,
  syncEnabledForms,
  syncFormLeads,
} from "@/lib/integrations/tiktok/sync";
import { TikTokTokenManager } from "@/lib/integrations/tiktok/token-manager";
import {
  DEFAULT_ORVA_STORE_ID,
  TikTokApiError,
  type TikTokFormRow,
  type TikTokLeadRow,
  type TikTokSyncLogRow,
} from "@/lib/integrations/tiktok/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { maskPhoneForPrivacy } from "@/lib/types/checkout";
import {
  jsonNoStore,
  mapTikTokErrorToResponse,
  parseValidatedJsonBody,
  requireAdminRouteSession,
  sanitizeSyncSummaryForJson,
  scheduleNonBlockingTasks,
  verifyCronBearerSecret,
} from "../_lib/route-helpers";

export const dynamic = "force-dynamic";

const syncPostBodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("sync_form"),
      advertiserId: z.string().trim().min(1).max(64).optional(),
      formId: z.string().trim().min(1, "formId is required.").max(64),
    })
    .strict(),
  z
    .object({
      action: z.literal("sync_all"),
      advertiserId: z.string().trim().min(1).max(64).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("retry_failed"),
      leadIds: z.array(z.string().trim().min(1).max(128)).max(100).optional(),
      maxRetries: z.number().int().min(1).max(10).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("reconcile"),
      advertiserId: z.string().trim().min(1).max(64).optional(),
      formIds: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
      lookbackDays: z.number().int().min(1).max(90).optional(),
    })
    .strict(),
]);

function getDb(): any {
  try {
    return getSupabaseServerClient() as any;
  } catch (err) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: "Supabase service-role client unavailable for TikTok sync operations.",
      cause: err,
    });
  }
}

async function resolveAndValidateAdvertiserId(requestedId?: string): Promise<string> {
  const accounts = await listStoredAdvertisers(DEFAULT_ORVA_STORE_ID);
  const clean = (requestedId || "").trim();

  if (clean) {
    const found = accounts.find((a) => a.advertiserId === clean && a.accountStatus !== "STATUS_REVOKED");
    if (!found) {
      throw new TikTokApiError({
        category: "AUTH_PERMISSION_DENIED",
        message: `Advertiser '${clean}' is not authorized or has been revoked.`,
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
      message: "No active TikTok advertiser account is selected.",
    });
  }

  const validSelected = accounts.find(
    (a) => a.advertiserId === selectedId && a.accountStatus !== "STATUS_REVOKED",
  );
  if (!validSelected) {
    throw new TikTokApiError({
      category: "AUTH_PERMISSION_DENIED",
      message: `Selected advertiser '${selectedId}' is unavailable or revoked.`,
    });
  }

  return validSelected.advertiserId;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminRouteSession(request);
  if (!auth.ok) return auth.response;

  const limitParam = Number.parseInt(request.nextUrl.searchParams.get("limit") || "25", 10);
  const logLimit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 25;

  try {
    const db = getDb();
    const [{ data: logRows, error: logErr }, { data: leadRows, error: leadErr }] = await Promise.all([
      db
        .from("tiktok_sync_logs")
        .select("*")
        .eq("store_id", DEFAULT_ORVA_STORE_ID)
        .order("started_at", { ascending: false })
        .limit(logLimit),
      db
        .from("tiktok_leads")
        .select(
          "id, external_lead_id, form_id, advertiser_id, customer_name, customer_phone_normalized, phone_valid, wilaya_code, wilaya_name, mapped_product_name, order_id, sync_status, retry_count, error_message, imported_at",
        )
        .eq("store_id", DEFAULT_ORVA_STORE_ID)
        .order("imported_at", { ascending: false })
        .limit(200),
    ]);

    if (logErr) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Failed to read tiktok_sync_logs: ${logErr.message}`,
        cause: logErr,
      });
    }
    if (leadErr) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Failed to read tiktok_leads summary: ${leadErr.message}`,
        cause: leadErr,
      });
    }

    const typedLeads = (leadRows ?? []) as Array<Partial<TikTokLeadRow>>;
    const statusCounts: Record<string, number> = {
      order_created: 0,
      lead_saved_no_order: 0,
      duplicate_skipped: 0,
      invalid_phone: 0,
      unmapped_form: 0,
      order_creation_failed: 0,
      pending: 0,
    };

    for (const lead of typedLeads) {
      const key = String(lead.sync_status || "pending");
      statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    }

    // Expose only masked phone numbers & non-sensitive metadata for recoverable/recent leads
    const recoverableLeads = typedLeads
      .filter((l) =>
        ["order_creation_failed", "unmapped_form", "invalid_phone", "pending"].includes(
          String(l.sync_status || ""),
        ),
      )
      .slice(0, 50)
      .map((l) => ({
        id: l.id,
        externalLeadId: l.external_lead_id,
        formId: l.form_id,
        advertiserId: l.advertiser_id,
        customerName: l.customer_name ?? null,
        maskedPhone: l.customer_phone_normalized
          ? maskPhoneForPrivacy(l.customer_phone_normalized)
          : null,
        phoneValid: Boolean(l.phone_valid),
        wilayaCode: l.wilaya_code ?? null,
        wilayaName: l.wilaya_name ?? null,
        mappedProductName: l.mapped_product_name ?? null,
        orderId: l.order_id ?? null,
        syncStatus: l.sync_status,
        retryCount: Number(l.retry_count ?? 0),
        errorMessage: l.error_message ?? null,
        importedAt: l.imported_at,
      }));

    const logs = ((logRows ?? []) as TikTokSyncLogRow[]).map((row) => ({
      id: row.id,
      advertiserId: row.advertiser_id,
      formId: row.form_id,
      triggerSource: row.trigger_source,
      status: row.status,
      leadsFetched: Number(row.leads_fetched ?? 0),
      leadsImported: Number(row.leads_imported ?? 0),
      ordersCreated: Number(row.orders_created ?? 0),
      duplicatesSkipped: Number(row.duplicates_skipped ?? 0),
      leadsFailed: Number(row.leads_failed ?? 0),
      durationMs: Number(row.duration_ms ?? 0),
      errorMessage: row.error_message ?? null,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    }));

    return jsonNoStore({
      success: true,
      logs,
      leadStats: {
        totalSampled: typedLeads.length,
        byStatus: statusCounts,
      },
      recoverableLeads,
    });
  } catch (err) {
    return mapTikTokErrorToResponse(err, "API /api/integrations/tiktok/sync GET");
  }
}

export async function POST(request: NextRequest) {
  const isCronCaller = verifyCronBearerSecret(request);
  let callerType: "admin" | "cron" = "cron";

  if (!isCronCaller) {
    const auth = await requireAdminRouteSession(request);
    if (!auth.ok) return auth.response;
    callerType = "admin";
  }

  const parsed = await parseValidatedJsonBody(request, syncPostBodySchema);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;

  // Cron bearer callers are restricted strictly to scheduled full-sync and reconciliation
  if (callerType === "cron" && body.action !== "sync_all" && body.action !== "reconcile") {
    return jsonNoStore(
      {
        success: false,
        error: "Forbidden: Scheduled cron tokens may only execute sync_all or reconcile actions.",
        code: "CRON_ACTION_FORBIDDEN",
      },
      403,
    );
  }

  try {
    if (body.action === "sync_form") {
      const advertiserId = await resolveAndValidateAdvertiserId(body.advertiserId);
      const db = getDb();
      const { data: formRow, error: formErr } = await db
        .from("tiktok_forms")
        .select("form_id, advertiser_id, status")
        .eq("store_id", DEFAULT_ORVA_STORE_ID)
        .eq("form_id", body.formId)
        .maybeSingle();

      if (formErr) {
        throw new TikTokApiError({
          category: "DATABASE_ERROR",
          message: `Failed to verify TikTok form '${body.formId}': ${formErr.message}`,
          cause: formErr,
        });
      }

      const typedForm = formRow as Partial<TikTokFormRow> | null;
      if (!typedForm || typedForm.advertiser_id !== advertiserId) {
        throw new TikTokApiError({
          category: "AUTH_PERMISSION_DENIED",
          message: `Form '${body.formId}' does not belong to authorized advertiser '${advertiserId}'.`,
        });
      }
      if (typedForm.status === "DELETED") {
        throw new TikTokApiError({
          category: "INVALID_PARAMETERS",
          message: `Cannot synchronize removed/deleted TikTok form '${body.formId}'.`,
        });
      }

      const summary = await syncFormLeads({
        storeId: DEFAULT_ORVA_STORE_ID,
        advertiserId,
        formId: body.formId,
        triggerSource: "manual",
      });

      scheduleNonBlockingTasks(summary.backgroundTasks);

      if (summary.skippedConcurrent) {
        return jsonNoStore(
          {
            success: false,
            error: summary.errorMessage || "A synchronization run is already in progress for this form.",
            code: "CONCURRENT_SYNC_IN_PROGRESS",
            summary: sanitizeSyncSummaryForJson(summary),
          },
          409,
        );
      }

      return jsonNoStore({
        success: true,
        action: "sync_form",
        advertiserId,
        formId: body.formId,
        summary: sanitizeSyncSummaryForJson(summary),
      });
    }

    if (body.action === "sync_all") {
      const advertiserId = await resolveAndValidateAdvertiserId(body.advertiserId);
      const run = await syncEnabledForms({
        storeId: DEFAULT_ORVA_STORE_ID,
        advertiserId,
        triggerSource: callerType === "cron" ? "scheduled" : "manual",
      });

      scheduleNonBlockingTasks(run.totals.backgroundTasks);

      return jsonNoStore({
        success: true,
        action: "sync_all",
        advertiserId: run.advertiserId,
        formsSynced: run.formsSynced,
        results: run.results.map((r) => ({
          formId: r.formId,
          ...(r.summary ? { summary: sanitizeSyncSummaryForJson(r.summary) } : {}),
          ...(r.error ? { error: r.error } : {}),
        })),
        totals: sanitizeSyncSummaryForJson(run.totals),
      });
    }

    if (body.action === "retry_failed") {
      const summary = await retryFailedTikTokLeads({
        storeId: DEFAULT_ORVA_STORE_ID,
        leadIds: body.leadIds,
        maxRetries: body.maxRetries,
        limit: body.limit,
      });

      scheduleNonBlockingTasks(summary.backgroundTasks);

      return jsonNoStore({
        success: true,
        action: "retry_failed",
        summary: sanitizeSyncSummaryForJson(summary),
      });
    }

    // action === "reconcile"
    const advertiserId = await resolveAndValidateAdvertiserId(body.advertiserId);
    const recon = await reconcileHistoricalLeads({
      storeId: DEFAULT_ORVA_STORE_ID,
      advertiserId,
      formIds: body.formIds,
      lookbackDays: body.lookbackDays,
    });

    scheduleNonBlockingTasks(recon.totals.backgroundTasks);

    return jsonNoStore({
      success: true,
      action: "reconcile",
      advertiserId,
      lookbackDays: recon.lookbackDays,
      startTime: recon.startTime,
      endTime: recon.endTime,
      formsProcessed: recon.formsProcessed,
      totals: sanitizeSyncSummaryForJson(recon.totals),
    });
  } catch (err) {
    return mapTikTokErrorToResponse(err, "API /api/integrations/tiktok/sync POST");
  }
}
