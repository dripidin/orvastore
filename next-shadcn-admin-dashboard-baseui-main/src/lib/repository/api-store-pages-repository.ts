"use client";

/**
 * Store pages + landing layouts backed by the server catalog.
 * A store page is simply a product's public landing page: published == product status "active".
 */
import { generateProductPageHtml } from "@/lib/generator/product-page-html-generator";

import { getApiProductsRepository } from "./api-products-repository";
import { createDefaultLayoutConfig, type ILayoutRepository, type ProductPageLayoutConfig } from "./layout-types";
import type { Product } from "./product-types";
import type {
  IStorePagesRepository,
  SitemapEntry,
  StorePage,
  StorePageCreateInput,
  StorePageStatus,
  StorePageSyncResult,
  StorePageUpdateInput,
} from "./store-pages-types";

const PAGE_PREFIX = "page_";

function pageStatus(p: Product): StorePageStatus {
  if (p.status === "active") return "published";
  if (p.status === "archived") return "archived";
  return "preview_ready";
}

function toPage(p: Product): StorePage {
  const status = pageStatus(p);
  return {
    pageId: `${PAGE_PREFIX}${p.id}`,
    productId: p.id,
    productSku: p.sku,
    slug: p.slug ?? p.id,
    title: p.title,
    templateId: "orva-storefront",
    templateVersion: "2.0.0",
    status,
    publicUrl: status === "published" ? (p.publicUrl ?? null) : null,
    previewPath: p.publicUrl ?? "",
    metaDescription: (p.description || p.subtitle || "").slice(0, 160),
    lastGeneratedAt: p.updatedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function productIdFromPage(pageId: string): string {
  return pageId.startsWith(PAGE_PREFIX) ? pageId.slice(PAGE_PREFIX.length) : pageId;
}

export class ApiStorePagesRepository implements IStorePagesRepository {
  private products = getApiProductsRepository();

  async getPages(): Promise<StorePage[]> {
    return (await this.products.getProducts()).map(toPage);
  }

  async getPageById(pageId: string): Promise<StorePage | null> {
    const p = await this.products.getProductById(productIdFromPage(pageId));
    return p ? toPage(p) : null;
  }

  async getPageByProductId(productId: string): Promise<StorePage | null> {
    const p = await this.products.getProductById(productId);
    return p ? toPage(p) : null;
  }

  async createPage(input: StorePageCreateInput): Promise<StorePage> {
    const page = await this.getPageByProductId(input.productId);
    if (!page) throw new Error("أنشئ المنتج أولاً من صفحة المنتجات");
    return page;
  }

  async updatePage(pageId: string, updates: StorePageUpdateInput): Promise<StorePage> {
    const id = productIdFromPage(pageId);
    const patch: Partial<Product> = {};
    if (updates.title) patch.title = updates.title;
    if (updates.status === "published") patch.status = "active";
    if (updates.status === "archived") patch.status = "archived";
    if (updates.status === "draft" || updates.status === "preview_ready") patch.status = "draft";
    const p = Object.keys(patch).length
      ? await this.products.updateProduct(id, patch)
      : await this.products.getProductById(id);
    if (!p) throw new Error("الصفحة غير موجودة");
    return toPage(p);
  }

  /** Publishing = making the product visible in the store (and refreshing the storefront cache). */
  async publishPage(pageId: string): Promise<StorePage> {
    const p = await this.products.updateProduct(productIdFromPage(pageId), { status: "active" });
    await fetch("/api/store-publish", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    return toPage(p);
  }

  async unpublishPage(pageId: string): Promise<StorePage> {
    return toPage(await this.products.updateProduct(productIdFromPage(pageId), { status: "draft" }));
  }

  async archivePage(pageId: string): Promise<StorePage> {
    return toPage(await this.products.updateProduct(productIdFromPage(pageId), { status: "archived" }));
  }

  async generatePreviewHtml(pageId: string): Promise<string> {
    const product = await this.products.getProductById(productIdFromPage(pageId));
    if (!product) throw new Error("المنتج غير موجود");
    return generateProductPageHtml({
      product,
      layoutConfig: product.layout ?? createDefaultLayoutConfig(product.id),
      storePage: toPage(product),
      baseAssetPath: "/",
      isProduction: false,
    });
  }

  async syncWithProduct(productId: string): Promise<StorePageSyncResult> {
    const page = await this.getPageByProductId(productId);
    if (!page) {
      return { page: null as unknown as StorePage, actionTaken: "no_change", message: "المنتج غير موجود" };
    }
    return { page, actionTaken: "no_change", message: "الصفحة متزامنة تلقائياً مع المنتج." };
  }

  async getSitemapEntries(): Promise<SitemapEntry[]> {
    return (await this.getPages()).map((p) => {
      const isPublished = p.status === "published" && Boolean(p.publicUrl);
      return {
        url: p.publicUrl ?? p.previewPath,
        status: p.status,
        productId: p.productId,
        productSku: p.productSku,
        title: p.title,
        lastModified: p.updatedAt,
        changeFrequency: isPublished ? "daily" : "monthly",
        priority: isPublished ? 1.0 : 0.3,
        isPublicIndexable: isPublished,
      };
    });
  }
}

/** Landing-page layouts stored on the product (products.metadata.layout). */
export class ApiLayoutRepository implements ILayoutRepository {
  private products = getApiProductsRepository();

  /** Returns the unpublished draft when there is one, otherwise the live layout. */
  async getLayoutConfig(productId = "global_default"): Promise<ProductPageLayoutConfig> {
    const p = await this.products.getProductById(productId);
    const cfg = p?.layoutDraft ?? p?.layout;
    return cfg ? { ...cfg, productId } : createDefaultLayoutConfig(productId);
  }

  /** Saves a draft: visible in the designer only, not in the store. */
  async saveLayoutConfig(config: ProductPageLayoutConfig): Promise<ProductPageLayoutConfig> {
    const saved = { ...config, updatedAt: new Date().toISOString() };
    await this.products.saveLayout(config.productId, saved, false);
    return saved;
  }

  /** Makes the layout live on the product's landing page. */
  async publishLayoutConfig(config: ProductPageLayoutConfig): Promise<ProductPageLayoutConfig> {
    const saved = { ...config, updatedAt: new Date().toISOString() };
    await this.products.saveLayout(config.productId, saved, true);
    return saved;
  }

  async resetLayoutConfig(productId = "global_default"): Promise<ProductPageLayoutConfig> {
    return this.publishLayoutConfig(createDefaultLayoutConfig(productId));
  }

  async restoreDefaultLayout(productId = "global_default"): Promise<ProductPageLayoutConfig> {
    return this.resetLayoutConfig(productId);
  }
}

let pagesInstance: ApiStorePagesRepository | null = null;
let layoutInstance: ApiLayoutRepository | null = null;

export function getApiStorePagesRepository(): ApiStorePagesRepository {
  if (!pagesInstance) pagesInstance = new ApiStorePagesRepository();
  return pagesInstance;
}

export function getApiLayoutRepository(): ApiLayoutRepository {
  if (!layoutInstance) layoutInstance = new ApiLayoutRepository();
  return layoutInstance;
}
