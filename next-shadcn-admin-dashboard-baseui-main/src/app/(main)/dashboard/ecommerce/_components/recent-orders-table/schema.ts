export const orderFilters = [
  "All",
  "Pending",
  "Confirmed",
  "Pushed to Redex",
  // "Redex Station", // merged with Shipped
  "Shipped",
  "Delivered",
  "Returned",
  "Cancelled",
  "Switched Only",
  "Risk",
] as const;

export type OrderFilter = (typeof orderFilters)[number];

export type PrimaryOrderBucket =
  | "Pending"
  | "Confirmed"
  | "Pushed to Redex"
  | "Shipped"
  | "Delivered"
  | "Returned"
  | "Cancelled";

const DELIVERED_CARRIER_STATUSES = new Set([
  "livred",
  "livre",
  "livre_non_encaisse",
  "encaisse_non_paye",
  "encaissed",
  "payed",
  "paye_et_archive",
]);

const RETURNED_CARRIER_STATUSES = new Set([
  "return_asked",
  "return_in_transit",
  "retour_chez_livreur",
  "retour_transit_entrepot",
  "retour_en_traitement",
  "retour_recu",
  "return_received",
  "retour_archive",
]);

const SHIPPED_CARRIER_STATUSES = new Set([
  "vers_station",
  "en_station",
  "vers_hub",
  "en_hub",
  "vers_wilaya",
  "en_preparation",
  "en_ramassage",
  "picked",
  "accepted_by_carrier",
  "en_livraison",
  "dispatched_to_driver",
]);

const PUSHED_CARRIER_STATUSES = new Set([
  "prete_a_expedier",
  "order_information_received_by_carrier",
  "notification_on_order",
]);

export type OrderBucketInput = {
  status?: string | null;
  in_redex?: boolean | null;
  redex_tracking_code?: string | null;
  redex_tracking_id?: string | null;
  carrier_status?: string | null;
};

/**
 * Classifies each order into a single, mutually exclusive operational bucket.
 * Guarantees that Delivered and Pushed to Redex orders never bleed into Shipped.
 */
export function resolveOperationalOrderBucket(order: OrderBucketInput): PrimaryOrderBucket {
  const s = (order.status || "").trim().toLowerCase();
  const cs = (order.carrier_status || "").trim().toLowerCase();
  const hasRedex = Boolean(order.in_redex || order.redex_tracking_code || order.redex_tracking_id);

  if (s === "cancelled" || s === "canceled" || s === "deleted" || cs === "annule") {
    return "Cancelled";
  }

  if (s === "delivered" || DELIVERED_CARRIER_STATUSES.has(cs)) {
    return "Delivered";
  }

  if (s === "returned" || RETURNED_CARRIER_STATUSES.has(cs)) {
    return "Returned";
  }

  if (
    s === "shipped" ||
    s === "in_transit" ||
    s === "out_for_delivery" ||
    s === "redex_station" ||
    SHIPPED_CARRIER_STATUSES.has(cs)
  ) {
    return "Shipped";
  }

  if (s === "pushed" || hasRedex || PUSHED_CARRIER_STATUSES.has(cs)) {
    return "Pushed to Redex";
  }

  if (s === "confirmed") {
    return "Confirmed";
  }

  return "Pending";
}

export function matchesOrderFilter(
  order: Pick<
    OrderRow,
    | "status"
    | "in_redex"
    | "redex_tracking_code"
    | "redex_tracking_id"
    | "carrier_status"
    | "isSwitched"
    | "riskScore"
    | "riskLevel"
    | "riskDecision"
  >,
  filter: OrderFilter | "Redex Station",
): boolean {
  if (!filter || filter === "All") return true;

  const s = (order.status || "").trim().toLowerCase();
  const cs = (order.carrier_status || "").trim().toLowerCase();

  if (filter === "Redex Station") {
    const bucket = resolveOperationalOrderBucket(order);
    return bucket === "Shipped" && (s === "redex_station" || cs === "vers_station" || cs === "vers_hub");
  }

  if (filter === "Switched Only") {
    return Boolean(order.isSwitched);
  }

  if (filter === "Risk") {
    return Boolean(
      (order.riskScore && order.riskScore >= 40) ||
        order.riskLevel === "HIGH" ||
        order.riskDecision === "BLOCK" ||
        order.riskDecision === "REVIEW" ||
        s === "review",
    );
  }

  return resolveOperationalOrderBucket(order) === filter;
}

export interface ConversionEvent {
  event?: string;
  switch_status?: string;
  conversion_id?: string;
  conversion_sequence?: number;
  timestamp_utc?: string;
  operator?: string;
  reason?: string;
  override_applied?: boolean;
  redex_tracking_code?: string | null;
  summary?: string;
  diff?: Record<string, { from: any; to: any }>;
}

export type OrderRow = {
  id: string; // order_id
  date: string; // created_at
  customer: string; // full_name
  phone: string;
  wilaya: string;
  commune: string;
  deliveryType: string;
  status: string; // operational status: pending, confirmed, shipped, delivered, cancelled
  total: string; // grand_total
  items: string; // product_name
  priceNum: number | null;
  shippingFee: string;
  in_redex?: boolean;
  redex_tracking_id?: string | null;
  redex_tracking_code?: string | null;
  fb_campaign_id?: string | null;
  fb_adset_id?: string | null;
  fb_ad_id?: string | null;
  fbclid?: string | null;
  utm_campaign?: string | null;
  attribution_source?: string | null;
  carrier_status?: string | null;
  carrier_status_ar?: string | null;
  courierId?: string | null;
  courierName?: string | null;
  courierStatus?: string | null;
  courierStatusAr?: string | null;
  normalizedCourierStatus?: string | null;
  courierLocationStage?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  currentStation?: string | null;
  financialStatus?: string | null;
  returnFeeDzd?: number | null;
  deskInfo?: Record<string, unknown> | null;
  courierRemarks?: unknown[];
  manualStatusOverride?: boolean;
  remarks?: any[];
  conversions: ConversionEvent[];
  isSwitched: boolean;
  conversionCount: number;
  riskScore: number;
  riskLevel: string;
  riskDecision: string;
  riskReasons: string[];
  rawOrder?: any;
};
