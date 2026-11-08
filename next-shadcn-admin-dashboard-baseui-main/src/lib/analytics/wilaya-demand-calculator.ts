/**
 * ORVA Store — Phase 7E Geographical Demand Calculator
 * 
 * Implements pure calculations for:
 * 1. Product Demand Share = Product Orders in Wilaya / Total Product Orders * 100
 * 2. Product Mix by Wilaya = Product Orders in Wilaya / All Product Orders in Wilaya * 100
 * 3. Regional Conversion Rate = Purchasing Sessions in Wilaya / Known-Wilaya View Sessions * 100
 * 
 * Strict Privacy & Integrity Rules:
 * - Zero IP Geolocation or wilaya guessing (voluntary selectedWilaya only).
 * - Multi-product orders do not duplicate orderId in store totals.
 * - Unknown Wilaya is isolated and never speculatively distributed.
 * - Catalog products matched via matchOrderToProduct; unmatched counted separately.
 */

import { ALGERIA_WILAYAS } from "../../data/algeria-locations";
import { extractWilayaCode } from "../../data/geoalgeria/geo-helper";
import { matchOrderToProduct } from "../repository/product-types";
import type { Product } from "../repository/product-types";
import type { OrvaOrder, RawOrvaOrder } from "../repository/types";
import type { VisitorSessionRecord } from "./visitor-analytics-types";
import type {
  GeographicalSummary,
  WilayaDemandRecord,
  ProductComparisonItem,
  GeographicalFilterState,
} from "./wilaya-demand-types";

export interface NormalizedOrderInfo {
  orderId: string;
  wilayaNumericCode: number | null;
  wilayaCodeStr: string | null;
  matchedProductId: string | null;
  matchedSku: string | null;
  status: string;
  createdAtMs: number;
  isCancelled: boolean;
  isDelivered: boolean;
  isReturned: boolean;
}

/**
 * Normalizes an order record into a clean analytical format.
 */
export function normalizeOrderForDemand(order: OrvaOrder | RawOrvaOrder): NormalizedOrderInfo {
  const orderId = String(order.id || (order as any).orderId || (order as any).order_id || "");
  const rawWilaya = order.wilaya || (order as any).selectedWilaya || "";
  const numCode = extractWilayaCode(rawWilaya);

  // Match product name using the project's official matching algorithm
  const rawProductName = (order as any).productName || (order as any).product_name || "";
  const match = matchOrderToProduct(rawProductName);

  const rawCreatedAt = (order as any).createdAt || (order as any).created_at || (order as any).date || "";
  let createdAtMs = 0;
  if (rawCreatedAt) {
    const parsed = new Date(rawCreatedAt).getTime();
    if (typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0) {
      createdAtMs = parsed;
    }
  }

  const status = String((order as any).status || "").toLowerCase();

  return {
    orderId,
    wilayaNumericCode: numCode && numCode >= 1 && numCode <= 58 ? numCode : null,
    wilayaCodeStr: numCode && numCode >= 1 && numCode <= 58 ? String(numCode).padStart(2, "0") : null,
    matchedProductId: (order as any).productId || match.matchedProductId,
    matchedSku: match.matchedSku,
    status,
    createdAtMs,
    isCancelled: status === "cancelled",
    isDelivered: status === "delivered",
    isReturned: status === "returned",
  };
}

/**
 * Filters orders based on time range and status filter.
 */
export function filterOrders(
  orders: NormalizedOrderInfo[],
  filter: Pick<GeographicalFilterState, "timeRange" | "statusFilter">,
  nowMs: number = Date.now()
): NormalizedOrderInfo[] {
  return orders.filter((o) => {
    // 1. Time range filter
    if (filter.timeRange !== "all") {
      // Must be a valid numeric, finite timestamp strictly greater than 0
      if (typeof o.createdAtMs !== "number" || !Number.isFinite(o.createdAtMs) || o.createdAtMs <= 0) {
        return false;
      }
      const elapsedDays = (nowMs - o.createdAtMs) / (1000 * 60 * 60 * 24);
      if (filter.timeRange === "today" && elapsedDays > 1) return false;
      if (filter.timeRange === "last_7_days" && elapsedDays > 7) return false;
      if (filter.timeRange === "last_30_days" && elapsedDays > 30) return false;
    }

    // 2. Status filter
    if (filter.statusFilter !== "all") {
      if (o.status !== filter.statusFilter) return false;
    }

    return true;
  });
}

/**
 * Computes comprehensive geographical demand metrics across all 58 wilayas.
 */
export function computeGeographicalDemand({
  orders,
  products,
  sessions,
  filter,
  nowMs = Date.now(),
}: {
  orders: Array<OrvaOrder | RawOrvaOrder>;
  products: Product[];
  sessions: VisitorSessionRecord[];
  filter: GeographicalFilterState;
  nowMs?: number;
}): GeographicalSummary {
  const normalizedOrders = orders.map(normalizeOrderForDemand);
  const activeOrdersList = filterOrders(normalizedOrders, filter, nowMs);

  const isAllProducts = filter.selectedProductId === "all";
  const targetProduct = products.find((p) => p.id === filter.selectedProductId);
  const productTitle = isAllProducts ? "جميع منتجات الكتالوج" : targetProduct?.title || filter.selectedProductId;

  // Filter orders relevant to the selected product (or all)
  const productOrders = activeOrdersList.filter((o) => {
    if (isAllProducts) return true;
    return o.matchedProductId === filter.selectedProductId;
  });

  // Count unmatched orders in the entire dataset (where productName exists but catalog match failed)
  const unmatchedOrdersCount = activeOrdersList.filter(
    (o) => !o.matchedProductId && !o.isCancelled
  ).length;

  // Track unknown wilaya orders
  const unknownWilayaOrdersCount = productOrders.filter((o) => !o.wilayaNumericCode).length;

  // Total product orders (deduplicated by orderId)
  const uniqueOrderIds = new Set<string>();
  let deliveredOrders = 0;
  let returnedOrders = 0;
  let cancelledOrders = 0;

  for (const o of productOrders) {
    if (!uniqueOrderIds.has(o.orderId)) {
      uniqueOrderIds.add(o.orderId);
      if (o.isDelivered) deliveredOrders++;
      if (o.isReturned) returnedOrders++;
      if (o.isCancelled) cancelledOrders++;
    }
  }

  const totalOrders = uniqueOrderIds.size;
  const activeOrders = Math.max(0, totalOrders - cancelledOrders);

  // Group all orders by Wilaya to compute Product Mix (All product orders in that wilaya)
  const allOrdersPerWilaya = new Map<number, number>();
  for (const o of activeOrdersList) {
    if (o.wilayaNumericCode && !o.isCancelled) {
      allOrdersPerWilaya.set(o.wilayaNumericCode, (allOrdersPerWilaya.get(o.wilayaNumericCode) || 0) + 1);
    }
  }

  // Group product orders by Wilaya (excluding cancelled orders from active demand share)
  const productOrdersPerWilaya = new Map<number, NormalizedOrderInfo[]>();
  for (const o of productOrders) {
    if (o.wilayaNumericCode) {
      if (!productOrdersPerWilaya.has(o.wilayaNumericCode)) {
        productOrdersPerWilaya.set(o.wilayaNumericCode, []);
      }
      productOrdersPerWilaya.get(o.wilayaNumericCode)!.push(o);
    }
  }

  // Session Analytics: Known Wilaya vs Unknown Wilaya (strictly voluntary selectedWilaya)
  // Sessions that viewed the target product (or any product if "all")
  const relevantSessions = sessions.filter((s) => {
    const viewed = s.viewedProductIds || [];
    if (isAllProducts) return viewed.length > 0;
    return viewed.includes(filter.selectedProductId);
  });

  const totalViewSessions = relevantSessions.length;
  let knownWilayaSessionsCount = 0;
  let unknownWilayaSessionsCount = 0;

  const sessionsPerWilaya = new Map<number, { views: number; purchases: number }>();

  for (const s of relevantSessions) {
    const sWilayaCode = s.selectedWilaya ? extractWilayaCode(s.selectedWilaya) : null;
    if (sWilayaCode && sWilayaCode >= 1 && sWilayaCode <= 58) {
      knownWilayaSessionsCount++;
      if (!sessionsPerWilaya.has(sWilayaCode)) {
        sessionsPerWilaya.set(sWilayaCode, { views: 0, purchases: 0 });
      }
      const st = sessionsPerWilaya.get(sWilayaCode)!;
      st.views++;

      // Purchasing session check
      const purchased = s.purchasedProductIds || [];
      const purchasedThisProduct = isAllProducts
        ? s.hasPurchased
        : s.hasPurchased && (purchased.includes(filter.selectedProductId) || s.currentProductId === filter.selectedProductId);

      if (purchasedThisProduct) {
        st.purchases++;
      }
    } else {
      unknownWilayaSessionsCount++;
    }
  }

  const geographicCoveragePercentage =
    totalViewSessions > 0
      ? Math.round((knownWilayaSessionsCount / totalViewSessions) * 1000) / 10
      : 0;

  // Pre-aggregate product orders by wilaya for O(1) breakdown lookup inside the 58-wilaya loop
  const productsByWilaya = new Map<number, Map<string, number>>();
  for (const o of activeOrdersList) {
    if (o.wilayaNumericCode && !o.isCancelled && o.matchedProductId) {
      let pMap = productsByWilaya.get(o.wilayaNumericCode);
      if (!pMap) {
        pMap = new Map<string, number>();
        productsByWilaya.set(o.wilayaNumericCode, pMap);
      }
      pMap.set(o.matchedProductId, (pMap.get(o.matchedProductId) || 0) + 1);
    }
  }

  // Build the 58 Wilayas breakdown matrix
  let topWilaya: GeographicalSummary["topWilaya"] = null;
  let activeWilayasCount = 0;

  const wilayaBreakdown: WilayaDemandRecord[] = ALGERIA_WILAYAS.map((wilayaDef) => {
    const numCode = parseInt(wilayaDef.code, 10);
    const wilayaOrders = productOrdersPerWilaya.get(numCode) || [];

    // Deduplicate orders in this wilaya
    const wilayaOrderIds = new Set<string>();
    let wDelivered = 0;
    let wReturned = 0;
    let wCancelled = 0;

    for (const o of wilayaOrders) {
      if (!wilayaOrderIds.has(o.orderId)) {
        wilayaOrderIds.add(o.orderId);
        if (o.isDelivered) wDelivered++;
        if (o.isReturned) wReturned++;
        if (o.isCancelled) wCancelled++;
      }
    }

    const wTotalOrders = wilayaOrderIds.size;
    const wActiveOrders = Math.max(0, wTotalOrders - wCancelled);
    if (wTotalOrders > 0) activeWilayasCount++;

    // A. Product Demand Share = Product Orders in Wilaya / Total Product Orders across all Wilayas * 100
    // (Using active non-cancelled orders for active demand share)
    const demandSharePercentage =
      activeOrders > 0
        ? Math.round((wActiveOrders / activeOrders) * 1000) / 10
        : 0;

    // B. Product Mix by Wilaya = Product Orders in Wilaya / All Product Orders in that Wilaya * 100
    const allInThisWilaya = allOrdersPerWilaya.get(numCode) || 0;
    const productMixPercentage =
      allInThisWilaya > 0
        ? Math.round((wActiveOrders / allInThisWilaya) * 1000) / 10
        : 0;

    // C. Regional Conversion Rate = Purchasing Sessions in Wilaya / Known-Wilaya View Sessions * 100
    const sessionStats = sessionsPerWilaya.get(numCode);
    const knownViewSessions = sessionStats?.views || 0;
    const purchasingProductSessions = sessionStats?.purchases || 0;
    const regionalConversionRate =
      knownViewSessions > 0
        ? Math.round((purchasingProductSessions / knownViewSessions) * 1000) / 10
        : null;

    const coveragePercentage =
      totalViewSessions > 0
        ? Math.round((knownViewSessions / totalViewSessions) * 1000) / 10
        : 0;

    // Product breakdown within this wilaya (O(1) pre-aggregated lookup)
    const productCounts = productsByWilaya.get(numCode) || new Map<string, number>();

    const productBreakdown = Array.from(productCounts.entries())
      .map(([pId, count]) => {
        const prod = products.find((p) => p.id === pId);
        return {
          productId: pId,
          productTitle: prod?.title || pId,
          orderCount: count,
          shareInWilaya: allInThisWilaya > 0 ? Math.round((count / allInThisWilaya) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.orderCount - a.orderCount);

    const record: WilayaDemandRecord = {
      numericCode: numCode,
      wilayaCode: wilayaDef.code,
      wilayaName: wilayaDef.arName,
      wilayaNameFr: wilayaDef.name.split(" - ")[1]?.split(" (")[1]?.replace(")", "") || wilayaDef.name,
      wilayaFullName: wilayaDef.name,
      totalOrders: wTotalOrders,
      deliveredOrders: wDelivered,
      returnedOrders: wReturned,
      cancelledOrders: wCancelled,
      activeOrders: wActiveOrders,
      demandSharePercentage,
      productMixPercentage,
      knownViewSessions,
      purchasingProductSessions,
      regionalConversionRate,
      coveragePercentage,
      productBreakdown,
    };

    // Track Top Wilaya by demand
    if (wActiveOrders > 0) {
      if (!topWilaya || wActiveOrders > topWilaya.orderCount) {
        topWilaya = {
          code: wilayaDef.code,
          numericCode: numCode,
          name: wilayaDef.arName,
          orderCount: wActiveOrders,
          sharePercentage: demandSharePercentage,
        };
      }
    }

    return record;
  });

  // Sort breakdown descending by active orders, then code
  wilayaBreakdown.sort((a, b) => {
    if (b.activeOrders !== a.activeOrders) return b.activeOrders - a.activeOrders;
    return a.numericCode - b.numericCode;
  });

  return {
    productId: filter.selectedProductId,
    productTitle,
    totalOrders,
    deliveredOrders,
    returnedOrders,
    cancelledOrders,
    activeOrders,
    activeWilayasCount,
    topWilaya,
    knownWilayaSessions: knownWilayaSessionsCount,
    unknownWilayaSessions: unknownWilayaSessionsCount,
    totalViewSessions,
    geographicCoveragePercentage,
    unmatchedOrdersCount,
    wilayaBreakdown,
    unknownWilayaOrdersCount,
  };
}

/**
 * Computes side-by-side product comparisons across orders and wilayas.
 */
export function computeProductComparisons({
  orders,
  products,
  sessions,
  productIds,
}: {
  orders: Array<OrvaOrder | RawOrvaOrder>;
  products: Product[];
  sessions: VisitorSessionRecord[];
  productIds: string[];
}): ProductComparisonItem[] {
  const normalizedOrders = orders.map(normalizeOrderForDemand);
  const totalStoreOrders = new Set(
    normalizedOrders.filter((o) => !o.isCancelled).map((o) => o.orderId)
  ).size;

  return productIds.map((pId) => {
    const prod = products.find((p) => p.id === pId);
    const prodOrders = normalizedOrders.filter((o) => o.matchedProductId === pId && !o.isCancelled);

    const uniqueOrderIds = new Set(prodOrders.map((o) => o.orderId));
    const totalOrders = uniqueOrderIds.size;
    const deliveredOrders = prodOrders.filter((o) => o.isDelivered).length;
    const returnedOrders = prodOrders.filter((o) => o.isReturned).length;

    // Wilayas count
    const wilayaCounts = new Map<string, number>();
    for (const o of prodOrders) {
      if (o.wilayaCodeStr) {
        wilayaCounts.set(o.wilayaCodeStr, (wilayaCounts.get(o.wilayaCodeStr) || 0) + 1);
      }
    }

    const activeWilayasCount = wilayaCounts.size;
    const storeSharePercentage =
      totalStoreOrders > 0
        ? Math.round((totalOrders / totalStoreOrders) * 1000) / 10
        : 0;

    // Top 3 wilayas for this product
    const topWilayas = Array.from(wilayaCounts.entries())
      .map(([code, count]) => {
        const wilayaDef = ALGERIA_WILAYAS.find((w) => w.code === code);
        return {
          code,
          name: wilayaDef?.arName || code,
          count,
          share: totalOrders > 0 ? Math.round((count / totalOrders) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Regional conversion rate for known wilaya sessions
    const prodSessions = sessions.filter((s) => s.viewedProductIds.includes(pId) && Boolean(s.selectedWilaya));
    const prodPurchasingSessions = prodSessions.filter(
      (s) => s.hasPurchased && (s.purchasedProductIds.includes(pId) || s.currentProductId === pId)
    );

    const regionalConversionRate =
      prodSessions.length > 0
        ? Math.round((prodPurchasingSessions.length / prodSessions.length) * 1000) / 10
        : null;

    return {
      productId: pId,
      productTitle: prod?.title || pId,
      sku: prod?.sku || "SKU-UNKNOWN",
      totalOrders,
      deliveredOrders,
      returnedOrders,
      activeWilayasCount,
      storeSharePercentage,
      topWilayas,
      regionalConversionRate,
    };
  });
}
