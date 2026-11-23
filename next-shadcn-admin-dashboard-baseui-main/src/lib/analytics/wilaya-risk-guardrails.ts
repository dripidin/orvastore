/**
 * ORVA Store — Automated Risk Guardrails for High-Risk Wilayas (< 70% Delivery Rate)
 * Never blocks or interrupts the customer during checkout; instead annotates risk metadata
 * and surfaces actionable alerts for admins & Telegram notifications.
 */

import { getWilayaNameAr69, parseWilayaCode69 } from "@/lib/geo/algeria-69";
import type { OrvaOrder } from "@/lib/orva-api";
import { loadAllStoreOrdersForReconciliation } from "@/lib/reconciliation/reconciliation-engine";

export const WILAYA_DELIVERY_RATE_THRESHOLD_PCT = 70;
export const WILAYA_CRITICAL_RATE_THRESHOLD_PCT = 50;
export const WILAYA_MIN_OUTCOMES_FOR_GUARDRAIL = 3;

export interface WilayaRiskStat {
  wilayaCode: number;
  wilayaName: string;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  outcomesCount: number;
  deliveryRatePct: number;
  returnLossDzd: number;
  riskTier: "LOW" | "HIGH" | "CRITICAL";
  isHighRisk: boolean;
  recommendedActionAr: string;
}

export interface CheckoutWilayaRiskEvaluation {
  wilayaCode: number;
  wilayaName: string;
  warningTriggered: boolean;
  deliveryRatePct: number;
  outcomesCount: number;
  returnedOrders: number;
  riskScore: number;
  riskLevel: "LOW" | "HIGH" | "CRITICAL";
  riskDecision: "ALLOW" | "REVIEW";
  riskReasons: string[];
  recommendedActionAr: string;
  telegramWarningLine: string | null;
}

export function computeWilayaRiskGuardrails(
  orders: OrvaOrder[],
  returnFeeMap: Record<number, number> = {},
): {
  allWilayas: WilayaRiskStat[];
  highRiskWilayas: WilayaRiskStat[];
} {
  const agg = new Map<
    number,
    { total: number; delivered: number; returned: number; returnLossDzd: number }
  >();

  for (const ord of orders) {
    const code = parseWilayaCode69(ord.wilaya);
    if (!code) continue;

    const current = agg.get(code) ?? { total: 0, delivered: 0, returned: 0, returnLossDzd: 0 };
    current.total += 1;

    const status = (ord.status || "").toLowerCase();
    const cs = (ord.courierStatus || ord.carrierStatus || "").toLowerCase();

    if (status === "delivered") {
      current.delivered += 1;
    } else if (status === "returned" || cs.includes("retour") || cs.includes("return")) {
      current.returned += 1;
      const fee =
        ord.returnFeeDzd && ord.returnFeeDzd > 0
          ? ord.returnFeeDzd
          : returnFeeMap[code] > 0
            ? returnFeeMap[code]
            : 400;
      current.returnLossDzd += fee;
    }

    agg.set(code, current);
  }

  const allWilayas: WilayaRiskStat[] = [];
  for (const [wilayaCode, stat] of agg.entries()) {
    const outcomesCount = stat.delivered + stat.returned;
    const deliveryRatePct = outcomesCount > 0 ? Math.round((stat.delivered / outcomesCount) * 100) : 100;
    const isHighRisk =
      outcomesCount >= WILAYA_MIN_OUTCOMES_FOR_GUARDRAIL &&
      deliveryRatePct < WILAYA_DELIVERY_RATE_THRESHOLD_PCT;

    const riskTier: WilayaRiskStat["riskTier"] = !isHighRisk
      ? "LOW"
      : deliveryRatePct < WILAYA_CRITICAL_RATE_THRESHOLD_PCT
        ? "CRITICAL"
        : "HIGH";

    const recommendedActionAr =
      riskTier === "CRITICAL"
        ? "تأكيد هاتفي مزدوج + اقتراح الدفع المسبق (عربون) أو الاستلام من المكتب Stop Desk"
        : riskTier === "HIGH"
          ? "تأكيد هاتفي مشدد واقتراح الاستلام من المكتب (Stop Desk) لتفادي الإرجاع"
          : "معدل تسليم سليم (التأكيد القياسي)";

    allWilayas.push({
      wilayaCode,
      wilayaName: getWilayaNameAr69(wilayaCode),
      totalOrders: stat.total,
      deliveredOrders: stat.delivered,
      returnedOrders: stat.returned,
      outcomesCount,
      deliveryRatePct,
      returnLossDzd: stat.returnLossDzd,
      riskTier,
      isHighRisk,
      recommendedActionAr,
    });
  }

  allWilayas.sort((a, b) => {
    if (a.isHighRisk !== b.isHighRisk) return a.isHighRisk ? -1 : 1;
    return a.deliveryRatePct - b.deliveryRatePct || b.returnedOrders - a.returnedOrders;
  });

  return {
    allWilayas,
    highRiskWilayas: allWilayas.filter((w) => w.isHighRisk),
  };
}

export async function evaluateWilayaRiskForCheckout(
  wilayaCode: number,
  injectedOrders?: OrvaOrder[],
): Promise<CheckoutWilayaRiskEvaluation> {
  const wilayaName = getWilayaNameAr69(wilayaCode);
  const orders = injectedOrders ?? (await loadAllStoreOrdersForReconciliation().catch(() => [] as OrvaOrder[]));
  const { allWilayas } = computeWilayaRiskGuardrails(orders);
  const stat = allWilayas.find((w) => w.wilayaCode === wilayaCode);

  if (!stat || !stat.isHighRisk) {
    return {
      wilayaCode,
      wilayaName,
      warningTriggered: false,
      deliveryRatePct: stat?.deliveryRatePct ?? 100,
      outcomesCount: stat?.outcomesCount ?? 0,
      returnedOrders: stat?.returnedOrders ?? 0,
      riskScore: 0,
      riskLevel: "LOW",
      riskDecision: "ALLOW",
      riskReasons: [],
      recommendedActionAr: "تأكيد قياسي",
      telegramWarningLine: null,
    };
  }

  const isCritical = stat.riskTier === "CRITICAL";
  const reason = `⚠️ ولاية عالية المخاطر (${wilayaCode} - ${wilayaName}): نسبة التسليم ${stat.deliveryRatePct}% فقط (${stat.returnedOrders} مرتجع من أصل ${stat.outcomesCount} طلبية منتهية). ${stat.recommendedActionAr}`;

  return {
    wilayaCode,
    wilayaName,
    warningTriggered: true,
    deliveryRatePct: stat.deliveryRatePct,
    outcomesCount: stat.outcomesCount,
    returnedOrders: stat.returnedOrders,
    riskScore: isCritical ? 82 : 64,
    riskLevel: stat.riskTier,
    riskDecision: "REVIEW",
    riskReasons: [reason],
    recommendedActionAr: stat.recommendedActionAr,
    telegramWarningLine: `⚠️ <b>تنبيه ولاية عالية المخاطر:</b> نسبة تسليم <b>${stat.deliveryRatePct}%</b> (${stat.returnedOrders} مرتجع / ${stat.outcomesCount}) — يُنصح بـ: ${stat.recommendedActionAr}`,
  };
}
