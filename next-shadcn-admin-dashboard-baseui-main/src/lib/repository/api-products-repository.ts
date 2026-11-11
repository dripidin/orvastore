"use client";

/**
 * Dashboard products repository backed by the server catalog (Supabase `products` table).
 * Replaces the localStorage mock so every admin change reaches the storefront.
 */
import { getMockProductsRepository } from "./mock-products-repository";
import type {
  IProductsRepository,
  InventoryRecord,
  Product,
  ProductAnalytics,
  ProductCreateInput,
  ProductDeleteResult,
  ProductUpdateInput,
} from "./product-types";
import type { ProductPageLayoutConfig } from "./layout-types";

async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as ({ success?: boolean; error?: string } & T) | null;
  if (!res.ok || !body || body.success === false) {
    throw new Error(body?.error || `تعذر الاتصال بالخادم (HTTP ${res.status})`);
  }
  return body;
}

/** Uploads any data: URLs (fresh uploads from the form) and returns public URLs in the same order. */
async function persistImages(images: string[] | undefined): Promise<string[] | undefined> {
  if (!images) return undefined;
  const out: string[] = [];
  for (const [i, src] of images.entries()) {
    if (src.startsWith("data:")) {
      const { url } = await api<{ url: string }>("/api/store-products/upload", {
        method: "POST",
        body: JSON.stringify({ dataUrl: src, name: `image-${i + 1}` }),
      });
      out.push(url);
    } else if (src && src !== "/placeholder.svg") {
      out.push(src);
    }
  }
  return out;
}

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("orva:catalog-updated"));
}

export class ApiProductsRepository implements IProductsRepository {
  private cache: Product[] = [];

  async getProducts(): Promise<Product[]> {
    const { data } = await api<{ data: Product[] }>("/api/store-products");
    this.cache = data;
    return data;
  }

  async getProductById(id: string): Promise<Product | null> {
    try {
      const { data } = await api<{ data: Product }>(`/api/store-products/${encodeURIComponent(id)}`);
      return data;
    } catch {
      return null;
    }
  }

  async createProduct(input: ProductCreateInput): Promise<Product> {
    const images = await persistImages(input.images);
    const { data } = await api<{ data: Product }>("/api/store-products", {
      method: "POST",
      body: JSON.stringify({ ...input, images }),
    });
    notify();
    return data;
  }

  async updateProduct(id: string, input: ProductUpdateInput): Promise<Product> {
    const images = await persistImages(input.images);
    const { data } = await api<{ data: Product }>(`/api/store-products/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(images ? { ...input, images } : input),
    });
    notify();
    return data;
  }

  /** live=true publishes the layout to the storefront; live=false keeps it as a designer draft. */
  async saveLayout(id: string, layout: ProductPageLayoutConfig, live = true): Promise<Product> {
    const { data } = await api<{ data: Product }>(`/api/store-products/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(live ? { layout } : { layoutDraft: layout }),
    });
    notify();
    return data;
  }

  async archiveProduct(id: string): Promise<Product> {
    return this.updateProduct(id, { status: "archived" });
  }

  async deleteProduct(id: string, _currentOrders?: unknown[]): Promise<ProductDeleteResult> {
    const res = await api<{ actionTaken: "deleted" | "archived"; orderReferenceCount: number }>(
      `/api/store-products/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    notify();
    return {
      success: true,
      actionTaken: res.actionTaken,
      orderReferenceCount: res.orderReferenceCount,
      message:
        res.actionTaken === "deleted"
          ? "تم حذف المنتج نهائياً وإزالته من المتجر."
          : `المنتج مرتبط بـ ${res.orderReferenceCount} طلبية، لذلك تمت أرشفته وإخفاؤه من المتجر بدل حذفه.`,
    };
  }

  async adjustInventory(productId: string, change: number, _reason: string): Promise<InventoryRecord> {
    const current = this.cache.find((p) => p.id === productId) ?? (await this.getProductById(productId));
    if (!current) throw new Error("المنتج غير موجود");
    const next = current.stockQuantity + change;
    if (next < 0) throw new Error("لا يمكن أن يصبح المخزون سالباً.");
    const updated = await this.updateProduct(productId, { stockQuantity: next });
    return this.toInventory(updated);
  }

  private toInventory(p: Product): InventoryRecord {
    return {
      productId: p.id,
      sku: p.sku,
      productTitle: p.title,
      availableQuantity: p.stockQuantity,
      reservedQuantity: 0,
      totalPhysicalQuantity: p.stockQuantity,
      lowStockThreshold: p.lowStockThreshold,
      isLowStock: p.stockQuantity <= p.lowStockThreshold,
      stockAdjustments: [],
      lastAdjustmentTimestamp: p.updatedAt || null,
      lastAdjustmentReason: null,
    };
  }

  async getInventory(): Promise<InventoryRecord[]> {
    const products = this.cache.length > 0 ? this.cache : await this.getProducts();
    return products.map((p) => this.toInventory(p));
  }

  async getInventoryByProductId(productId: string): Promise<InventoryRecord | null> {
    const p = (await this.getInventory()).find((i) => i.productId === productId);
    return p ?? null;
  }

  /** Visitor analytics still come from the local analytics store. */
  async getAllProductsAnalytics(): Promise<ProductAnalytics[]> {
    try {
      return await getMockProductsRepository().getAllProductsAnalytics();
    } catch {
      return [];
    }
  }
}

let instance: ApiProductsRepository | null = null;
export function getApiProductsRepository(): ApiProductsRepository {
  if (!instance) instance = new ApiProductsRepository();
  return instance;
}
