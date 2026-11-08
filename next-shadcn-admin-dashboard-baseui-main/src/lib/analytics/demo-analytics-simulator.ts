/**
 * ORVA Store — Phase 7D Demo Analytics Simulator
 * 
 * Generates synthetic visitor behavior scenarios to demonstrate:
 * - Immediate buyers (< 1 minute)
 * - Deliberate buyers (1-5 min, 5-15 min, > 30 min)
 * - Bounced visitors (< 60s)
 * - Visitors Exited After 1 Minute Without Buying (> 60s)
 * - Abandoned checkouts
 * 
 * Every record is explicitly flagged as `isSynthetic: true` with
 * the badge: "SYNTHETIC DEMO EVENTS".
 */

import { MockVisitorAnalyticsRepository } from "./mock-visitor-analytics-repository";

export type SyntheticScenarioType =
  | "quick_bounce"               // Viewed and bounced in 25s
  | "exit_after_one_minute"       // Viewed, stayed 85s (> 60s) and left without buying
  | "abandoned_checkout"         // Viewed, started form, left after 120s
  | "buyer_under_1_min"          // Purchased 45s after first view
  | "buyer_5_min"                // Purchased 290s after first view
  | "buyer_15_min"               // Purchased 750s after first view
  | "buyer_over_30_min";         // Purchased 2100s (35m) after first view

const DEMO_WILAYAS = [
  "16 - الجزائر", "31 - وهران", "25 - قسنطينة", "07 - بسكرة", "09 - البليدة", "19 - سطيف"
];

export async function simulateVisitorScenario(
  repo: MockVisitorAnalyticsRepository,
  scenario: SyntheticScenarioType,
  productId: string = "prod_pack_1_pro"
): Promise<{ sessionId: string; scenario: SyntheticScenarioType; description: string }> {
  const baseTime = Date.now() - 3600 * 1000; // Start an hour ago
  const sessionId = `sess_synth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const randomWilaya = DEMO_WILAYAS[Math.floor(Math.random() * DEMO_WILAYAS.length)];

  switch (scenario) {
    case "quick_bounce": {
      // 1. product_view
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "product_view",
        productId,
        timestamp: new Date(baseTime).toISOString(),
        sessionDurationSeconds: 0,
        isSynthetic: true,
      });
      // 2. session_activity 25s later
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "session_activity",
        productId,
        timestamp: new Date(baseTime + 25 * 1000).toISOString(),
        sessionDurationSeconds: 25,
        isSynthetic: true,
      });
      return { sessionId, scenario, description: "زائر شاهد المنتج وغادر بعد 25 ثانية (ارتداد سريع)" };
    }

    case "exit_after_one_minute": {
      // 1. product_view
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "product_view",
        productId,
        timestamp: new Date(baseTime).toISOString(),
        sessionDurationSeconds: 0,
        isSynthetic: true,
      });
      // 2. session_activity 95s later (> 60s exit without purchase)
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "session_activity",
        productId,
        timestamp: new Date(baseTime + 95 * 1000).toISOString(),
        sessionDurationSeconds: 95,
        isSynthetic: true,
      });
      return { sessionId, scenario, description: "زائر بقي 95 ثانية (أكثر من دقيقة) ثم غادر دون شراء" };
    }

    case "abandoned_checkout": {
      // 1. product_view
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "product_view",
        productId,
        timestamp: new Date(baseTime).toISOString(),
        sessionDurationSeconds: 0,
        isSynthetic: true,
      });
      // 2. checkout_started at 40s
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "checkout_started",
        productId,
        timestamp: new Date(baseTime + 40 * 1000).toISOString(),
        sessionDurationSeconds: 40,
        selectedWilaya: randomWilaya,
        isSynthetic: true,
      });
      // 3. session_activity at 130s then abandoned
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "session_activity",
        productId,
        timestamp: new Date(baseTime + 130 * 1000).toISOString(),
        sessionDurationSeconds: 130,
        isSynthetic: true,
      });
      return { sessionId, scenario, description: "زائر بدأ ملء النموذج واختار الولاية ثم تراجع دون تأكيد" };
    }

    case "buyer_under_1_min": {
      const orderId = `ORD_SYNTH_${Math.floor(10000 + Math.random() * 90000)}`;
      // 1. product_view
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "product_view",
        productId,
        timestamp: new Date(baseTime).toISOString(),
        sessionDurationSeconds: 0,
        isSynthetic: true,
      });
      // 2. checkout_started at 20s
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "checkout_started",
        productId,
        timestamp: new Date(baseTime + 20 * 1000).toISOString(),
        sessionDurationSeconds: 20,
        selectedWilaya: randomWilaya,
        isSynthetic: true,
      });
      // 3. order_created at 45s (< 1 min)
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "order_created",
        productId,
        timestamp: new Date(baseTime + 45 * 1000).toISOString(),
        sessionDurationSeconds: 45,
        orderId,
        selectedWilaya: randomWilaya,
        isSynthetic: true,
      });
      return { sessionId, scenario, description: `مشتري فوري: أكمل الشراء بعد 45 ثانية (${orderId})` };
    }

    case "buyer_5_min": {
      const orderId = `ORD_SYNTH_${Math.floor(10000 + Math.random() * 90000)}`;
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "product_view",
        productId,
        timestamp: new Date(baseTime).toISOString(),
        sessionDurationSeconds: 0,
        isSynthetic: true,
      });
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "checkout_started",
        productId,
        timestamp: new Date(baseTime + 120 * 1000).toISOString(),
        sessionDurationSeconds: 120,
        selectedWilaya: randomWilaya,
        isSynthetic: true,
      });
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "order_created",
        productId,
        timestamp: new Date(baseTime + 280 * 1000).toISOString(),
        sessionDurationSeconds: 280,
        orderId,
        selectedWilaya: randomWilaya,
        isSynthetic: true,
      });
      return { sessionId, scenario, description: `مشتري تأملي: أكمل الشراء بعد 4 دقائق و40 ثانية (${orderId})` };
    }

    case "buyer_15_min": {
      const orderId = `ORD_SYNTH_${Math.floor(10000 + Math.random() * 90000)}`;
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "product_view",
        productId,
        timestamp: new Date(baseTime).toISOString(),
        sessionDurationSeconds: 0,
        isSynthetic: true,
      });
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "order_created",
        productId,
        timestamp: new Date(baseTime + 720 * 1000).toISOString(),
        sessionDurationSeconds: 720,
        orderId,
        selectedWilaya: randomWilaya,
        isSynthetic: true,
      });
      return { sessionId, scenario, description: `مشتري متأنٍ: أكمل الشراء بعد 12 دقيقة (${orderId})` };
    }

    case "buyer_over_30_min": {
      const orderId = `ORD_SYNTH_${Math.floor(10000 + Math.random() * 90000)}`;
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "product_view",
        productId,
        timestamp: new Date(baseTime).toISOString(),
        sessionDurationSeconds: 0,
        isSynthetic: true,
      });
      await repo.trackEvent({
        pseudonymousSessionId: sessionId,
        eventType: "order_created",
        productId,
        timestamp: new Date(baseTime + 2200 * 1000).toISOString(), // ~36 min
        sessionDurationSeconds: 2200,
        orderId,
        selectedWilaya: randomWilaya,
        isSynthetic: true,
      });
      return { sessionId, scenario, description: `مشتري بعد مقارنة: أكمل الشراء بعد 36 دقيقة (${orderId})` };
    }
  }
}

/**
 * Seeds a full demonstration cohort showcasing all 5 duration buckets and exit scenarios.
 */
export async function seedDemoAnalyticsCohort(
  repo: MockVisitorAnalyticsRepository,
  productId: string = "prod_pack_1_pro"
): Promise<number> {
  const scenarios: SyntheticScenarioType[] = [
    "quick_bounce",
    "quick_bounce",
    "exit_after_one_minute",
    "exit_after_one_minute",
    "exit_after_one_minute",
    "abandoned_checkout",
    "abandoned_checkout",
    "buyer_under_1_min",
    "buyer_under_1_min",
    "buyer_5_min",
    "buyer_5_min",
    "buyer_15_min",
    "buyer_over_30_min",
  ];

  for (const s of scenarios) {
    await simulateVisitorScenario(repo, s, productId);
  }

  return scenarios.length;
}
