/**
 * ORVA Store — Phase 7D Visitor & Conversion Analytics Contracts
 * 
 * First-party, privacy-preserving analytics contracts:
 * - Pseudonymous sessions (no IP tracking, no device fingerprinting).
 * - Zero personal identifiable information (PII).
 * - Exact Time to Purchase calculations with 5 duration buckets.
 * - Visitors Exited After 1 Minute Without Buying.
 * - Product View Conversion and Checkout Completion Rate.
 */

export type VisitorEventType =
  | "product_view"
  | "add_to_cart"
  | "checkout_started"
  | "order_created"
  | "session_activity"
  | "session_ended";

export type ReferrerCategory = "direct" | "search" | "social" | "referral" | "paid";

export interface VisitorAnalyticsEvent {
  id: string;                      // Unique event UUID for deduplication
  pseudonymousSessionId: string;   // Purely random session ID (no IP/fingerprinting)
  eventType: VisitorEventType;
  productId: string;
  productIds?: string[];           // All product IDs in multi-product orders
  timestamp: string;               // ISO 8601 UTC
  sessionDurationSeconds: number;  // Seconds elapsed since session started
  selectedWilaya?: string;         // Voluntarily chosen at checkout ONLY, never IP-inferred
  orderId?: string;                // Attached ONLY after order is successfully confirmed
  isSynthetic?: boolean;           // Flagged true for Demo Simulator events
  metadata?: Record<string, unknown>;
}

export interface VisitorSessionRecord {
  sessionId: string;
  startedAt: string;               // ISO 8601 UTC
  lastActivityAt: string;          // ISO 8601 UTC
  currentProductId?: string;
  sessionDurationSeconds: number;
  hasPurchased: boolean;
  orderId?: string;
  orderIds: string[];              // Unique order IDs created in this session
  purchasedProductIds: string[];   // Products actually purchased in this session
  selectedWilaya?: string;         // Voluntarily chosen only
  referrerCategory: ReferrerCategory;
  viewedProductIds: string[];      // Deduplicated products viewed in this session
  startedCheckout: boolean;
  isSynthetic?: boolean;
}

export type PurchaseTimeBucket =
  | "under_1_min"       // < 60s
  | "from_1_to_5_min"   // 60s – 300s
  | "from_5_to_15_min"  // 300s – 900s
  | "from_15_to_30_min" // 900s – 1800s
  | "over_30_min";      // > 1800s

export interface TimeToPurchaseMetrics {
  totalPurchasingSessions: number;
  averageTimeToPurchaseSeconds: number;
  medianTimeToPurchaseSeconds: number;
  buckets: {
    under1Min: number;
    from1To5Min: number;
    from5To15Min: number;
    from15To30Min: number;
    over30Min: number;
  };
}

export interface ExitMetrics {
  totalSessions: number;
  sessionsInactive60sWithoutPurchase: number; // Labeled: Sessions Inactive for 60+ Seconds Without Purchase
  inactivityRatePercentage: number;
  isEstimated: boolean;                       // Always true (estimated metric)
  exitedAfterOneMinuteCount: number;          // Compatibility alias for sessionsInactive60sWithoutPurchase
  exitRatePercentage: number;                 // Compatibility alias for inactivityRatePercentage
}

export interface ConversionMetrics {
  totalSessions: number;
  uniqueProductViews: number;
  uniqueProductSessions?: number;             // Explicit Tab-scoped sessions viewing product
  checkoutStarts: number;
  ordersCreated: number;                      // Deduplicated unique orders created
  uniqueOrdersCount?: number;                 // Deduplicated order IDs count
  purchasingSessions?: number;                // Sessions that made at least one purchase
  attributedPurchasingSessions?: number;      // Sessions that viewed product AND purchased it
  unattributedPurchasingSessions?: number;    // Purchases without preceding product view
  productViewConversionRate: number;          // (attributedPurchasingSessions / uniqueProductViews) * 100
  checkoutCompletionRate: number;             // (orders / checkoutStarts) * 100
  deliveredOrdersCount?: number;              // Deferred until delivery status confirmed
}

export interface ProductAnalyticsSummary {
  productId: string;
  conversion: ConversionMetrics;
  timeToPurchase: TimeToPurchaseMetrics;
  exitMetrics: ExitMetrics;
  wilayaDistribution: Array<{ wilaya: string; orderCount: number; sharePercentage: number }>;
}

export interface IVisitorAnalyticsRepository {
  trackEvent(event: Omit<VisitorAnalyticsEvent, "id"> & { id?: string }): Promise<VisitorAnalyticsEvent>;
  getEvents(filter?: { productId?: string; eventType?: VisitorEventType }): Promise<VisitorAnalyticsEvent[]>;
  getSessions(filter?: { productId?: string }): Promise<VisitorSessionRecord[]>;
  getProductConversionMetrics(productId?: string): Promise<ConversionMetrics>;
  getTimeToPurchaseMetrics(productId?: string): Promise<TimeToPurchaseMetrics>;
  getExitMetrics(productId?: string): Promise<ExitMetrics>;
  resetDemoAnalytics(): Promise<void>;
}
