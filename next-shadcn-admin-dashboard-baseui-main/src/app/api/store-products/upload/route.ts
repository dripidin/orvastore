import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { uploadProductImage, uploadProductImageBuffer } from "@/lib/catalog/server";

export const dynamic = "force-dynamic";

/** Admin: upload one product image (multipart binary or { dataUrl, name }) to Hostinger media storage. */
export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size <= 0) {
        throw new Error("ملف الصورة مطلوب");
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const res = await uploadProductImageBuffer(
        bytes,
        String(form.get("name") || file.name || "image"),
        file.type || null
      );
      return NextResponse.json({ success: true, url: res.url, provider: res.provider });
    }

    const { dataUrl, name } = (await request.json()) as { dataUrl?: string; name?: string };
    if (!dataUrl) throw new Error("dataUrl مطلوب");
    const url = await uploadProductImage(dataUrl, name);
    return NextResponse.json({ success: true, url });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 }
    );
  }
}
