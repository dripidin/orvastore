import type {
  IStorePagesRepository,
  StorePage,
  StorePageCreateInput,
  StorePageStatus,
  StorePageSyncResult,
  StorePageUpdateInput,
  SitemapEntry,
} from "./store-pages-types";
import { getMockProductsRepository } from "./mock-products-repository";
import { getMockLayoutRepository } from "./mock-layout-repository";
import { generateProductPageHtml } from "../generator/product-page-html-generator";

/**
 * Initial dataset of store pages for ORVA Store.
 * Strictly adheres to rule: ONLY existing, verified live routes have status="published".
 * Unreleased products have status="preview_ready" and publicUrl = null.
 */
const INITIAL_STORE_PAGES: StorePage[] = [
  {
    pageId: "page_store_catalog",
    productId: "prod_pack_1_pro",
    productSku: "ORVA-CATALOG",
    slug: "",
    title: "الكتالوج الرئيسي والمتجر العام — ORVA Store",
    templateId: "orva-calm-night-light",
    templateVersion: "1.0.0",
    status: "published",
    publicUrl: "/",
    previewPath: "/",
    metaDescription: "المتجر الرسمي لمنتجات ومعدات ORVA الأصلية في الجزائر، عروض الصيانة والتجهيزات مع التوصيل لـ 58 ولاية والدفع عند الاستلام.",
    lastGeneratedAt: "2026-10-31T06:00:00Z",
    createdAt: "2026-10-01T08:00:00Z",
    updatedAt: "2026-10-31T06:00:00Z",
  },
  {
    pageId: "page_pack_1_pro",
    productId: "prod_pack_1_pro",
    productSku: "ORVA-P1-PRO",
    slug: "pack1",
    title: "عِرض كومبريسار والمفاتيح 4 في 1 — Pack 1 Pro",
    templateId: "orva-calm-night-light",
    templateVersion: "1.0.0",
    status: "published",
    publicUrl: "/pack1",
    previewPath: "/pack1",
    metaDescription: "باك الخدمة والصيانة 4 في 1 للسيارة والمنزل: منفاخ عجلات TOYOTA، طقم مفاتيح 46 قطعة، مفك مرن 11 قطعة، وطقم 6 مفكات مع التوصيل والدفع عند الاستلام.",
    lastGeneratedAt: "2026-10-31T06:00:00Z",
    createdAt: "2026-10-25T10:00:00Z",
    updatedAt: "2026-10-31T06:00:00Z",
  },
  {
    pageId: "page_pack_2_elite",
    productId: "prod_pack_2_elite",
    productSku: "ORVA-P2-ELITE",
    slug: "pack2",
    title: "باقة الفيسوز كراون Elite 5 في 1 — Pack 2 Elite",
    templateId: "orva-calm-night-light",
    templateVersion: "1.0.0",
    status: "published",
    publicUrl: "/pack2",
    previewPath: "/pack2",
    metaDescription: "عرض 5 في 1 الفاخر: ماكينة ثقب CROWN 20V ببطاريتين، طقم مفكات 6 قطع، علبة مفاتيح 46 قطعة، مفك مرن وقفازات مع التوصيل السريع.",
    lastGeneratedAt: "2026-10-31T06:00:00Z",
    createdAt: "2026-10-26T12:00:00Z",
    updatedAt: "2026-10-31T06:00:00Z",
  },
  {
    pageId: "page_pack_3_ultra",
    productId: "prod_pack_3_ultra",
    productSku: "ORVA-P3-ULTRA",
    slug: "pack3",
    title: "باقة سودير كراون الصلب 6 في 1 — Pack 3 Ultra",
    templateId: "orva-calm-night-light",
    templateVersion: "1.0.0",
    status: "published",
    publicUrl: "/pack3",
    previewPath: "/pack3",
    metaDescription: "عرض 6 في 1 المتميز للورشات الكبرى مع معدات صيانة كهربائية وميكانيكية عالية الجودة.",
    lastGeneratedAt: "2026-10-31T06:00:00Z",
    createdAt: "2026-10-29T14:00:00Z",
    updatedAt: "2026-10-31T06:00:00Z",
  },
  {
    pageId: "page_checkout_confirmation",
    productId: "prod_pack_1_pro",
    productSku: "ORVA-CHECKOUT",
    slug: "checkout/confirmation",
    title: "صفحة تأكيد واستلام الطلب — Checkout Confirmation",
    templateId: "orva-calm-night-light",
    templateVersion: "1.0.0",
    status: "published",
    publicUrl: "/checkout/confirmation",
    previewPath: "/checkout/confirmation",
    metaDescription: "صفحة تأكيد تسجيل واستلام الطلبية مع تفاصيل الفاتورة والشحن وتتبع الإرسال مع شركة ريدكس إكسبريس.",
    lastGeneratedAt: "2026-10-31T06:00:00Z",
    createdAt: "2026-10-29T15:00:00Z",
    updatedAt: "2026-10-31T06:00:00Z",
  },
];

const STORAGE_KEY = "orva_store_pages_v2";

async function callPublishApi(payload: {
  action: "preview" | "publish" | "unpublish" | "archive";
  pageId?: string;
  slug?: string;
  html?: string;
}): Promise<unknown> {
  if (typeof window !== "undefined") {
    try {
      const res = await fetch("/api/publish-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}
  } else {
    // Node.js environment (server, scripts, automated tests)
    try {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const fs = require("fs");
      const path = require("path");
      const rootDir = process.cwd();
      const previewDir = path.join(rootDir, "data", "preview", "products");
      const productsDir = path.join(rootDir, "products");
      if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });
      if (!fs.existsSync(productsDir)) fs.mkdirSync(productsDir, { recursive: true });

      const slug = (payload.slug || payload.pageId || "product").replace(/^products\//, "").replace(/\.html$/, "");
      const safeId = (payload.pageId || slug).replace(/[^a-zA-Z0-9_-]/g, "_");

      if (payload.action === "preview" && payload.html) {
        fs.writeFileSync(path.join(previewDir, `${safeId}.html`), payload.html, "utf8");
        return { success: true, previewPath: `/data/preview/products/${safeId}.html` };
      }
      if (payload.action === "publish" && payload.html) {
        fs.writeFileSync(path.join(productsDir, `${slug}.html`), payload.html, "utf8");
        fs.writeFileSync(path.join(previewDir, `${safeId}.html`), payload.html, "utf8");
        return { success: true, publicUrl: `/products/${slug}.html` };
      }
      if (payload.action === "unpublish" || payload.action === "archive") {
        const p = path.join(productsDir, `${slug}.html`);
        if (fs.existsSync(p)) fs.unlinkSync(p);
        return { success: true };
      }
    } catch (_) {}
  }
  return null;
}

export class MockStorePagesRepository implements IStorePagesRepository {
  private pages: StorePage[] = [];

  constructor() {
    this.loadState();
  }

  private loadState(): void {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as StorePage[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.pages = parsed;
            return;
          }
        }
      } catch (_) {}
    }
    this.pages = JSON.parse(JSON.stringify(INITIAL_STORE_PAGES));
  }

  private persistState(): void {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.pages));
      } catch (_) {}
    }
  }

  async getPages(): Promise<StorePage[]> {
    return JSON.parse(JSON.stringify(this.pages));
  }

  async getPageById(pageId: string): Promise<StorePage | null> {
    const page = this.pages.find((p) => p.pageId === pageId);
    return page ? JSON.parse(JSON.stringify(page)) : null;
  }

  async getPageByProductId(productId: string): Promise<StorePage | null> {
    const page = this.pages.find((p) => p.productId === productId);
    return page ? JSON.parse(JSON.stringify(page)) : null;
  }

  async createPage(input: StorePageCreateInput): Promise<StorePage> {
    const now = new Date().toISOString();
    const newPage: StorePage = {
      ...input,
      // Security guard: Only explicitly whitelisted static pages can ever start as published
      status: input.status === "published" && !input.publicUrl ? "preview_ready" : input.status,
      publicUrl: input.status === "published" ? input.publicUrl : null,
      createdAt: now,
      updatedAt: now,
    };
    this.pages.push(newPage);
    this.persistState();
    return JSON.parse(JSON.stringify(newPage));
  }

  async updatePage(pageId: string, updates: StorePageUpdateInput): Promise<StorePage> {
    const idx = this.pages.findIndex((p) => p.pageId === pageId);
    if (idx === -1) throw new Error(`صفحة المتجر غير موجودة: ${pageId}`);

    const existing = this.pages[idx];
    const updatedStatus: StorePageStatus = updates.status || existing.status;
    const now = new Date().toISOString();

    const updated: StorePage = {
      ...existing,
      ...updates,
      status: updatedStatus,
      publicUrl: updatedStatus === "published" ? (updates.publicUrl ?? existing.publicUrl) : null,
      updatedAt: now,
    };

    this.pages[idx] = updated;
    this.persistState();
    return JSON.parse(JSON.stringify(updated));
  }

  /**
   * Generates standalone preview HTML and saves it to preview path.
   */
  async generatePreviewHtml(pageId: string): Promise<string> {
    const page = await this.getPageById(pageId);
    if (!page) throw new Error(`صفحة غير موجودة: ${pageId}`);

    const productsRepo = getMockProductsRepository();
    const product = await productsRepo.getProductById(page.productId);
    if (!product) throw new Error(`المنتج المرتبط بالصفحة غير موجود: ${page.productId}`);

    const layoutRepo = getMockLayoutRepository();
    const layoutConfig = await layoutRepo.getLayoutConfig(product.id);

    const html = generateProductPageHtml({
      product,
      layoutConfig,
      storePage: page,
      baseAssetPath: "/",
      isProduction: false,
    });

    // Write preview file via API or disk
    await callPublishApi({
      action: "preview",
      pageId: page.pageId,
      slug: page.slug,
      html,
    });

    // Record last generated timestamp
    await this.updatePage(pageId, {
      lastGeneratedAt: new Date().toISOString(),
    });

    return html;
  }

  /**
   * Dynamic Publishing: Generates production HTML and writes to live storefront path.
   */
  async publishPage(pageId: string): Promise<StorePage> {
    const page = await this.getPageById(pageId);
    if (!page) throw new Error(`صفحة غير موجودة: ${pageId}`);

    const productsRepo = getMockProductsRepository();
    const product = await productsRepo.getProductById(page.productId);
    if (!product) throw new Error(`المنتج المرتبط بالصفحة غير موجود: ${page.productId}`);

    const layoutRepo = getMockLayoutRepository();
    const layoutConfig = await layoutRepo.getLayoutConfig(product.id);

    const cleanSlug = page.slug.replace(/^products\//, "").replace(/\.html$/, "");
    const publicUrl = page.publicUrl || `/products/${cleanSlug}.html`;

    const productionHtml = generateProductPageHtml({
      product,
      layoutConfig,
      storePage: {
        ...page,
        status: "published",
        publicUrl,
      },
      baseAssetPath: "/",
      isProduction: true,
    });

    // Write file to live storefront via API / disk
    await callPublishApi({
      action: "publish",
      pageId: page.pageId,
      slug: cleanSlug,
      html: productionHtml,
    });

    const now = new Date().toISOString();
    return this.updatePage(pageId, {
      status: "published",
      publicUrl,
      lastGeneratedAt: now,
    });
  }

  /**
   * Reverts published page to preview_ready and removes public file from disk.
   */
  async unpublishPage(pageId: string): Promise<StorePage> {
    const page = await this.getPageById(pageId);
    if (!page) throw new Error(`صفحة غير موجودة: ${pageId}`);

    const cleanSlug = page.slug.replace(/^products\//, "").replace(/\.html$/, "");
    await callPublishApi({
      action: "unpublish",
      pageId: page.pageId,
      slug: cleanSlug,
    });

    return this.updatePage(pageId, {
      status: "preview_ready",
      publicUrl: null,
    });
  }

  /**
   * Archives page, removes public file from disk, and revokes public visibility.
   */
  async archivePage(pageId: string): Promise<StorePage> {
    const page = await this.getPageById(pageId);
    if (page) {
      const cleanSlug = page.slug.replace(/^products\//, "").replace(/\.html$/, "");
      await callPublishApi({
        action: "archive",
        pageId: page.pageId,
        slug: cleanSlug,
      });
    }

    return this.updatePage(pageId, {
      status: "archived",
      publicUrl: null,
    });
  }

  /**
   * Synchronizes page title, description, and status with Product Repository.
   * Cascade rule: If product is archived, store page MUST be archived.
   */
  async syncWithProduct(productId: string): Promise<StorePageSyncResult> {
    const productsRepo = getMockProductsRepository();
    const product = await productsRepo.getProductById(productId);
    if (!product) {
      return {
        page: null as unknown as StorePage,
        actionTaken: "no_change",
        message: `المنتج غير موجود: ${productId}`,
      };
    }

    let existingPage = this.pages.find((p) => p.productId === productId);

    if (!existingPage) {
      // Create new staged page
      const created = await this.createPage({
        pageId: `page_${product.sku.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        productId: product.id,
        productSku: product.sku,
        slug: `products/${product.sku.toLowerCase()}`,
        title: product.title,
        templateId: "orva-calm-night-light",
        templateVersion: "1.0.0",
        status: product.status === "archived" ? "archived" : "preview_ready",
        publicUrl: null,
        previewPath: `/data/preview/products/page_${product.id}.html`,
        metaDescription: product.description.slice(0, 160),
        lastGeneratedAt: new Date().toISOString(),
      });
      return {
        page: created,
        actionTaken: "created",
        message: `تم إنشاء صفحة معاينة جديدة للمنتج (${product.sku}).`,
      };
    }

    // Cascade archive if product is archived
    if (product.status === "archived" && existingPage.status !== "archived") {
      const archived = await this.archivePage(existingPage.pageId);
      return {
        page: archived,
        actionTaken: "archived",
        message: `تم أرشفة صفحة المتجر تلقائياً تماشياً مع أرشفة المنتج (${product.sku}).`,
      };
    }

    // Update title and description from product
    const updated = await this.updatePage(existingPage.pageId, {
      title: product.title,
      metaDescription: product.description.slice(0, 160),
      productSku: product.sku,
    });

    return {
      page: updated,
      actionTaken: "updated",
      message: `تمت مزامنة بيانات الصفحة مع المنتج (${product.sku}) بنجاح.`,
    };
  }

  async getSitemapEntries(): Promise<SitemapEntry[]> {
    return this.pages.map((p) => {
      const isPublished = p.status === "published" && Boolean(p.publicUrl);
      return {
        url: isPublished ? (p.publicUrl as string) : p.previewPath,
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

let storePagesRepoInstance: MockStorePagesRepository | null = null;

export function getMockStorePagesRepository(): MockStorePagesRepository {
  if (!storePagesRepoInstance) {
    storePagesRepoInstance = new MockStorePagesRepository();
  }
  return storePagesRepoInstance;
}
