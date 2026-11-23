import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { getCourierProviderManager, getRateLimitSnapshot } from "@/lib/couriers";
import { ALGERIA_69_WILAYAS } from "@/lib/geo/algeria-69";
import { getStorefrontDeliveryCoverage } from "@/lib/geo/coverage";
import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ courierId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { courierId } = await context.params;

  const coverage = await getStorefrontDeliveryCoverage({ courierId });
  let desks: any[] = [];
  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;
      const { data } = await supabase
        .from("courier_stop_desks")
        .select("*")
        .eq("courier_id", courierId)
        .order("wilaya_code", { ascending: true });
      desks = data ?? [];
    } catch {
      desks = [];
    }
  }

  return NextResponse.json({
    success: true,
    courierId,
    wilayas: coverage.wilayas,
    desks,
    rateLimit: getRateLimitSnapshot(courierId),
  });
}

/**
 * POST -> Sync Configuration (Wilayas, Communes/Desks, Delivery + Return/Pickup/Exchange Fees) from carrier API
 */
export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { courierId } = await context.params;
  const manager = getCourierProviderManager();
  const { provider, credentials } = await manager.resolveConfiguredProvider(courierId);

  if (!provider.syncConfiguration) {
    return NextResponse.json(
      { success: false, error: `الشركة ${provider.name} لا تدعم المزامنة التلقائية للإعدادات عبر API` },
      { status: 400 },
    );
  }

  const syncResult = await provider.syncConfiguration(credentials);
  if (!syncResult.success) {
    return NextResponse.json(
      { success: false, error: syncResult.error || "فشلت مزامنة إعدادات شركة التوصيل" },
      { status: 502 },
    );
  }

  const nowIso = new Date().toISOString();
  const feeMap = new Map(syncResult.fees.map((f) => [f.wilayaCode, f]));
  const servedSet = new Set(syncResult.servedWilayaIds);

  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;

      // Preserve admin's explicit is_active / stop_desk overrides on existing desks
      const { data: existingDesks } = await supabase
        .from("courier_stop_desks")
        .select("station_code, is_active")
        .eq("courier_id", courierId);
      const existingDeskActive = new Map(
        (existingDesks ?? []).map((d: any) => [String(d.station_code), Boolean(d.is_active)]),
      );

      const { data: existingCov } = await supabase
        .from("courier_wilaya_coverage")
        .select("wilaya_code, is_active")
        .eq("courier_id", courierId);
      const existingCovActive = new Map(
        (existingCov ?? []).map((c: any) => [Number(c.wilaya_code), Boolean(c.is_active)]),
      );

      const covRows = ALGERIA_69_WILAYAS.map((w) => {
        const directFee = feeMap.get(w.code);
        const motherFee = w.motherWilayaCode ? feeMap.get(w.motherWilayaCode) : undefined;
        const effectiveFee = directFee ?? motherFee;
        const routedViaMother =
          !directFee && Boolean(w.motherWilayaCode && (servedSet.has(w.motherWilayaCode) || motherFee));
        const activeDefault = servedSet.size === 0 ? true : servedSet.has(w.code) || routedViaMother;

        return {
          courier_id: courierId,
          wilaya_code: w.code,
          is_active: existingCovActive.has(w.code) ? existingCovActive.get(w.code)! : activeDefault,
          home_enabled: true,
          stop_desk_enabled: directFee ? directFee.tarifStopdesk > 0 && w.code <= 58 : false,
          tarif_domicile: effectiveFee?.tarifDomicile ?? 0,
          tarif_stopdesk: directFee?.tarifStopdesk ?? 0,
          tarif_retour: effectiveFee?.tarifRetour ?? 0,
          tarif_pickup: effectiveFee?.tarifPickup ?? 0,
          tarif_echange: effectiveFee?.tarifEchange ?? 0,
          mapped_carrier_wilaya_code: routedViaMother ? w.motherWilayaCode : null,
          source: routedViaMother ? "mother_wilaya_inherited" : "courier_api",
          synced_at: nowIso,
        };
      });

      await supabase.from("courier_wilaya_coverage").upsert(covRows, { onConflict: "courier_id,wilaya_code" });

      if (syncResult.desks.length > 0) {
        const deskRows = syncResult.desks.map((d) => ({
          courier_id: courierId,
          station_code: d.stationCode,
          name: d.name,
          wilaya_code: d.wilayaCode,
          commune: d.commune || null,
          address: d.address || null,
          phones: d.phones,
          map_url: d.mapUrl || null,
          is_active: existingDeskActive.has(d.stationCode) ? existingDeskActive.get(d.stationCode)! : true,
          synced_at: nowIso,
        }));
        await supabase.from("courier_stop_desks").upsert(deskRows, { onConflict: "courier_id,station_code" });
      }

      if (courierId === "redex" && covRows.length > 0) {
        const legacyFeeRows = covRows.map((c) => ({
          wilaya_id: c.wilaya_code,
          service_type: "ecotrack",
          tarif_domicile: c.tarif_domicile,
          tarif_stopdesk: c.tarif_stopdesk,
          tarif_retour: c.tarif_retour,
          tarif_pickup: c.tarif_pickup,
          tarif_echange: c.tarif_echange,
          synced_at: nowIso,
        }));
        await supabase.from("delivery_fees").upsert(legacyFeeRows, { onConflict: "wilaya_id,service_type" });
      }

      await supabase
        .from("courier_configurations")
        .update({ last_synced_at: nowIso, updated_at: nowIso })
        .eq("id", courierId);
    } catch (dbErr) {
      console.warn("[couriers/config] Partial DB sync warning:", dbErr);
    }
  }

  return NextResponse.json({
    success: true,
    courierId,
    syncedWilayas: syncResult.servedWilayaIds.length,
    syncedFees: syncResult.fees.length,
    syncedDesks: syncResult.desks.length,
    fees: syncResult.fees,
    rateLimit: getRateLimitSnapshot(courierId),
  });
}

/**
 * PATCH -> Admin override for wilaya coverage, domicile/stop-desk toggle, or custom tarif_retour
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { courierId } = await context.params;
  const body = await request.json().catch(() => ({}));

  if (!isServiceRoleConfigured()) {
    return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 503 });
  }

  const supabase = getSupabaseServerClient() as any;

  if (body.type === "desk" && body.stationCode) {
    const { error } = await supabase
      .from("courier_stop_desks")
      .update({ is_active: Boolean(body.isActive) })
      .eq("courier_id", courierId)
      .eq("station_code", String(body.stationCode));
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  const wilayaCode = Number(body.wilayaCode);
  if (!Number.isInteger(wilayaCode) || wilayaCode < 1 || wilayaCode > 69) {
    return NextResponse.json({ success: false, error: "Invalid wilayaCode (1..69)" }, { status: 400 });
  }

  const payload = {
    courier_id: courierId,
    wilaya_code: wilayaCode,
    is_active: body.isActive ?? true,
    home_enabled: body.homeEnabled ?? true,
    stop_desk_enabled: body.stopDeskEnabled ?? false,
    tarif_domicile: Number(body.tarifDomicile ?? 0),
    tarif_stopdesk: Number(body.tarifStopdesk ?? 0),
    tarif_retour: Number(body.tarifRetour ?? 0),
    source: "manual",
    synced_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("courier_wilaya_coverage")
    .upsert(payload, { onConflict: "courier_id,wilaya_code" });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, row: payload });
}
