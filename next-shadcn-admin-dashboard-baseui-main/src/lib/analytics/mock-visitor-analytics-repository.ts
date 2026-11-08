/**
 * ORVA Store — Phase 7D Mock Visitor Analytics Repository
 * 
 * First-party, privacy-first in-memory / localStorage analytics repository.
 * Provides deduplication, time-to-purchase bucket calculations, exit metrics,
 * and safe isolated reset without clearing products or orders.
 */

import {
  VisitorAnalyticsEvent,
  VisitorSessionRecord,
  VisitorEventType,
  TimeToPurchaseMetrics,
  ExitMetrics,
  ConversionMetrics,
  IVisitorAnalyticsRepository,
} from "./visitor-analytics-types";
import { DEFAULT_MOCK_VISITOR_EVENTS } from "../repository/mock-products-dataset";

const ANALYTICS_STORAGE_KEY = "orva_visitor_analytics_v1";
const BROADCAST_CHANNEL_NAME = "orva_visitor_analytics_sync_v1";

export class MockVisitorAnalyticsRepository implements IVisitorAnalyticsRepository {
  private events: VisitorAnalyticsEvent[] = [];
  private sessions: Map<string, VisitorSessionRecord> = new Map();
  private eventIdsSet: Set<string> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private nowProvider: () => number;

  constructor(customNowProvider?: () => number) {
    this.nowProvider = customNowProvider || (() => Date.now());
    this.initData();
    this.setupCrossTabSync();
  }

  /**
   * Allows tests to advance or freeze time deterministically.
   */
  setNowProvider(fn: () => number) {
    this.nowProvider = fn;
  }

  private getCurrentTime(): number {
    return this.nowProvider();
  }

  private initData() {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(ANALYTICS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed.events)) {
            this.events = parsed.events;
            this.eventIdsSet = new Set(this.events.map((e) => e.id));
          }
          if (Array.isArray(parsed.sessions)) {
            this.sessions = new Map(parsed.sessions.map((s: VisitorSessionRecord) => [s.sessionId, s]));
          }
        }
      } catch {
        // Fallback to memory
      }
    }
  }

  public loadSeedEvents(seedEvents: VisitorAnalyticsEvent[]) {
    for (const evt of seedEvents) {
      if (this.eventIdsSet.has(evt.id)) continue;
      this.eventIdsSet.add(evt.id);
      this.events.push(evt);

      const sessionId = evt.pseudonymousSessionId;
      const productId = evt.productId || "unknown";

      let session = this.sessions.get(sessionId);
      if (!session) {
        session = {
          sessionId,
          startedAt: evt.timestamp,
          lastActivityAt: evt.timestamp,
          currentProductId: productId,
          sessionDurationSeconds: 0,
          hasPurchased: false,
          orderIds: [],
          purchasedProductIds: [],
          referrerCategory: "direct",
          viewedProductIds: [],
          startedCheckout: false,
          isSynthetic: true,
        };
        this.sessions.set(sessionId, session);
      }

      if (!session.orderIds) session.orderIds = [];
      if (!session.purchasedProductIds) session.purchasedProductIds = [];
      if (!session.viewedProductIds) session.viewedProductIds = [];

      if (typeof evt.sessionDurationSeconds === "number" && evt.sessionDurationSeconds >= 0) {
        session.sessionDurationSeconds = Math.max(session.sessionDurationSeconds, evt.sessionDurationSeconds);
      }
      session.lastActivityAt = evt.timestamp;

      if (evt.eventType === "product_view") {
        if (!session.viewedProductIds.includes(productId)) {
          session.viewedProductIds.push(productId);
        }
      }
      if (evt.eventType === "checkout_started") {
        session.startedCheckout = true;
      }
      if (evt.eventType === "order_created") {
        session.hasPurchased = true;
        if (evt.orderId && !session.orderIds.includes(evt.orderId)) {
          session.orderIds.push(evt.orderId);
          session.orderId = evt.orderId;
        }
        if (!session.purchasedProductIds.includes(productId)) {
          session.purchasedProductIds.push(productId);
        }
        if (evt.selectedWilaya) {
          session.selectedWilaya = evt.selectedWilaya;
        }
      }
    }
  }

  private persist() {
    if (typeof window === "undefined") return;
    try {
      const payload = {
        events: this.events,
        sessions: Array.from(this.sessions.values()),
        updatedAt: new Date(this.getCurrentTime()).toISOString(),
      };
      window.localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(payload));
      this.broadcastChannel?.postMessage({ type: "ANALYTICS_UPDATED", timestamp: this.getCurrentTime() });
      window.dispatchEvent(new CustomEvent("orva:analytics-updated"));
    } catch (e) {
      console.warn("[MockVisitorAnalyticsRepository] Failed to persist analytics", e);
    }
  }

  private setupCrossTabSync() {
    if (typeof window === "undefined") return;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          if (event.data?.type === "ANALYTICS_UPDATED") {
            this.initData();
            window.dispatchEvent(new CustomEvent("orva:analytics-updated"));
          }
        };
      }
      window.addEventListener("storage", (event) => {
        if (event.key === ANALYTICS_STORAGE_KEY) {
          this.initData();
          window.dispatchEvent(new CustomEvent("orva:analytics-updated"));
        }
      });
    } catch (e) {
      console.warn("[MockVisitorAnalyticsRepository] Cross-tab sync warning:", e);
    }
  }

  // ── 1. Event Tracking with Deduplication ───────────────────────────────────

  async trackEvent(
    eventInput: Omit<VisitorAnalyticsEvent, "id"> & { id?: string }
  ): Promise<VisitorAnalyticsEvent> {
    const nowIso = new Date(this.getCurrentTime()).toISOString();
    const eventId = eventInput.id || `evt_${this.getCurrentTime()}_${Math.random().toString(36).substring(2, 8)}`;

    // Deduplication check 1: Event ID uniqueness
    if (this.eventIdsSet.has(eventId)) {
      // Find and return existing without duplicating
      const existing = this.events.find((e) => e.id === eventId);
      if (existing) return { ...existing };
    }

    const sessionId = eventInput.pseudonymousSessionId;
    const productId = eventInput.productId || "unknown";

    // Retrieve or initialize session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        startedAt: eventInput.timestamp || nowIso,
        lastActivityAt: nowIso,
        currentProductId: productId,
        sessionDurationSeconds: 0,
        hasPurchased: false,
        orderIds: [],
        purchasedProductIds: [],
        referrerCategory: "direct",
        viewedProductIds: [],
        startedCheckout: false,
        isSynthetic: eventInput.isSynthetic || false,
      };
      this.sessions.set(sessionId, session);
    }

    if (!session.orderIds) session.orderIds = [];
    if (!session.purchasedProductIds) session.purchasedProductIds = [];
    if (!session.viewedProductIds) session.viewedProductIds = [];

    // Update session duration from event timestamp or explicit sessionDurationSeconds
    const eventTimeMs = eventInput.timestamp ? new Date(eventInput.timestamp).getTime() : this.getCurrentTime();
    const startedMs = new Date(session.startedAt).getTime();
    const computedDuration = Math.max(0, Math.floor((eventTimeMs - startedMs) / 1000));

    session.sessionDurationSeconds = Math.max(
      session.sessionDurationSeconds,
      typeof eventInput.sessionDurationSeconds === "number" && eventInput.sessionDurationSeconds >= 0
        ? eventInput.sessionDurationSeconds
        : computedDuration
    );
    session.lastActivityAt = eventInput.timestamp || nowIso;
    session.currentProductId = productId;

    // Deduplication check 2: Unique product_view per product per session
    if (eventInput.eventType === "product_view") {
      const alreadyViewed = session.viewedProductIds.includes(productId);
      if (!alreadyViewed) {
        session.viewedProductIds.push(productId);
      }
    }

    if (eventInput.eventType === "checkout_started") {
      session.startedCheckout = true;
    }

    if (eventInput.eventType === "order_created") {
      session.hasPurchased = true;
      if (eventInput.orderId) {
        session.orderId = eventInput.orderId;
        if (!session.orderIds.includes(eventInput.orderId)) {
          session.orderIds.push(eventInput.orderId);
        }
      }
      const orderProducts =
        eventInput.productIds && eventInput.productIds.length > 0
          ? eventInput.productIds
          : productId && productId !== "unknown"
          ? [productId]
          : [];

      for (const pId of orderProducts) {
        if (!session.purchasedProductIds.includes(pId)) {
          session.purchasedProductIds.push(pId);
        }
      }

      if (eventInput.selectedWilaya) {
        session.selectedWilaya = eventInput.selectedWilaya;
      }
    }

    if (eventInput.selectedWilaya && !session.selectedWilaya) {
      session.selectedWilaya = eventInput.selectedWilaya;
    }

    const eventRecord: VisitorAnalyticsEvent = {
      id: eventId,
      pseudonymousSessionId: sessionId,
      eventType: eventInput.eventType,
      productId,
      productIds: eventInput.productIds,
      timestamp: eventInput.timestamp || nowIso,
      sessionDurationSeconds: session.sessionDurationSeconds,
      selectedWilaya: eventInput.selectedWilaya || session.selectedWilaya,
      orderId: eventInput.orderId || session.orderId,
      isSynthetic: eventInput.isSynthetic || false,
      metadata: eventInput.metadata,
    };

    this.events.push(eventRecord);
    this.eventIdsSet.add(eventId);
    this.persist();

    return { ...eventRecord };
  }

  async getEvents(filter?: { productId?: string; eventType?: VisitorEventType }): Promise<VisitorAnalyticsEvent[]> {
    let list = [...this.events];
    if (filter?.productId) {
      list = list.filter(
        (e) => e.productId === filter.productId || (e.productIds && e.productIds.includes(filter.productId!))
      );
    }
    if (filter?.eventType) {
      list = list.filter((e) => e.eventType === filter.eventType);
    }
    return list;
  }

  async getSessions(filter?: { productId?: string }): Promise<VisitorSessionRecord[]> {
    let list = Array.from(this.sessions.values());
    if (filter?.productId) {
      list = list.filter(
        (s) =>
          s.viewedProductIds.includes(filter.productId!) ||
          s.purchasedProductIds.includes(filter.productId!) ||
          s.currentProductId === filter.productId
      );
    }
    return JSON.parse(JSON.stringify(list));
  }

  // ── 2. Time To Purchase Calculation (5 Buckets) ───────────────────────────

  /**
   * Product Time To Purchase = وقت إنشاء الطلب المحتوي على المنتج - أول مشاهدة لذلك المنتج في الجلسة.
   * لا تستخدم أول مشاهدة لأي منتج آخر. استبعد القيم السالبة والقيم غير الصالحة.
   */
  async getTimeToPurchaseMetrics(productId?: string): Promise<TimeToPurchaseMetrics> {
    const purchasingSessions = Array.from(this.sessions.values()).filter((s) => s.hasPurchased);
    const durations: number[] = [];
    const buckets = {
      under1Min: 0,
      from1To5Min: 0,
      from5To15Min: 0,
      from15To30Min: 0,
      over30Min: 0,
    };

    for (const session of purchasingSessions) {
      if (productId) {
        // Specific product: Session must have actually purchased this specific product
        const purchased =
          session.purchasedProductIds.includes(productId) ||
          (session.currentProductId === productId && session.purchasedProductIds.length === 0);
        if (!purchased) continue;

        // Find FIRST product_view event specifically for this product
        const viewEvents = this.events.filter(
          (e) =>
            e.pseudonymousSessionId === session.sessionId &&
            e.eventType === "product_view" &&
            e.productId === productId
        );

        // If not viewed in this session, exclude from view-to-purchase duration
        if (viewEvents.length === 0) continue;

        const orderEvents = this.events.filter(
          (e) =>
            e.pseudonymousSessionId === session.sessionId &&
            e.eventType === "order_created" &&
            (e.productId === productId || (e.productIds && e.productIds.includes(productId)))
        );

        const orderTimestamp = orderEvents.length > 0 ? orderEvents[0].timestamp : null;
        if (!orderTimestamp) continue;

        const firstViewMs = new Date(viewEvents[0].timestamp).getTime();
        const orderMs = new Date(orderTimestamp).getTime();
        const diffSec = Math.floor((orderMs - firstViewMs) / 1000);

        if (Number.isFinite(diffSec) && diffSec >= 0) {
          durations.push(diffSec);
        }
      } else {
        // Catalog-wide: Evaluate each purchased product independently
        const productsPurchased =
          session.purchasedProductIds.length > 0
            ? session.purchasedProductIds
            : session.currentProductId
            ? [session.currentProductId]
            : [];

        for (const pId of productsPurchased) {
          const viewEvents = this.events.filter(
            (e) =>
              e.pseudonymousSessionId === session.sessionId &&
              e.eventType === "product_view" &&
              e.productId === pId
          );
          if (viewEvents.length === 0) continue;

          const orderEvents = this.events.filter(
            (e) =>
              e.pseudonymousSessionId === session.sessionId &&
              e.eventType === "order_created" &&
              (e.productId === pId || (e.productIds && e.productIds.includes(pId)))
          );
          const orderTimestamp = orderEvents.length > 0 ? orderEvents[0].timestamp : null;
          if (!orderTimestamp) continue;

          const firstViewMs = new Date(viewEvents[0].timestamp).getTime();
          const orderMs = new Date(orderTimestamp).getTime();
          const diffSec = Math.floor((orderMs - firstViewMs) / 1000);

          if (Number.isFinite(diffSec) && diffSec >= 0) {
            durations.push(diffSec);
          }
        }
      }
    }

    // Populate duration buckets
    for (const durationSec of durations) {
      if (durationSec < 60) {
        buckets.under1Min++;
      } else if (durationSec < 300) {
        buckets.from1To5Min++;
      } else if (durationSec < 900) {
        buckets.from5To15Min++;
      } else if (durationSec < 1800) {
        buckets.from15To30Min++;
      } else {
        buckets.over30Min++;
      }
    }

    if (durations.length === 0) {
      return {
        totalPurchasingSessions: 0,
        averageTimeToPurchaseSeconds: 0,
        medianTimeToPurchaseSeconds: 0,
        buckets,
      };
    }

    // Average
    const sum = durations.reduce((a, b) => a + b, 0);
    const averageTimeToPurchaseSeconds = Math.round(sum / durations.length);

    // Median
    durations.sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    const medianTimeToPurchaseSeconds =
      durations.length % 2 !== 0
        ? durations[mid]
        : Math.round((durations[mid - 1] + durations[mid]) / 2);

    return {
      totalPurchasingSessions: durations.length,
      averageTimeToPurchaseSeconds,
      medianTimeToPurchaseSeconds,
      buckets,
    };
  }

  // ── 3. Sessions Inactive for 60+ Seconds Without Purchase ───────────────────

  /**
   * Sessions Inactive for 60+ Seconds Without Purchase:
   * - Inactivity duration >= 60 seconds
   * - Strictly NO successful order_created (hasPurchased === false)
   * - Count session at most once (deduplicated)
   * - Categorized as Estimated (isEstimated: true)
   * - Does NOT categorize visitors as New Customers
   */
  async getExitMetrics(productId?: string): Promise<ExitMetrics> {
    const allSessions = Array.from(this.sessions.values()).filter((s) => {
      if (productId) {
        return (
          s.viewedProductIds.includes(productId) ||
          s.purchasedProductIds.includes(productId) ||
          s.currentProductId === productId
        );
      }
      return true;
    });

    const totalSessions = allSessions.length;

    // Deduplicated count: each session in allSessions is unique
    const inactiveSessions = allSessions.filter((s) => {
      // Must NOT have purchased
      if (s.hasPurchased) return false;

      return s.sessionDurationSeconds >= 60;
    });

    const sessionsInactive60sWithoutPurchase = inactiveSessions.length;
    const inactivityRatePercentage =
      totalSessions > 0
        ? Math.round((sessionsInactive60sWithoutPurchase / totalSessions) * 1000) / 10
        : 0;

    return {
      totalSessions,
      sessionsInactive60sWithoutPurchase,
      inactivityRatePercentage,
      isEstimated: true,
      exitedAfterOneMinuteCount: sessionsInactive60sWithoutPurchase,
      exitRatePercentage: inactivityRatePercentage,
    };
  }

  // ── 4. Conversion Rates (Explicit Product Conversion Attribution) ─────────

  /**
   * يُنسب شراء المنتج إلى جلسة معينة فقط عندما:
   * 1. تكون الجلسة قد شاهدت المنتج.
   * 2. يكون المنتج موجوداً فعلياً في الطلب المنشأ.
   * 3. يكون order_created مؤكداً.
   * 4. يكون productId متطابقاً.
   * لا تنسب شراء منتج لمجرد وجوده في جلسة شاهدت منتجاً آخر.
   * افصل عمليات الشراء التي لم تسبقها مشاهدة منتج عن Product View Conversion.
   * منع تكرار orderId في إجمالي الطلبات.
   */
  async getProductConversionMetrics(productId?: string): Promise<ConversionMetrics> {
    const allSessions = Array.from(this.sessions.values());

    if (productId) {
      // Relevant sessions for this product
      const relevantSessions = allSessions.filter(
        (s) =>
          s.viewedProductIds.includes(productId) ||
          s.purchasedProductIds.includes(productId) ||
          s.currentProductId === productId
      );

      const totalSessions = relevantSessions.length;

      // Unique product sessions (viewed product)
      const uniqueProductViews = allSessions.filter((s) => s.viewedProductIds.includes(productId)).length;

      // Checkout starts
      const checkoutStarts = relevantSessions.filter(
        (s) => s.startedCheckout && (s.viewedProductIds.includes(productId) || s.currentProductId === productId)
      ).length;

      // Explicit Attribution: viewed AND purchased this exact product
      const attributedPurchasingSessions = allSessions.filter(
        (s) =>
          s.hasPurchased &&
          s.viewedProductIds.includes(productId) &&
          s.purchasedProductIds.includes(productId)
      ).length;

      // Unattributed purchases: purchased without prior view of this product
      const unattributedPurchasingSessions = allSessions.filter(
        (s) =>
          s.hasPurchased &&
          !s.viewedProductIds.includes(productId) &&
          s.purchasedProductIds.includes(productId)
      ).length;

      // Unique orders count containing this product (prevent duplicate orderId)
      const uniqueOrderIds = new Set<string>();
      let noIdOrders = 0;
      for (const s of allSessions) {
        if (s.hasPurchased && s.purchasedProductIds.includes(productId)) {
          if (s.orderIds && s.orderIds.length > 0) {
            for (const oId of s.orderIds) uniqueOrderIds.add(oId);
          } else if (s.orderId) {
            uniqueOrderIds.add(s.orderId);
          } else {
            noIdOrders++;
          }
        }
      }
      const uniqueOrdersCount = uniqueOrderIds.size + noIdOrders;
      const ordersCreated = uniqueOrdersCount;

      // Product View Conversion = (attributedPurchasingSessions / uniqueProductViews) * 100
      const productViewConversionRate =
        uniqueProductViews > 0
          ? Math.round((attributedPurchasingSessions / uniqueProductViews) * 1000) / 10
          : 0;

      // Checkout Completion Rate = (ordersCreated / checkoutStarts) * 100
      const checkoutCompletionRate =
        checkoutStarts > 0
          ? Math.round((ordersCreated / checkoutStarts) * 1000) / 10
          : 0;

      return {
        totalSessions,
        uniqueProductViews,
        uniqueProductSessions: uniqueProductViews,
        checkoutStarts,
        ordersCreated,
        uniqueOrdersCount,
        purchasingSessions: attributedPurchasingSessions + unattributedPurchasingSessions,
        attributedPurchasingSessions,
        unattributedPurchasingSessions,
        productViewConversionRate,
        checkoutCompletionRate,
      };
    }

    // Store-wide Catalog Aggregate
    const totalSessions = allSessions.length;
    const uniqueProductViews = allSessions.filter((s) => s.viewedProductIds.length > 0).length;
    const checkoutStarts = allSessions.filter((s) => s.startedCheckout).length;

    // Deduplicated unique order IDs across store
    const uniqueOrderIds = new Set<string>();
    let noIdOrders = 0;
    for (const s of allSessions) {
      if (s.hasPurchased) {
        if (s.orderIds && s.orderIds.length > 0) {
          for (const oId of s.orderIds) uniqueOrderIds.add(oId);
        } else if (s.orderId) {
          uniqueOrderIds.add(s.orderId);
        } else {
          noIdOrders++;
        }
      }
    }
    const uniqueOrdersCount = uniqueOrderIds.size + noIdOrders;
    const ordersCreated = uniqueOrdersCount;

    // Attributed store purchasing sessions: purchased at least one product they actually viewed
    const attributedPurchasingSessions = allSessions.filter(
      (s) =>
        s.hasPurchased &&
        s.purchasedProductIds.some((pId) => s.viewedProductIds.includes(pId))
    ).length;

    const purchasingSessions = allSessions.filter((s) => s.hasPurchased).length;
    const unattributedPurchasingSessions = Math.max(0, purchasingSessions - attributedPurchasingSessions);

    const productViewConversionRate =
      uniqueProductViews > 0
        ? Math.round((attributedPurchasingSessions / uniqueProductViews) * 1000) / 10
        : 0;

    const checkoutCompletionRate =
      checkoutStarts > 0
        ? Math.round((ordersCreated / checkoutStarts) * 1000) / 10
        : 0;

    return {
      totalSessions,
      uniqueProductViews,
      uniqueProductSessions: uniqueProductViews,
      checkoutStarts,
      ordersCreated,
      uniqueOrdersCount,
      purchasingSessions,
      attributedPurchasingSessions,
      unattributedPurchasingSessions,
      productViewConversionRate,
      checkoutCompletionRate,
    };
  }

  // ── 5. Safe Reset for Demo Analytics Only ──────────────────────────────────

  async resetDemoAnalytics(): Promise<void> {
    this.events = [];
    this.sessions.clear();
    this.eventIdsSet.clear();

    if (typeof window !== "undefined") {
      try {
        // ONLY remove the analytics key, leaving orders and products untouched
        window.localStorage.removeItem(ANALYTICS_STORAGE_KEY);
        this.broadcastChannel?.postMessage({ type: "ANALYTICS_UPDATED", timestamp: this.getCurrentTime() });
        window.dispatchEvent(new CustomEvent("orva:analytics-updated"));
      } catch (e) {
        console.warn("[MockVisitorAnalyticsRepository] Reset error:", e);
      }
    }
  }
}

// Singleton accessor
let singletonVisitorRepo: MockVisitorAnalyticsRepository | null = null;

export function getMockVisitorAnalyticsRepository(): MockVisitorAnalyticsRepository {
  if (!singletonVisitorRepo) {
    singletonVisitorRepo = new MockVisitorAnalyticsRepository();
  }
  return singletonVisitorRepo;
}
