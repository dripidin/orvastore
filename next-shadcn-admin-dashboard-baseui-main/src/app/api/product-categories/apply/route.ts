import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { adminApplyCategoryAssignments } from "@/lib/categories/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => null)) as {
      assignments?: Array<{ productId?: string; categoryId?: string | null }>;
    } | null;
    const assignments = body?.assignments;

    if (
      !Array.isArray(assignments) ||
      assignments.length > 500 ||
      assignments.some(
        (item) =>
          !UUID.test(item.productId ?? "") ||
          (item.categoryId !== null && item.categoryId !== "" && item.categoryId !== undefined && !UUID.test(item.categoryId))
      )
    ) {
      return NextResponse.json({ success: false, error: "قائمة ربط المنتجات غير صالحة." }, { status: 400 });
    }

    const clean = assignments.map((item) => ({
      productId: String(item.productId),
      categoryId: item.categoryId ? String(item.categoryId) : null,
    }));

    const result = await adminApplyCategoryAssignments(clean);
    return NextResponse.json({
      success: true,
      updatedCount: result.updatedCount,
      usedRpc: result.usedRpc,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "تعذر حفظ ارتباطات المنتجات." },
      { status: 400 }
    );
  }
}
