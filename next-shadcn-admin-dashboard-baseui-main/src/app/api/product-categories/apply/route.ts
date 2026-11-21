import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { assignments?: Array<{ productId?: string; categoryId?: string }> };
    const assignments = body.assignments;
    if (!Array.isArray(assignments) || assignments.length > 500 || assignments.some((item) => !UUID.test(item.productId ?? "") || !UUID.test(item.categoryId ?? ""))) {
      return NextResponse.json({ success: false, error: "قائمة ربط المنتجات غير صالحة." }, { status: 400 });
    }
    const { error } = await (getSupabaseServerClient() as any).rpc("assign_product_categories", { p_assignments: assignments });
    if (error) throw error;
    return NextResponse.json({ success: true, updatedCount: assignments.length });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "تعذر حفظ ارتباطات المنتجات." }, { status: 400 });
  }
}
