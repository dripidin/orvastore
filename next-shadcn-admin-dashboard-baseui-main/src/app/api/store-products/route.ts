import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { revalidateStore } from "@/lib/catalog/revalidate";
import { adminCreateProduct, adminListProducts } from "@/lib/catalog/server";

export const dynamic = "force-dynamic";

function errorResponse(err: unknown, status = 500) {
  return NextResponse.json(
    { success: false, error: err instanceof Error ? err.message : "Unexpected error" },
    { status },
  );
}

/** Admin: every product (any status) with internal costs. */
export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, data: await adminListProducts() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Admin: create a product. */
export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const product = await adminCreateProduct(body);
    revalidateStore([product.publicUrl ?? ""].filter(Boolean));
    return NextResponse.json({ success: true, data: product });
  } catch (err) {
    return errorResponse(err, 400);
  }
}
