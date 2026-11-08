/**
 * ORVA Store — Phase 7F Business Overview & Profit Analytics Calculator
 * 
 * Implements deterministic calculation logic for:
 * 1. Product Conversion Rate (Attributed purchasing sessions / Unique product views * 100)
 * 2. Active Non-Buying Sessions (Unique tab-scoped sessions without order_created)
 * 3. Sessions Inactive for 60+ Seconds Without Purchase (with Estimated badge)
 * 4. Estimated Net Product Profit (Delivered Revenue - Purchase Cost - Per-Order Marketing Cost)
 * 5. Customer Activity Graph Daily Aggregation (Africa/Algiers timezone, dual-axis metrics)
 */

import type { Product } from "../repository/product-types";
import type { OrvaOrder, RawOrvaOrder } from "../repository/types";
import type { VisitorSessionRecord, VisitorAnalyticsEvent } from "./visitor-analytics-types";
import { matchOrderToProduct } from "../repository/product-types";

export type OverviewDateRange = "today" | "last_7_days" | "last_30_days" | "all";

export interface ProductConversionRateResult {
  conversionRate: number;                     // e.g. 16.7 (%)
  uniqueProductSessions: number;             // Denominator: unique sessions viewing product
  purchasingSessions: number;                // Total purchasing sessions
  attributedPurchasingSessions: number;      // Numerator: attributed purchasing sessions
  unattributedPurchasingSessions: number;    // Purchases without preceding product view
  averageTimeToPurchaseSeconds: number;      // Average duration from view to purchase
  medianTimeToPurchaseSeconds: number;       // Median duration
  timeBuckets: {
    under1Min: number;
    from1To5Min: number;
    from5To15Min: number;
    from15To30Min: number;
    over30Min: number;
  };
}

export interface ActiveNonBuyingSessionsResult {
  count: number;                             // Active non-buying sessions count
  percentageOfActive: number;                // % of all active sessions
  viewedProductSessionsCount: number;        // Sessions that viewed product(s) without buying
  startedCheckoutCount: number;              // Sessions that started checkout without buying
  totalActiveSessions: number;               // Total active sessions in period
  isTabScoped: true;                         // Explicit indicator of tab-scoped identifier
}

export interface InactiveSessions60sResult {
  count: number;                             // Inactive >= 60s without purchase
  percentageOfActive: number;                // % of all active sessions
  isEstimated: true;                         // Always estimated
  explanationNote: string;                   // Educational text
}

export interface EstimatedNetProductProfitResult {
  isAvailable: boolean;                      // False in Live Mode if costs not connected
  statusMessage?: string;                    // e.g. "Not Available" / "Analytics Not Connected"
  estimatedNetProfitDzd: number;             // Revenue - Purchase Cost - Marketing Cost
  collectedRevenueDzd: number;               // Products price from delivered orders (no shipping fee)
  totalPurchaseCostDzd: number;              // Unit purchase cost * delivered qty
  totalMarketingCostDzd: number;             // Marketing cost per order * delivered orders
  deliveredOrdersCount: number;              // Deduplicated delivered orders count
  deliveredUnitsCount: number;               // Sum of delivered quantities
  financialCoveragePercentage: number;       // % of delivered orders with known cost data
  disclaimer: string;                        // "ربح تقديري للمنتجات المسلّمة فقط، ولا يمثل صافي ربح الشركة الكلي"
}

export interface OverviewDailyChartPoint {
  date: string;                              // YYYY-MM-DD in Africa/Algiers
  formattedDate: string;                     // e.g. "28 Oct"
  uniqueSessions: number;                    // Count (left axis)
  ordersCreated: number;                     // Count (left axis)
  collectedRevenue: number;                  // DZD (right axis)
  estimatedNetProfit: number;                // DZD (right axis)
}

export interface BusinessOverviewSummary {
  selectedRange: OverviewDateRange;
  selectedProductId: string;                 // "all" or specific product ID
  productConversion: ProductConversionRateResult;
  activeNonBuying: ActiveNonBuyingSessionsResult;
  inactive60s: InactiveSessions60sResult;
  netProductProfit: EstimatedNetProductProfitResult;
  chartData: OverviewDailyChartPoint[];
}

// ── 1. Africa/Algiers Timezone Utilities ─────────────────────────────────────

/**
 * Returns YYYY-MM-DD string in Africa/Algiers (UTC+1) timezone.
 * Returns null if input is missing, non-finite, NaN, or <= 0.
 */
export function getAlgiersDateKey(dateInput: string | number | Date | null | undefined): string | null {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  const ms = d.getTime();
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;

  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Algiers",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return null;
  }
}

/**
 * Validates whether an event/order timestamp falls within the selected date range
 * relative to the calendar day in Africa/Algiers.
 */
export function isDateInAlgiersRange(
  dateInput: string | number | Date | null | undefined,
  range: OverviewDateRange,
  nowMs: number = Date.now()
): boolean {
  if (range === "all") return true;

  const itemDateKey = getAlgiersDateKey(dateInput);
  if (!itemDateKey) return false; // Strictly reject invalid/missing dates in specified periods

  const todayDateKey = getAlgiersDateKey(nowMs);
  if (!todayDateKey) return false;

  if (range === "today") {
    // Exact calendar day in Africa/Algiers
    return itemDateKey === todayDateKey;
  }

  const [iy, im, id] = itemDateKey.split("-").map(Number);
  const [ty, tm, td] = todayDateKey.split("-").map(Number);

  const itemMidnight = Date.UTC(iy, im - 1, id);
  const todayMidnight = Date.UTC(ty, tm - 1, td);
  const diffDays = Math.floor((todayMidnight - itemMidnight) / (24 * 3600 * 1000));

  const maxDays = range === "last_7_days" ? 7 : 30;
  return diffDays >= 0 && diffDays < maxDays;
}

// ── 2. KPI 1: Product Conversion Rate Calculation ───────────────────────────

export function computeProductConversionRate({
  sessions,
  events = [],
  productId = "all",
}: {
  sessions: VisitorSessionRecord[];
  events?: VisitorAnalyticsEvent[];
  productId?: string;
}): ProductConversionRateResult {
  const isAll = !productId || productId === "all";

  // Filter sessions that viewed the product(s)
  const uniqueProductSessions = sessions.filter((s) => {
    const views = s.viewedProductIds || [];
    if (isAll) return views.length > 0;
    return views.includes(productId);
  }).length;

  // Attributed purchasing sessions
  // Must have hasPurchased === true AND must have viewed the product AND purchased that exact product
  const attributedSessions = sessions.filter((s) => {
    if (!s.hasPurchased) return false;
    const views = s.viewedProductIds || [];
    const purchases = s.purchasedProductIds || [];

    if (isAll) {
      // Must have purchased at least one product that was actually viewed in this session
      return purchases.some((p) => views.includes(p));
    }

    // Specific product: must have viewed this exact product AND purchased this exact product
    return views.includes(productId) && purchases.includes(productId);
  });

  const attributedPurchasingSessions = attributedSessions.length;

  // Total purchasing sessions
  const totalPurchasing = sessions.filter((s) => {
    if (!s.hasPurchased) return false;
    if (isAll) return true;
    const purchases = s.purchasedProductIds || [];
    return purchases.includes(productId) || s.currentProductId === productId;
  }).length;

  const unattributedPurchasingSessions = Math.max(0, totalPurchasing - attributedPurchasingSessions);

  const conversionRate =
    uniqueProductSessions > 0
      ? Math.round((attributedPurchasingSessions / uniqueProductSessions) * 1000) / 10
      : 0;

  // Time to Purchase calculations across attributed sessions
  const durations: number[] = [];
  const timeBuckets = {
    under1Min: 0,
    from1To5Min: 0,
    from5To15Min: 0,
    from15To30Min: 0,
    over30Min: 0,
  };

  for (const s of attributedSessions) {
    let diffSec: number | null = null;

    if (events.length > 0) {
      // Find earliest view event of matching product in this session
      const targetPids = isAll ? (s.purchasedProductIds || []) : [productId];
      const viewEvts = events.filter(
        (e) =>
          e.pseudonymousSessionId === s.sessionId &&
          e.eventType === "product_view" &&
          targetPids.includes(e.productId)
      );

      const orderEvts = events.filter(
        (e) =>
          e.pseudonymousSessionId === s.sessionId &&
          e.eventType === "order_created" &&
          (targetPids.includes(e.productId) || (e.productIds && e.productIds.some((p) => targetPids.includes(p))))
      );

      if (viewEvts.length > 0 && orderEvts.length > 0) {
        const vTime = new Date(viewEvts[0].timestamp).getTime();
        const oTime = new Date(orderEvts[0].timestamp).getTime();
        if (Number.isFinite(vTime) && Number.isFinite(oTime) && oTime >= vTime) {
          diffSec = Math.floor((oTime - vTime) / 1000);
        }
      }
    }

    if (diffSec === null && typeof s.sessionDurationSeconds === "number" && s.sessionDurationSeconds >= 0) {
      diffSec = s.sessionDurationSeconds;
    }

    if (diffSec !== null && Number.isFinite(diffSec) && diffSec >= 0) {
      durations.push(diffSec);

      if (diffSec < 60) {
        timeBuckets.under1Min++;
      } else if (diffSec < 300) {
        timeBuckets.from1To5Min++;
      } else if (diffSec < 900) {
        timeBuckets.from5To15Min++;
      } else if (diffSec < 1800) {
        timeBuckets.from15To30Min++;
      } else {
        timeBuckets.over30Min++;
      }
    }
  }

  let averageTimeToPurchaseSeconds = 0;
  let medianTimeToPurchaseSeconds = 0;

  if (durations.length > 0) {
    const sum = durations.reduce((acc, val) => acc + val, 0);
    averageTimeToPurchaseSeconds = Math.round(sum / durations.length);

    durations.sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    medianTimeToPurchaseSeconds =
      durations.length % 2 !== 0
        ? durations[mid]
        : Math.round((durations[mid - 1] + durations[mid]) / 2);
  }

  return {
    conversionRate,
    uniqueProductSessions,
    purchasingSessions: totalPurchasing,
    attributedPurchasingSessions,
    unattributedPurchasingSessions,
    averageTimeToPurchaseSeconds,
    medianTimeToPurchaseSeconds,
    timeBuckets,
  };
}

// ── 3. KPI 2: Active Non-Buying Sessions Calculation ────────────────────────

export function computeActiveNonBuyingSessions({
  sessions,
  productId = "all",
}: {
  sessions: VisitorSessionRecord[];
  productId?: string;
}): ActiveNonBuyingSessionsResult {
  const isAll = !productId || productId === "all";

  // Filter relevant sessions by product if specified
  const relevantSessions = sessions.filter((s) => {
    if (isAll) return true;
    const views = s.viewedProductIds || [];
    const purchases = s.purchasedProductIds || [];
    return views.includes(productId) || purchases.includes(productId) || s.currentProductId === productId;
  });

  const totalActiveSessions = relevantSessions.length;

  // Active non-buying sessions: hasPurchased === false
  const nonBuyingSessions = relevantSessions.filter((s) => !s.hasPurchased);
  const count = nonBuyingSessions.length;

  const percentageOfActive =
    totalActiveSessions > 0
      ? Math.round((count / totalActiveSessions) * 1000) / 10
      : 0;

  const viewedProductSessionsCount = nonBuyingSessions.filter((s) => {
    const views = s.viewedProductIds || [];
    if (isAll) return views.length > 0;
    return views.includes(productId);
  }).length;

  const startedCheckoutCount = nonBuyingSessions.filter((s) => s.startedCheckout).length;

  return {
    count,
    percentageOfActive,
    viewedProductSessionsCount,
    startedCheckoutCount,
    totalActiveSessions,
    isTabScoped: true,
  };
}

// ── 4. KPI 3: Sessions Inactive for 60+ Seconds Without Purchase ────────────

export function computeInactiveSessions60s({
  sessions,
  productId = "all",
}: {
  sessions: VisitorSessionRecord[];
  productId?: string;
}): InactiveSessions60sResult {
  const isAll = !productId || productId === "all";

  const relevantSessions = sessions.filter((s) => {
    if (isAll) return true;
    const views = s.viewedProductIds || [];
    const purchases = s.purchasedProductIds || [];
    return views.includes(productId) || purchases.includes(productId) || s.currentProductId === productId;
  });

  const totalActiveSessions = relevantSessions.length;

  // Inactive >= 60 seconds and strictly NO purchase
  // If session created an order later (hasPurchased === true), it is excluded!
  const inactiveSessions = relevantSessions.filter((s) => {
    if (s.hasPurchased) return false;
    return typeof s.sessionDurationSeconds === "number" && s.sessionDurationSeconds >= 60;
  });

  const count = inactiveSessions.length;
  const percentageOfActive =
    totalActiveSessions > 0
      ? Math.round((count / totalActiveSessions) * 1000) / 10
      : 0;

  return {
    count,
    percentageOfActive,
    isEstimated: true,
    explanationNote: "قياس عدم النشاط (Inactivity) بعد دقيقة دون شراء — تقديري وليس دليلاً قطعياً على إغلاق المتصفح.",
  };
}

// ── 5. KPI 4: Estimated Net Product Profit Calculation ──────────────────────

export function computeDeliveredProductProfit({
  orders,
  products,
  productId = "all",
  isLiveMode = false,
  hasLiveFinancialData = false,
}: {
  orders: Array<OrvaOrder | RawOrvaOrder>;
  products: Product[];
  productId?: string;
  isLiveMode?: boolean;
  hasLiveFinancialData?: boolean;
}): EstimatedNetProductProfitResult {
  // Live mode guard: if live financial costs not authenticated from server, show unavailable
  if (isLiveMode && !hasLiveFinancialData) {
    return {
      isAvailable: false,
      statusMessage: "Not Available",
      estimatedNetProfitDzd: 0,
      collectedRevenueDzd: 0,
      totalPurchaseCostDzd: 0,
      totalMarketingCostDzd: 0,
      deliveredOrdersCount: 0,
      deliveredUnitsCount: 0,
      financialCoveragePercentage: 0,
      disclaimer: "البيانات المالية غير متاحة في وضع الخادم دون مزامنة تكاليف المنتجات والتسويق.",
    };
  }

  const isAll = !productId || productId === "all";

  // Products catalog lookup map
  const productCatalogMap = new Map<string, Product>();
  for (const p of products) {
    productCatalogMap.set(p.id, p);
  }

  // Filter delivered orders only
  const deliveredOrders = orders.filter((o) => {
    const st = String((o as any).status || "").toLowerCase();
    return st === "delivered";
  });

  // Track unique delivered orders
  const uniqueOrderIds = new Set<string>();
  let collectedRevenueDzd = 0;
  let totalPurchaseCostDzd = 0;
  let totalMarketingCostDzd = 0;
  let deliveredUnitsCount = 0;
  let deliveredOrdersCount = 0;
  let ordersWithKnownCostsCount = 0;

  // Group items by order to deduct marketing cost ONCE per delivered order-product association
  const orderProductTrack = new Set<string>(); // key: `${orderId}_${matchedProductId}`

  for (const order of deliveredOrders) {
    const rawId = String(order.id || (order as any).orderId || (order as any).order_id || "");
    const orderId = rawId || `ord_${Math.random()}`;

    // Deduplicate orderId in total delivered orders
    if (!uniqueOrderIds.has(orderId)) {
      uniqueOrderIds.add(orderId);
      deliveredOrdersCount++;
    }

    // Match product
    const rawProductName = String((order as any).productName || (order as any).product_name || "");
    const explicitProductId = (order as any).productId;
    const match = matchOrderToProduct(rawProductName);
    const matchedProductId = explicitProductId || match.matchedProductId;

    // Filter by product if specified
    if (!isAll && matchedProductId !== productId) {
      continue;
    }

    const qty = Math.max(1, Number((order as any).quantity) || 1);
    deliveredUnitsCount += qty;

    // Revenue: product selling price (excluding shipping fee!)
    const productDef = matchedProductId ? productCatalogMap.get(matchedProductId) : null;
    let unitSellingPrice = 0;
    if (typeof (order as any).priceDzd === "number" && (order as any).priceDzd > 0) {
      unitSellingPrice = (order as any).priceDzd;
    } else if (typeof (order as any).priceNum === "number" && (order as any).priceNum > 0) {
      unitSellingPrice = (order as any).priceNum;
    } else if (productDef && typeof productDef.sellingPrice === "number") {
      unitSellingPrice = productDef.sellingPrice;
    }

    const orderRevenue = unitSellingPrice * qty;
    collectedRevenueDzd += orderRevenue;

    // Costs check
    if (productDef && typeof productDef.purchaseCost === "number" && productDef.purchaseCost >= 0) {
      ordersWithKnownCostsCount++;
      const orderPurchaseCost = productDef.purchaseCost * qty;
      totalPurchaseCostDzd += orderPurchaseCost;

      // Marketing cost deducted ONCE per order for this product
      const trackKey = `${orderId}_${productDef.id}`;
      if (!orderProductTrack.has(trackKey)) {
        orderProductTrack.add(trackKey);
        const marketingCost = Number(productDef.marketingCostPerOrder) || 0;
        totalMarketingCostDzd += marketingCost;
      }
    }
  }

  const financialCoveragePercentage =
    deliveredOrdersCount > 0
      ? Math.round((ordersWithKnownCostsCount / deliveredOrdersCount) * 1000) / 10
      : 100;

  const rawProfit = collectedRevenueDzd - totalPurchaseCostDzd - totalMarketingCostDzd;
  const estimatedNetProfitDzd = Math.max(0, rawProfit);

  return {
    isAvailable: true,
    estimatedNetProfitDzd,
    collectedRevenueDzd,
    totalPurchaseCostDzd,
    totalMarketingCostDzd,
    deliveredOrdersCount,
    deliveredUnitsCount,
    financialCoveragePercentage,
    disclaimer: "ربح تقديري للمنتجات المسلّمة فقط، ولا يمثل صافي ربح الشركة الكلي (لا يخصم الضرائب أو المصاريف العامة غير المسجلة).",
  };
}

// ── 6. Customer Activity Graph Daily Aggregation ────────────────────────────

export function computeDailyOverviewChartData({
  sessions,
  orders,
  products,
  range = "last_7_days",
  productId = "all",
  nowMs = Date.now(),
}: {
  sessions: VisitorSessionRecord[];
  orders: Array<OrvaOrder | RawOrvaOrder>;
  products: Product[];
  range: OverviewDateRange;
  productId?: string;
  nowMs?: number;
}): OverviewDailyChartPoint[] {
  const isAll = !productId || productId === "all";

  // Build list of target calendar dates in Africa/Algiers
  const todayKey = getAlgiersDateKey(nowMs) || "2026-10-31";
  const [ty, tm, td] = todayKey.split("-").map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);

  let numDays = 7;
  if (range === "today") numDays = 1;
  else if (range === "last_7_days") numDays = 7;
  else if (range === "last_30_days") numDays = 30;
  else if (range === "all") numDays = 30; // 30-day window for graph view

  const dateKeys: string[] = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const dayMs = todayUtc - i * 24 * 3600 * 1000;
    const dKey = getAlgiersDateKey(dayMs);
    if (dKey && !dateKeys.includes(dKey)) {
      dateKeys.push(dKey);
    }
  }

  // Pre-filter sessions by product
  const relevantSessions = sessions.filter((s) => {
    if (isAll) return true;
    const views = s.viewedProductIds || [];
    const purchases = s.purchasedProductIds || [];
    return views.includes(productId) || purchases.includes(productId) || s.currentProductId === productId;
  });

  // Pre-filter orders by product
  const relevantOrders = orders.filter((o) => {
    if (isAll) return true;
    const rawProdName = String((o as any).productName || (o as any).product_name || "");
    const explicitPid = (o as any).productId;
    const match = matchOrderToProduct(rawProdName);
    return explicitPid === productId || match.matchedProductId === productId;
  });

  // Index sessions by date key
  const sessionsByDate = new Map<string, Set<string>>();
  for (const s of relevantSessions) {
    const dateKey = getAlgiersDateKey(s.startedAt);
    if (dateKey) {
      if (!sessionsByDate.has(dateKey)) sessionsByDate.set(dateKey, new Set());
      sessionsByDate.get(dateKey)!.add(s.sessionId);
    }
  }

  // Index orders by date key
  const ordersByDate = new Map<string, Array<OrvaOrder | RawOrvaOrder>>();
  for (const o of relevantOrders) {
    const rawDate = (o as any).createdAt || (o as any).created_at || (o as any).date;
    const dateKey = getAlgiersDateKey(rawDate);
    if (dateKey) {
      if (!ordersByDate.has(dateKey)) ordersByDate.set(dateKey, []);
      ordersByDate.get(dateKey)!.push(o);
    }
  }

  const result: OverviewDailyChartPoint[] = [];

  for (const dKey of dateKeys) {
    const daySessions = sessionsByDate.get(dKey)?.size || 0;
    const dayOrders = ordersByDate.get(dKey) || [];

    // Deduplicate orders created on this day
    const dayOrderIds = new Set<string>();
    for (const o of dayOrders) {
      const id = String(o.id || (o as any).orderId || (o as any).order_id || "");
      if (id) dayOrderIds.add(id);
    }
    const ordersCreated = dayOrderIds.size;

    // Profit & Revenue for delivered orders on this day
    const profitMetrics = computeDeliveredProductProfit({
      orders: dayOrders,
      products,
      productId,
      isLiveMode: false,
      hasLiveFinancialData: true,
    });

    const [y, m, d] = dKey.split("-").map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const formattedDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(dateObj);

    result.push({
      date: dKey,
      formattedDate,
      uniqueSessions: daySessions,
      ordersCreated,
      collectedRevenue: profitMetrics.collectedRevenueDzd,
      estimatedNetProfit: profitMetrics.estimatedNetProfitDzd,
    });
  }

  return result;
}
