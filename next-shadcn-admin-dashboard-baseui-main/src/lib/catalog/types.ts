import type { PackBoxItem, StorefrontPack } from "@/data/storefront-packs";
import type { ProductPageLayoutConfig } from "@/lib/repository/layout-types";

/** DB status of a row in public.products. Only PUBLISHED rows are visible in the store. */
export type CatalogStatus = "PUBLISHED" | "DRAFT" | "ARCHIVED";

/** Editable landing-page content kept in products.metadata.landing (all optional overrides). */
export interface LandingOverrides {
  badgeAr?: string;
  highlightsAr?: string[];
  boxItems?: PackBoxItem[];
  rating?: number;
  reviewsCount?: number;
  alternatePriceDzd?: number;
  crossSellSlug?: string;
  /** Admin switch: show the "out of stock" notice on product cards and the landing page. */
  showOutOfStock?: boolean;
  seoTitle?: string;
  seoDescription?: string;
}

/** A product as the storefront sees it (no internal costs). */
export interface StoreProduct {
  id: string;
  slug: string;
  /** Order/catalog id sent with orders: slug uppercased (PACK1 for slug pack1). */
  packId: string;
  route: string;
  sku: string;
  title: string;
  subtitle: string;
  description: string;
  priceDzd: number;
  originalPriceDzd: number | null;
  images: string[];
  stockQuantity: number;
  showOutOfStock: boolean;
  status: CatalogStatus;
  isFeatured: boolean;
  sortOrder: number;
  updatedAt: string;
  landing: StorefrontPack;
  layout: ProductPageLayoutConfig | null;
}

export const LEGACY_PACK_SLUGS = ["pack1", "pack2", "pack3"] as const;

export function productRoute(slug: string): string {
  return (LEGACY_PACK_SLUGS as readonly string[]).includes(slug) ? `/${slug}/` : `/p/${encodeURIComponent(slug)}/`;
}

export function packIdFromSlug(slug: string): string {
  return slug.toUpperCase();
}

/** Latin, lowercase, dash-separated slug. Falls back to a random suffix for non-Latin titles. */
export function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || `product-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatDzd(value: number): string {
  return `${new Intl.NumberFormat("fr-DZ").format(value)} د.ج`;
}

/** Minimal product info for navbar / footer links. */
export interface NavProduct {
  id: string;
  title: string;
  route: string;
  priceDzd: number;
}

export function toNavProduct(p: StoreProduct): NavProduct {
  return { id: p.id, title: p.title, route: p.route, priceDzd: p.priceDzd };
}
