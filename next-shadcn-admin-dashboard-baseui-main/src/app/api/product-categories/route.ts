import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { adminCreateCategory, adminListCategories } from "@/lib/categories/server";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const result = await adminListCategories();
    return NextResponse.json({
      success: true,
      data: result.categories,
      capabilities: result.capabilities,
      stats: {
        totalProducts: result.totalProducts,
        uncategorizedCount: result.uncategorizedCount,
        categorizedCount: Math.max(0, result.totalProducts - result.uncategorizedCount),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "تعذر جلب التصنيفات" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      slug?: string;
      description?: string | null;
      parentId?: string | null;
      iconName?: string | null;
      displayOrder?: number;
      active?: boolean;
    } | null;

    if (!body?.name) {
      return NextResponse.json({ success: false, error: "اسم التصنيف مطلوب." }, { status: 400 });
    }

    const created = await adminCreateCategory({
      name: body.name,
      slug: body.slug,
      description: body.description,
      parentId: body.parentId ?? null,
      iconName: body.iconName,
      displayOrder: body.displayOrder,
      active: body.active,
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "تعذر حفظ التصنيف" },
      { status: 400 }
    );
  }
}
