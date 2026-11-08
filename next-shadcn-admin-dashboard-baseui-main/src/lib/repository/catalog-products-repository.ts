/**
 * Live products repository � data/products-catalog.json via /api/products-catalog.php
 * Local tests: pass fixture=test (isolated copy under data/local-fixtures/).
 */
import { orvaRequestJson } from "@/lib/orva-api";
import type {
  IProductsRepository,
  InventoryRecord,
  Product,
  ProductCreateInput,
  ProductDeleteResult,
  ProductUpdateInput,
  ProductAnalytics,
} from "./product-types";

type CatalogEnvelope<T> = { success?: boolean; data?: T; error?: string; fixture?: string };

function mapProduct(raw: any): Product {
  return {
    id: String(raw.id || raw.catalogKey || ""),
    sku: String(raw.sku || ""),
    title: String(raw.title || ""),
    subtitle: String(raw.subtitle || ""),
    description: String(raw.description || ""),
    images: Array.isArray(raw.images) ? raw.images.map(String) : [],
    sellingPrice: Number(raw.sellingPrice) || 0,
    purchaseCost: Number(raw.purchaseCost) || 0,
    marketingCostPerOrder: Number(raw.marketingCostPerOrder) || 0,
    stockQuantity: Number(raw.stockQuantity) || 0,
    lowStockThreshold: Number(raw.lowStockThreshold) || 5,
    status: (raw.status as Product["status"]) || "active",
    createdAt: String(raw.createdAt || ""),
    updatedAt: String(raw.updatedAt || ""),
  };
}

export class CatalogProductsRepository implements IProductsRepository {
  private fixture: "live" | "test";
  private keyById = new Map<string, string>();

  constructor(opts?: { useTestFixture?: boolean }) {
    this.fixture = opts?.useTestFixture ? "test" : "live";
  }

  private url(action: string) {
    const q = new URLSearchParams({ action });
    if (this.fixture === "test") q.set("fixture", "test");
    return `/api/products-catalog?${q.toString()}`;
  }

  private rememberKeys(list: any[]) {
    this.keyById.clear();
    for (const row of list) {
      const id = String(row.id || "");
      const key = String(row.catalogKey || id);
      if (id) this.keyById.set(id, key);
      if (row.sku) this.keyById.set(String(row.sku), key);
    }
  }

  private resolveKey(id: string) {
    return this.keyById.get(id) || id;
  }

  async getProducts(): Promise<Product[]> {
    const res = await orvaRequestJson<CatalogEnvelope<any[]>>(this.url("list"));
    const rows = Array.isArray(res.data) ? res.data : [];
    this.rememberKeys(rows);
    return rows.map(mapProduct);
  }

  async getProductById(id: string): Promise<Product | null> {
    const all = await this.getProducts();
    return all.find((p) => p.id === id || p.sku === id) || null;
  }

  async createProduct(input: ProductCreateInput): Promise<Product> {
    const res = await orvaRequestJson<CatalogEnvelope<any>>(this.url("upsert"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert",
        product: {
          ...input,
          catalogKey: input.id || undefined,
          allowOrders: input.status === "active",
        },
      }),
    });
    if (!res.data) throw new Error(res.error || "CREATE_FAILED");
    const mapped = mapProduct(res.data);
    this.keyById.set(mapped.id, String(res.data.catalogKey || mapped.id));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("orva:products-updated"));
    }
    return mapped;
  }

  async updateProduct(id: string, input: ProductUpdateInput): Promise<Product> {
    const current = await this.getProductById(id);
    if (!current) throw new Error("NOT_FOUND");
    const catalogKey = this.resolveKey(id);
    const res = await orvaRequestJson<CatalogEnvelope<any>>(this.url("upsert"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert",
        catalogKey,
        product: {
          ...current,
          ...input,
          catalogKey,
          id: current.id,
          allowOrders: (input.status ?? current.status) === "active",
        },
      }),
    });
    if (!res.data) throw new Error(res.error || "UPDATE_FAILED");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("orva:products-updated"));
    }
    return mapProduct(res.data);
  }

  async archiveProduct(id: string): Promise<Product> {
    return this.updateProduct(id, { status: "archived" });
  }

  async deleteProduct(id: string, _currentOrders?: unknown[]): Promise<ProductDeleteResult> {
    // Soft-delete: archive (catalog has no hard delete to protect storefront)
    await this.archiveProduct(id);
    return {
      success: true,
      actionTaken: "archived",
      message: "تم أرشفة المنتج في الكتالوج (حذف ناعم).",
      orderReferenceCount: 0,
    };
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
      lastAdjustmentTimestamp: null,
      lastAdjustmentReason: null,
    };
  }

  async adjustInventory(
    productId: string,
    change: number,
    reason: string,
    operator = "المسؤول",
  ): Promise<InventoryRecord> {
    const catalogKey = this.resolveKey(productId);
    const res = await orvaRequestJson<CatalogEnvelope<any>>(this.url("adjust_stock"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adjust_stock", catalogKey, change, reason, operator }),
    });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("orva:products-updated"));
    }
    const p = res.data ? mapProduct(res.data) : await this.getProductById(productId);
    if (!p) throw new Error("NOT_FOUND");
    const inv = this.toInventory(p);
    inv.lastAdjustmentReason = reason;
    inv.lastAdjustmentTimestamp = new Date().toISOString();
    return inv;
  }

  async getInventory(): Promise<InventoryRecord[]> {
    const products = await this.getProducts();
    return products.map((p) => this.toInventory(p));
  }

  async getInventoryByProductId(productId: string): Promise<InventoryRecord | null> {
    const all = await this.getInventory();
    return all.find((i) => i.productId === productId) || null;
  }

  /** Analytics not stored in catalog file � empty until visitor pipeline is live. */
  async getAllProductsAnalytics(): Promise<ProductAnalytics[]> {
    const products = await this.getProducts();
    return products.map((p) => ({
      productId: p.id,
      productTitle: p.title,
      uniqueProductViews: 0,
      uniquePurchasingSessions: 0,
      conversionRate: 0,
      averageTimeToPurchaseSeconds: 0,
      orderCount: 0,
      wilayaDistribution: [],
      collectedRevenueDzd: 0,
      estimatedNetProfitDzd: 0,
    }));
  }
}

let liveInstance: CatalogProductsRepository | null = null;
let testInstance: CatalogProductsRepository | null = null;

export function getCatalogProductsRepository(opts?: { useTestFixture?: boolean }): CatalogProductsRepository {
  if (opts?.useTestFixture) {
    if (!testInstance) testInstance = new CatalogProductsRepository({ useTestFixture: true });
    return testInstance;
  }
  if (!liveInstance) liveInstance = new CatalogProductsRepository({ useTestFixture: false });
  return liveInstance;
}
