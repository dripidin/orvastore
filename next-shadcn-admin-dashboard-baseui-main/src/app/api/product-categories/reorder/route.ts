import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { adminReorderCategories } from "@/lib/categories/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => null)) as {
      items?: Array<{ id?: string; displayOrder?: number; parentId?: string | null }>;
    } | null;

    const items = body?.items;
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 500 ||
      items.some(
        (i) =>
          !UUID.test(i.id ?? "") ||
          typeof i.displayOrder !== "number" ||
          !Number.isFinite(i.displayOrder)
      )
    ) {
      return NextResponse.json({ success: false, error: "بيانات إعادة الترتيب غير صالحة." }, { status: 400 });
    }

    await adminReorderCategories(
      items.map((i) => ({
        id: String(i.id),
        displayOrder: Number(i.displayOrder),
        parentId: i.parentId === undefined ? undefined : i.parentId || null,
      }))
    );

    return NextResponse.json({ success: true, count: items.length });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "تعذر حفظ ترتيب التصنيفات." },
      { status: 400 }
    );
  }
}
