import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Category = { id: string; name: string; slug: string; description: string | null; parent_id: string | null; display_order: number; active: boolean; productCount?: number };
const db = () => getSupabaseServerClient() as any;
const slugify = (name: string) => name.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const [{ data: categories, error }, { data: products, error: productsError }] = await Promise.all([
      db().from("categories").select("id,name,slug,description,parent_id,display_order,active").order("display_order").order("name"),
      db().from("products").select("id,category_id"),
    ]);
    if (error) throw error;
    if (productsError) throw productsError;
    const counts = new Map<string, number>();
    for (const product of products ?? []) if (product.category_id) counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1);
    return NextResponse.json({ success: true, data: (categories ?? []).map((c: Category) => ({ ...c, productCount: counts.get(c.id) ?? 0 })) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "تعذر جلب التصنيفات" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { name?: string; description?: string; parentId?: string | null };
    const name = body.name?.trim();
    if (!name || name.length > 80) return NextResponse.json({ success: false, error: "اسم التصنيف مطلوب (حتى 80 حرفاً)." }, { status: 400 });
    if (body.parentId) {
      const { data: parent, error: parentError } = await db().from("categories").select("id,parent_id").eq("id", body.parentId).maybeSingle();
      if (parentError) throw parentError;
      if (!parent || parent.parent_id) throw new Error("اختر تصنيفاً رئيسياً موجوداً لإنشاء تصنيف فرعي تحته.");
    }
    const { data, error } = await db().from("categories").insert({ name, slug: `${slugify(name)}-${Date.now().toString(36)}`, description: body.description?.trim() || null, parent_id: body.parentId || null, active: true }).select("id,name,slug,description,parent_id,display_order,active").single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "تعذر حفظ التصنيف" }, { status: 400 });
  }
}
