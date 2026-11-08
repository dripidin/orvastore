import type {
  Product,
  ProductCreateInput,
  ProductUpdateInput,
  ProductDeleteResult,
  InventoryRecord,
  ProductAnalytics,
  VisitorAnalyticsEvent,
  VisitorSessionSummary,
  TimeToPurchaseDistribution,
  IProductsRepository,
  IVisitorAnalyticsRepository,
  ICourierAdapter,
  DeliveryTrackingRecord,
  WilayaDemandStat,
} from "./product-types";
import {
  DEFAULT_MOCK_PRODUCTS,
  DEFAULT_MOCK_INVENTORY,
  DEFAULT_MOCK_VISITOR_EVENTS,
  DEFAULT_MOCK_COURIER_TRACKING,
} from "./mock-products-dataset";
import { DEFAULT_MOCK_ORDERS } from "./mock-orders-dataset";

const PRODUCTS_STORAGE_KEY = "orva_mock_products_v1";
const INVENTORY_STORAGE_KEY = "orva_mock_inventory_v1";
const VISITOR_EVENTS_STORAGE_KEY = "orva_mock_visitor_events_v1";
const COURIER_TRACKING_STORAGE_KEY = "orva_mock_courier_tracking_v1";
const BROADCAST_CHANNEL_NAME = "orva_products_cross_tab_v1";

export class MockProductsRepository implements IProductsRepository, IVisitorAnalyticsRepository {
  private products: Product[] = [];
  private inventory: InventoryRecord[] = [];
  private visitorEvents: VisitorAnalyticsEvent[] = [];
  private courierRecords: DeliveryTrackingRecord[] = [];
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    this.initData();
    if (typeof window !== "undefined") {
      this.setupCrossTabSync();
    }
  }

  // ── Initialization & Persistence ──────────────────────────────────────────

  private initData() {
    if (typeof window === "undefined") {
      this.products = [...DEFAULT_MOCK_PRODUCTS];
      this.inventory = [...DEFAULT_MOCK_INVENTORY];
      this.visitorEvents = [...DEFAULT_MOCK_VISITOR_EVENTS];
      this.courierRecords = [...DEFAULT_MOCK_COURIER_TRACKING];
      return;
    }

    try {
      const storedProducts = window.localStorage.getItem(PRODUCTS_STORAGE_KEY);
      this.products = storedProducts ? JSON.parse(storedProducts) : [...DEFAULT_MOCK_PRODUCTS];
    } catch {
      this.products = [...DEFAULT_MOCK_PRODUCTS];
    }

    try {
      const storedInventory = window.localStorage.getItem(INVENTORY_STORAGE_KEY);
      this.inventory = storedInventory ? JSON.parse(storedInventory) : [...DEFAULT_MOCK_INVENTORY];
    } catch {
      this.inventory = [...DEFAULT_MOCK_INVENTORY];
    }

    try {
      const storedEvents = window.localStorage.getItem(VISITOR_EVENTS_STORAGE_KEY);
      this.visitorEvents = storedEvents ? JSON.parse(storedEvents) : [...DEFAULT_MOCK_VISITOR_EVENTS];
    } catch {
      this.visitorEvents = [...DEFAULT_MOCK_VISITOR_EVENTS];
    }

    try {
      const storedCourier = window.localStorage.getItem(COURIER_TRACKING_STORAGE_KEY);
      this.courierRecords = storedCourier ? JSON.parse(storedCourier) : [...DEFAULT_MOCK_COURIER_TRACKING];
    } catch {
      this.courierRecords = [...DEFAULT_MOCK_COURIER_TRACKING];
    }

    // Single Source of Truth reconciliation:
    // Ensure product.stockQuantity strictly reflects inventory.availableQuantity,
    // and totalPhysicalQuantity = availableQuantity + reservedQuantity.
    for (const prod of this.products) {
      const inv = this.inventory.find((i) => i.productId === prod.id);
      if (inv) {
        prod.stockQuantity = inv.availableQuantity;
        inv.totalPhysicalQuantity = inv.availableQuantity + inv.reservedQuantity;
      }
    }
  }

  private persist() {

    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(this.products));
      window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(this.inventory));
      window.localStorage.setItem(VISITOR_EVENTS_STORAGE_KEY, JSON.stringify(this.visitorEvents));
      window.localStorage.setItem(COURIER_TRACKING_STORAGE_KEY, JSON.stringify(this.courierRecords));
      this.broadcastChannel?.postMessage({ type: "PRODUCTS_UPDATED", timestamp: Date.now() });
      window.dispatchEvent(new CustomEvent("orva:products-updated"));
    } catch (e) {
      console.warn("[MockProductsRepository] Failed to persist data to localStorage", e);
    }
  }

  private setupCrossTabSync() {
    if (typeof window === "undefined") return;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          if (event.data?.type === "PRODUCTS_UPDATED") {
            this.initData();
            window.dispatchEvent(new CustomEvent("orva:products-updated"));
          }
        };
      }
      window.addEventListener("storage", (e) => {
        if (
          e.key === PRODUCTS_STORAGE_KEY ||
          e.key === INVENTORY_STORAGE_KEY ||
          e.key === VISITOR_EVENTS_STORAGE_KEY
        ) {
          this.initData();
          window.dispatchEvent(new CustomEvent("orva:products-updated"));
        }
      });
    } catch (e) {
      console.warn("[MockProductsRepository] Cross-tab sync initialization warning:", e);
    }
  }

  // ── 1. Products CRUD & Business Rules ──────────────────────────────────────

  async getProducts(): Promise<Product[]> {
    return [...this.products];
  }

  async getProductById(id: string): Promise<Product | null> {
    const found = this.products.find((p) => p.id === id);
    return found ? { ...found } : null;
  }

  async createProduct(input: ProductCreateInput): Promise<Product> {
    const now = new Date().toISOString();
    const newProduct: Product = {
      ...input,
      id: input.id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };

    this.products.unshift(newProduct);

    // Create corresponding inventory record
    const inventoryRecord: InventoryRecord = {
      productId: newProduct.id,
      sku: newProduct.sku,
      productTitle: newProduct.title,
      availableQuantity: newProduct.stockQuantity,
      reservedQuantity: 0,
      totalPhysicalQuantity: newProduct.stockQuantity,
      lowStockThreshold: newProduct.lowStockThreshold,
      isLowStock: newProduct.stockQuantity <= newProduct.lowStockThreshold,
      stockAdjustments: [
        {
          id: `adj_${Date.now()}`,
          productId: newProduct.id,
          change: newProduct.stockQuantity,
          quantityBefore: 0,
          quantityAfter: newProduct.stockQuantity,
          reason: "الرصيد الافتتاحي للمنتج الجديد",
          timestamp: now,
        },
      ],
      lastAdjustmentTimestamp: now,
      lastAdjustmentReason: "الرصيد الافتتاحي للمنتج الجديد",
    };
    this.inventory.push(inventoryRecord);

    this.persist();
    return { ...newProduct };
  }

  async updateProduct(id: string, input: ProductUpdateInput): Promise<Product> {
    const idx = this.products.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`المنتج بالمعرف ${id} غير موجود`);
    }

    const current = this.products[idx];
    const updated: Product = {
      ...current,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    this.products[idx] = updated;

    // Update inventory header & quantities to maintain single source of truth
    const invIdx = this.inventory.findIndex((inv) => inv.productId === id);
    if (invIdx !== -1) {
      const invRecord = this.inventory[invIdx];
      const newAvailable = typeof updated.stockQuantity === "number" ? updated.stockQuantity : invRecord.availableQuantity;
      this.inventory[invIdx] = {
        ...invRecord,
        productTitle: updated.title,
        sku: updated.sku,
        availableQuantity: newAvailable,
        totalPhysicalQuantity: newAvailable + invRecord.reservedQuantity,
        lowStockThreshold: updated.lowStockThreshold,
        isLowStock: newAvailable <= updated.lowStockThreshold,
      };
    }


    this.persist();
    return { ...updated };
  }

  async archiveProduct(id: string): Promise<Product> {
    const updated = await this.updateProduct(id, { status: "archived" });
    try {
      const { getMockStorePagesRepository } = await import("./mock-store-pages-repository");
      await getMockStorePagesRepository().syncWithProduct(id);
    } catch (_) {}
    return updated;
  }

  /**
   * Delete Guard:
   * Checks whether historical orders reference this product by name or SKU.
   * If referenced, hard deletion is PREVENTED and the product is archived instead.
   */
  async deleteProduct(id: string, currentOrders?: unknown[]): Promise<ProductDeleteResult> {
    const product = await this.getProductById(id);
    if (!product) {
      return {
        success: false,
        actionTaken: "deleted",
        message: "المنتج غير موجود",
        orderReferenceCount: 0,
      };
    }

    // Read active orders from passed parameter, localStorage, or fallback to DEFAULT_MOCK_ORDERS
    let activeOrdersList: any[] | null = (Array.isArray(currentOrders) && currentOrders.length > 0)
      ? (currentOrders as any[])
      : null;

    if (!activeOrdersList && typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem("orva_mock_orders_v2");
        if (stored) {
          activeOrdersList = JSON.parse(stored);
        }
      } catch {}
    }

    if (!activeOrdersList) {
      activeOrdersList = DEFAULT_MOCK_ORDERS;
    }

    const currentTitle = product.title.trim().toLowerCase();
    const currentSku = product.sku.trim().toLowerCase();

    const matchingOrders = activeOrdersList.filter((o) => {
      const orderProdName = (o.productName || o.product_name || "").trim().toLowerCase();
      const orderSku = (o.sku || "").trim().toLowerCase();
      return (
        orderProdName.includes(currentTitle) ||
        currentTitle.includes(orderProdName) ||
        (orderSku && orderSku === currentSku)
      );
    });

    if (matchingOrders.length > 0) {
      // Historical references exist -> Archive instead of delete
      await this.archiveProduct(id);
      return {
        success: true,
        actionTaken: "archived",
        message: `المنتج مرتبط بـ ${matchingOrders.length} طلبية تاريخية سابقة؛ تم تحويله إلى الأرشيف لحماية سلامة السجلات المالية.`,
        orderReferenceCount: matchingOrders.length,
      };
    }

    // Safe to hard delete
    this.products = this.products.filter((p) => p.id !== id);
    this.inventory = this.inventory.filter((inv) => inv.productId !== id);
    this.persist();

    return {
      success: true,
      actionTaken: "deleted",
      message: "تم حذف المنتج بنجاح لعدم وجود ارتباطات تاريخية.",
      orderReferenceCount: 0,
    };
  }

  // ── 2. Inventory Operations ────────────────────────────────────────────────

  async getInventory(): Promise<InventoryRecord[]> {
    return [...this.inventory];
  }

  async getInventoryByProductId(productId: string): Promise<InventoryRecord | null> {
    const item = this.inventory.find((inv) => inv.productId === productId);
    return item ? { ...item } : null;
  }

  async adjustInventory(
    productId: string,
    change: number,
    reason: string,
    operator: string = "المسؤول"
  ): Promise<InventoryRecord> {
    const invIdx = this.inventory.findIndex((inv) => inv.productId === productId);
    if (invIdx === -1) {
      throw new Error(`سجل المخزون للمنتج ${productId} غير موجود`);
    }

    const current = this.inventory[invIdx];
    const potentialQty = current.availableQuantity + change;

    // Strict inventory protection: reject deduction if greater than available stock
    if (potentialQty < 0) {
      const error: any = new Error(
        `INSUFFICIENT_STOCK: المخزون المتاح حالياً هو ${current.availableQuantity} قطعة فقط، ولا يمكن خصم ${Math.abs(change)} قطعة.`
      );
      error.code = "INSUFFICIENT_STOCK";
      error.availableQuantity = current.availableQuantity;
      error.requestedDeduction = Math.abs(change);
      error.details = {
        code: "INSUFFICIENT_STOCK",
        productId,
        availableQuantity: current.availableQuantity,
        requestedDeduction: Math.abs(change),
        message: error.message,
      };
      throw error;
    }

    const newQty = potentialQty;
    const now = new Date().toISOString();


    const adjustment = {
      id: `adj_${Date.now()}`,
      productId,
      change,
      quantityBefore: current.availableQuantity,
      quantityAfter: newQty,
      reason,
      timestamp: now,
      operator,
    };

    const updated: InventoryRecord = {
      ...current,
      availableQuantity: newQty,
      totalPhysicalQuantity: newQty + current.reservedQuantity,
      isLowStock: newQty <= current.lowStockThreshold,
      stockAdjustments: [adjustment, ...current.stockAdjustments],
      lastAdjustmentTimestamp: now,
      lastAdjustmentReason: reason,
    };

    this.inventory[invIdx] = updated;

    // Synchronize product.stockQuantity
    const prodIdx = this.products.findIndex((p) => p.id === productId);
    if (prodIdx !== -1) {
      this.products[prodIdx] = {
        ...this.products[prodIdx],
        stockQuantity: newQty,
        updatedAt: now,
      };
    }

    this.persist();
    return { ...updated };
  }

  // ── 3. First-Party Visitor & Conversion Analytics ──────────────────────────

  async recordEvent(event: Omit<VisitorAnalyticsEvent, "id">): Promise<VisitorAnalyticsEvent> {
    const newEvent: VisitorAnalyticsEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    this.visitorEvents.push(newEvent);
    this.persist();
    return newEvent;
  }

  async getEvents(filter?: {
    productId?: string;
    eventType?: VisitorAnalyticsEvent["eventType"];
  }): Promise<VisitorAnalyticsEvent[]> {
    let list = [...this.visitorEvents];
    if (filter?.productId) {
      list = list.filter((e) => e.productId === filter.productId);
    }
    if (filter?.eventType) {
      list = list.filter((e) => e.eventType === filter.eventType);
    }
    return list;
  }

  async getSessions(): Promise<VisitorSessionSummary[]> {
    const sessionMap = new Map<string, VisitorAnalyticsEvent[]>();
    for (const evt of this.visitorEvents) {
      const list = sessionMap.get(evt.pseudonymousSessionId) ?? [];
      list.push(evt);
      sessionMap.set(evt.pseudonymousSessionId, list);
    }

    const summaries: VisitorSessionSummary[] = [];

    for (const [sessionId, events] of sessionMap.entries()) {
      events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const first = events[0];
      const last = events[events.length - 1];
      const maxDuration = Math.max(...events.map((e) => e.sessionDurationSeconds || 0));

      const purchaseEvt = events.find((e) => e.eventType === "order_created");
      const hasPurchased = Boolean(purchaseEvt);
      const exitedAfterOneMinuteWithoutBuying = !hasPurchased && maxDuration >= 60;

      summaries.push({
        pseudonymousSessionId: sessionId,
        firstSeenAt: first.timestamp,
        lastSeenAt: last.timestamp,
        durationSeconds: maxDuration,
        hasPurchased,
        exitedAfterOneMinuteWithoutBuying,
        productViewed: first.productId,
        selectedWilaya: purchaseEvt?.selectedWilaya,
        orderId: purchaseEvt?.orderId,
      });
    }

    return summaries;
  }

  async getProductAnalytics(productId: string): Promise<ProductAnalytics | null> {
    const product = await this.getProductById(productId);
    if (!product) return null;

    const sessions = await this.getSessions();
    const productSessions = sessions.filter((s) => s.productViewed === productId);

    const uniqueProductViews = Math.max(1, productSessions.length);
    const uniquePurchasingSessions = productSessions.filter((s) => s.hasPurchased).length;
    const conversionRate = (uniquePurchasingSessions / uniqueProductViews) * 100;

    // Calculate time to purchase
    const purchaseTimes = productSessions
      .filter((s) => s.hasPurchased)
      .map((s) => s.durationSeconds);
    const averageTimeToPurchaseSeconds =
      purchaseTimes.length > 0
        ? Math.round(purchaseTimes.reduce((acc, t) => acc + t, 0) / purchaseTimes.length)
        : 0;

    // Cross reference orders
    const productOrders = DEFAULT_MOCK_ORDERS.filter((o) => {
      const orderProdName = (o.productName || "").trim().toLowerCase();
      const currentTitle = product.title.trim().toLowerCase();
      return orderProdName.includes(currentTitle) || currentTitle.includes(orderProdName);
    });

    const deliveredOrders = productOrders.filter((o) => o.status === "delivered");
    const collectedRevenueDzd = deliveredOrders.reduce((sum, o) => {
      const val = Number(o.priceNum) || 0;
      return sum + val;
    }, 0);

    const deliveredUnits = deliveredOrders.reduce((sum, o) => sum + (Number(o.quantity) || 1), 0);
    const totalPurchaseCost = deliveredUnits * product.purchaseCost;
    const totalMarketingCost = deliveredOrders.length * product.marketingCostPerOrder;
    const estimatedNetProfitDzd = Math.max(0, collectedRevenueDzd - totalPurchaseCost - totalMarketingCost);

    // Wilaya demand distribution
    const wilayaCounts = new Map<string, number>();
    for (const order of productOrders) {
      const w = order.wilaya || "غير محدد";
      wilayaCounts.set(w, (wilayaCounts.get(w) ?? 0) + 1);
    }

    const wilayaDistribution: WilayaDemandStat[] = [...wilayaCounts.entries()].map(
      ([wilayaStr, count]) => {
        const parts = wilayaStr.split("-");
        const code = parts[0]?.trim() || "00";
        const name = parts[1]?.trim() || wilayaStr;
        return {
          wilayaCode: code,
          wilayaName: name,
          orderCount: count,
          demandShare: (count / Math.max(1, productOrders.length)) * 100,
        };
      }
    );

    return {
      productId: product.id,
      productTitle: product.title,
      uniqueProductViews,
      uniquePurchasingSessions,
      conversionRate,
      averageTimeToPurchaseSeconds,
      orderCount: productOrders.length,
      wilayaDistribution,
      collectedRevenueDzd,
      estimatedNetProfitDzd,
    };
  }

  async getAllProductsAnalytics(): Promise<ProductAnalytics[]> {
    const list: ProductAnalytics[] = [];
    for (const prod of this.products) {
      const stat = await this.getProductAnalytics(prod.id);
      if (stat) list.push(stat);
    }
    return list;
  }

  async getTimeToPurchaseDistribution(): Promise<TimeToPurchaseDistribution> {
    const sessions = await this.getSessions();
    const purchased = sessions.filter((s) => s.hasPurchased);

    let under1Min = 0;
    let between1And5Min = 0;
    let between5And15Min = 0;
    let between15And30Min = 0;
    let over30Min = 0;

    for (const s of purchased) {
      const dur = s.durationSeconds;
      if (dur < 60) under1Min++;
      else if (dur <= 300) between1And5Min++;
      else if (dur <= 900) between5And15Min++;
      else if (dur <= 1800) between15And30Min++;
      else over30Min++;
    }

    return {
      under1Min,
      between1And5Min,
      between5And15Min,
      between15And30Min,
      over30Min,
    };
  }
}

// ── 4. Mock Courier Adapter ───────────────────────────────────────────────────

export class MockCourierAdapter implements ICourierAdapter {
  readonly courierName = "Redex";

  async fetchTrackingStatus(trackingCode: string): Promise<DeliveryTrackingRecord> {
    const found = DEFAULT_MOCK_COURIER_TRACKING.find((r) => r.trackingCode === trackingCode);
    if (found) {
      return {
        ...found,
        lastSyncedAt: new Date().toISOString(),
      };
    }
    return {
      orderId: "UNKNOWN",
      courierName: this.courierName,
      trackingCode,
      internalOrderStatus: "shipped",
      externalCourierStatus: "EN_COURS_ACHEMINEMENT",
      lastSyncedAt: new Date().toISOString(),
      syncResult: "success",
    };
  }

  async bulkFetchTrackingStatus(
    trackingCodes: string[]
  ): Promise<Map<string, DeliveryTrackingRecord>> {
    const map = new Map<string, DeliveryTrackingRecord>();
    for (const code of trackingCodes) {
      map.set(code, await this.fetchTrackingStatus(code));
    }
    return map;
  }
}

// Global Singleton Instance
let productsRepoInstance: MockProductsRepository | null = null;

export function getMockProductsRepository(): MockProductsRepository {
  if (!productsRepoInstance) {
    productsRepoInstance = new MockProductsRepository();
  }
  return productsRepoInstance;
}
