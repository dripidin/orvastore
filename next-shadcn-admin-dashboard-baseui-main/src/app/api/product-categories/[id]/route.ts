import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import {
  adminDeleteCategory,
  adminUpdateCategory,
  CategoryDeleteConflictError,
} from "@/lib/categories/server";
import type { CategoryDeleteMode } from "@/lib/categories/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as {
      name?: string;
      slug?: string;
      description?: string | null;
      parentId?: string | null;
      iconName?: string | null;
      displayOrder?: number;
      active?: boolean;
    } | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "بيانات التحديث غير صالحة." }, { status: 400 });
    }

    const updated = await adminUpdateCategory(id, {
      name: body.name,
      slug: body.slug,
      description: body.description,
      parentId: body.parentId,
      iconName: body.iconName,
      displayOrder: body.displayOrder,
      active: body.active,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "تعذر تحديث التصنيف" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      mode?: CategoryDeleteMode;
      reassignToCategoryId?: string | null;
    };

    const rawMode = request.nextUrl.searchParams.get("mode") || body.mode;
    const mode: CategoryDeleteMode =
      rawMode === "unlink" || rawMode === "reassign" ? rawMode : "restrict";
    const reassignToCategoryId =
      request.nextUrl.searchParams.get("reassignToCategoryId") || body.reassignToCategoryId || null;

    await adminDeleteCategory(id, { mode, reassignToCategoryId });
    return NextResponse.json({ success: true, mode });
  } catch (error) {
    if (error instanceof CategoryDeleteConflictError) {
      return NextResponse.json({ success: false, ...error.conflict }, { status: 409 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "تعذر حذف التصنيف" },
      { status: 400 }
    );
  }
}
