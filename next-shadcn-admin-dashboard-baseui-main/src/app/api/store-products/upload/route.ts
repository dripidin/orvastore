import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { uploadProductImage } from "@/lib/catalog/server";

export const dynamic = "force-dynamic";

/** Admin: upload one product image ({ dataUrl, name }) to Supabase Storage; returns its public URL. */
export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { dataUrl, name } = (await request.json()) as { dataUrl?: string; name?: string };
    if (!dataUrl) throw new Error("dataUrl مطلوب");
    const url = await uploadProductImage(dataUrl, name);
    return NextResponse.json({ success: true, url });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
