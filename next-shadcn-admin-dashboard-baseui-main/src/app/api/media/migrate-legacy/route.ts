import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import {
  buildMediaPublicUrl,
  listMediaAssets,
  type MediaFolder,
  resolveMediaBackend,
  uploadMediaBuffer,
} from "@/lib/media/hostinger-media";
import { rewriteMediaUrlReferences } from "@/lib/media/usage-scanner";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SUPABASE_STORAGE_URL_RE = /https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/[^\s"'`<>\\)]+/gi;
const BUCKET_NAME = "product-images";

interface LegacyScanProduct {
  id: string;
  name: string;
  slug: string;
}

interface LegacyBucketObject {
  name: string;
  sizeBytes: number;
}

interface LegacyMediaScanState {
  legacyUrlCount: number;
  legacyUrls: string[];
  affectedProducts: LegacyScanProduct[];
  logoUrls: Set<string>;
  bucketObjectCount: number;
  bucketObjects: LegacyBucketObject[];
  canCleanupBucket: boolean;
}

function unauthorized() {
  return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
}

function collectSupabaseUrls(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    const matches = value.match(SUPABASE_STORAGE_URL_RE);
    if (matches) {
      for (const m of matches) found.add(m);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSupabaseUrls(item, found);
    return;
  }
  if (value && typeof value === "object") {
    for (const val of Object.values(value)) collectSupabaseUrls(val, found);
  }
}

function extractSafeFilenameFromLegacyUrl(rawUrl: string): { filename: string; stem: string } {
  let base = "legacy-image.webp";
  try {
    const parsed = new URL(rawUrl);
    const extracted = path.posix.basename(decodeURIComponent(parsed.pathname));
    if (extracted) base = extracted;
  } catch {
    // keep fallback
  }
  const clean = base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  const prefixed = /^[a-z0-9]/.test(clean) ? clean : `migrated-${clean}`;
  const hasAllowedExt = /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(prefixed);
  const filename = hasAllowedExt ? prefixed : `${prefixed}.webp`;
  const stem = filename.replace(/\.[a-z0-9]+$/i, "") || "legacy-image";
  return { filename, stem };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function listAllBucketObjects(supabase: any, prefix = "", depth = 0): Promise<LegacyBucketObject[]> {
  if (depth > 2) return [];
  const { data, error } = await supabase.storage.from(BUCKET_NAME).list(prefix, { limit: 1000 });
  if (error || !Array.isArray(data)) return [];

  const results: LegacyBucketObject[] = [];
  for (const item of data) {
    if (!item?.name) continue;
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    // In Supabase Storage list(), folder placeholders have id === null
    if (item.id === null) {
      const nested = await listAllBucketObjects(supabase, fullPath, depth + 1);
      results.push(...nested);
    } else {
      results.push({
        name: fullPath,
        sizeBytes: Number(item.metadata?.size || 0),
      });
    }
  }
  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function scanLegacyMediaState(supabase: any): Promise<LegacyMediaScanState> {
  const legacyUrls = new Set<string>();
  const logoUrls = new Set<string>();
  const affectedProducts: LegacyScanProduct[] = [];
  const seenProductIds = new Set<string>();

  // 1. Products table
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, name, slug, metadata");
  if (productsError) {
    throw new Error(`تعذر فحص جدول المنتجات: ${productsError.message}`);
  }

  for (const row of products ?? []) {
    const foundInProduct = new Set<string>();
    collectSupabaseUrls(row.metadata, foundInProduct);
    if (foundInProduct.size > 0) {
      for (const u of foundInProduct) legacyUrls.add(u);
      if (!seenProductIds.has(row.id)) {
        seenProductIds.add(row.id);
        affectedProducts.push({
          id: String(row.id),
          name: String(row.name || row.slug || "منتج"),
          slug: String(row.slug || ""),
        });
      }
    }
  }

  // 2. product_media table (optional)
  try {
    const { data: mediaRows } = await supabase.from("product_media").select("id, url");
    for (const row of mediaRows ?? []) {
      collectSupabaseUrls(row.url, legacyUrls);
    }
  } catch {
    // optional legacy table
  }

  // 3. site_settings (store logo / integrations)
  try {
    const { data: settingsRow } = await supabase
      .from("site_settings")
      .select("id, integrations")
      .eq("id", 1)
      .maybeSingle();
    if (settingsRow?.integrations) {
      collectSupabaseUrls(settingsRow.integrations, logoUrls);
      for (const u of logoUrls) legacyUrls.add(u);
    }
  } catch {
    // optional
  }

  // 4. Bucket objects in product-images
  let bucketObjects: LegacyBucketObject[] = [];
  try {
    bucketObjects = await listAllBucketObjects(supabase);
  } catch {
    bucketObjects = [];
  }

  const urlList = Array.from(legacyUrls);
  return {
    legacyUrlCount: urlList.length,
    legacyUrls: urlList,
    affectedProducts,
    logoUrls,
    bucketObjectCount: bucketObjects.length,
    bucketObjects,
    canCleanupBucket: urlList.length === 0 && bucketObjects.length > 0,
  };
}

function toPublicPayload(state: LegacyMediaScanState) {
  return {
    legacyUrlCount: state.legacyUrlCount,
    legacyUrls: state.legacyUrls,
    affectedProducts: state.affectedProducts,
    bucketObjectCount: state.bucketObjectCount,
    bucketObjects: state.bucketObjects,
    canCleanupBucket: state.canCleanupBucket,
  };
}

async function checkHostingerAssetExists(
  candidateUrl: string,
  folder: MediaFolder,
  filename: string
): Promise<boolean> {
  if (/^https?:\/\//i.test(candidateUrl)) {
    try {
      const head = await fetch(candidateUrl, { method: "HEAD", cache: "no-store" });
      const contentType = (head.headers.get("content-type") || "").toLowerCase();
      if (head.ok && contentType.startsWith("image/")) {
        return true;
      }
    } catch {
      // fall through to local listing check
    }
  }

  try {
    const listing = await listMediaAssets();
    return listing.items.some((item) => item.folder === folder && item.filename === filename);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorized();

  try {
    const supabase = getSupabaseServerClient();
    const state = await scanLegacyMediaState(supabase);
    return NextResponse.json({
      success: true,
      ...toPublicPayload(state),
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "تعذر فحص روابط Supabase القديمة.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) return unauthorized();

  try {
    const body = (await request.json().catch(() => null)) as { action?: string } | null;
    const action = body?.action === "cleanup_bucket" ? "cleanup_bucket" : "migrate";
    const supabase = getSupabaseServerClient();

    if (action === "cleanup_bucket") {
      const state = await scanLegacyMediaState(supabase);
      if (state.legacyUrlCount > 0) {
        return NextResponse.json(
          {
            success: false,
            code: "LEGACY_REFS_REMAIN",
            error: `لا يمكن تنظيف سلة Supabase الآن: ما يزال هناك ${state.legacyUrlCount} رابط قديم مستخدم في قاعدة البيانات.`,
            ...toPublicPayload(state),
          },
          { status: 409 }
        );
      }

      if (state.bucketObjects.length === 0) {
        return NextResponse.json({
          success: true,
          action,
          deletedCount: 0,
          ...toPublicPayload(state),
        });
      }

      const paths = state.bucketObjects.map((obj) => obj.name);
      const { error: removeError } = await supabase.storage.from(BUCKET_NAME).remove(paths);
      if (removeError) {
        throw new Error(`تعذر حذف ملفات سلة Supabase: ${removeError.message}`);
      }

      const afterState = await scanLegacyMediaState(supabase);
      return NextResponse.json({
        success: true,
        action,
        deletedCount: paths.length,
        ...toPublicPayload(afterState),
      });
    }

    // action === "migrate"
    const initialState = await scanLegacyMediaState(supabase);
    if (initialState.legacyUrls.length === 0) {
      return NextResponse.json({
        success: true,
        action,
        alreadyClean: true,
        migrated: [],
        ...toPublicPayload(initialState),
      });
    }

    const backend = await resolveMediaBackend();
    const migrated: Array<{
      oldUrl: string;
      newUrl: string;
      folder: MediaFolder;
      skippedReupload: boolean;
      rewrite: { updatedProducts: number; updatedProductMedia: number; updatedLogo: boolean };
    }> = [];

    for (const oldUrl of initialState.legacyUrls) {
      const folder: MediaFolder = initialState.logoUrls.has(oldUrl) ? "branding" : "products";
      const { filename, stem } = extractSafeFilenameFromLegacyUrl(oldUrl);
      const candidateUrl = buildMediaPublicUrl(backend.publicBaseUrl, folder, filename);

      let newUrl = "";
      let skippedReupload = false;

      if (await checkHostingerAssetExists(candidateUrl, folder, filename)) {
        newUrl = candidateUrl;
        skippedReupload = true;
      } else {
        const downloadRes = await fetch(oldUrl, { cache: "no-store" });
        if (!downloadRes.ok) {
          throw new Error(`تعذر تحميل الصورة القديمة (${downloadRes.status}): ${oldUrl}`);
        }
        const bytes = Buffer.from(await downloadRes.arrayBuffer());
        const claimedMime = downloadRes.headers.get("content-type") || undefined;
        const uploaded = await uploadMediaBuffer({
          bytes,
          name: stem,
          folder,
          claimedMime,
        });

        if (/^https?:\/\//i.test(uploaded.url)) {
          const verifyHead = await fetch(uploaded.url, { method: "HEAD", cache: "no-store" });
          if (!verifyHead.ok) {
            throw new Error(`فشل التحقق من وصول الصورة الجديدة (${verifyHead.status}): ${uploaded.url}`);
          }
        }
        newUrl = uploaded.url;
      }

      const rewrite = await rewriteMediaUrlReferences(oldUrl, newUrl, supabase);
      migrated.push({
        oldUrl,
        newUrl,
        folder,
        skippedReupload,
        rewrite,
      });
    }

    const afterState = await scanLegacyMediaState(supabase);
    return NextResponse.json({
      success: true,
      action,
      alreadyClean: false,
      migrated,
      ...toPublicPayload(afterState),
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "فشل ترحيل الصور القديمة.",
      },
      { status: 500 }
    );
  }
}
