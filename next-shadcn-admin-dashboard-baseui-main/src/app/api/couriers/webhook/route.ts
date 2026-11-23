import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { loadCourierConfig } from "@/lib/couriers/credentials-store";
import { mapCourierStatusRich } from "@/lib/delivery/courier-status-mapper";
import { parseWilayaCode69 } from "@/lib/geo/algeria-69";
import { getReturnFeesByWilayaMap } from "@/lib/geo/coverage";
import { type ParsedCourierRow } from "@/lib/reconciliation/excel-parser";
import {
  diagnoseOrderDiscrepancy,
  loadAllStoreOrdersForReconciliation,
  persistAuthoritativeOrderPatch,
} from "@/lib/reconciliation/reconciliation-engine";
import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function timingSafeMatch(expected: string, actual: string): boolean {
  if (!expected || !actual) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function authorizeWebhookRequest(request: NextRequest, courierId: string, rawBody: string): Promise<boolean> {
  if (await verifyAdminSession(request)) return true;

  const cfg = await loadCourierConfig(courierId).catch(() => null);
  const secrets = [
    cfg?.webhookSecret,
    process.env.COURIER_WEBHOOK_SECRET,
    process.env.REDEX_WEBHOOK_SECRET,
    process.env.CRON_SECRET,
  ]
    .map((s) => (s || "").trim())
    .filter(Boolean);

  if (secrets.length === 0) {
    return false;
  }

  const providedSecret = (
    request.headers.get("x-webhook-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.nextUrl.searchParams.get("secret") ||
    ""
  ).trim();

  if (providedSecret && secrets.some((s) => timingSafeMatch(s, providedSecret))) {
    return true;
  }

  const hmacSig = (request.headers.get("x-ecotrack-signature") || "").trim().toLowerCase();
  if (hmacSig) {
    for (const s of secrets) {
      const expectedHex = crypto.createHmac("sha256", s).update(rawBody).digest("hex").toLowerCase();
      if (timingSafeMatch(expectedHex, hmacSig)) return true;
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let body: any = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON webhook payload" }, { status: 400 });
  }

  const courierId = String(
    body.courier_id || body.courierId || request.nextUrl.searchParams.get("courier") || "redex",
  )
    .trim()
    .toLowerCase();

  const authorized = await authorizeWebhookRequest(request, courierId, rawBody);
  if (!authorized) {
    return NextResponse.json({ success: false, error: "Unauthorized webhook signature" }, { status: 401 });
  }

  const events: Array<Record<string, any>> = Array.isArray(body)
    ? body
    : Array.isArray(body.events)
      ? body.events
      : Array.isArray(body.data)
        ? body.data
        : [body];

  if (events.length === 0) {
    return NextResponse.json({ success: false, error: "Empty webhook payload" }, { status: 400 });
  }

  const [storeOrders, returnFeeMap] = await Promise.all([
    loadAllStoreOrdersForReconciliation(),
    getReturnFeesByWilayaMap(courierId).catch(() => ({}) as Record<number, number>),
  ]);

  const byTracking = new Map(
    storeOrders
      .filter((o) => o.redexTrackingCode || o.redexTrackingId)
      .map((o) => [String(o.redexTrackingCode || o.redexTrackingId).trim().toUpperCase(), o]),
  );
  const byRef = new Map(storeOrders.map((o) => [o.id.trim().toUpperCase(), o]));
  const byPhone9 = new Map(
    storeOrders
      .map((o) => [String(o.phone || "").replace(/[^\d]/g, "").slice(-9), o] as const)
      .filter(([p]) => p.length === 9),
  );

  const processed: Array<{
    tracking?: string;
    orderId?: string;
    matched: boolean;
    status?: string;
    autoHealedCodDzd?: number;
    adjustmentReasonAr?: string;
  }> = [];

  for (const ev of events) {
    const tracking = String(ev.tracking || ev.code_tracking || ev.tracking_code || "").trim().toUpperCase();
    const ref = String(ev.reference || ev.order_id || ev.order_number || "").trim().toUpperCase();
    const rawPhone = String(ev.phone || ev.telephone || ev.client_phone || "");
    const phone9 = rawPhone.replace(/[^\d]/g, "").slice(-9);

    const matchedOrder =
      (tracking && byTracking.get(tracking)) ||
      (ref && (byRef.get(ref) || storeOrders.find((o) => o.id.toUpperCase().endsWith(`-${ref}`)))) ||
      (phone9 && byPhone9.get(phone9)) ||
      null;

    if (!matchedOrder) {
      processed.push({ tracking: tracking || undefined, matched: false });
      continue;
    }

    const rawStatus = String(ev.status || ev.new_status || ev.global_status || "en_transit");
    const rich = mapCourierStatusRich(rawStatus);
    const wilayaCode = ev.wilaya_id ? Number(ev.wilaya_id) : parseWilayaCode69(matchedOrder.wilaya);
    const returnFeeDzd =
      ev.return_fee !== undefined || ev.tarif_retour !== undefined
        ? Number(ev.return_fee ?? ev.tarif_retour ?? 0)
        : wilayaCode && returnFeeMap[wilayaCode] > 0
          ? returnFeeMap[wilayaCode]
          : 400;

    const extRow: ParsedCourierRow = {
      rowIndex: 1,
      courierId,
      courierName: courierId.toUpperCase(),
      sourceFileName: `WEBHOOK:${courierId}`,
      trackingCode: tracking || String(matchedOrder.redexTrackingCode || ""),
      reference: ref || matchedOrder.id,
      boutique: ev.boutique ? String(ev.boutique) : "",
      customerName: String(ev.client || ev.nom_client || matchedOrder.customer || ""),
      customerPhone: rawPhone || matchedOrder.phone || "",
      customerPhoneTail9: phone9,
      customerPhone2: "",
      wilayaRaw: wilayaCode ? String(wilayaCode) : "",
      wilayaCode,
      commune: String(ev.commune || matchedOrder.commune || ""),
      address: String(ev.adresse || ""),
      montantDzd: Number(ev.montant ?? ev.cod_amount ?? matchedOrder.grandTotalDzd ?? 0),
      productName: matchedOrder.productName || "",
      rawStatus,
      normalizedStatus: rich.normalizedStatus,
      mappedStoreStatus: rich.orderStatus,
      financialStatus: String(ev.financial_status || ev.payment_status || (rich.financialStage !== "none" ? rawStatus : "")),
      deliveryFeeDzd: Number(ev.tarif_prestation ?? ev.delivery_fee ?? matchedOrder.shippingDzd ?? 0),
      returnFeeDzd,
      stopDesk: Number(ev.stop_desk ?? 0) === 1,
      remarksSummary: Array.isArray(ev.status_reason)
        ? ev.status_reason.map((x: any) => x?.remarque).filter(Boolean).join(" | ")
        : ev.remarque
          ? String(ev.remarque)
          : undefined,
      driverName: String(ev.driver_name || ev.livreur || ""),
      driverPhone: String(ev.driver_phone || ""),
      createdAt: ev.created_at || null,
      updatedAt: ev.updated_at || new Date().toISOString(),
      rawRow: ev,
    };

    const diagnosis = diagnoseOrderDiscrepancy({
      ord: matchedOrder,
      ext: extRow,
      rich,
      returnFeeDzd,
    });

    await persistAuthoritativeOrderPatch({
      orderId: matchedOrder.id,
      courierId,
      trackingCode: tracking || matchedOrder.redexTrackingCode,
      patch: diagnosis.autoHealPatch,
    });

    processed.push({
      tracking: tracking || undefined,
      orderId: matchedOrder.id,
      matched: true,
      status: rich.orderStatus,
      autoHealedCodDzd: diagnosis.autoHealPatch.totalPayableDzd,
      adjustmentReasonAr: diagnosis.autoHealPatch.adjustmentReasonAr,
    });
  }

  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;
      await supabase.from("courier_api_logs").insert({
        courier_id: courierId,
        endpoint: "POST /api/couriers/webhook",
        method: "POST",
        status_code: 200,
        latency_ms: 0,
        request_payload: { eventCount: events.length },
        response_summary: { matched: processed.filter((p) => p.matched).length, processed },
      });
    } catch {
      // Non-blocking audit log
    }
  }

  return NextResponse.json({
    success: true,
    courierId,
    processedCount: processed.length,
    matchedCount: processed.filter((p) => p.matched).length,
    results: processed,
  });
}
