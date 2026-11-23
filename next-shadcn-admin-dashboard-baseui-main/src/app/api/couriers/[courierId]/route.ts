import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import {
  EcoTrackClient,
  getCourierProviderManager,
  getRateLimitSnapshot,
  loadCourierConfig,
  toPublicCourierDTO,
  upsertCourierConfig,
} from "@/lib/couriers";
import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ courierId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { courierId } = await context.params;
  const cfg = await loadCourierConfig(courierId);
  if (!cfg) {
    return NextResponse.json({ success: false, error: "Courier not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    courier: toPublicCourierDTO(cfg),
    liveRateLimit: getRateLimitSnapshot(cfg.id),
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { courierId } = await context.params;
  const body = await request.json().catch(() => ({}));

  const saved = await upsertCourierConfig({
    id: courierId,
    name: body.name,
    nameAr: body.nameAr,
    family: body.family,
    baseUrl: body.baseUrl,
    isActive: body.isActive,
    isDefault: body.isDefault,
    supportsStopDesk: body.supportsStopDesk,
    autoValidate: body.autoValidate,
    isExternalExcelOnly: body.isExternalExcelOnly,
    originHub: body.originHub,
    trackingUrlTemplate: body.trackingUrlTemplate,
    apiKey: body.apiKey,
    apiToken: body.apiToken,
    apiSecret: body.apiSecret,
    accountId: body.accountId,
    webhookSecret: body.webhookSecret,
    storeIdentifiers: Array.isArray(body.storeIdentifiers) ? body.storeIdentifiers : undefined,
  });

  return NextResponse.json({ success: true, courier: saved });
}

/**
 * POST /api/couriers/[courierId] -> Run live Authorisation test + Taux limite check
 */
export async function POST(request: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { courierId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const manager = getCourierProviderManager();
  const resolved = await manager.resolveConfiguredProvider(courierId);

  const overrideCreds = {
    ...resolved.credentials,
    ...(body.apiToken ? { token: body.apiToken, apiToken: body.apiToken } : {}),
    ...(body.apiKey ? { apiId: body.apiKey, apiKey: body.apiKey, key: body.apiKey } : {}),
    ...(body.apiSecret ? { apiSecret: body.apiSecret } : {}),
    ...(body.baseUrl ? { baseUrl: body.baseUrl } : {}),
  };

  if (resolved.config?.family === "ecotrack" || courierId === "redex") {
    const client = new EcoTrackClient({
      courierId,
      baseUrl: overrideCreds.baseUrl,
      token: overrideCreds.token,
    });
    const conn = await client.testConnection();
    const rate = await client.checkRateLimitStatus();
    return NextResponse.json({
      success: conn.success,
      connection: conn,
      rateLimit: rate.snapshot,
    });
  }

  const result = await resolved.provider.testConnection(overrideCreds);
  return NextResponse.json({
    success: result.success,
    connection: result,
    rateLimit: getRateLimitSnapshot(courierId),
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { courierId } = await context.params;
  if (courierId === "redex") {
    return NextResponse.json(
      { success: false, error: "لا يمكن حذف الشركة الافتراضية الرئيسية Redex (يمكنك تعطيلها فقط)." },
      { status: 400 },
    );
  }
  if (isServiceRoleConfigured()) {
    const supabase = getSupabaseServerClient() as any;
    await supabase.from("courier_configurations").delete().eq("id", courierId);
  }
  return NextResponse.json({ success: true });
}
