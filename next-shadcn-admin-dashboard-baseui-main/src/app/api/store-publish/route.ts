import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";

export const dynamic = "force-dynamic";

/** Storefront routes refreshed by "Publish to Store" (dashboard and store share the same app). */
const STORE_PATHS = ["/", "/pack1", "/pack2", "/pack3", "/checkout"];

const state: { publishedAt: string | null } =
  (globalThis as { __orvaStorePublish?: { publishedAt: string | null } }).__orvaStorePublish ??
  ((globalThis as { __orvaStorePublish?: { publishedAt: string | null } }).__orvaStorePublish = { publishedAt: null });

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ success: true, publishedAt: state.publishedAt, paths: STORE_PATHS });
}

/** Admin: clear the storefront cache so products, prices and page designs go live now. */
export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    for (const path of STORE_PATHS) revalidatePath(path);
    revalidatePath("/", "layout");
    state.publishedAt = new Date().toISOString();
    return NextResponse.json({ success: true, publishedAt: state.publishedAt, paths: STORE_PATHS });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Publish failed" },
      { status: 500 },
    );
  }
}
