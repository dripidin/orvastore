import { type NextRequest, NextResponse } from "next/server";

import { getMediaSettingsAction } from "@/app/actions/settings";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import {
  buildMediaPublicUrl,
  deleteMediaAsset,
  listMediaAssets,
  renameMediaAsset,
  resolveMediaBackend,
  sanitizeMediaFolder,
  uploadMediaBuffer,
  uploadMediaDataUrl,
  type MediaAssetItem,
} from "@/lib/media/hostinger-media";
import {
  findMediaUsagesForUrl,
  normalizeMediaCompareKey,
  rewriteMediaUrlReferences,
  scanAllMediaUsages,
  unlinkMediaUrlReferences,
} from "@/lib/media/usage-scanner";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const [listing, settings, usageMap] = await Promise.all([
      listMediaAssets(),
      getMediaSettingsAction(),
      scanAllMediaUsages(),
    ]);

    const items = listing.items.map((item) => {
      const usages = usageMap.get(normalizeMediaCompareKey(item.url)) ?? [];
      return {
        ...item,
        usages,
        usageCount: usages.length,
      };
    });

    return NextResponse.json({
      success: true,
      provider: listing.provider,
      publicBaseUrl: listing.publicBaseUrl,
      settings,
      items,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "تعذر جلب مكتبة الوسائط." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const contentType = (request.headers.get("content-type") || "").toLowerCase();

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const folder = sanitizeMediaFolder(form.get("folder"), "products");
      const files = form.getAll("files");
      const singleFile = form.get("file");
      const allEntries = [...files, ...(singleFile ? [singleFile] : [])].filter(
        (entry): entry is File => entry instanceof File && entry.size > 0
      );

      if (allEntries.length === 0) {
        return NextResponse.json({ success: false, error: "يرجى اختيار صورة واحدة على الأقل." }, { status: 400 });
      }

      const uploaded: Array<MediaAssetItem & { usages: never[]; usageCount: number }> = [];
      let providerUsed = "hostinger-fs";
      for (const file of allEntries) {
        const bytes = Buffer.from(await file.arrayBuffer());
        const res = await uploadMediaBuffer({
          bytes,
          name: String(form.get("name") || file.name || "image"),
          folder,
          claimedMime: file.type || null,
        });
        providerUsed = res.provider;
        uploaded.push({ ...res.item, usages: [], usageCount: 0 });
      }

      return NextResponse.json({
        success: true,
        provider: providerUsed,
        item: uploaded[0],
        items: uploaded,
        url: uploaded[0].url,
      });
    }

    const body = (await request.json().catch(() => null)) as {
      dataUrl?: string;
      name?: string;
      folder?: string;
    } | null;
    if (!body?.dataUrl) {
      return NextResponse.json({ success: false, error: "dataUrl أو ملف صورة مطلوب." }, { status: 400 });
    }

    const res = await uploadMediaDataUrl({
      dataUrl: body.dataUrl,
      name: body.name || "image",
      folder: sanitizeMediaFolder(body.folder, "products"),
    });

    return NextResponse.json({
      success: true,
      provider: res.provider,
      item: { ...res.item, usages: [], usageCount: 0 },
      items: [{ ...res.item, usages: [], usageCount: 0 }],
      url: res.url,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "فشل رفع الصورة." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const body = (await request.json().catch(() => null)) as {
      folder?: string;
      filename?: string;
      newName?: string;
      updateReferences?: boolean;
    } | null;

    if (!body?.filename || !body?.newName) {
      return NextResponse.json(
        { success: false, error: "اسم الملف الحالي والاسم الجديد مطلوبان." },
        { status: 400 }
      );
    }

    const folder = sanitizeMediaFolder(body.folder, "products");
    const renamed = await renameMediaAsset({
      folder,
      filename: body.filename,
      newName: body.newName,
    });

    let rewriteSummary = { updatedProducts: 0, updatedProductMedia: 0, updatedLogo: false };
    if (body.updateReferences !== false && renamed.oldUrl !== renamed.newUrl) {
      rewriteSummary = await rewriteMediaUrlReferences(renamed.oldUrl, renamed.newUrl);
    }

    const usages = await findMediaUsagesForUrl(renamed.newUrl);

    return NextResponse.json({
      success: true,
      provider: renamed.provider,
      oldUrl: renamed.oldUrl,
      newUrl: renamed.newUrl,
      rewriteSummary,
      item: {
        ...renamed.item,
        usages,
        usageCount: usages.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "تعذر إعادة تسمية الملف.";
    const status = msg.includes("يوجد ملف آخر") ? 409 : msg.includes("غير موجود") ? 404 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorized();
  try {
    const body = (await request.json().catch(() => null)) as {
      folder?: string;
      filename?: string;
      force?: boolean;
      unlinkReferences?: boolean;
    } | null;

    if (!body?.filename) {
      return NextResponse.json({ success: false, error: "اسم الملف مطلوب للحذف." }, { status: 400 });
    }

    const folder = sanitizeMediaFolder(body.folder, "products");
    const backend = await resolveMediaBackend();
    const targetUrl = buildMediaPublicUrl(backend.publicBaseUrl, folder, body.filename);
    const usages = await findMediaUsagesForUrl(targetUrl);

    if (usages.length > 0 && body.force !== true) {
      return NextResponse.json(
        {
          success: false,
          code: "MEDIA_IN_USE",
          error: `هذه الصورة مستخدمة حالياً في ${usages.length} موضع بالموقع. قم بفك ارتباطها أو أكّد الحذف الإجباري.`,
          usages,
        },
        { status: 409 }
      );
    }

    const deleted = await deleteMediaAsset({ folder, filename: body.filename });
    let unlinkSummary = { updatedProducts: 0, deletedProductMedia: 0, resetLogo: false };
    if (usages.length > 0 && body.unlinkReferences !== false) {
      unlinkSummary = await unlinkMediaUrlReferences(deleted.url);
    }

    return NextResponse.json({
      success: true,
      deleted: true,
      url: deleted.url,
      unlinkSummary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "تعذر حذف الصورة.";
    const status = msg.includes("غير موجود") ? 404 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
