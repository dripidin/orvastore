import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { adminListProducts } from "@/lib/catalog/server";
import { EcoTrackClient, loadCourierConfig } from "@/lib/couriers";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ courierId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const { courierId } = await context.params;
  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";

  const cfg = await loadCourierConfig(courierId);
  if (!cfg || (cfg.family !== "ecotrack" && cfg.id !== "redex")) {
    return NextResponse.json(
      { success: false, products: [], error: "مستودع المنتجات عبر API متاح لشركات EcoTrack / Redex" },
      { status: 400 },
    );
  }

  const client = new EcoTrackClient({ courierId: cfg.id, baseUrl: cfg.baseUrl, token: cfg.apiToken });
  const [ecoRes, localProducts] = await Promise.all([
    client.getAllProducts(forceRefresh),
    adminListProducts().catch(() => []),
  ]);

  if (!ecoRes.success) {
    return NextResponse.json({ success: false, products: [], error: ecoRes.error }, { status: 502 });
  }

  const localBySku = new Map(localProducts.map((p) => [p.sku.trim().toLowerCase(), p]));
  const matched = ecoRes.products.map((item) => {
    const skuKey = item.reference.trim().toLowerCase();
    const localMatch = localBySku.get(skuKey) || null;
    return {
      ...item,
      matchedLocalProductId: localMatch?.id ?? null,
      matchedLocalProductTitle: localMatch?.title ?? null,
    };
  });

  return NextResponse.json({
    success: true,
    courierId: cfg.id,
    total: matched.length,
    products: matched,
  });
}
