/**
 * ORVA Store — Phase 7E Geographical Product Analytics Contracts
 * 
 * Defines data structures for:
 * - Product Demand Share (Product Orders in Wilaya / Total Product Orders * 100)
 * - Product Mix by Wilaya (Product Orders in Wilaya / All Product Orders in Wilaya * 100)
 * - Regional Product Conversion Rate (Purchasing Sessions in Wilaya / Known-Wilaya View Sessions * 100)
 * - Geographic coverage and Unknown Wilaya isolation
 */

export type GeographicalMetricType =
  | "demand_share"     // Product Demand Share (%)
  | "product_mix"      // Product Mix by Wilaya (%)
  | "regional_cvr"     // Regional Conversion Rate (%)
  | "total_orders";    // Absolute Order Count

export type TimeRangeFilter = "all" | "today" | "last_7_days" | "last_30_days";

export type OrderStatusFilter = "all" | "delivered" | "shipped" | "confirmed" | "returned" | "cancelled";

export interface WilayaDemandRecord {
  numericCode: number;                 // 1 .. 58
  wilayaCode: string;                  // "01" .. "58"
  wilayaName: string;                  // "الجزائر", "وهران", "بسكرة", etc.
  wilayaNameFr: string;                // "Alger", "Oran", "Biskra", etc.
  wilayaFullName: string;              // "16 - الجزائر (Alger)"
  totalOrders: number;                 // Orders matching product & filters in this wilaya
  deliveredOrders: number;             // Status delivered
  returnedOrders: number;              // Status returned
  cancelledOrders: number;             // Status cancelled
  activeOrders: number;                // totalOrders - cancelledOrders
  demandSharePercentage: number;       // Product Orders in Wilaya / Total Product Orders * 100
  productMixPercentage: number;        // Product Orders in Wilaya / All Product Orders in Wilaya * 100
  knownViewSessions: number;           // Sessions viewing product that voluntarily selected this wilaya
  purchasingProductSessions: number;   // Purchasing sessions for this product in this wilaya
  regionalConversionRate: number | null; // (purchasing / knownViewSessions) * 100, or null if no views
  coveragePercentage: number;          // knownViewSessions / totalProductViewSessions * 100
  productBreakdown?: Array<{
    productId: string;
    productTitle: string;
    orderCount: number;
    shareInWilaya: number;             // orderCount / allOrdersInWilaya * 100
  }>;
}

export interface GeographicalSummary {
  productId: string;                   // "all" or specific productId
  productTitle: string;
  totalOrders: number;                 // Deduplicated orders count
  deliveredOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  activeOrders: number;
  activeWilayasCount: number;          // Wilayas with at least 1 order (e.g. 24 / 58)
  topWilaya: {
    code: string;
    numericCode: number;
    name: string;
    orderCount: number;
    sharePercentage: number;
  } | null;
  knownWilayaSessions: number;         // Sessions with voluntary wilaya selection
  unknownWilayaSessions: number;       // Sessions without wilaya selection
  totalViewSessions: number;           // Total sessions
  geographicCoveragePercentage: number; // knownWilayaSessions / totalViewSessions * 100
  unmatchedOrdersCount: number;        // Orders unable to match catalog products
  wilayaBreakdown: WilayaDemandRecord[];
  unknownWilayaOrdersCount: number;    // Orders with invalid / unknown wilaya
}

export interface ProductComparisonItem {
  productId: string;
  productTitle: string;
  sku: string;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  activeWilayasCount: number;
  storeSharePercentage: number;        // Product orders / Total store orders * 100
  topWilayas: Array<{
    code: string;
    name: string;
    count: number;
    share: number;
  }>;
  regionalConversionRate: number | null;
}

export interface GeographicalFilterState {
  selectedProductId: string;           // "all" or specific productId
  timeRange: TimeRangeFilter;
  statusFilter: OrderStatusFilter;
  activeMetric: GeographicalMetricType;
  searchQuery: string;
}
