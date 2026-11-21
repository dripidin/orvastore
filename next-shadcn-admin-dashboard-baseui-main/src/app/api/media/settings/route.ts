import { type NextRequest, NextResponse } from "next/server";

import { getMediaSettingsAction, saveMediaSettingsAction } from "@/app/actions/settings";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import {
  MEDIA_MAX_UPLOAD_MB,
  MEDIA_MIN_UPLOAD_MB,
  clampMaxUploadSizeMb,
  clampWebpQuality,
} from "@/lib/settings/settings-store";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  const settings = await getMediaSettingsAction();
  return NextResponse.json({
    success: true,
    settings,
    bounds: {
      minUploadSizeMb: MEDIA_MIN_UPLOAD_MB,
      maxUploadSizeMb: MEDIA_MAX_UPLOAD_MB,
    },
  });
}

async function handleSave(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const body = (await request.json().catch(() => null)) as {
      maxUploadSizeMb?: unknown;
      webpCompressionEnabled?: unknown;
      webpQuality?: unknown;
    } | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "بيانات الإعدادات غير صالحة." }, { status: 400 });
    }

    const patch: {
      maxUploadSizeMb?: number;
      webpCompressionEnabled?: boolean;
      webpQuality?: number;
    } = {};

    if (body.maxUploadSizeMb !== undefined) {
      patch.maxUploadSizeMb = clampMaxUploadSizeMb(body.maxUploadSizeMb);
    }
    if (body.webpCompressionEnabled !== undefined) {
      patch.webpCompressionEnabled = Boolean(body.webpCompressionEnabled);
    }
    if (body.webpQuality !== undefined) {
      patch.webpQuality = clampWebpQuality(body.webpQuality);
    }

    const saved = await saveMediaSettingsAction(patch);
    return NextResponse.json({
      success: true,
      settings: saved,
      message: "تم حفظ إعدادات الوسائط بنجاح.",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "تعذر حفظ الإعدادات." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  return handleSave(request);
}

export async function POST(request: NextRequest) {
  return handleSave(request);
}
