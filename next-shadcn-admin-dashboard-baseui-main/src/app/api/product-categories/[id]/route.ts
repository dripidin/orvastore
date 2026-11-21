import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const db = () => getSupabaseServerClient() as any;
type Ctx = { params: Promise<{ id: string }> };
const slugify = (name: string) => name.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!(await verifyAdminSession(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json() as { name?: string; description?: string | null; parentId?: string | null; displayOrder?: number; active?: boolean };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name || name.length > 80) throw new Error("اسم التصنيف مطلوب (حتى 80 حرفاً).");
      patch.name = name;
      patch.slug = `${slugify(name)}-${Date.now().toString(36)}`;
    }
    if (body.description !== undefined) patch.description = body.description?.trim() || null;
    if (body.parentId !== undefined) patch.parent_id = body.parentId || null;
    if (body.displayOrder !== undefined) patch.display_order = body.displayOrder;
    if (body.active !== undefined) patch.active = body.active;
    if (patch.parent_id === id) throw new Error("لا يمكن جعل التصنيف أباً لنفسه.");
    if (typeof patch.parent_id === "string") {
      const { data: parent, error: parentError } = await db().from("categories").select("id,parent_id").eq("id", patch.parent_id).maybeSingle();
      if (parentError) throw parentError;
      if (!parent || parent.parent_id) throw new Error("التصنيف الفرعي يجب أن يتصل بتصنيف رئيسي.");
    }
    const { data, error } = await db().from("categories").update(patch).eq("id", id).select("id,name,slug,description,parent_id,display_order,active").single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "تعذر تحديث التصنيف" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  if (!(await verifyAdminSession(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const client = db();
    const { data: children, error: childError } = await client.from("categories").select("id").eq("parent_id", id).limit(1);
    if (childError) throw childError;
    if (children?.length) throw new Error("انقل التصنيفات الفرعية أو احذفها أولاً.");
    const { data: assigned, error: assignedError } = await client.from("products").select("id").eq("category_id", id).limit(1);
    if (assignedError) throw assignedError;
    if (assigned?.length) throw new Error("أعد تصنيف المنتجات المرتبطة قبل حذف هذا التصنيف.");
    const { error } = await client.from("categories").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "تعذر حذف التصنيف" }, { status: 400 });
  }
}
