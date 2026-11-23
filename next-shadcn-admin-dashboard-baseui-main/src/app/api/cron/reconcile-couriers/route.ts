import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { computeWilayaRiskGuardrails } from "@/lib/analytics/wilaya-risk-guardrails";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { EcoTrackClient, getCourierProviderManager, listCourierConfigsPublic, loadCourierConfig } from "@/lib/couriers";
import { mapCourierStatusRich } from "@/lib/delivery/courier-status-mapper";
import { parseWilayaCode69 } from "@/lib/geo/algeria-69";
import { getReturnFeesByWilayaMap } from "@/lib/geo/coverage";
import { type ParsedCourierRow } from "@/lib/reconciliation/excel-parser";
import {
  applyAuthoritativeCourierAutoHeal,
  type CourierBatchInput,
  loadAllStoreOrdersForReconciliation,
  runMultiCourierReconciliation,
} from "@/lib/reconciliation/reconciliation-engine";

export const dynamic = "force-dynamic";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function authorizeCronOrAdmin(request: NextRequest): Promise<boolean> {
  if (await verifyAdminSession(request)) return true;

  const cronSecret = (process.env.CRON_SECRET || process.env.ADMIN_SESSION_SECRET || "").trim();
  if (!cronSecret) return false;

  const provided = (
    request.headers.get("x-cron-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.nextUrl.searchParams.get("secret") ||
    ""
  ).trim();

  return timingSafeEqualStr(cronSecret, provided);
}

async function handleCronReconciliation(request: NextRequest) {
  if (!(await authorizeCronOrAdmin(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const publicCouriers = await listCourierConfigsPublic();
  const activeApiCouriers = publicCouriers.filter((c) => c.isActive && !c.isExternalExcelOnly && c.hasApiToken);
  const targetIds = activeApiCouriers.length > 0 ? activeApiCouriers.map((c) => c.id) : ["redex"];

  const manager = getCourierProviderManager();
  const storeOrders = await loadAllStoreOrdersForReconciliation();
  const batches: CourierBatchInput[] = [];
  const syncErrors: Array<{ courierId: string; error: string }> = [];

  for (const cid of targetIds) {
    const cfg = await loadCourierConfig(cid);
    const { provider, credentials } = await manager.resolveConfiguredProvider(cid);
    let extRows: ParsedCourierRow[] = [];

    if (cfg?.family === "ecotrack" || cid === "redex") {
      if (!cfg?.apiToken && !process.env.REDEX_API_TOKEN && !process.env.ECOTRACK_API_TOKEN) {
        syncErrors.push({ courierId: cid, error: "Missing API token" });
        continue;
      }
      const client = new EcoTrackClient({
        courierId: cfg?.id || cid,
        baseUrl: cfg?.baseUrl,
        token: cfg?.apiToken,
      });
      const res = await client.getAllOrdersPaginated({ maxPages: 12, enrichStatuses: true });
      if (!res.success) {
        syncErrors.push({ courierId: cid, error: res.error || "API pull failed" });
        continue;
      }

      extRows = res.orders.map((o, idx) => {
        const rich = mapCourierStatusRich(o.status);
        const phoneDigits = String(o.phone || "").replace(/[^\d]/g, "");
        return {
          rowIndex: idx + 1,
          courierId: cid,
          courierName: cfg?.nameAr || cfg?.name || cid,
          sourceFileName: `CRON:${cid}`,
          trackingCode: o.tracking.toUpperCase(),
          reference: o.reference || "",
          boutique: o.boutique || "",
          customerName: o.client || "زبون",
          customerPhone: o.phone || "",
          customerPhoneTail9: phoneDigits.slice(-9),
          customerPhone2: o.phone2 || "",
          wilayaRaw: o.wilayaName || (o.wilayaId ? String(o.wilayaId) : ""),
          wilayaCode: o.wilayaId || parseWilayaCode69(o.wilayaName),
          commune: o.commune || "",
          address: o.address || "",
          montantDzd: Number(o.montant || 0),
          productName: "",
          rawStatus: o.status,
          normalizedStatus: rich.normalizedStatus,
          mappedStoreStatus: rich.orderStatus,
          financialStatus: o.financialStatus || "",
          deliveryFeeDzd: Number(o.deliveryFee || 0),
          returnFeeDzd: o.returnFee ?? null,
          stopDesk: o.stopDesk,
          remarksSummary: o.remarksSummary,
          driverName: o.driverName || "",
          driverPhone: o.driverPhone || "",
          createdAt: o.createdAt || null,
          updatedAt: o.updatedAt || null,
          lastUpdatedAt: o.lastUpdatedAt || o.updatedAt || null,
          rawRow: (o.raw as Record<string, unknown>) ?? {},
        };
      });
    } else if (provider.getOrders) {
      const res = await provider.getOrders({ page: 1 }, credentials);
      if (!res.success) {
        syncErrors.push({ courierId: cid, error: res.error || "Provider getOrders failed" });
        continue;
      }
      extRows = res.orders.map((o, idx) => {
        const rich = mapCourierStatusRich(o.status);
        const phoneDigits = String(o.phone || "").replace(/[^\d]/g, "");
        return {
          rowIndex: idx + 1,
          courierId: cid,
          courierName: cfg?.nameAr || provider.name,
          sourceFileName: `CRON:${cid}`,
          trackingCode: o.tracking.toUpperCase(),
          reference: o.reference || "",
          boutique: o.boutique || "",
          customerName: o.client || "زبون",
          customerPhone: o.phone || "",
          customerPhoneTail9: phoneDigits.slice(-9),
          customerPhone2: o.phone2 || "",
          wilayaRaw: o.wilayaName || "",
          wilayaCode: o.wilayaId || parseWilayaCode69(o.wilayaName),
          commune: o.commune || "",
          address: o.address || "",
          montantDzd: Number(o.montant || 0),
          productName: "",
          rawStatus: o.status,
          normalizedStatus: rich.normalizedStatus,
          mappedStoreStatus: rich.orderStatus,
          financialStatus: o.financialStatus || "",
          deliveryFeeDzd: Number(o.deliveryFee || 0),
          returnFeeDzd: o.returnFee ?? null,
          stopDesk: o.stopDesk,
          remarksSummary: o.remarksSummary,
          driverName: o.driverName || "",
          driverPhone: o.driverPhone || "",
          createdAt: o.createdAt || null,
          updatedAt: o.updatedAt || null,
          rawRow: (o.raw as Record<string, unknown>) ?? {},
        };
      });
    }

    if (extRows.length > 0) {
      batches.push({
        courierId: cid,
        courierName: cfg?.nameAr || cfg?.name || provider.name,
        sourceType: "api",
        rows: extRows,
      });
    }
  }

  const rawRecon = await runMultiCourierReconciliation({
    batches,
    includeStoreOnly: true,
  });
  const healed = await applyAuthoritativeCourierAutoHeal(rawRecon);

  const [freshOrders, returnFeeMap] = await Promise.all([
    loadAllStoreOrdersForReconciliation(),
    getReturnFeesByWilayaMap().catch(() => ({}) as Record<number, number>),
  ]);
  const wilayaGuardrails = computeWilayaRiskGuardrails(
    freshOrders.length > 0 ? freshOrders : storeOrders,
    returnFeeMap,
  );

  return NextResponse.json({
    success: true,
    executedAt: new Date().toISOString(),
    couriersSynced: batches.map((b) => b.courierId),
    syncErrors,
    healedCount: healed.healedCount,
    priceHealedCount: healed.priceHealedCount,
    statusHealedCount: healed.statusHealedCount,
    counts: healed.summary.counts,
    accounting: healed.summary.accounting,
    highRiskWilayas: wilayaGuardrails.highRiskWilayas,
    result: healed.summary,
  });
}

export async function GET(request: NextRequest) {
  return handleCronReconciliation(request);
}

export async function POST(request: NextRequest) {
  return handleCronReconciliation(request);
}
