/**
 * ORVA Store — Media Usage Scanner & Reference Rewriter
 * Answers "Where is this image used?" across products, product_media, and store branding,
 * and safely rewrites or unlinks URLs when an admin renames or deletes a file.
 */

import { revalidateStore } from "@/lib/catalog/revalidate";
import { OFFICIAL_STORE_LOGO_URL } from "@/lib/settings/settings-store";
import { getSupabaseServerClient } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface MediaUsageLocation {
  kind: "product" | "product_media" | "store_logo";
  label: string;
  role: string;
  entityId?: string;
  slug?: string;
  href?: string;
}

export function normalizeMediaCompareKey(rawUrl: string): string {
  const trimmed = String(rawUrl || "").trim();
  if (!trimmed) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      return decodeURIComponent(parsed.pathname).replace(/\/+$/, "");
    }
    return decodeURIComponent(trimmed.split("?")[0]).replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const val of Object.values(value)) collectStrings(val, out);
  }
  return out;
}

function replaceUrlInValue(value: unknown, oldKey: string, oldUrl: string, newUrl: string): { changed: boolean; next: unknown } {
  if (typeof value === "string") {
    if (value === oldUrl || (oldKey && normalizeMediaCompareKey(value) === oldKey)) {
      return { changed: true, next: newUrl };
    }
    return { changed: false, next: value };
  }
  if (Array.isArray(value)) {
    let anyChanged = false;
    const nextArr = value.map((item) => {
      const r = replaceUrlInValue(item, oldKey, oldUrl, newUrl);
      if (r.changed) anyChanged = true;
      return r.next;
    });
    return { changed: anyChanged, next: nextArr };
  }
  if (value && typeof value === "object") {
    let anyChanged = false;
    const nextObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = replaceUrlInValue(v, oldKey, oldUrl, newUrl);
      if (r.changed) anyChanged = true;
      nextObj[k] = r.next;
    }
    return { changed: anyChanged, next: nextObj };
  }
  return { changed: false, next: value };
}

function removeUrlFromValue(value: unknown, targetKey: string, targetUrl: string): { changed: boolean; next: unknown } {
  if (Array.isArray(value)) {
    let anyChanged = false;
    const filtered: unknown[] = [];
    for (const item of value) {
      if (typeof item === "string") {
        if (item === targetUrl || (targetKey && normalizeMediaCompareKey(item) === targetKey)) {
          anyChanged = true;
          continue;
        }
        filtered.push(item);
      } else {
        const r = removeUrlFromValue(item, targetKey, targetUrl);
        if (r.changed) anyChanged = true;
        filtered.push(r.next);
      }
    }
    return { changed: anyChanged, next: filtered };
  }
  if (value && typeof value === "object") {
    let anyChanged = false;
    const nextObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && (v === targetUrl || (targetKey && normalizeMediaCompareKey(v) === targetKey))) {
        anyChanged = true;
        nextObj[k] = "";
      } else {
        const r = removeUrlFromValue(v, targetKey, targetUrl);
        if (r.changed) anyChanged = true;
        nextObj[k] = r.next;
      }
    }
    return { changed: anyChanged, next: nextObj };
  }
  return { changed: false, next: value };
}

export async function scanAllMediaUsages(
  supabaseOverride?: any
): Promise<Map<string, MediaUsageLocation[]>> {
  const usageMap = new Map<string, MediaUsageLocation[]>();
  const addUsage = (rawUrl: string, loc: MediaUsageLocation) => {
    const key = normalizeMediaCompareKey(rawUrl);
    if (!key) return;
    const existing = usageMap.get(key) ?? [];
    if (!existing.some((e) => e.kind === loc.kind && e.entityId === loc.entityId && e.role === loc.role)) {
      existing.push(loc);
      usageMap.set(key, existing);
    }
  };

  let supabase: any = supabaseOverride;
  if (!supabase) {
    try {
      supabase = getSupabaseServerClient() as any;
    } catch {
      return usageMap;
    }
  }

  // 1. Scan public.products
  try {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, slug, status, metadata");
    const productById = new Map<string, { name: string; slug: string }>();

    for (const row of products ?? []) {
      productById.set(row.id, { name: row.name, slug: row.slug });
      const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      const images: string[] = Array.isArray(meta.images) ? meta.images.map(String) : [];

      images.forEach((imgUrl, idx) => {
        addUsage(imgUrl, {
          kind: "product",
          label: row.name,
          role: idx === 0 ? "غلاف رئيسي للمنتج" : `صورة معرض (#${idx + 1})`,
          entityId: row.id,
          slug: row.slug,
          href: `/dashboard/products?edit=${encodeURIComponent(row.id)}`,
        });
      });

      for (const nestedKey of ["landing", "layout", "layoutDraft"] as const) {
        if (!meta[nestedKey]) continue;
        for (const str of collectStrings(meta[nestedKey])) {
          if (/^https?:\/\/|^\/uploads\//i.test(str)) {
            addUsage(str, {
              kind: "product",
              label: row.name,
              role: nestedKey === "landing" ? "محتوى صفحة الهبوط" : "مصمم صفحة المنتج",
              entityId: row.id,
              slug: row.slug,
              href: `/dashboard/products/designer`,
            });
          }
        }
      }
    }

    // 2. Scan public.product_media
    try {
      const { data: mediaRows } = await supabase.from("product_media").select("id, product_id, url");
      for (const mr of mediaRows ?? []) {
        const prod = productById.get(mr.product_id);
        addUsage(String(mr.url || ""), {
          kind: "product_media",
          label: prod?.name || "وسائط منتج",
          role: "سجل جدول product_media",
          entityId: mr.product_id,
          slug: prod?.slug,
          href: `/dashboard/products`,
        });
      }
    } catch {
      // product_media optional
    }
  } catch (err) {
    console.warn("[usage-scanner] products scan warning:", err);
  }

  // 3. Scan public.site_settings (Store Logo)
  try {
    const { data: settingsRow } = await supabase
      .from("site_settings")
      .select("id, integrations")
      .eq("id", 1)
      .maybeSingle();
    const logoUrl = settingsRow?.integrations?.store?.logo_url;
    if (typeof logoUrl === "string" && logoUrl.trim()) {
      addUsage(logoUrl, {
        kind: "store_logo",
        label: "شعار المتجر الرسمي (Store Logo)",
        role: "الهيدر والفوتر والهوية",
        href: `/dashboard/settings`,
      });
    }
  } catch {
    // ignore settings read errors
  }

  return usageMap;
}

export async function findMediaUsagesForUrl(
  url: string,
  supabaseOverride?: any
): Promise<MediaUsageLocation[]> {
  const map = await scanAllMediaUsages(supabaseOverride);
  return map.get(normalizeMediaCompareKey(url)) ?? [];
}

export async function rewriteMediaUrlReferences(
  oldUrl: string,
  newUrl: string,
  supabaseOverride?: any
): Promise<{ updatedProducts: number; updatedProductMedia: number; updatedLogo: boolean }> {
  const oldKey = normalizeMediaCompareKey(oldUrl);
  let updatedProducts = 0;
  let updatedProductMedia = 0;
  let updatedLogo = false;
  const affectedSlugs: string[] = [];

  let supabase: any = supabaseOverride;
  if (!supabase) {
    try {
      supabase = getSupabaseServerClient() as any;
    } catch {
      return { updatedProducts, updatedProductMedia, updatedLogo };
    }
  }

  // 1. Update public.products.metadata
  const { data: products } = await supabase.from("products").select("id, slug, metadata");
  for (const row of products ?? []) {
    const res = replaceUrlInValue(row.metadata, oldKey, oldUrl, newUrl);
    if (res.changed) {
      await supabase
        .from("products")
        .update({ metadata: res.next, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      updatedProducts += 1;
      if (row.slug) affectedSlugs.push(`/p/${row.slug}`, `/${row.slug}`);
    }
  }

  // 2. Update public.product_media
  try {
    const { data: mediaRows } = await supabase.from("product_media").select("id, url");
    for (const mr of mediaRows ?? []) {
      if (mr.url === oldUrl || (oldKey && normalizeMediaCompareKey(mr.url) === oldKey)) {
        await supabase.from("product_media").update({ url: newUrl }).eq("id", mr.id);
        updatedProductMedia += 1;
      }
    }
  } catch {
    // optional table
  }

  // 3. Update site_settings.integrations.store.logo_url
  try {
    const { data: settingsRow } = await supabase
      .from("site_settings")
      .select("id, integrations")
      .eq("id", 1)
      .maybeSingle();
    const logoUrl = settingsRow?.integrations?.store?.logo_url;
    if (typeof logoUrl === "string" && (logoUrl === oldUrl || (oldKey && normalizeMediaCompareKey(logoUrl) === oldKey))) {
      const nextIntegrations = {
        ...(settingsRow.integrations || {}),
        store: {
          ...(settingsRow.integrations?.store || {}),
          logo_url: newUrl,
        },
      };
      await supabase
        .from("site_settings")
        .update({ integrations: nextIntegrations, updated_at: new Date().toISOString() })
        .eq("id", 1);
      updatedLogo = true;
    }
  } catch {
    // ignore
  }

  if (updatedProducts > 0 || updatedProductMedia > 0 || updatedLogo) {
    revalidateStore(affectedSlugs);
  }

  return { updatedProducts, updatedProductMedia, updatedLogo };
}

export async function unlinkMediaUrlReferences(
  targetUrl: string,
  supabaseOverride?: any
): Promise<{ updatedProducts: number; deletedProductMedia: number; resetLogo: boolean }> {
  const targetKey = normalizeMediaCompareKey(targetUrl);
  let updatedProducts = 0;
  let deletedProductMedia = 0;
  let resetLogo = false;
  const affectedSlugs: string[] = [];

  let supabase: any = supabaseOverride;
  if (!supabase) {
    try {
      supabase = getSupabaseServerClient() as any;
    } catch {
      return { updatedProducts, deletedProductMedia, resetLogo };
    }
  }

  const { data: products } = await supabase.from("products").select("id, slug, metadata");
  for (const row of products ?? []) {
    const res = removeUrlFromValue(row.metadata, targetKey, targetUrl);
    if (res.changed) {
      await supabase
        .from("products")
        .update({ metadata: res.next, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      updatedProducts += 1;
      if (row.slug) affectedSlugs.push(`/p/${row.slug}`, `/${row.slug}`);
    }
  }

  try {
    const { data: mediaRows } = await supabase.from("product_media").select("id, url");
    for (const mr of mediaRows ?? []) {
      if (mr.url === targetUrl || (targetKey && normalizeMediaCompareKey(mr.url) === targetKey)) {
        await supabase.from("product_media").delete().eq("id", mr.id);
        deletedProductMedia += 1;
      }
    }
  } catch {
    // optional
  }

  try {
    const { data: settingsRow } = await supabase
      .from("site_settings")
      .select("id, integrations")
      .eq("id", 1)
      .maybeSingle();
    const logoUrl = settingsRow?.integrations?.store?.logo_url;
    if (typeof logoUrl === "string" && (logoUrl === targetUrl || (targetKey && normalizeMediaCompareKey(logoUrl) === targetKey))) {
      const nextIntegrations = {
        ...(settingsRow.integrations || {}),
        store: {
          ...(settingsRow.integrations?.store || {}),
          logo_url: OFFICIAL_STORE_LOGO_URL,
        },
      };
      await supabase
        .from("site_settings")
        .update({ integrations: nextIntegrations, updated_at: new Date().toISOString() })
        .eq("id", 1);
      resetLogo = true;
    }
  } catch {
    // ignore
  }

  if (updatedProducts > 0 || deletedProductMedia > 0 || resetLogo) {
    revalidateStore(affectedSlugs);
  }

  return { updatedProducts, deletedProductMedia, resetLogo };
}
