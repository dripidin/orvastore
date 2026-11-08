/**
 * ORVA Store — Phase 7G Delivery Metrics & KPI Calculator
 * 
 * Pure mathematical functions for:
 * 1. KPI cards calculation (Delivered, In Transit, Failed, Returned, Pending, Unknown).
 * 2. Multi-criteria filtering (search, wilaya, courier, internal status, external status, date).
 * 3. Timeline event generation with strict authenticity (no fake dates).
 * 4. Multi-order customer summary extraction with complete order isolation.
 */

import type { OrvaOrder } from "../repository/types";
import type {
  CourierTrackingResult,
  DeliveryKPIMetrics,
  DeliveryFilterOptions,
  DeliveryTimelineEvent,
  CustomerOrderSummary,
} from "./delivery-tracking-types";
import { mapExternalCourierStatus } from "./courier-status-mapper";
import { MOCK_COURIER_SEED_MAP } from "./mock-courier-adapter";
import { maskDemoPhone } from "../phone-utils";

/**
 * Evaluates whether an ISO timestamp falls into the given date range
 * with strict respect to the Africa/Algiers timezone (UTC+1).
 */
export function isDateInAlgiersDeliveryRange(
  dateIso: string | null | undefined,
  range: "today" | "last_7_days" | "last_30_days" | "all",
  nowMs: number = Date.now()
): boolean {
  if (range === "all") return true;
  if (!dateIso) return false;

  const parsed = Date.parse(dateIso);
  if (isNaN(parsed) || parsed <= 0) return false;

  // Algiers is fixed UTC+1 (3600000 ms)
  const ALGIERS_OFFSET_MS = 3600000;
  const algiersNow = new Date(nowMs + ALGIERS_OFFSET_MS);
  const targetDate = new Date(parsed + ALGIERS_OFFSET_MS);

  if (range === "today") {
    return (
      targetDate.getUTCFullYear() === algiersNow.getUTCFullYear() &&
      targetDate.getUTCMonth() === algiersNow.getUTCMonth() &&
      targetDate.getUTCDate() === algiersNow.getUTCDate()
    );
  }

  const diffMs = nowMs - parsed;
  if (range === "last_7_days") {
    return diffMs >= 0 && diffMs <= 7 * 86400000;
  }
  if (range === "last_30_days") {
    return diffMs >= 0 && diffMs <= 30 * 86400000;
  }

  return true;
}

/**
 * Resolves tracking code for an order, checking order.redexTrackingCode,
 * order.raw.redex_tracking_code, or synthetic conventions.
 */
export function resolveOrderTrackingCode(order: OrvaOrder): string | null {
  if (order.redexTrackingCode) return order.redexTrackingCode;
  const raw = order.raw as Record<string, any>;
  if (raw?.redex_tracking_code) return raw.redex_tracking_code;
  if (raw?.trackingCode) return raw.trackingCode;
  if (raw?.tracking_code) return raw.tracking_code;

  // Check seed tracking mapping
  if (order.id && MOCK_COURIER_SEED_MAP) {
    for (const [code, seed] of Object.entries(MOCK_COURIER_SEED_MAP)) {
      if (seed.orderId === order.id) {
        return code;
      }
    }
  }

  // If order is inRedex or has standard ID, provide deterministic mock code
  const num = (order.id || "").replace(/[^\d]/g, "");
  if (num) {
    return `RDX-${num}`;
  }

  return null;
}

/**
 * Computes the 6 KPI cards from unique orders without duplicate counting.
 */
export function computeDeliveryKPIs(
  orders: OrvaOrder[],
  trackingMap: Map<string, CourierTrackingResult>
): DeliveryKPIMetrics {
  const seenOrderIds = new Set<string>();
  let deliveredOrders = 0;
  let inTransitOrders = 0;
  let deliveryFailedOrders = 0;
  let returnedOrders = 0;
  let pendingTrackingOrders = 0;
  let unknownStatusOrders = 0;
  let returningOrders = 0;

  for (const order of orders) {
    if (!order.id || seenOrderIds.has(order.id)) continue;
    seenOrderIds.add(order.id);

    const tracking = trackingMap.get(order.id);

    if (tracking) {
      switch (tracking.receiptClassification) {
        case "Received":
          deliveredOrders++;
          break;
        case "Not Yet Received":
          if (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(tracking.normalizedStatus)) {
            inTransitOrders++;
          } else {
            pendingTrackingOrders++;
          }
          break;
        case "Not Received / Failed":
          deliveryFailedOrders++;
          break;
        case "Returning":
          returningOrders++;
          inTransitOrders++;
          break;
        case "Returned":
          returnedOrders++;
          break;
        case "Unknown":
        default:
          unknownStatusOrders++;
          break;
      }
    } else {
      // Fallback classification based on internal order.status when tracking is pending/unsynced
      if (order.status === "delivered") {
        deliveredOrders++;
      } else if (order.status === "shipped") {
        inTransitOrders++;
      } else if (order.status === "returned") {
        returnedOrders++;
      } else if (order.status === "cancelled") {
        deliveryFailedOrders++;
      } else if (["pending", "confirmed"].includes(order.status)) {
        pendingTrackingOrders++;
      } else {
        unknownStatusOrders++;
      }
    }
  }

  return {
    totalOrders: seenOrderIds.size,
    deliveredOrders,
    inTransitOrders,
    deliveryFailedOrders,
    returnedOrders,
    pendingTrackingOrders,
    unknownStatusOrders,
    returningOrders,
  };
}

/**
 * Filters orders based on user selection in the Customers & Delivery dashboard.
 */
export function filterDeliveryOrders(
  orders: OrvaOrder[],
  trackingMap: Map<string, CourierTrackingResult>,
  filters: DeliveryFilterOptions
): OrvaOrder[] {
  const query = (filters.searchTerm || "").trim().toLowerCase();

  return orders.filter((order) => {
    const tracking = trackingMap.get(order.id);
    const trackingCode = tracking?.trackingCode || resolveOrderTrackingCode(order) || "";

    // 1. Search Query (Name, Phone, Order ID, Tracking Code)
    if (query) {
      const matchName = (order.customer || "").toLowerCase().includes(query);
      const matchId = (order.id || "").toLowerCase().includes(query);
      const matchTracking = trackingCode.toLowerCase().includes(query);
      const cleanPhone = (order.phone || "").replace(/[^\d]/g, "");
      const cleanQuery = query.replace(/[^\d]/g, "");
      const matchPhone = cleanPhone && cleanQuery ? cleanPhone.includes(cleanQuery) : false;

      if (!matchName && !matchId && !matchTracking && !matchPhone) {
        return false;
      }
    }

    // 2. Wilaya Filter
    if (filters.wilayaCode && filters.wilayaCode !== "all") {
      const wilayaStr = order.wilaya || "";
      const paddedCode = filters.wilayaCode.padStart(2, "0");
      if (!wilayaStr.startsWith(paddedCode) && !wilayaStr.includes(filters.wilayaCode)) {
        return false;
      }
    }

    // 3. Courier Filter
    if (filters.courierId && filters.courierId !== "all") {
      if (filters.courierId === "none") {
        if (trackingCode || tracking?.courierId) return false;
      } else {
        const orderCourier = (tracking?.courierId || (trackingCode.startsWith("RDX") ? "redex" : trackingCode.startsWith("ECO") ? "ecotrack" : "")).toLowerCase();
        if (orderCourier !== filters.courierId.toLowerCase()) {
          return false;
        }
      }
    }

    // 4. ORVA Internal Status Filter
    if (filters.orvaStatus && filters.orvaStatus !== "all") {
      if (order.status !== filters.orvaStatus) {
        return false;
      }
    }

    // 5. Courier Normalized Status Filter
    if (filters.courierStatus && filters.courierStatus !== "all") {
      const normStatus = tracking?.normalizedStatus || "UNKNOWN";
      if (normStatus !== filters.courierStatus) {
        return false;
      }
    }

    // 6. Receipt Classification Filter
    if (filters.receiptStatus && filters.receiptStatus !== "all") {
      const receiptClass = tracking?.receiptClassification || "Unknown";
      if (receiptClass !== filters.receiptStatus) {
        return false;
      }
    }

    // 7. Date Range Filter
    if (filters.dateRange && filters.dateRange !== "all") {
      if (!isDateInAlgiersDeliveryRange(order.createdAt, filters.dateRange)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Builds authentic delivery timeline events for an order.
 * Strictly adheres to rule: NEVER invent fake dates.
 */
export function buildOrderTimeline(
  order: OrvaOrder,
  tracking?: CourierTrackingResult | null
): DeliveryTimelineEvent[] {
  // If tracking has detailed timeline events from adapter, return them
  if (tracking?.timelineEvents && tracking.timelineEvents.length > 0) {
    return tracking.timelineEvents;
  }

  const events: DeliveryTimelineEvent[] = [];
  const status = order.status;

  // Step 1: Order Created
  events.push({
    id: `evt_${order.id}_created`,
    stepKey: "created",
    titleAr: "إنشاء الطلب في المتجر",
    titleEn: "Order Created",
    descriptionAr: `تم تسجيل الطلب ${order.id} بنجاح عبر المتجر`,
    timestamp: order.createdAt || null,
    category: "orva_internal",
    status: "completed",
  });

  // Step 2: Confirmed
  const isConfirmed = ["confirmed", "shipped", "delivered", "returned", "cancelled"].includes(status);
  events.push({
    id: `evt_${order.id}_confirmed`,
    stepKey: "confirmed",
    titleAr: "تأكيد الطلب هاتفياً",
    titleEn: "Order Confirmed",
    descriptionAr: "تم تأكيد العنوان والمنتج مع الزبون",
    timestamp: null, // Authentic: exact confirmation timestamp not stored separately
    category: "orva_internal",
    status: isConfirmed ? "completed" : status === "pending" ? "pending" : "failed",
  });

  // Step 3: Shipped
  const isShipped = ["shipped", "delivered", "returned"].includes(status);
  events.push({
    id: `evt_${order.id}_shipped`,
    stepKey: "shipped",
    titleAr: "تجهيز الشحنة والربط مع الناقل",
    titleEn: "Shipped & Handed to Courier",
    descriptionAr: "تم تحزيم الطلب وتعيين بوليصة الشحن",
    timestamp: null,
    category: "orva_internal",
    status: isShipped ? "completed" : isConfirmed ? "pending" : "pending",
  });

  // Step 4: Picked Up
  const isPickedUp = isShipped;
  events.push({
    id: `evt_${order.id}_picked_up`,
    stepKey: "picked_up",
    titleAr: "استلام مندوب الناقل",
    titleEn: "Picked Up by Courier",
    descriptionAr: "استلم الناقل الشحنة من مستودع بسكرة المركزي",
    timestamp: null,
    category: "courier_external",
    status: isPickedUp ? "completed" : "pending",
  });

  // Step 5: In Transit
  const isInTransit = ["shipped", "delivered", "returned"].includes(status);
  events.push({
    id: `evt_${order.id}_in_transit`,
    stepKey: "in_transit",
    titleAr: "قيد النقل بين المراكز الولائية",
    titleEn: "In Transit",
    descriptionAr: `الشحنة في طريقها إلى ولاية ${order.wilaya || "المقصد"}`,
    timestamp: null,
    category: "courier_external",
    status: isInTransit ? (status === "shipped" ? "in_progress" : "completed") : "pending",
  });

  // Step 6: Out for Delivery
  events.push({
    id: `evt_${order.id}_out_for_delivery`,
    stepKey: "out_for_delivery",
    titleAr: "خرج للتسليم مع الموزع",
    titleEn: "Out for Delivery",
    descriptionAr: "الشحنة مع موزع التوصيل النهائي",
    timestamp: null,
    category: "courier_external",
    status: status === "delivered" ? "completed" : status === "shipped" ? "in_progress" : "pending",
  });

  // Step 7: Final Outcome
  if (status === "delivered") {
    events.push({
      id: `evt_${order.id}_delivered`,
      stepKey: "delivered",
      titleAr: "تم التسليم للزبون وتحصيل المبلغ",
      titleEn: "Delivered to Customer",
      descriptionAr: "تم التسليم بنجاح وتحصيل مبلغ الدفع عند الاستلام",
      timestamp: null,
      category: "courier_external",
      status: "completed",
    });
  } else if (status === "returned") {
    events.push({
      id: `evt_${order.id}_returned`,
      stepKey: "returned",
      titleAr: "أعيد الطرد إلى المستودع",
      titleEn: "Returned to Sender",
      descriptionAr: "تعذر التسليم وتم إرجاع الطرد إلى مركز بسكرة",
      timestamp: null,
      category: "courier_external",
      status: "completed",
    });
  } else if (status === "cancelled") {
    events.push({
      id: `evt_${order.id}_cancelled`,
      stepKey: "cancelled",
      titleAr: "إلغاء الطلب أو رفض الاستلام",
      titleEn: "Cancelled / Refused",
      descriptionAr: "تم إلغاء الطلب أو رفض استلامه",
      timestamp: null,
      category: "courier_external",
      status: "failed",
    });
  }

  return events;
}

/**
 * Groups orders by unique customer (phone or name) while strictly
 * maintaining each order's independent status without cross-order bleed.
 */
export function extractUniqueCustomers(orders: OrvaOrder[]): CustomerOrderSummary[] {
  const map = new Map<string, CustomerOrderSummary>();

  for (const order of orders) {
    const rawPhone = (order.phone || "").replace(/[^\d]/g, "");
    const rawName = (order.customer || "").trim();
    const key = rawPhone || rawName || order.id;

    let existing = map.get(key);
    if (!existing) {
      existing = {
        customerKey: key,
        fullName: order.customer || "عميل غير معروف",
        phone: order.phone || "",
        maskedPhone: maskDemoPhone(order.phone),
        wilaya: order.wilaya || "—",
        commune: order.commune || "—",
        totalOrdersCount: 0,
        totalDeliveredCount: 0,
        orderIds: [],
      };
      map.set(key, existing);
    }

    existing.totalOrdersCount++;
    if (order.status === "delivered") {
      existing.totalDeliveredCount++;
    }
    if (!existing.orderIds.includes(order.id)) {
      existing.orderIds.push(order.id);
    }
  }

  return Array.from(map.values());
}
