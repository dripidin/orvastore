/**
 * CodFlow integration — shared wire types (Phase 0).
 *
 * These types describe CodFlow's JSON payloads exactly as documented in
 * `codflow-main/cod-server/src/openapi/schemas/*`. They are not UI models:
 * mappers in later phases convert them into OrvaStore's repository types.
 *
 * Contract rules:
 * - Never add fields that CodFlow does not return.
 * - Domain DTOs (products, customers, delivery, store) are added with their
 *   own phase, pinned by captured fixtures, so an inaccurate guess never
 *   becomes a silent contract.
 * - Money is integer DZD. `codAmount` is the only cash-on-delivery authority.
 */

export type CodflowHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type CodflowQueryValue = string | number | boolean | null | undefined;

export type CodflowQuery = Record<string, CodflowQueryValue>;

/** CodFlow's fixed 11-state order lifecycle. */
export type CodflowOrderStatus =
  | "new"
  | "confirmed"
  | "unreachable"
  | "preparing"
  | "ready"
  | "assigned"
  | "dispatched"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "cancelled";

export const CODFLOW_ORDER_STATUSES: readonly CodflowOrderStatus[] = [
  "new",
  "confirmed",
  "unreachable",
  "preparing",
  "ready",
  "assigned",
  "dispatched",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
] as const;

export type CodflowOrderType = "online" | "offline";

export type CodflowDeliveryType = "home" | "stop_desk";

export type CodflowDeliveryMethod = "unassigned" | "driver" | "company";

export type CodflowOrderProductStatus = "fulfilled" | "partially_returned" | "returned";

/** CodFlow envelope for every merchant `/api/*` response. */
export interface CodflowEnvelope<T> {
  success?: boolean;
  data?: T;
  count?: number;
  total?: number;
  message?: string;
  [key: string]: unknown;
}

/**
 * Union of the two error envelopes the bridge can return:
 * - OrvaStore bridge: `{ success: false, error: "CODE", message }`
 * - CodFlow: `{ error: "human message", code: "CODE", category: "..." }`
 */
export interface CodflowErrorPayload {
  success?: boolean;
  error?: string;
  error_code?: string;
  code?: string;
  category?: string;
  message?: string;
  requestId?: string;
  upstreamStatus?: number;
  [key: string]: unknown;
}

export interface CodflowOrderProduct {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantLabel: string | null;
  sku: string | null;
  quantity: number;
  pricePerUnit: number;
  lineTotal: number;
  status: CodflowOrderProductStatus;
  returnedQuantity: number;
  createdAt: string;
}

export interface CodflowStatusHistoryItem {
  id: string;
  orderId: string;
  status: CodflowOrderStatus;
  timestamp: string;
  by: string | null;
  byName: string | null;
}

/**
 * `GET /api/orders` list item. Mirrors `OrderBaseSchema` plus the two fields
 * that are only present in list responses.
 */
export interface CodflowOrderListItem {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  phone: string;

  wilayaId: number | null;
  wilaya: string | null;
  communeId: string | null;
  commune: string | null;
  city: string | null;
  address: string | null;

  price: number;
  deliveryFee: number;
  driverFee: number;
  codAmount: number | null;

  status: CodflowOrderStatus;
  orderType: CodflowOrderType;
  deliveryMethod: CodflowDeliveryMethod;
  deliveryType: CodflowDeliveryType;

  driverId: string | null;
  driverName: string | null;
  companyId: string | null;
  assignedAt: string | null;
  assignedBy: string | null;
  assignmentNotes: string | null;

  trackingNumber: string | null;
  trackingUrl: string | null;
  externalOrderId: string | null;
  stationCode: string | null;

  pickupTime: string | null;
  deliveryTime: string | null;
  deliveryAttempts: number | null;

  notes: string | null;
  photos: string | null;
  weight: number | null;
  isFragile: boolean | null;

  codPaymentId: string | null;
  feePaymentId: string | null;

  createdAt: string;
  updatedAt: string;

  customerEmail?: string | null;
  customFieldsJson?: string | null;

  // List-only fields.
  hasReview?: number;
  lastUpdatedBy?: string | null;
}

/** `GET /api/orders/{id}` detail. Adds line items and status history. */
export interface CodflowOrderDetail extends CodflowOrderListItem {
  products?: CodflowOrderProduct[];
  statusHistory?: CodflowStatusHistoryItem[];
}

/**
 * Carrier-specific records returned by `/api/orders/{id}/remarks` and
 * `/api/orders/{id}/tracking-events`. Shape varies by provider by design.
 */
export type CodflowCarrierRecord = Record<string, unknown>;

/** Local bridge health payload (`/api/codflow?path=/__health`). */
export interface CodflowHealth {
  bridge: "ok";
  version: string;
  configured: boolean;
  upstreamHost: string | null;
  flags: Record<string, string>;
  auth: "bridge";
  upstream: {
    reachable: boolean;
    status: number;
    latencyMs: number;
    error: string | null;
  } | null;
  timestamp: string;
}
