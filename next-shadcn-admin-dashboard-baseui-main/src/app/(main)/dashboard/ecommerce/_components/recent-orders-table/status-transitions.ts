import type { OrderRow } from "./schema";

/**
 * Single source of truth for manual (ORVA-only) status changes from the dashboard.
 * Delivered / Returned only change the ORVA database status; they never call the courier.
 */
export const allowedStatusTransitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "pending"],
  pushed: ["delivered", "returned", "cancelled"],
  redex_station: ["delivered", "returned", "cancelled"],
  shipped: ["delivered", "returned", "cancelled"],
  delivered: ["returned"],
  cancelled: ["pending"],
  returned: ["pending", "delivered"],
};

const SHIPPING_TRANSITIONS = ["delivered", "returned", "cancelled"];

/** Transitions available for one order, taking courier hand-off (tracking code / in_redex) into account. */
export function getAvailableTransitions(order: Pick<OrderRow, "status" | "in_redex" | "redex_tracking_code">): string[] {
  const status = (order.status || "").toLowerCase();
  const base = allowedStatusTransitions[status] ?? [];
  const handedToCourier = Boolean(order.in_redex || order.redex_tracking_code);
  if (handedToCourier && (status === "pending" || status === "confirmed")) {
    return Array.from(new Set([...SHIPPING_TRANSITIONS, ...base.filter((s) => s !== "confirmed")]));
  }
  return base;
}

export const STATUS_LABELS_AR: Record<string, string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكدة",
  delivered: "مستلمة",
  returned: "مرتجعة",
  cancelled: "ملغاة",
};
