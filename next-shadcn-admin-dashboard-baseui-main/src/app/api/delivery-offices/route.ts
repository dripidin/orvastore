import { type NextRequest, NextResponse } from "next/server";

import { getDeliveryOffices } from "@/lib/delivery-offices";

export const dynamic = "force-dynamic";

/** Public (read-only): which communes of a wilaya have an EcoTrack delivery office (stop-desk). */
export async function GET(request: NextRequest) {
  const wilayaId = Number(new URL(request.url).searchParams.get("wilaya"));
  if (!Number.isInteger(wilayaId) || wilayaId < 1 || wilayaId > 58) {
    return NextResponse.json({ success: false, offices: [], error: "wilaya must be 1-58" }, { status: 400 });
  }

  try {
    const result = await getDeliveryOffices(wilayaId);
    return NextResponse.json(result, {
      headers: result.success ? { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } : {},
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      wilayaId,
      offices: [],
      error: err instanceof Error ? err.message : "Lookup failed",
    });
  }
}
