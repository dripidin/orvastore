import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { ECOTRACK_STATUS_MAP_AR, EcoTrackClient, getCourierProviderManager, loadCourierConfig } from "@/lib/couriers";
import { mapCourierStatusRich } from "@/lib/delivery/courier-status-mapper";
import { computeCourierStatusBridgeUpdate } from "@/lib/delivery/status-bridge";
import { extractWilayaCode69 } from "@/lib/geo/algeria-69";
import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ courierId: string }> };

function normalizePhoneTail(raw?: string | null): string {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  return digits.slice(-9);
}

function matchesStoreIdentifiers(extOrder: { boutique?: string; reference?: string }, identifiers: string[]): boolean {
  const hay = `${extOrder.boutique || ""} ${extOrder.reference || ""}`.toUpperCase();
  return identifiers.some((id) => {
    const clean = id.trim().toUpperCase();
    return clean.length > 0 && hay.includes(clean);
  });
}

/**
 * POST /api/couriers/[courierId]/sync
 * Live API Token sync:
 *  1. Pulls external orders + get/orders/status (driver_phone, desk_info, activity[]) + get/maj remarks
 *  2. Runs Dual-Track Status Bridge on matched local orders (updates status + driver + location + return_fee_dzd)
 *  3. Detects store-owned RETURNED parcels even if never saved in local orders (can optionally autoImportReturns: true)
 */
export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { courierId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const startDate = typeof body.startDate === "string" ? body.startDate : undefined;
  const endDate = typeof body.endDate === "string" ? body.endDate : undefined;
  const autoImportReturns = body.autoImportReturns !== false;

  const cfg = await loadCourierConfig(courierId);
  const storeIdentifiers = cfg?.storeIdentifiers?.length
    ? cfg.storeIdentifiers
    : ["ORVA", "ORV-", "PACK1-", "PACK2-", "PACK3-", "REROUTE-", "ORD-"];

  const manager = getCourierProviderManager();
  const { provider, credentials } = await manager.resolveConfiguredProvider(courierId);

  let extOrders: Awaited<ReturnType<EcoTrackClient["getAllOrdersPaginated"]>>["orders"] = [];
  let bulkStatusMap: Record<string, any> = {};
  let ecoClient: EcoTrackClient | null = null;

  if (cfg?.family === "ecotrack" || courierId === "redex") {
    ecoClient = new EcoTrackClient({
      courierId: cfg?.id || courierId,
      baseUrl: cfg?.baseUrl,
      token: cfg?.apiToken,
    });
    const ordersRes = await ecoClient.getAllOrdersPaginated({
      startDate,
      endDate,
      maxPages: Number(body.maxPages ?? 10),
    });
    if (!ordersRes.success) {
      return NextResponse.json(
        { success: false, error: ordersRes.error || "تعذر سحب الطلبيات عبر API Token" },
        { status: 502 },
      );
    }
    extOrders = ordersRes.orders;

    const trackings = extOrders.map((o) => o.tracking).filter(Boolean);
    if (trackings.length > 0) {
      const bulkRes = await ecoClient.getBulkOrdersStatus(trackings, "all");
      if (bulkRes.success && bulkRes.data) {
        bulkStatusMap = bulkRes.data;
      }
    }
  } else if (provider.getOrders) {
    const res = await provider.getOrders({ page: 1, startDate, endDate }, credentials);
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error || "Failed to pull orders" }, { status: 502 });
    }
    extOrders = res.orders;
  } else {
    return NextResponse.json(
      { success: false, error: `الشركة ${provider.name} لا تدعم مزامنة السحب الكامل عبر API` },
      { status: 400 },
    );
  }

  if (!isServiceRoleConfigured()) {
    return NextResponse.json({
      success: true,
      syncedCount: 0,
      fetchedOrdersCount: extOrders.length,
      storeOwnedUnregisteredReturns: [],
      message: "تم جلب الطلبيات من شركة التوصيل (قاعدة البيانات المحلية غير متصلة للحفظ)",
    });
  }

  const supabase = getSupabaseServerClient() as any;
  const { data: localOrders } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);

  const byTracking = new Map<string, any>();
  const byOrderNumber = new Map<string, any>();
  const byPhone = new Map<string, any>();

  for (const row of localOrders ?? []) {
    const t = String(row.redex_tracking_code || row.tracking_code || "")
      .trim()
      .toUpperCase();
    if (t) byTracking.set(t, row);
    for (const refKey of [row.order_id, row.order_number, row.external_order_id]) {
      const clean = String(refKey || "")
        .trim()
        .toUpperCase();
      if (clean) byOrderNumber.set(clean, row);
    }
    const ph = normalizePhoneTail(row.customer_phone || row.phone);
    if (ph && !byPhone.has(ph)) byPhone.set(ph, row);
  }

  let matchedUpdatedCount = 0;
  let storeStatusChangedCount = 0;
  let capturedReturnsCount = 0;
  const storeOwnedUnregisteredReturns: any[] = [];

  for (const ext of extOrders) {
    const trackingUpper = ext.tracking.trim().toUpperCase();
    const refUpper = ext.reference.trim().toUpperCase();
    const matched =
      (trackingUpper && byTracking.get(trackingUpper)) ||
      (refUpper && byOrderNumber.get(refUpper)) ||
      (ext.phone ? byPhone.get(normalizePhoneTail(ext.phone)) : undefined);

    const statusInfo = bulkStatusMap[ext.tracking] || {};
    const activityList = Array.isArray(statusInfo.activity) ? statusInfo.activity : [];
    const latestAct = activityList[activityList.length - 1];
    const effectiveCourierStatus = String(latestAct?.status || statusInfo.status || ext.status || "");
    const rich = mapCourierStatusRich(effectiveCourierStatus);

    const driverName = ext.driverName || [...activityList].reverse().find((a: any) => a?.driver)?.driver || undefined;
    const driverPhone = ext.driverPhone || (statusInfo.driver_phone ? String(statusInfo.driver_phone) : undefined);
    const currentStation = latestAct?.station || statusInfo.desk_commune || undefined;
    const deskInfo =
      statusInfo.desk_phone || statusInfo.desk_address || statusInfo.desk_map_link || statusInfo.desk_commune
        ? {
            deskPhone: statusInfo.desk_phone ? String(statusInfo.desk_phone) : undefined,
            deskCommune: statusInfo.desk_commune ? String(statusInfo.desk_commune) : undefined,
            deskAddress: statusInfo.desk_address ? String(statusInfo.desk_address) : undefined,
            deskMapLink: statusInfo.desk_map_link ? String(statusInfo.desk_map_link) : undefined,
          }
        : undefined;

    if (matched) {
      const bridgePatch = computeCourierStatusBridgeUpdate({
        currentStoreStatus: matched.status,
        manualStatusOverride: matched.manual_status_override,
        courierStatusRaw: effectiveCourierStatus,
        courierStatusAr: ECOTRACK_STATUS_MAP_AR[effectiveCourierStatus]?.label || rich.labelAr,
        driverName,
        driverPhone,
        currentStation,
        deskInfo,
        checkpoints: activityList.map((a: any) => ({
          date: a.date || "",
          time: a.time || "",
          status: a.status || "",
          statusAr: ECOTRACK_STATUS_MAP_AR[a.status]?.label || a.details || a.status,
          station: a.station,
          scanLocation: a.scanLocation,
          details: a.details,
          reason: a.reason,
          driver: a.driver,
          postponedTo: a.postponed_to,
        })),
        returnFeeDzd: ext.returnFee,
        financialStatus: ext.financialStatus,
        statusSource: "courier_api",
      });

      const dbPatch: Record<string, unknown> = {
        tracking_code: matched.tracking_code || ext.tracking,
        redex_tracking_code: matched.redex_tracking_code || ext.tracking,
        redex_tracking_id: matched.redex_tracking_id || ext.tracking,
        in_redex: true,
        courier_id: courierId,
        courier_status: bridgePatch.courier_status,
        courier_status_ar: bridgePatch.courier_status_ar,
        normalized_courier_status: bridgePatch.normalized_courier_status,
        courier_location_stage: bridgePatch.courier_location_stage,
        courier_last_synced_at: bridgePatch.courier_last_synced_at,
      };
      if (bridgePatch.status) {
        dbPatch.status = bridgePatch.status;
        dbPatch.status_source = bridgePatch.status_source;
      }
      if (bridgePatch.driver_name) dbPatch.driver_name = bridgePatch.driver_name;
      if (bridgePatch.driver_phone) dbPatch.driver_phone = bridgePatch.driver_phone;
      if (bridgePatch.current_station) dbPatch.current_station = bridgePatch.current_station;
      if (bridgePatch.desk_info) dbPatch.desk_info = bridgePatch.desk_info;
      if (bridgePatch.tracking_checkpoints) dbPatch.tracking_checkpoints = bridgePatch.tracking_checkpoints;
      if (bridgePatch.return_fee_dzd !== undefined) dbPatch.return_fee_dzd = bridgePatch.return_fee_dzd;
      if (bridgePatch.financial_status) dbPatch.financial_status = bridgePatch.financial_status;

      const updRes = await supabase.from("orders").update(dbPatch).eq("id", matched.id);
      if (updRes.error) {
        // Fallback if migration hasn't added extended columns yet
        await supabase
          .from("orders")
          .update({
            ...(bridgePatch.status ? { status: bridgePatch.status } : {}),
            tracking_code: matched.tracking_code || ext.tracking,
            redex_tracking_code: matched.redex_tracking_code || ext.tracking,
            in_redex: true,
          })
          .eq("id", matched.id);
      }

      matchedUpdatedCount += 1;
      if (bridgePatch.storeStatusChanged) storeStatusChangedCount += 1;
    } else if (rich.orderStatus === "returned" && matchesStoreIdentifiers(ext, storeIdentifiers)) {
      // Unregistered store-owned returned parcel auto-capture!
      const wCode = extractWilayaCode69(ext.wilayaId || ext.wilayaName || 16);
      storeOwnedUnregisteredReturns.push({
        tracking: ext.tracking,
        reference: ext.reference,
        boutique: ext.boutique,
        customerName: ext.client,
        customerPhone: ext.phone,
        wilayaCode: wCode,
        commune: ext.commune,
        montant: ext.montant,
        returnFee: ext.returnFee ?? 0,
        courierStatus: effectiveCourierStatus,
      });

      if (autoImportReturns) {
        const canonicalId = ext.reference || `RET-${ext.tracking}`;
        const insertPayload: Record<string, unknown> = {
          order_id: canonicalId,
          order_number: canonicalId,
          external_order_id: ext.tracking,
          customer_name: ext.client || "زبون مرتجع",
          customer_phone: ext.phone || "0550000000",
          wilaya_code: wCode,
          wilaya_name: ext.wilayaName || String(wCode),
          commune_name: ext.commune || "Centre",
          delivery_method: "DOMICILE",
          product_name: "طرد مرتجع مستورد تلقائياً",
          subtotal: Math.max(0, ext.montant - (ext.deliveryFee || 0)),
          delivery_fee: ext.deliveryFee || 0,
          total: ext.montant,
          total_payable: ext.montant,
          status: "returned",
          tracking_code: ext.tracking,
          redex_tracking_code: ext.tracking,
          in_redex: true,
          courier: courierId.toUpperCase(),
          courier_provider: courierId.toUpperCase(),
          courier_id: courierId,
          courier_status: effectiveCourierStatus,
          courier_status_ar: rich.labelAr,
          normalized_courier_status: rich.normalizedStatus,
          courier_location_stage: "returned",
          status_source: "courier_api",
          import_source: "courier_api",
          return_fee_dzd: ext.returnFee ?? 0,
          courier_last_synced_at: new Date().toISOString(),
        };

        const ins = await supabase.from("orders").insert(insertPayload);
        if (!ins.error) {
          capturedReturnsCount += 1;
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    courierId,
    fetchedOrdersCount: extOrders.length,
    matchedUpdatedCount,
    storeStatusChangedCount,
    capturedReturnsCount,
    storeOwnedUnregisteredReturns,
  });
}
