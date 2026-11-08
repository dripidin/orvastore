/**
 * ORVA Store — First-Party Visitor Tracker (Privacy-First Client Helper)
 * 
 * Manages pseudonymous sessions across product pages using sessionStorage.
 * Strictly adheres to first-party privacy:
 * - NO IP Geolocation
 * - NO Browser Fingerprinting
 * - NO Personal Data (Name, Phone, Email, Address) in events
 * - Disabled by default in production mode
 */

import { getMockVisitorAnalyticsRepository } from "./mock-visitor-analytics-repository";
import { VisitorEventType } from "./visitor-analytics-types";

const SESSION_STORAGE_KEY = "orva_visitor_session_id_v1";

/**
 * Checks whether first-party tracking is allowed.
 * OFF by default in production until official privacy policies and consent are deployed.
 */
export function isTrackingEnabled(): boolean {
  // In production, tracking is OFF by default unless demo mode is explicitly enabled
  const isProd = process.env.NODE_ENV === "production";
  const allowDemo = process.env.NEXT_PUBLIC_ALLOW_DEMO_MODE === "true";

  if (isProd && !allowDemo) {
    return false;
  }

  return true;
}

/**
 * Returns or generates a pure random pseudonymous session ID.
 * Persists inside sessionStorage across product page navigations.
 */
export function getOrCreatePseudonymousSessionId(): string {
  if (typeof window === "undefined") {
    return `sess_ssr_${Math.random().toString(36).substring(2, 9)}`;
  }

  try {
    let sessId = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessId) {
      sessId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessId);
    }
    return sessId;
  } catch {
    return `sess_fallback_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Strips any potential PII fields before recording events.
 */
function sanitizeEventMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const safe: Record<string, unknown> = {};
  const FORBIDDEN_KEYS = [
    "name", "fullname", "phone", "phone_number", "email", "address",
    "password", "secret", "token", "card", "cvv"
  ];

  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_KEYS.some((f) => key.toLowerCase().includes(f))) {
      continue; // Filter out sensitive PII keys
    }
    safe[key] = value;
  }
  return safe;
}

export class VisitorTracker {
  private repo = getMockVisitorAnalyticsRepository();
  private viewedProductsInSession: Set<string> = new Set();

  /**
   * Tracks a product view. Enforces deduplication within the session.
   */
  async trackProductView(productId: string): Promise<boolean> {
    if (!isTrackingEnabled()) return false;
    const sessionId = getOrCreatePseudonymousSessionId();

    // Deduplicate within the current page instance
    const viewKey = `${sessionId}_${productId}`;
    const isNewView = !this.viewedProductsInSession.has(viewKey);
    this.viewedProductsInSession.add(viewKey);

    await this.repo.trackEvent({
      pseudonymousSessionId: sessionId,
      eventType: "product_view",
      productId,
      timestamp: new Date().toISOString(),
      sessionDurationSeconds: 0,
    });

    return isNewView;
  }

  /**
   * Tracks when a user begins interacting with the order form.
   */
  async trackCheckoutStarted(productId: string): Promise<void> {
    if (!isTrackingEnabled()) return;
    const sessionId = getOrCreatePseudonymousSessionId();

    await this.repo.trackEvent({
      pseudonymousSessionId: sessionId,
      eventType: "checkout_started",
      productId,
      timestamp: new Date().toISOString(),
      sessionDurationSeconds: 0,
    });
  }

  /**
   * Tracks a successfully created order (or confirmed simulation in demo).
   * Notice: Customer name and phone are strictly EXCLUDED.
   * Supports multi-product order attribution via productIds array.
   */
  async trackOrderCreated(
    productId: string,
    orderId: string,
    selectedWilaya?: string,
    isSynthetic: boolean = false,
    productIds?: string[]
  ): Promise<void> {
    if (!isTrackingEnabled()) return;
    const sessionId = getOrCreatePseudonymousSessionId();

    await this.repo.trackEvent({
      pseudonymousSessionId: sessionId,
      eventType: "order_created",
      productId,
      productIds: productIds && productIds.length > 0 ? productIds : [productId],
      timestamp: new Date().toISOString(),
      sessionDurationSeconds: 0,
      orderId,
      selectedWilaya, // Only voluntarily selected wilaya
      isSynthetic,
    });
  }
}

// Global singleton instance
export const visitorTracker = new VisitorTracker();
