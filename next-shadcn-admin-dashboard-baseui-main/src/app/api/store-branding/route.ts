import { NextResponse } from "next/server";
import { getAdminSettingsAction } from "@/app/actions/settings";

export async function GET() {
  const settings = await getAdminSettingsAction();
  return NextResponse.json({ logoUrl: settings.store.logoUrl });
}
