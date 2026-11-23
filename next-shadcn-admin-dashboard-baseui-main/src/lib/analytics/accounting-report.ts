/**
 * ORVA Store — COD Accounting & Financial P&L Report Engine
 * Computes real profitability & COD cash lifecycle across EcoTrack / multi-courier statuses:
 *  - Gross COD, Product Revenue vs Delivery Fees
 *  - Cash Lifecycle: livre_non_encaisse -> encaisse_non_paye -> paiements_prets -> paye_et_archive / payed
 *  - COGS + Real synced `tarif_retour` return losses (including captured store-owned returns)
 *  - Meta Ads spend (USD / DZD) + Net Realized Profit + Break-Even CPA & ROAS
 */

import { classifyCourierFinancialStage } from "@/lib/delivery/courier-status-mapper";
import { parseWilayaCode69 } from "@/lib/geo/algeria-69";
import type { OrvaOrder } from "@/lib/orva-api";
import { matchOrderToProduct, type Product } from "@/lib/repository/product-types";

export interface CapturedExternalReturnEntry {
  trackingCode: string;
  courierId: string;
  courierName: string;
  wilayaCode?: number | null;
  wilayaName?: string | null;
  returnFeeDzd?: number | null;
  montantDzd?: number;
}

export interface CodAccountingReportInput {
  orders: OrvaOrder[];
  capturedReturns?: CapturedExternalReturnEntry[];
  metaAdSpendDzd?: number;
  exchangeRateDzd?: number;
  returnFeesByWilaya?: Record<number, number>;
  fallbackReturnFeeDzd?: number;
  products?: Product[];
}

export interface CodAccountingReport {
  totalOrdersCount: number;
  deliveredCount: number;
  returnedCount: number;
  capturedExternalReturnsCount: number;
  cancelledCount: number;
  inFlightCount: number;
  deliveryRatePct: number;
  grossDeliveredCodDzd: number;
  deliveredProductRevenueDzd: number;
  deliveredShippingDzd: number;
  courierCashStages: {
    deliveredUncollectedDzd: number;
    collectedUnpaidDzd: number;
    payoutReadyDzd: number;
    settledPaidDzd: number;
    pendingReceivableDzd: number;
  };
  totalCogsDzd: number;
  totalReturnLossDzd: number;
  capturedExternalReturnLossDzd: number;
  metaAdSpendDzd: number;
  metaAdSpendUsd: number;
  netRealizedProfitDzd: number;
  actualRoas: number | null;
  breakEvenRoas: number | null;
  actualCpaDzd: number | null;
  breakEvenCpaDzd: number | null;
  wilayaLeakage: Array<{
    wilaya: string;
    totalOrders: number;
    returnedOrders: number;
    returnLossDzd: number;
    deliveryRatePct: number;
  }>;
  courierBreakdown: Array<{
    courierId: string;
    totalOrders: number;
    deliveredOrders: number;
    returnedOrders: number;
    settledPaidDzd: number;
    pendingReceivableDzd: number;
    returnLossDzd: number;
  }>;
}

export function computeCodAccountingReport(input: CodAccountingReportInput): CodAccountingReport {
  const rate = Math.max(1, Number(input.exchangeRateDzd ?? 245) || 245);
  const fallbackReturn = Math.max(0, Number(input.fallbackReturnFeeDzd ?? 400) || 400);
  const feeMap = input.returnFeesByWilaya ?? {};
  const products = input.products ?? [];

  let deliveredCount = 0;
  let returnedCount = 0;
  let cancelledCount = 0;
  let inFlightCount = 0;

  let grossDeliveredCodDzd = 0;
  let deliveredProductRevenueDzd = 0;
  let deliveredShippingDzd = 0;
  let totalCogsDzd = 0;
  let totalReturnLossDzd = 0;

  let deliveredUncollectedDzd = 0;
  let collectedUnpaidDzd = 0;
  let payoutReadyDzd = 0;
  let settledPaidDzd = 0;

  const wilayaAgg = new Map<
    string,
    { wilaya: string; totalOrders: number; deliveredOrders: number; returnedOrders: number; returnLossDzd: number }
  >();
  const courierAgg = new Map<
    string,
    {
      courierId: string;
      totalOrders: number;
      deliveredOrders: number;
      returnedOrders: number;
      settledPaidDzd: number;
      pendingReceivableDzd: number;
      returnLossDzd: number;
    }
  >();

  for (const order of input.orders) {
    const status = (order.status || "").toLowerCase();
    const cs = (order.courierStatus || order.carrierStatus || "").toLowerCase();
    const finStage = classifyCourierFinancialStage(order.financialStatus || cs);
    const courierId = (order.courierId || (order.inRedex ? "redex" : "store")).toLowerCase();
    const wLabel = order.wilaya || "غير محدد";
    const wCode = parseWilayaCode69(wLabel);

    const wStat = wilayaAgg.get(wLabel) ?? {
      wilaya: wLabel,
      totalOrders: 0,
      deliveredOrders: 0,
      returnedOrders: 0,
      returnLossDzd: 0,
    };
    wStat.totalOrders += 1;

    const cStat = courierAgg.get(courierId) ?? {
      courierId,
      totalOrders: 0,
      deliveredOrders: 0,
      returnedOrders: 0,
      settledPaidDzd: 0,
      pendingReceivableDzd: 0,
      returnLossDzd: 0,
    };
    cStat.totalOrders += 1;

    const grand = Math.max(0, Number(order.grandTotalDzd ?? order.priceDzd ?? 0) || 0);
    const shipping = Math.max(0, Number(order.shippingDzd ?? 0) || 0);
    const productRev = Math.max(0, Number(order.priceDzd ?? Math.max(0, grand - shipping)) || 0);

    if (status === "delivered") {
      deliveredCount += 1;
      wStat.deliveredOrders += 1;
      cStat.deliveredOrders += 1;

      grossDeliveredCodDzd += grand;
      deliveredProductRevenueDzd += productRev;
      deliveredShippingDzd += shipping;

      const orderProductText = (order.productName || "").trim().toLowerCase();
      const matchedMeta = products.length > 0 ? matchOrderToProduct(order.productName) : null;
      const matchedProduct =
        products.find(
          (p) =>
            (matchedMeta?.matchedProductId && p.id === matchedMeta.matchedProductId) ||
            (matchedMeta?.matchedSku && p.sku === matchedMeta.matchedSku),
        ) ??
        products.find((p) => {
          const t = (p.title || "").trim().toLowerCase();
          return Boolean(t && orderProductText && (orderProductText.includes(t) || t.includes(orderProductText)));
        });
      const qty = Math.max(1, Number(order.quantity ?? 1) || 1);
      if (matchedProduct && matchedProduct.purchaseCost > 0) {
        totalCogsDzd += matchedProduct.purchaseCost * qty;
      }

      if (finStage === "paid_archived") {
        settledPaidDzd += grand;
        cStat.settledPaidDzd += grand;
      } else if (finStage === "ready_to_pay") {
        payoutReadyDzd += grand;
        cStat.pendingReceivableDzd += grand;
      } else if (finStage === "collected_unpaid") {
        collectedUnpaidDzd += grand;
        cStat.pendingReceivableDzd += grand;
      } else {
        deliveredUncollectedDzd += grand;
        cStat.pendingReceivableDzd += grand;
      }
    } else if (status === "returned" || cs.includes("retour") || cs.includes("return")) {
      returnedCount += 1;
      wStat.returnedOrders += 1;
      cStat.returnedOrders += 1;

      const returnFee =
        order.returnFeeDzd && order.returnFeeDzd > 0
          ? order.returnFeeDzd
          : wCode && feeMap[wCode] > 0
            ? feeMap[wCode]
            : fallbackReturn;

      totalReturnLossDzd += returnFee;
      wStat.returnLossDzd += returnFee;
      cStat.returnLossDzd += returnFee;
    } else if (status === "cancelled" || status === "deleted") {
      cancelledCount += 1;
    } else {
      inFlightCount += 1;
    }

    wilayaAgg.set(wLabel, wStat);
    courierAgg.set(courierId, cStat);
  }

  let capturedExternalReturnLossDzd = 0;
  const capturedReturns = input.capturedReturns ?? [];
  for (const extRet of capturedReturns) {
    const fee =
      extRet.returnFeeDzd && extRet.returnFeeDzd > 0
        ? extRet.returnFeeDzd
        : extRet.wilayaCode && feeMap[extRet.wilayaCode] > 0
          ? feeMap[extRet.wilayaCode]
          : fallbackReturn;
    capturedExternalReturnLossDzd += fee;
    totalReturnLossDzd += fee;
    returnedCount += 1;

    const cKey = (extRet.courierId || "external").toLowerCase();
    const cStat = courierAgg.get(cKey) ?? {
      courierId: cKey,
      totalOrders: 0,
      deliveredOrders: 0,
      returnedOrders: 0,
      settledPaidDzd: 0,
      pendingReceivableDzd: 0,
      returnLossDzd: 0,
    };
    cStat.returnedOrders += 1;
    cStat.returnLossDzd += fee;
    courierAgg.set(cKey, cStat);
  }

  const metaAdSpendDzd = Math.max(0, Math.round(Number(input.metaAdSpendDzd ?? 0) || 0));
  const metaAdSpendUsd = Number((metaAdSpendDzd / rate).toFixed(2));
  const netRealizedProfitDzd = Math.round(
    deliveredProductRevenueDzd - totalCogsDzd - totalReturnLossDzd - metaAdSpendDzd,
  );

  const outcomes = deliveredCount + returnedCount;
  const deliveryRatePct = outcomes > 0 ? Math.round((deliveredCount / outcomes) * 100) : 0;

  const actualRoas = metaAdSpendDzd > 0 ? Number((deliveredProductRevenueDzd / metaAdSpendDzd).toFixed(2)) : null;

  const grossMarginBeforeAds = deliveredProductRevenueDzd - totalCogsDzd - totalReturnLossDzd;
  const contributionMarginPct = deliveredProductRevenueDzd > 0 ? grossMarginBeforeAds / deliveredProductRevenueDzd : 0;
  const breakEvenRoas = contributionMarginPct > 0.01 ? Number((1 / contributionMarginPct).toFixed(2)) : null;

  const totalOrdersCount = input.orders.length;
  const actualCpaDzd =
    metaAdSpendDzd > 0 && totalOrdersCount > 0 ? Math.round(metaAdSpendDzd / totalOrdersCount) : null;
  const breakEvenCpaDzd =
    deliveredCount > 0 && grossMarginBeforeAds > 0
      ? Math.round(grossMarginBeforeAds / Math.max(1, totalOrdersCount))
      : null;

  const wilayaLeakage = Array.from(wilayaAgg.values())
    .filter((w) => w.returnedOrders > 0)
    .map((w) => {
      const o = w.deliveredOrders + w.returnedOrders;
      return {
        wilaya: w.wilaya,
        totalOrders: w.totalOrders,
        returnedOrders: w.returnedOrders,
        returnLossDzd: w.returnLossDzd,
        deliveryRatePct: o > 0 ? Math.round((w.deliveredOrders / o) * 100) : 0,
      };
    })
    .sort((a, b) => b.returnLossDzd - a.returnLossDzd);

  return {
    totalOrdersCount,
    deliveredCount,
    returnedCount,
    capturedExternalReturnsCount: capturedReturns.length,
    cancelledCount,
    inFlightCount,
    deliveryRatePct,
    grossDeliveredCodDzd,
    deliveredProductRevenueDzd,
    deliveredShippingDzd,
    courierCashStages: {
      deliveredUncollectedDzd,
      collectedUnpaidDzd,
      payoutReadyDzd,
      settledPaidDzd,
      pendingReceivableDzd: deliveredUncollectedDzd + collectedUnpaidDzd + payoutReadyDzd,
    },
    totalCogsDzd,
    totalReturnLossDzd,
    capturedExternalReturnLossDzd,
    metaAdSpendDzd,
    metaAdSpendUsd,
    netRealizedProfitDzd,
    actualRoas,
    breakEvenRoas,
    actualCpaDzd,
    breakEvenCpaDzd,
    wilayaLeakage,
    courierBreakdown: Array.from(courierAgg.values()),
  };
}
