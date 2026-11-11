import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { STORE_PATHS, revalidateStore } from "@/lib/catalog/revalidate";
import { adminListProducts } from "@/lib/catalog/server";

export const dynamic = "force-dynamic";

const state: { publishedAt: string | null } =
  (globalThis as { __orvaStorePublish?: { publishedAt: string | null } }).__orvaStorePublish ??
  ((globalThis as { __orvaStorePublish?: { publishedAt: string | null } }).__orvaStorePublish = { publishedAt: null });

async function catalogSummary() {
  const products = await adminListProducts().catch(() => []);
  return products.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    publicUrl: p.publicUrl ?? null,
    price: p.sellingPrice,
    image: p.images[0] ?? null,
  }));
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    publishedAt: state.publishedAt,
    paths: STORE_PATHS,
    products: await catalogSummary(),
  });
}

/** Admin: refresh every storefront page so the latest catalog, prices and designs are live. */
export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const products = await catalogSummary();
    revalidateStore(products.map((p) => p.publicUrl).filter((u): u is string => Boolean(u)));
    state.publishedAt = new Date().toISOString();
    return NextResponse.json({ success: true, publishedAt: state.publishedAt, paths: STORE_PATHS, products });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Publish failed" },
      { status: 500 },
    );
  }
}
