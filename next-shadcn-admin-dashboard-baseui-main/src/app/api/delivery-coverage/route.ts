import { type NextRequest, NextResponse } from "next/server";

import { getStorefrontDeliveryCoverage } from "@/lib/geo/coverage";

export const dynamic = "force-dynamic";

/** Public storefront endpoint: 69 Algerian wilayas coverage, tariffs, stop-desk status & active shipping carrier names. */
export async function GET(request: NextRequest) {
  try {
    const courierId = new URL(request.url).searchParams.get("courierId")?.trim() || undefined;
    const coverage = await getStorefrontDeliveryCoverage({ courierId });
    return NextResponse.json(
      { success: true, ...coverage },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to load 69-wilaya coverage",
      },
      { status: 500 },
    );
  }
}
