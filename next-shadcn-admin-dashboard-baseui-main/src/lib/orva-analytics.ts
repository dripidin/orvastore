import type { OrvaOrder } from "@/lib/orva-api";

export interface DeliveredProductMetric {
  productName: string;
  deliveredOrderCount: number;
  totalRevenueDzd: number;
}

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

export function filterOrdersByPeriod(orders: OrvaOrder[], period: AnalyticsPeriod, now = new Date()) {
  if (period === "all") return orders;

  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const start = new Date(now);
  start.setDate(start.getDate() - days);

  return orders.filter((order) => {
    if (!order.createdAt) return false;
    const createdAt = new Date(order.createdAt);
    return Number.isFinite(createdAt.getTime()) && createdAt >= start && createdAt <= now;
  });
}

export function aggregateDeliveredProducts(orders: OrvaOrder[]): DeliveredProductMetric[] {
  const products = new Map<string, { count: number; revenue: number }>();

  for (const order of orders) {
    const s = (order.status || "").toLowerCase();
    if (s === "cancelled" || s === "deleted") continue;
    const productName = order.productName?.trim();
    if (!productName) continue;

    const existing = products.get(productName) ?? { count: 0, revenue: 0 };
    products.set(productName, {
      count: existing.count + 1,
      revenue: existing.revenue + (order.grandTotalDzd || order.priceDzd || 0),
    });
  }

  return [...products.entries()]
    .map(([productName, metric]) => ({
      productName,
      deliveredOrderCount: metric.count,
      totalRevenueDzd: metric.revenue,
    }))
    .sort((a, b) => b.deliveredOrderCount - a.deliveredOrderCount || a.productName.localeCompare(b.productName));
}


export function getSwitchCount(orders: OrvaOrder[]) {
  return orders.filter((order) =>
    order.remarks.some((remark) => {
      if (typeof remark === "string") return remark.includes("ORDER_CONVERSION");
      if (!remark || typeof remark !== "object") return false;
      const event = "event" in remark ? remark.event : undefined;
      const status = "switch_status" in remark ? remark.switch_status : undefined;
      return event === "ORDER_CONVERSION" || status === "switched";
    }),
  ).length;
}
