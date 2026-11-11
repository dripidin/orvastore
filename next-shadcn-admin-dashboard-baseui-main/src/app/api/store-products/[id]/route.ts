import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { revalidateStore } from "@/lib/catalog/revalidate";
import { adminDeleteProduct, adminGetProduct, adminUpdateProduct } from "@/lib/catalog/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

function errorResponse(err: unknown, status = 400) {
  return NextResponse.json(
    { success: false, error: err instanceof Error ? err.message : "Unexpected error" },
    { status },
  );
}

export async function GET(request: NextRequest, { params }: Ctx) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const product = await adminGetProduct((await params).id);
    if (!product) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: product });
  } catch (err) {
    return errorResponse(err, 500);
  }
}

/** Admin: partial update (fields, status/publish, landing content or page layout). */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const product = await adminUpdateProduct((await params).id, await request.json());
    revalidateStore([product.publicUrl ?? ""].filter(Boolean));
    return NextResponse.json({ success: true, data: product });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Admin: delete (or archive when orders reference the product). */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const result = await adminDeleteProduct((await params).id);
    revalidateStore();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
