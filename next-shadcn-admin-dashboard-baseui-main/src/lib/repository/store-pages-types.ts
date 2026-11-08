/**
 * ORVA Store — Store Pages & Sitemap Contracts
 * 
 * Architecture:
 * - Public Storefront Pages follow the authentic Algerian eCommerce template.
 * - Store Pages administration and Sitemap registry live inside Next.js Dashboard.
 * - Published status is strictly guarded: only verified live URLs are "published".
 * - Unreleased/new products are "preview_ready" or "draft", with publicUrl = null.
 */

export type StorePageStatus = "published" | "preview_ready" | "draft" | "archived";

export interface StorePage {
  pageId: string;                  // e.g. "page_pack_1_pro", "page_pack_3_ultra"
  productId: string;               // Linked Product ID in ProductsRepository
  productSku: string;              // e.g. "ORVA-P1-PRO"
  slug: string;                    // Clean URL slug (e.g. "pack1", "products/pack-3-ultra")
  title: string;                   // Public page title
  templateId: string;              // e.g. "orva-calm-night-light"
  templateVersion: string;         // e.g. "1.0.0"
  status: StorePageStatus;
  publicUrl: string | null;        // Valid public URL ONLY if published (e.g. "/pack1.html"), strictly null otherwise
  previewPath: string;             // Local preview path (e.g. "/data/preview/products/page_pack_3_ultra.html")
  metaDescription: string;
  lastGeneratedAt: string;         // ISO 8601 UTC
  createdAt: string;               // ISO 8601 UTC
  updatedAt: string;               // ISO 8601 UTC
}

export type StorePageCreateInput = Omit<StorePage, "createdAt" | "updatedAt">;
export type StorePageUpdateInput = Partial<Omit<StorePage, "pageId" | "createdAt" | "updatedAt">>;

export interface SitemapEntry {
  url: string;                     // Public URL for published, or preview path for staged
  status: StorePageStatus;
  productId: string;
  productSku: string;
  title: string;
  lastModified: string;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
  isPublicIndexable: boolean;      // Strictly true ONLY if status === "published" AND publicUrl !== null
}

export interface StorePageSyncResult {
  page: StorePage;
  actionTaken: "created" | "updated" | "archived" | "no_change";
  message: string;
}

export interface IStorePagesRepository {
  getPages(): Promise<StorePage[]>;
  getPageById(pageId: string): Promise<StorePage | null>;
  getPageByProductId(productId: string): Promise<StorePage | null>;
  createPage(input: StorePageCreateInput): Promise<StorePage>;
  updatePage(pageId: string, updates: StorePageUpdateInput): Promise<StorePage>;
  publishPage(pageId: string): Promise<StorePage>;
  unpublishPage(pageId: string): Promise<StorePage>;
  archivePage(pageId: string): Promise<StorePage>;
  generatePreviewHtml(pageId: string): Promise<string>;
  syncWithProduct(productId: string): Promise<StorePageSyncResult>;
  getSitemapEntries(): Promise<SitemapEntry[]>;
}
