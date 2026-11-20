import { NextResponse } from "next/server";
import { getAdminSettingsAction } from "@/app/actions/settings";
import { normalizeStoreLogoUrl } from "@/lib/settings/settings-store";

export async function GET() {
  const settings = await getAdminSettingsAction();
  return NextResponse.json({ logoUrl: normalizeStoreLogoUrl(settings.store.logoUrl) });
}
