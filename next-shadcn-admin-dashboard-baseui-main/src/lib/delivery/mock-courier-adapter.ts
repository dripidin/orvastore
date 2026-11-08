/**
 * ORVA Store — Phase 7G Mock Courier Adapter
 * 
 * Simulated Courier Adapter representing Redex Delivery DZ and Ecotrack network.
 * Provides deterministic tracking synchronization for the 36 development orders.
 * 
 * Rules:
 * - Operates entirely with synthetic mock data.
 * - Zero network calls to third parties or courier APIs.
 * - Zero secret tokens or credentials.
 * - Supports simulated latency, synchronization success, failure, and not_found.
 * - Provides controllable Clock / nowProvider for deterministic test verification.
 */

import type {
  ICourierAdapter,
  CourierTrackingResult,
  DeliveryTimelineEvent,
  SyncResultStatus,
} from "./delivery-tracking-types";
import { mapExternalCourierStatus } from "./courier-status-mapper";

interface SeedTrackingRecord {
  orderId: string;
  trackingCode: string;
  courierId: string;
  courierName: string;
  rawStatusCode: string;
  externalMessage: string;
  events: Array<{
    stepKey: string;
    titleAr: string;
    titleEn: string;
    descriptionAr?: string;
    relativeMinutesFromOrder?: number | null; // null if unrecorded/absent!
    category: "orva_internal" | "courier_external" | "mock_simulated";
    status: "completed" | "in_progress" | "pending" | "failed";
  }>;
}

export const MOCK_COURIER_SEED_MAP: Record<string, SeedTrackingRecord> = {
  // Delivered Orders (Redex & Ecotrack)
  "RDX-10960": {
    orderId: "ORVA-10960",
    trackingCode: "RDX-10960",
    courierId: "redex",
    courierName: "Redex Delivery DZ",
    rawStatusCode: "LIVRE_CLIENT",
    externalMessage: "تم تسليم الشحنة للزبون بنجاح وتحصيل المبلغ",
    events: [
      { stepKey: "created", titleAr: "إنشاء الطلب", titleEn: "Order Created", relativeMinutesFromOrder: 0, category: "orva_internal", status: "completed" },
      { stepKey: "confirmed", titleAr: "تأكيد الطلب هاتفياً", titleEn: "Order Confirmed", relativeMinutesFromOrder: 15, category: "orva_internal", status: "completed" },
      { stepKey: "shipped", titleAr: "تجهيز الشحنة", titleEn: "Shipped", relativeMinutesFromOrder: 45, category: "orva_internal", status: "completed" },
      { stepKey: "picked_up", titleAr: "استلام مندوب ريديكس", titleEn: "Picked Up by Courier", relativeMinutesFromOrder: 120, category: "courier_external", status: "completed" },
      { stepKey: "in_transit", titleAr: "قيد النقل إلى مركز التوزيع", titleEn: "In Transit", relativeMinutesFromOrder: 360, category: "courier_external", status: "completed" },
      { stepKey: "out_for_delivery", titleAr: "خرج للتسليم مع الموزع", titleEn: "Out for Delivery", relativeMinutesFromOrder: 1200, category: "courier_external", status: "completed" },
      { stepKey: "delivered", titleAr: "تم التسليم للزبون", titleEn: "Delivered to Customer", relativeMinutesFromOrder: 1350, category: "courier_external", status: "completed" },
    ],
  },
  "RDX-10959": {
    orderId: "ORVA-10959",
    trackingCode: "RDX-10959",
    courierId: "redex",
    courierName: "Redex Delivery DZ",
    rawStatusCode: "LIVRE_CLIENT",
    externalMessage: "تم التسليم وتحصيل COD في وهران",
    events: [
      { stepKey: "created", titleAr: "إنشاء الطلب", titleEn: "Order Created", relativeMinutesFromOrder: 0, category: "orva_internal", status: "completed" },
      { stepKey: "confirmed", titleAr: "تأكيد الطلب", titleEn: "Order Confirmed", relativeMinutesFromOrder: 25, category: "orva_internal", status: "completed" },
      { stepKey: "shipped", titleAr: "تجهيز الشحنة", titleEn: "Shipped", relativeMinutesFromOrder: 60, category: "orva_internal", status: "completed" },
      { stepKey: "picked_up", titleAr: "استلام الناقل", titleEn: "Picked Up", relativeMinutesFromOrder: 180, category: "courier_external", status: "completed" },
      { stepKey: "delivered", titleAr: "تم التسليم", titleEn: "Delivered", relativeMinutesFromOrder: 1500, category: "courier_external", status: "completed" },
    ],
  },
  // In Transit & Out for Delivery Orders
  "RDX-10958": {
    orderId: "ORVA-10958",
    trackingCode: "RDX-10958",
    courierId: "redex",
    courierName: "Redex Delivery DZ",
    rawStatusCode: "EN_COURS_LIVRAISON",
    externalMessage: "الشحنة مع موزع سطيف، جاري التواصل مع الزبون",
    events: [
      { stepKey: "created", titleAr: "إنشاء الطلب", titleEn: "Order Created", relativeMinutesFromOrder: 0, category: "orva_internal", status: "completed" },
      { stepKey: "confirmed", titleAr: "تأكيد الطلب", titleEn: "Order Confirmed", relativeMinutesFromOrder: 30, category: "orva_internal", status: "completed" },
      { stepKey: "shipped", titleAr: "تجهيز الشحنة", titleEn: "Shipped", relativeMinutesFromOrder: 90, category: "orva_internal", status: "completed" },
      { stepKey: "picked_up", titleAr: "استلام الناقل", titleEn: "Picked Up", relativeMinutesFromOrder: 240, category: "courier_external", status: "completed" },
      { stepKey: "in_transit", titleAr: "تحويل بين المراكز", titleEn: "In Transit", relativeMinutesFromOrder: 600, category: "courier_external", status: "completed" },
      { stepKey: "out_for_delivery", titleAr: "خرج للتسليم", titleEn: "Out for Delivery", relativeMinutesFromOrder: 1400, category: "courier_external", status: "in_progress" },
    ],
  },
  "ECO-10955": {
    orderId: "ORVA-10955",
    trackingCode: "ECO-10955",
    courierId: "ecotrack",
    courierName: "Ecotrack Network DZ",
    rawStatusCode: "EN_TRANSIT",
    externalMessage: "الطرد في محور قسنطينة باتجاه عنابة",
    events: [
      { stepKey: "created", titleAr: "إنشاء الطلب", titleEn: "Order Created", relativeMinutesFromOrder: 0, category: "orva_internal", status: "completed" },
      { stepKey: "confirmed", titleAr: "تأكيد الطلب", titleEn: "Order Confirmed", relativeMinutesFromOrder: 20, category: "orva_internal", status: "completed" },
      { stepKey: "shipped", titleAr: "تجهيز الشحنة", titleEn: "Shipped", relativeMinutesFromOrder: 80, category: "orva_internal", status: "completed" },
      { stepKey: "picked_up", titleAr: "استلام الناقل", titleEn: "Picked Up", relativeMinutesFromOrder: 200, category: "courier_external", status: "completed" },
      { stepKey: "in_transit", titleAr: "قيد النقل", titleEn: "In Transit", relativeMinutesFromOrder: 500, category: "courier_external", status: "in_progress" },
    ],
  },
  // Delivery Failed / Client Unreachable
  "RDX-10954": {
    orderId: "ORVA-10954",
    trackingCode: "RDX-10954",
    courierId: "redex",
    courierName: "Redex Delivery DZ",
    rawStatusCode: "CLIENT_INJOIGNABLE",
    externalMessage: "تعذر التسليم: الزبون لا يرد على الهاتف (المحاولة 1)",
    events: [
      { stepKey: "created", titleAr: "إنشاء الطلب", titleEn: "Order Created", relativeMinutesFromOrder: 0, category: "orva_internal", status: "completed" },
      { stepKey: "confirmed", titleAr: "تأكيد الطلب", titleEn: "Order Confirmed", relativeMinutesFromOrder: 10, category: "orva_internal", status: "completed" },
      { stepKey: "shipped", titleAr: "تجهيز الشحنة", titleEn: "Shipped", relativeMinutesFromOrder: 40, category: "orva_internal", status: "completed" },
      { stepKey: "picked_up", titleAr: "استلام الناقل", titleEn: "Picked Up", relativeMinutesFromOrder: 150, category: "courier_external", status: "completed" },
      { stepKey: "out_for_delivery", titleAr: "خرج للتسليم", titleEn: "Out for Delivery", relativeMinutesFromOrder: 1100, category: "courier_external", status: "completed" },
      { stepKey: "delivery_failed", titleAr: "فشل محاولة التسليم", titleEn: "Delivery Failed", relativeMinutesFromOrder: 1250, category: "courier_external", status: "failed" },
    ],
  },
  // Customer Refused
  "RDX-10953": {
    orderId: "ORVA-10953",
    trackingCode: "RDX-10953",
    courierId: "redex",
    courierName: "Redex Delivery DZ",
    rawStatusCode: "REFUSE",
    externalMessage: "رفض الزبون استلام الطرد عند وصول الموزع",
    events: [
      { stepKey: "created", titleAr: "إنشاء الطلب", titleEn: "Order Created", relativeMinutesFromOrder: 0, category: "orva_internal", status: "completed" },
      { stepKey: "confirmed", titleAr: "تأكيد الطلب", titleEn: "Order Confirmed", relativeMinutesFromOrder: 15, category: "orva_internal", status: "completed" },
      { stepKey: "shipped", titleAr: "تجهيز الشحنة", titleEn: "Shipped", relativeMinutesFromOrder: 50, category: "orva_internal", status: "completed" },
      { stepKey: "picked_up", titleAr: "استلام الناقل", titleEn: "Picked Up", relativeMinutesFromOrder: 160, category: "courier_external", status: "completed" },
      { stepKey: "out_for_delivery", titleAr: "خرج للتسليم", titleEn: "Out for Delivery", relativeMinutesFromOrder: 1000, category: "courier_external", status: "completed" },
      { stepKey: "customer_refused", titleAr: "رفض الزبون الاستلام", titleEn: "Customer Refused", relativeMinutesFromOrder: 1120, category: "courier_external", status: "failed" },
    ],
  },
  // Return In Progress
  "RDX-10952": {
    orderId: "ORVA-10952",
    trackingCode: "RDX-10952",
    courierId: "redex",
    courierName: "Redex Delivery DZ",
    rawStatusCode: "RETOUR_AU_CENTRE",
    externalMessage: "الطرد المرتجع قيد النقل إلى مستودع بسكرة (07)",
    events: [
      { stepKey: "created", titleAr: "إنشاء الطلب", titleEn: "Order Created", relativeMinutesFromOrder: 0, category: "orva_internal", status: "completed" },
      { stepKey: "shipped", titleAr: "تجهيز الشحنة", titleEn: "Shipped", relativeMinutesFromOrder: 60, category: "orva_internal", status: "completed" },
      { stepKey: "delivery_failed", titleAr: "تعذر التسليم", titleEn: "Delivery Failed", relativeMinutesFromOrder: 1400, category: "courier_external", status: "failed" },
      { stepKey: "return_in_progress", titleAr: "بدء إجراءات الإرجاع", titleEn: "Return in Progress", relativeMinutesFromOrder: 1600, category: "courier_external", status: "in_progress" },
    ],
  },
  // Returned To Sender
  "RDX-10950": {
    orderId: "ORVA-10950",
    trackingCode: "RDX-10950",
    courierId: "redex",
    courierName: "Redex Delivery DZ",
    rawStatusCode: "RETOUR_EXPEDITEUR",
    externalMessage: "تم استلام الطرد المرتجع في المستودع وإغلاق الشحنة",
    events: [
      { stepKey: "created", titleAr: "إنشاء الطلب", titleEn: "Order Created", relativeMinutesFromOrder: 0, category: "orva_internal", status: "completed" },
      { stepKey: "shipped", titleAr: "تجهيز الشحنة", titleEn: "Shipped", relativeMinutesFromOrder: 40, category: "orva_internal", status: "completed" },
      { stepKey: "returned_to_sender", titleAr: "أعيدت إلى المرسل", titleEn: "Returned to Sender", relativeMinutesFromOrder: 2400, category: "courier_external", status: "completed" },
    ],
  },
  // Picked up / Pending
  "RDX-10951": {
    orderId: "ORVA-10951",
    trackingCode: "RDX-10951",
    courierId: "redex",
    courierName: "Redex Delivery DZ",
    rawStatusCode: "RAMASSE",
    externalMessage: "تم استلام الشحنة في مركز تجميع بسكرة",
    events: [
      { stepKey: "created", titleAr: "إنشاء الطلب", titleEn: "Order Created", relativeMinutesFromOrder: 0, category: "orva_internal", status: "completed" },
      { stepKey: "confirmed", titleAr: "تأكيد الطلب", titleEn: "Order Confirmed", relativeMinutesFromOrder: 15, category: "orva_internal", status: "completed" },
      { stepKey: "shipped", titleAr: "تجهيز الشحنة", titleEn: "Shipped", relativeMinutesFromOrder: 60, category: "orva_internal", status: "completed" },
      { stepKey: "picked_up", titleAr: "استلام الناقل", titleEn: "Picked Up", relativeMinutesFromOrder: 120, category: "courier_external", status: "completed" },
    ],
  },
};

export class MockCourierAdapter implements ICourierAdapter {
  private nowProvider: () => number;
  private forceSimulatedFailure: boolean = false;

  constructor(nowProvider?: () => number) {
    this.nowProvider = nowProvider || (() => Date.now());
  }

  setNowProvider(fn: () => number) {
    this.nowProvider = fn;
  }

  setSimulatedFailure(shouldFail: boolean) {
    this.forceSimulatedFailure = shouldFail;
  }

  private getCurrentIso(): string {
    return new Date(this.nowProvider()).toISOString();
  }

  async getTrackingStatus(trackingCode: string, orderId?: string): Promise<CourierTrackingResult> {
    const currentIso = this.getCurrentIso();
    const cleanCode = (trackingCode || "").trim().toUpperCase();

    // 1. Check simulated global or designated failure
    if (this.forceSimulatedFailure || cleanCode === "RDX-FAIL-TEST" || cleanCode === "FAIL_SYNC") {
      const targetOrderId = orderId || "UNKNOWN";
      return {
        orderId: targetOrderId,
        courierName: "Redex Delivery DZ",
        courierId: "redex",
        trackingCode: cleanCode,
        externalStatusCode: "SYNC_ERROR",
        normalizedStatus: "UNKNOWN",
        receiptClassification: "Unknown",
        lastSyncedAt: currentIso,
        syncResult: "failed",
        safeMessage: "تعذر الاتصال بخادم التتبع التجريبي (Simulated Network Timeout)",
        timelineEvents: [],
      };
    }

    // 2. Check Seed Data Map
    const seed = MOCK_COURIER_SEED_MAP[cleanCode];
    if (seed) {
      const mapping = mapExternalCourierStatus(seed.rawStatusCode);
      const timelineEvents: DeliveryTimelineEvent[] = seed.events.map((evt, idx) => ({
        id: `evt_${seed.orderId}_${evt.stepKey}_${idx}`,
        stepKey: evt.stepKey,
        titleAr: evt.titleAr,
        titleEn: evt.titleEn,
        descriptionAr: evt.descriptionAr,
        timestamp: evt.relativeMinutesFromOrder !== null && evt.relativeMinutesFromOrder !== undefined
          ? new Date(this.nowProvider() - (1440 - evt.relativeMinutesFromOrder) * 60000).toISOString()
          : null,
        category: evt.category,
        status: evt.status,
      }));

      return {
        orderId: seed.orderId,
        courierName: seed.courierName,
        courierId: seed.courierId,
        trackingCode: seed.trackingCode,
        externalStatusCode: seed.rawStatusCode,
        normalizedStatus: mapping.normalizedStatus,
        receiptClassification: mapping.receiptClassification,
        lastSyncedAt: currentIso,
        syncResult: "success",
        safeMessage: seed.externalMessage,
        timelineEvents,
      };
    }

    // 3. Fallback: If code follows standard pattern RDX-109xx or ECO-109xx but not explicitly in seed map
    const match = cleanCode.match(/^(RDX|ECO|YAL)-(\d{5})$/);
    if (match) {
      const courierPrefix = match[1];
      const orderNum = match[2];
      const derivedOrderId = orderId || `ORVA-${orderNum}`;
      const courierName = courierPrefix === "RDX" ? "Redex Delivery DZ" : courierPrefix === "ECO" ? "Ecotrack DZ" : "Yalidine Express";
      const courierId = courierPrefix.toLowerCase();

      // Deterministic simulation based on order number modulo
      const numVal = parseInt(orderNum, 10);
      let rawStatusCode = "EN_COURS_LIVRAISON";
      let message = "الشحنة في مسار التوصيل المجدول";

      if (numVal % 5 === 0) {
        rawStatusCode = "LIVRE_CLIENT";
        message = "تم تسليم الطرد للزبون";
      } else if (numVal % 5 === 1) {
        rawStatusCode = "EN_TRANSIT";
        message = "الشحنة في طريقها بين المراكز";
      } else if (numVal % 5 === 2) {
        rawStatusCode = "RAMASSE";
        message = "تم استلام الطرد من المستودع";
      } else if (numVal % 5 === 3) {
        rawStatusCode = "CLIENT_INJOIGNABLE";
        message = "محاولة توصيل مؤجلة لعدم رد الزبون";
      }

      const mapping = mapExternalCourierStatus(rawStatusCode);
      return {
        orderId: derivedOrderId,
        courierName,
        courierId,
        trackingCode: cleanCode,
        externalStatusCode: rawStatusCode,
        normalizedStatus: mapping.normalizedStatus,
        receiptClassification: mapping.receiptClassification,
        lastSyncedAt: currentIso,
        syncResult: "success",
        safeMessage: message,
        timelineEvents: [
          {
            id: `evt_${derivedOrderId}_created`,
            stepKey: "created",
            titleAr: "إنشاء الطلب",
            titleEn: "Order Created",
            timestamp: null,
            category: "orva_internal",
            status: "completed",
          },
          {
            id: `evt_${derivedOrderId}_shipped`,
            stepKey: "shipped",
            titleAr: "تجهيز الشحنة",
            titleEn: "Shipped",
            timestamp: null,
            category: "orva_internal",
            status: "completed",
          },
          {
            id: `evt_${derivedOrderId}_courier`,
            stepKey: "courier_status",
            titleAr: mapping.labelAr,
            titleEn: mapping.labelEn,
            timestamp: currentIso,
            category: "courier_external",
            status: mapping.receiptClassification === "Received" ? "completed" : "in_progress",
          },
        ],
      };
    }

    // 4. Not Found: cleanCode unrecognized
    return {
      orderId: orderId || "UNKNOWN",
      courierName: "Unknown Courier",
      courierId: "none",
      trackingCode: cleanCode,
      externalStatusCode: "NOT_FOUND",
      normalizedStatus: "UNKNOWN",
      receiptClassification: "Unknown",
      lastSyncedAt: currentIso,
      syncResult: "not_found",
      safeMessage: "لم يتم العثور على شحنة مسجلة برمز التتبع هذا لدى الناقل",
      timelineEvents: [],
    };
  }

  async getBulkTrackingStatus(trackingCodes: string[]): Promise<CourierTrackingResult[]> {
    if (!Array.isArray(trackingCodes) || trackingCodes.length === 0) {
      return [];
    }

    const results: CourierTrackingResult[] = [];
    for (const code of trackingCodes) {
      const res = await this.getTrackingStatus(code);
      results.push(res);
    }
    return results;
  }
}

// Global Singleton Instance
let singletonMockCourierAdapter: MockCourierAdapter | null = null;

export function getMockCourierAdapter(): MockCourierAdapter {
  if (!singletonMockCourierAdapter) {
    singletonMockCourierAdapter = new MockCourierAdapter();
  }
  return singletonMockCourierAdapter;
}
