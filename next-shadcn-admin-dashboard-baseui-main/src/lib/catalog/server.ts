import { STOREFRONT_PACKS, type PackBoxItem, type StorefrontPack } from "@/data/storefront-packs";
import { createDefaultLayoutConfig, type ProductPageLayoutConfig } from "@/lib/repository/layout-types";
import type { Product, ProductStatus } from "@/lib/repository/product-types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

import {
  type CatalogStatus,
  type LandingOverrides,
  type StoreProduct,
  packIdFromSlug,
  productRoute,
  slugify,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type ProductRow = {
  id: string;
  name: string;
  name_fr: string | null;
  slug: string;
  sku: string | null;
  short_description: string | null;
  description: string | null;
  base_price: number | string;
  original_price: number | string | null;
  status: CatalogStatus;
  is_featured: boolean | null;
  stock_quantity: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

const LEGACY_BY_SLUG: Record<string, StorefrontPack> = {
  pack1: STOREFRONT_PACKS.PACK1,
  pack2: STOREFRONT_PACKS.PACK2,
  pack3: STOREFRONT_PACKS.PACK3,
};

function db(): any {
  return getSupabaseServerClient() as any;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function rowImages(row: ProductRow): string[] {
  const meta = row.metadata ?? {};
  if (Array.isArray(meta.images) && meta.images.length > 0) return meta.images.map(String);
  const legacy = LEGACY_BY_SLUG[row.slug];
  if (legacy) return [legacy.heroImage, legacy.allProductsImage];
  return ["/placeholder.svg"];
}

function boxItemsFromList(items: string[]): PackBoxItem[] {
  return items.map((name, i) => ({ id: i + 1, name, tag: "", desc: "", iconName: "Wrench" as const }));
}

/** Builds the landing-page content for a product: admin data first, legacy pack copy as fallback. */
function buildLanding(row: ProductRow, images: string[]): StorefrontPack {
  const meta = row.metadata ?? {};
  const landing: LandingOverrides = meta.landing ?? {};
  const legacy = LEGACY_BY_SLUG[row.slug];
  const price = num(row.base_price);
  const original = row.original_price == null ? null : num(row.original_price);
  const subtitle = meta.subtitle || row.short_description || legacy?.subtitleAr || "";
  const description = row.description || legacy?.descriptionAr || subtitle;
  const seedItems: string[] = Array.isArray(meta.items) ? meta.items.map(String) : [];
  const highlights =
    landing.highlightsAr && landing.highlightsAr.length > 0
      ? landing.highlightsAr
      : legacy?.highlightsAr ?? seedItems;
  const boxItems =
    landing.boxItems && landing.boxItems.length > 0
      ? landing.boxItems
      : legacy?.boxItems ?? boxItemsFromList(highlights);
  const originalPrice = original && original > price ? original : price;

  return {
    id: packIdFromSlug(row.slug),
    slug: row.slug,
    route: productRoute(row.slug),
    nameAr: row.name,
    nameFr: row.name_fr ?? legacy?.nameFr ?? row.name,
    subtitleAr: subtitle,
    badgeAr: landing.badgeAr ?? legacy?.badgeAr ?? "عرض خاص",
    badgeColor: legacy?.badgeColor ?? "bg-amber-600",
    priceDzd: price,
    alternatePriceDzd: landing.alternatePriceDzd ?? legacy?.alternatePriceDzd,
    originalPriceDzd: originalPrice,
    savingsDzd: Math.max(0, originalPrice - price),
    rating: landing.rating ?? legacy?.rating ?? 4.9,
    reviewsCount: landing.reviewsCount ?? legacy?.reviewsCount ?? 0,
    heroImage: images[0],
    allProductsImage: images[1] ?? images[0],
    heroImageAlt: row.name,
    descriptionAr: description,
    highlightsAr: highlights,
    boxItems,
    crossSellTargetId: landing.crossSellSlug ? packIdFromSlug(landing.crossSellSlug) : (legacy?.crossSellTargetId ?? ""),
    crossSellHeading: legacy?.crossSellHeading ?? "منتجات أخرى قد تعجبك",
    crossSellSubtitle: legacy?.crossSellSubtitle ?? "اكتشف باقي منتجات متجر أورفا بنفس شروط التوصيل والدفع عند الاستلام",
    crossSellCtaText: legacy?.crossSellCtaText ?? "شاهد المنتج",
    seo: {
      title: landing.seoTitle || `${row.name} — ${new Intl.NumberFormat("fr-DZ").format(price)} د.ج | متجر أورفا ORVA Store`,
      description: landing.seoDescription || description,
      keywords: legacy?.seo.keywords ?? [row.name, "ORVA", "الجزائر", "الدفع عند الاستلام"],
    },
  };
}

function toStoreProduct(row: ProductRow): StoreProduct {
  const meta = row.metadata ?? {};
  const images = rowImages(row);
  return {
    id: row.id,
    slug: row.slug,
    packId: packIdFromSlug(row.slug),
    route: productRoute(row.slug),
    sku: row.sku ?? "",
    title: row.name,
    subtitle: meta.subtitle || row.short_description || "",
    description: row.description ?? "",
    priceDzd: num(row.base_price),
    originalPriceDzd: row.original_price == null ? null : num(row.original_price),
    images,
    stockQuantity: num(row.stock_quantity),
    showOutOfStock: meta.landing?.showOutOfStock === true,
    status: row.status,
    isFeatured: row.is_featured !== false,
    sortOrder: num(meta.sortOrder, 100),
    updatedAt: row.updated_at,
    landing: buildLanding(row, images),
    layout: meta.layout ?? null,
  };
}

/** Static fallback when the database is unreachable, so the store never renders empty. */
function legacyFallback(): StoreProduct[] {
  return Object.values(LEGACY_BY_SLUG).map((pack, i) =>
    toStoreProduct({
      id: `legacy-${pack.slug}`,
      name: pack.nameAr,
      name_fr: pack.nameFr,
      slug: pack.slug,
      sku: pack.id,
      short_description: pack.subtitleAr,
      description: pack.descriptionAr,
      base_price: pack.priceDzd,
      original_price: pack.originalPriceDzd,
      status: "PUBLISHED",
      is_featured: true,
      stock_quantity: 50,
      metadata: { sortOrder: i + 1 },
      created_at: "",
      updated_at: "",
    }),
  );
}

function sortProducts(list: StoreProduct[]): StoreProduct[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.priceDzd - b.priceDzd);
}

// ── Storefront reads ─────────────────────────────────────────────────────────

export async function listPublishedProducts(): Promise<StoreProduct[]> {
  try {
    const { data, error } = await db().from("products").select("*").eq("status", "PUBLISHED");
    if (error) throw error;
    return sortProducts((data as ProductRow[]).map(toStoreProduct));
  } catch (err) {
    console.warn("[catalog] listPublishedProducts fallback:", err);
    return legacyFallback();
  }
}

export async function getPublishedProductBySlug(slug: string): Promise<StoreProduct | null> {
  try {
    const { data, error } = await db()
      .from("products")
      .select("*")
      .eq("slug", slug)
      .eq("status", "PUBLISHED")
      .maybeSingle();
    if (error) throw error;
    return data ? toStoreProduct(data as ProductRow) : null;
  } catch (err) {
    console.warn("[catalog] getPublishedProductBySlug fallback:", err);
    return legacyFallback().find((p) => p.slug === slug) ?? null;
  }
}

/** Published products ranked by number of (non-cancelled) orders; ties fall back to catalog order. */
export async function listBestSellers(limit = 2, published?: StoreProduct[]): Promise<StoreProduct[]> {
  const products = published ?? (await listPublishedProducts());
  const counts = new Map<string, number>();
  try {
    const { data, error } = await db()
      .from("orders")
      .select("pack_id, status")
      .not("pack_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error) throw error;
    for (const row of data ?? []) {
      const status = String(row.status || "").toUpperCase();
      if (status === "CANCELLED" || status === "DELETED") continue;
      const key = String(row.pack_id).toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  } catch (err) {
    console.warn("[catalog] listBestSellers: order counts unavailable:", err);
  }
  return products
    .map((p, index) => ({ p, index, n: counts.get(p.packId) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.p);
}

/** Accepted unit prices for an order line, read from the DB (null = product unknown / DB offline). */
export async function getAllowedPricesForPack(packId: string): Promise<number[] | null> {
  try {
    const { data, error } = await db()
      .from("products")
      .select("base_price, metadata, status")
      .eq("slug", packId.toLowerCase())
      .maybeSingle();
    if (error) return null;
    if (!data || data.status !== "PUBLISHED") return [];
    const prices = [num(data.base_price)];
    const alt = data.metadata?.landing?.alternatePriceDzd;
    if (alt) prices.push(num(alt));
    return prices;
  } catch {
    return null;
  }
}

// ── Admin (dashboard) ────────────────────────────────────────────────────────

const STATUS_TO_DB: Record<ProductStatus, CatalogStatus> = {
  active: "PUBLISHED",
  draft: "DRAFT",
  archived: "ARCHIVED",
};
const STATUS_FROM_DB: Record<CatalogStatus, ProductStatus> = {
  PUBLISHED: "active",
  DRAFT: "draft",
  ARCHIVED: "archived",
};

async function readPrivate(ids: string[]): Promise<Map<string, { purchase: number; marketing: number }>> {
  const map = new Map<string, { purchase: number; marketing: number }>();
  if (ids.length === 0) return map;
  try {
    const { data } = await db().from("product_private").select("*").in("product_id", ids);
    for (const r of data ?? []) {
      map.set(r.product_id, { purchase: num(r.purchase_cost), marketing: num(r.marketing_cost_per_order) });
    }
  } catch {
    // migration not applied yet: costs default to 0
  }
  return map;
}

function toAdminProduct(row: ProductRow, priv?: { purchase: number; marketing: number }): Product {
  const sp = toStoreProduct(row);
  return {
    id: row.id,
    sku: row.sku ?? "",
    title: row.name,
    subtitle: sp.subtitle,
    description: row.description ?? "",
    images: sp.images,
    sellingPrice: sp.priceDzd,
    purchaseCost: priv?.purchase ?? 0,
    marketingCostPerOrder: priv?.marketing ?? 0,
    stockQuantity: sp.stockQuantity,
    lowStockThreshold: num(row.metadata?.lowStockThreshold, 5),
    status: STATUS_FROM_DB[row.status] ?? "draft",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slug: row.slug,
    publicUrl: sp.route,
    originalPrice: sp.originalPriceDzd,
    highlights: sp.landing.highlightsAr,
    layout: sp.layout,
    layoutDraft: row.metadata?.layoutDraft ?? null,
    showOutOfStock: sp.showOutOfStock,
  };
}

export async function adminListProducts(): Promise<Product[]> {
  const { data, error } = await db().from("products").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = data as ProductRow[];
  const priv = await readPrivate(rows.map((r) => r.id));
  return rows.map((r) => toAdminProduct(r, priv.get(r.id)));
}

export async function adminGetProduct(id: string): Promise<Product | null> {
  const { data, error } = await db().from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const priv = await readPrivate([id]);
  return toAdminProduct(data as ProductRow, priv.get(id));
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await db().from("products").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function writePrivate(id: string, input: Partial<Product>) {
  if (input.purchaseCost === undefined && input.marketingCostPerOrder === undefined) return;
  try {
    const { data } = await db().from("product_private").select("*").eq("product_id", id).maybeSingle();
    await db()
      .from("product_private")
      .upsert({
        product_id: id,
        purchase_cost: input.purchaseCost ?? data?.purchase_cost ?? 0,
        marketing_cost_per_order: input.marketingCostPerOrder ?? data?.marketing_cost_per_order ?? 0,
        updated_at: new Date().toISOString(),
      });
  } catch (err) {
    console.warn("[catalog] product_private write skipped (run migration 20261111_000003):", err);
  }
}

export interface AdminProductInput extends Partial<Product> {
  layout?: ProductPageLayoutConfig;
  layoutDraft?: ProductPageLayoutConfig | null;
  landing?: LandingOverrides;
}

export async function adminCreateProduct(input: AdminProductInput): Promise<Product> {
  const title = (input.title ?? "").trim();
  if (title.length < 2) throw new Error("اسم المنتج مطلوب");
  const price = num(input.sellingPrice);
  if (price <= 0) throw new Error("سعر البيع غير صالح");

  const slug = await uniqueSlug(slugify(input.slug || input.sku || title));
  const metadata = {
    subtitle: input.subtitle ?? "",
    images: input.images?.length ? input.images : [],
    lowStockThreshold: input.lowStockThreshold ?? 5,
    sortOrder: 100,
    landing: { highlightsAr: input.highlights ?? [], showOutOfStock: input.showOutOfStock === true },
    layout: input.layout ?? createDefaultLayoutConfig(slug),
  };

  const { data, error } = await db()
    .from("products")
    .insert({
      name: title,
      slug,
      sku: input.sku?.trim() || null,
      short_description: input.subtitle ?? null,
      description: input.description ?? null,
      base_price: price,
      original_price: input.originalPrice && input.originalPrice > price ? input.originalPrice : null,
      status: STATUS_TO_DB[input.status ?? "draft"],
      is_featured: true,
      stock_quantity: Math.max(0, Math.round(num(input.stockQuantity))),
      metadata,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await writePrivate(data.id, input);
  return (await adminGetProduct(data.id)) as Product;
}

export async function adminUpdateProduct(id: string, input: AdminProductInput): Promise<Product> {
  const { data: current, error: readErr } = await db().from("products").select("*").eq("id", id).maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!current) throw new Error("المنتج غير موجود");

  const meta: Record<string, any> = { ...(current.metadata ?? {}) };
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if (input.title !== undefined) patch.name = input.title.trim();
  if (input.sku !== undefined) patch.sku = input.sku.trim() || null;
  if (input.subtitle !== undefined) {
    patch.short_description = input.subtitle;
    meta.subtitle = input.subtitle;
  }
  if (input.description !== undefined) patch.description = input.description;
  if (input.sellingPrice !== undefined) patch.base_price = num(input.sellingPrice);
  if (input.originalPrice !== undefined) patch.original_price = input.originalPrice || null;
  if (input.stockQuantity !== undefined) patch.stock_quantity = Math.max(0, Math.round(num(input.stockQuantity)));
  if (input.status !== undefined) patch.status = STATUS_TO_DB[input.status];
  if (input.images !== undefined) meta.images = input.images;
  if (input.lowStockThreshold !== undefined) meta.lowStockThreshold = input.lowStockThreshold;
  if (input.highlights !== undefined) meta.landing = { ...(meta.landing ?? {}), highlightsAr: input.highlights };
  if (input.landing !== undefined) meta.landing = { ...(meta.landing ?? {}), ...input.landing };
  if (input.showOutOfStock !== undefined) {
    meta.landing = { ...(meta.landing ?? {}), showOutOfStock: input.showOutOfStock === true };
  }
  if (input.layoutDraft !== undefined) meta.layoutDraft = input.layoutDraft;
  if (input.layout !== undefined) {
    meta.layout = input.layout;
    delete meta.layoutDraft;
  }
  patch.metadata = meta;

  const { error } = await db().from("products").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await writePrivate(id, input);
  return (await adminGetProduct(id)) as Product;
}

/** Hard delete when no order references the product; otherwise archive it (keeps order history intact). */
export async function adminDeleteProduct(
  id: string,
): Promise<{ actionTaken: "deleted" | "archived"; orderReferenceCount: number }> {
  let refs = 0;
  try {
    const { count } = await db()
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("product_id", id);
    refs = count ?? 0;
  } catch {
    refs = 0;
  }
  if (refs > 0) {
    await adminUpdateProduct(id, { status: "archived" });
    return { actionTaken: "archived", orderReferenceCount: refs };
  }
  const { error } = await db().from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { actionTaken: "deleted", orderReferenceCount: 0 };
}

const BUCKET = "product-images";

/** Uploads a data: URL to Supabase Storage and returns its public URL. */
export async function uploadProductImage(dataUrl: string, name = "image"): Promise<string> {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error("صيغة الصورة غير مدعومة");
  const [, mime, b64] = match;
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length > 4 * 1024 * 1024) throw new Error("حجم الصورة أكبر من 4MB");
  const ext = mime.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg");
  const path = `${Date.now().toString(36)}-${slugify(name).slice(0, 40)}.${ext}`;

  const storage = db().storage;
  let { error } = await storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (error && /bucket/i.test(error.message)) {
    await storage.createBucket(BUCKET, { public: true }).catch(() => undefined);
    ({ error } = await storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false }));
  }
  if (error) throw new Error(error.message);
  return storage.from(BUCKET).getPublicUrl(path).data.publicUrl as string;
}
