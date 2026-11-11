import type { ProductPageLayoutConfig } from "./layout-types";
import type { OrderStatus } from "./types";

/**
 * ORVA Store — Phase 7A Data Architecture & Contracts
 * 
 * Strict separation:
 * - Product Management
 * - Product Analytics & Profitability
 * - Visitor & Funnel Analytics (Consent-aware, pseudonymous)
 * - Inventory & Adjustments
 * - Delivery & Courier Status Tracking
 */

// ── 1. Product Contract ────────────────────────────────────────────────────────

export type ProductStatus = "active" | "draft" | "archived";

export interface Product {
  id: string;
  sku: string;
  title: string;
  subtitle: string;
  description: string;
  images: string[];
  sellingPrice: number;            // in DZD
  purchaseCost: number;            // in DZD (Internal/Confidential — never exposed on public storefront)
  marketingCostPerOrder: number;   // in DZD (Internal/Confidential — never exposed on public storefront)
  stockQuantity: number;
  lowStockThreshold: number;
  status: ProductStatus;
  createdAt: string;               // ISO 8601 UTC
  updatedAt: string;               // ISO 8601 UTC
  /** Storefront fields (server catalog). Optional so mock data stays valid. */
  slug?: string;
  publicUrl?: string;              // e.g. "/p/my-product/" — live only when status is "active"
  originalPrice?: number | null;   // price before discount, shown struck-through
  highlights?: string[];           // landing-page bullet points
  layout?: ProductPageLayoutConfig | null; // live landing-page section layout (designer)
  layoutDraft?: ProductPageLayoutConfig | null; // unpublished designer draft
  showOutOfStock?: boolean;        // admin switch: show "نفدت الكمية مؤقتاً" on cards and landing page
}

export type ProductCreateInput = Omit<Product, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

export type ProductUpdateInput = Partial<Omit<Product, "id" | "createdAt" | "updatedAt">>;

// ── 2. Product Analytics & Profitability Contract ──────────────────────────────

export interface WilayaDemandStat {
  wilayaCode: string;
  wilayaName: string;
  orderCount: number;
  demandShare: number;             // percentage: (orders in wilaya / total orders of product) * 100
}

export interface TimeToPurchaseDistribution {
  under1Min: number;               // count of purchases made in < 60s
  between1And5Min: number;         // 1 - 5 mins
  between5And15Min: number;        // 5 - 15 mins
  between15And30Min: number;       // 15 - 30 mins
  over30Min: number;               // > 30 mins
}

export interface ProductAnalytics {
  productId: string;
  productTitle: string;
  uniqueProductViews: number;
  uniquePurchasingSessions: number;
  conversionRate: number;          // (uniquePurchasingSessions / uniqueProductViews) * 100
  averageTimeToPurchaseSeconds: number;
  orderCount: number;
  wilayaDistribution: WilayaDemandStat[];
  collectedRevenueDzd: number;
  estimatedNetProfitDzd: number;   // Collected Revenue - (Purchase Cost * units) - (Marketing Cost * orders)
}

// ── 3. Visitor Analytics (First-party, Consent-aware) ─────────────────────────

export type VisitorEventType =
  | "product_view"
  | "add_to_cart"
  | "checkout_started"
  | "order_created"
  | "session_activity"
  | "session_ended";

export interface VisitorAnalyticsEvent {
  id: string;
  pseudonymousSessionId: string;   // random UUID or hash, NO fingerprinting
  eventType: VisitorEventType;
  productId: string;
  timestamp: string;               // ISO 8601 UTC
  sessionDurationSeconds: number;
  selectedWilaya?: string;         // Voluntarily chosen at checkout ONLY, never IP-geolocated
  orderId?: string;                // Attached ONLY after order is successfully placed
  metadata?: Record<string, unknown>;
}

export interface VisitorSessionSummary {
  pseudonymousSessionId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  durationSeconds: number;
  hasPurchased: boolean;
  exitedAfterOneMinuteWithoutBuying: boolean; // Duration >= 60s, no purchase
  productViewed?: string;
  selectedWilaya?: string;
  orderId?: string;
}

// ── 4. Inventory & Adjustment Contract ────────────────────────────────────────

export interface StockAdjustment {
  id: string;
  productId: string;
  change: number;                  // Positive (restock) or negative (deduction/damage)
  quantityBefore: number;
  quantityAfter: number;
  reason: string;                  // e.g. "Restock from supplier", "Damaged in transit", "Physical count audit"
  timestamp: string;               // ISO 8601 UTC
  operator?: string;
}

export interface InventoryRecord {
  productId: string;
  sku: string;
  productTitle: string;
  availableQuantity: number;
  reservedQuantity: number;        // in active pending/confirmed/shipped orders
  totalPhysicalQuantity: number;   // available + reserved
  lowStockThreshold: number;
  isLowStock: boolean;
  stockAdjustments: StockAdjustment[];
  lastAdjustmentTimestamp: string | null;
  lastAdjustmentReason: string | null;
}

// ── 5. Delivery Tracking & Courier Adapter Contract ───────────────────────────

export type CourierSyncResultStatus = "success" | "failed" | "pending" | "unknown";

export interface DeliveryTrackingRecord {
  orderId: string;
  courierName: "Redex" | "Ecotrack" | "Internal" | string;
  trackingCode: string;
  internalOrderStatus: OrderStatus | string;
  externalCourierStatus: string;   // e.g. "LIVRE", "EN_COURS", "RETOUR_CENTRE", "ATTENTE_PICKUP"
  lastSyncedAt: string;            // ISO 8601 UTC
  syncResult: CourierSyncResultStatus;
  rawCourierResponse?: Record<string, unknown>;
}

export interface CourierQueryOptions {
  forceRemoteRefresh?: boolean;
}

export interface ICourierAdapter {
  readonly courierName: string;
  fetchTrackingStatus(trackingCode: string, options?: CourierQueryOptions): Promise<DeliveryTrackingRecord>;
  bulkFetchTrackingStatus(trackingCodes: string[]): Promise<Map<string, DeliveryTrackingRecord>>;
}

// ── 6. Repository Interfaces ──────────────────────────────────────────────────

export interface ProductDeleteResult {
  success: boolean;
  actionTaken: "deleted" | "archived";
  message: string;
  orderReferenceCount: number;
}

export interface IProductsRepository {
  getProducts(): Promise<Product[]>;
  getProductById(id: string): Promise<Product | null>;
  createProduct(input: ProductCreateInput): Promise<Product>;
  updateProduct(id: string, input: ProductUpdateInput): Promise<Product>;
  archiveProduct(id: string): Promise<Product>;
  deleteProduct(id: string, currentOrders?: unknown[]): Promise<ProductDeleteResult>;
  adjustInventory(productId: string, change: number, reason: string, operator?: string): Promise<InventoryRecord>;
  getInventory(): Promise<InventoryRecord[]>;
  getInventoryByProductId(productId: string): Promise<InventoryRecord | null>;
}

export interface IVisitorAnalyticsRepository {
  recordEvent(event: Omit<VisitorAnalyticsEvent, "id">): Promise<VisitorAnalyticsEvent>;
  getEvents(filter?: { productId?: string; eventType?: VisitorEventType; fromDate?: string }): Promise<VisitorAnalyticsEvent[]>;
  getSessions(): Promise<VisitorSessionSummary[]>;
  getProductAnalytics(productId: string): Promise<ProductAnalytics | null>;
  getAllProductsAnalytics(): Promise<ProductAnalytics[]>;
  getTimeToPurchaseDistribution(): Promise<TimeToPurchaseDistribution>;
}

// ── 7. Public DTO (Cost & Margin Confidentiality) ─────────────────────────────

export interface PublicProductDTO {
  id: string;
  sku: string;
  title: string;
  subtitle: string;
  description: string;
  images: string[];
  sellingPrice: number;
  stockQuantity: number;
  status: ProductStatus;
}

/**
 * Strips out confidential purchaseCost, marketingCost, and lowStockThreshold.
 * Safe to expose to public storefronts or clients.
 */
export function toPublicProductDTO(product: Product): PublicProductDTO {
  return {
    id: product.id,
    sku: product.sku,
    title: product.title,
    subtitle: product.subtitle,
    description: product.description,
    images: [...product.images],
    sellingPrice: product.sellingPrice,
    stockQuantity: product.stockQuantity,
    status: product.status,
  };
}

// ── 8. Order & Product Linking Specification ──────────────────────────────────

export interface KnownProductMapping {
  nameMatchPattern: string;
  productId: string;
  sku: string;
  defaultPriceDzd: number;
}

export const KNOWN_PRODUCT_MAPPINGS: KnownProductMapping[] = [
  // Pack 1 Mappings
  {
    nameMatchPattern: "باك منفاخ تويوتا وطقم المفاتيح",
    productId: "prod_pack_1_pro",
    sku: "ORVA-P1-PRO",
    defaultPriceDzd: 4950,
  },
  {
    nameMatchPattern: "منفاخ تويوتا",
    productId: "prod_pack_1_pro",
    sku: "ORVA-P1-PRO",
    defaultPriceDzd: 4950,
  },
  {
    nameMatchPattern: "باك كومبريسار و المفاتيح 4 في 1",
    productId: "prod_pack_1_pro",
    sku: "ORVA-P1-PRO",
    defaultPriceDzd: 4950,
  },
  {
    nameMatchPattern: "باك كومبريسار",
    productId: "prod_pack_1_pro",
    sku: "ORVA-P1-PRO",
    defaultPriceDzd: 4950,
  },
  {
    nameMatchPattern: "Pack 1 Pro",
    productId: "prod_pack_1_pro",
    sku: "ORVA-P1-PRO",
    defaultPriceDzd: 4950,
  },
  {
    nameMatchPattern: "PACK 4EN1",
    productId: "prod_pack_1_pro",
    sku: "ORVA-P1-PRO",
    defaultPriceDzd: 4950,
  },
  {
    nameMatchPattern: "Pack 4 en 1",
    productId: "prod_pack_1_pro",
    sku: "ORVA-P1-PRO",
    defaultPriceDzd: 4950,
  },
  {
    nameMatchPattern: "Pack 4-in-1",
    productId: "prod_pack_1_pro",
    sku: "ORVA-P1-PRO",
    defaultPriceDzd: 4950,
  },

  // Pack 2 Mappings
  {
    nameMatchPattern: "باك ماكينة كراون CROWN 20V الأصلية",
    productId: "prod_pack_2_elite",
    sku: "ORVA-P2-ELITE",
    defaultPriceDzd: 12950,
  },
  {
    nameMatchPattern: "ماكينة كراون",
    productId: "prod_pack_2_elite",
    sku: "ORVA-P2-ELITE",
    defaultPriceDzd: 12950,
  },
  {
    nameMatchPattern: "باك الفيسوز كراون Elite",
    productId: "prod_pack_2_elite",
    sku: "ORVA-P2-ELITE",
    defaultPriceDzd: 12950,
  },
  {
    nameMatchPattern: "فيسوز كراون",
    productId: "prod_pack_2_elite",
    sku: "ORVA-P2-ELITE",
    defaultPriceDzd: 12950,
  },
  {
    nameMatchPattern: "Pack 2 Elite",
    productId: "prod_pack_2_elite",
    sku: "ORVA-P2-ELITE",
    defaultPriceDzd: 12950,
  },
  {
    nameMatchPattern: "PACK 5EN1",
    productId: "prod_pack_2_elite",
    sku: "ORVA-P2-ELITE",
    defaultPriceDzd: 12950,
  },
  {
    nameMatchPattern: "Pack 5 en 1",
    productId: "prod_pack_2_elite",
    sku: "ORVA-P2-ELITE",
    defaultPriceDzd: 12950,
  },
  {
    nameMatchPattern: "Pack 5-in-1",
    productId: "prod_pack_2_elite",
    sku: "ORVA-P2-ELITE",
    defaultPriceDzd: 12950,
  },
  {
    nameMatchPattern: "HIGH-TECH",
    productId: "prod_pack_2_elite",
    sku: "ORVA-P2-ELITE",
    defaultPriceDzd: 12950,
  },
  {
    nameMatchPattern: "عرض النخبة",
    productId: "prod_pack_2_elite",
    sku: "ORVA-P2-ELITE",
    defaultPriceDzd: 12950,
  },

  // Pack 3 Mappings
  {
    nameMatchPattern: "باك الأشغال الشاقة CROWN و Starcle Pro",
    productId: "prod_pack_3_ultra",
    sku: "ORVA-P3-ULTRA",
    defaultPriceDzd: 15950,
  },
  {
    nameMatchPattern: "الأشغال الشاقة",
    productId: "prod_pack_3_ultra",
    sku: "ORVA-P3-ULTRA",
    defaultPriceDzd: 15950,
  },
  {
    nameMatchPattern: "باك سودير كراون الصلب",
    productId: "prod_pack_3_ultra",
    sku: "ORVA-P3-ULTRA",
    defaultPriceDzd: 15950,
  },
  {
    nameMatchPattern: "سودير كراون",
    productId: "prod_pack_3_ultra",
    sku: "ORVA-P3-ULTRA",
    defaultPriceDzd: 15950,
  },
  {
    nameMatchPattern: "Pack 3 Ultra",
    productId: "prod_pack_3_ultra",
    sku: "ORVA-P3-ULTRA",
    defaultPriceDzd: 15950,
  },
  {
    nameMatchPattern: "PACK 6EN1",
    productId: "prod_pack_3_ultra",
    sku: "ORVA-P3-ULTRA",
    defaultPriceDzd: 15950,
  },
  {
    nameMatchPattern: "Pack 6 en 1",
    productId: "prod_pack_3_ultra",
    sku: "ORVA-P3-ULTRA",
    defaultPriceDzd: 15950,
  },
  {
    nameMatchPattern: "Sac Banane Moto Yamaha + Cadeaux",
    productId: "prod_sac_yamaha",
    sku: "ORVA-SAC-YAM",
    defaultPriceDzd: 4400,
  },
  {
    nameMatchPattern: "Sac Banane Moto Yamaha",
    productId: "prod_sac_yamaha",
    sku: "ORVA-SAC-YAM",
    defaultPriceDzd: 4400,
  },
  {
    nameMatchPattern: "Sac Banane",
    productId: "prod_sac_yamaha",
    sku: "ORVA-SAC-YAM",
    defaultPriceDzd: 4400,
  },
];

/**
 * Maps an order's raw text productName to known product ID and SKU.
 * Strictly avoids speculative guessing: returns unmatched if no pattern fits.
 */
export function matchOrderToProduct(productName: string | null | undefined): {
  matchedProductId: string | null;
  matchedSku: string | null;
  confidence: "exact" | "high" | "unmatched";
} {
  if (!productName || typeof productName !== "string") {
    return { matchedProductId: null, matchedSku: null, confidence: "unmatched" };
  }
  const trimmed = productName.trim().toLowerCase();

  // 1. Check Sac Banane matches
  if (trimmed.includes("cadeaux") || trimmed.includes("bundle") || trimmed.includes("sac banane")) {
    return { matchedProductId: "prod_sac_yamaha", matchedSku: "ORVA-SAC-YAM", confidence: "exact" };
  }

  for (const mapping of KNOWN_PRODUCT_MAPPINGS) {
    if (trimmed.includes(mapping.nameMatchPattern.toLowerCase())) {
      return {
        matchedProductId: mapping.productId,
        matchedSku: mapping.sku,
        confidence: "high",
      };
    }
  }

  return { matchedProductId: null, matchedSku: null, confidence: "unmatched" };
}

// ── 9. Economics & Inventory Verification Helpers ─────────────────────────────

export interface InsufficientStockErrorDetails {
  code: "INSUFFICIENT_STOCK";
  productId: string;
  availableQuantity: number;
  requestedDeduction: number;
  message: string;
}

/**
 * Unit Margin = Selling Price - Purchase Cost
 * Never subtracts marketing cost, which is defined per order.
 */
export function computeUnitMargin(sellingPrice: number, purchaseCost: number): number {
  return Math.max(0, (Number(sellingPrice) || 0) - (Number(purchaseCost) || 0));
}

/**
 * Estimated Order Profit =
 * ((Selling Price - Purchase Cost) * Quantity) - Marketing Cost Per Order
 * Marketing cost is deducted ONCE per order, regardless of quantity.
 */
export function computeEstimatedOrderProfit(
  sellingPrice: number,
  purchaseCost: number,
  marketingCostPerOrder: number = 0,
  quantity: number = 1
): number {
  const qty = Math.max(1, Number(quantity) || 1);
  const unitMargin = computeUnitMargin(sellingPrice, purchaseCost);
  const totalUnitMargin = unitMargin * qty;
  const marketing = Number(marketingCostPerOrder) || 0;
  return Math.max(0, totalUnitMargin - marketing);
}


