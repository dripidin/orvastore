import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import {
  COURIER_DZ_PROVIDERS,
  getRateLimitSnapshot,
  listCourierConfigsPublic,
  upsertCourierConfig,
} from "@/lib/couriers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const couriers = await listCourierConfigsPublic();
  const enriched = couriers.map((c) => ({
    ...c,
    liveRateLimit: getRateLimitSnapshot(c.id),
  }));

  return NextResponse.json({
    success: true,
    couriers: enriched,
    catalog: COURIER_DZ_PROVIDERS,
  });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const id = String(body.id || "")
      .trim()
      .toLowerCase();
    if (!id) {
      return NextResponse.json({ success: false, error: "معرّف شركة التوصيل مطلوب" }, { status: 400 });
    }

    const saved = await upsertCourierConfig({
      id,
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
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "تعذر حفظ شركة التوصيل" }, { status: 500 });
  }
}
