export type OrderStatus =
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "returned"
  | "cancelled"
  | "deleted";

export type DeliveryType = "توصيل للمنزل" | "استلام من المكتب (Stop Desk)" | string;

export interface OrderConversionRecord {
  event: "ORDER_CONVERSION";
  switch_status: "switched";
  conversion_sequence: number;
  timestamp_utc: string;
  operator: string;
  reason: string;
  override_applied?: boolean;
  redex_tracking_code?: string | null;
  previous_product?: string;
  new_product?: string;
  previous_wilaya?: string;
  new_wilaya?: string;
  previous_total?: string;
  new_total?: string;
  financial_difference?: string;
  diff?: Record<string, { from: any; to: any }>;
}

export interface RawOrvaOrder extends Record<string, unknown> {
  orderId?: string;
  order_id?: string;
  id?: string;
  fullName?: string;
  full_name?: string;
  customer?: string;
  phone?: string;
  phone_number?: string;
  wilaya?: string;
  commune?: string;
  deliveryType?: string;
  delivery_type?: string;
  productName?: string;
  product_name?: string;
  priceNum?: number | string;
  price_num?: number | string;
  shippingFee?: string;
  shipping_fee?: string;
  grandTotal?: string;
  grand_total?: string;
  status?: string;
  in_redex?: boolean;
  inRedex?: boolean;
  redex_tracking_code?: string | null;
  redexTrackingCode?: string | null;
  remarks?: unknown[];
  created_at?: string;
  createdAt?: string;
  date?: string;
}

export interface OrvaOrder {
  id: string;
  createdAt: string | null;
  customer: string | null;
  phone: string | null;
  productName: string | null;
  status: OrderStatus | string;
  wilaya: string | null;
  commune: string | null;
  deliveryType: DeliveryType | null;
  priceDzd: number | null;
  shippingDzd: number | null;
  grandTotalDzd: number | null;
  quantity: number | null;
  inRedex: boolean;
  redexTrackingCode: string | null;
  remarks: unknown[];
  conversions?: OrderConversionRecord[];
  isSwitched?: boolean;
  conversionCount?: number;
  riskScore?: number;
  riskLevel?: string;
  riskDecision?: string;
  riskReasons?: string[];
  raw: RawOrvaOrder;
}

export interface SwitchOrderPayload {
  orderId: string;
  fullName: string;
  phone: string;
  wilaya: string;
  commune: string;
  deliveryType: string;
  reason: string;
  productName?: string;
  priceNum?: number;
  shippingFee: string;
  grandTotal: string;
  claimedOperatorName?: string;
  operatorOverride?: boolean;
  idempotencyKey?: string;
  originHub?: string;
}

export interface SwitchOrderResult {
  success: boolean;
  orderId: string;
  updatedOrder: OrvaOrder;
  redexComment: string;
  message?: string;
}

export interface PushOrderPayload {
  orderId: string;
  courierId: string;
  courierName?: string;
  deliveryType?: "home" | "desk";
  shippingFeeDzd?: number;
  codAmountDzd?: number;
  notes?: string;
  freeShipping?: boolean;
  operatorName?: string;
  phone?: string;
  fullName?: string;
  wilayaCode?: number;
  commune?: string;
  address?: string;
  productName?: string;
  phone2?: string;
  price?: number;
  token?: string;
  baseUrl?: string;
  wilaya?: string;
}

export interface PushOrderResult {
  success: boolean;
  orderId: string;
  trackingCode: string;
  courierId: string;
  courierName: string;
  labelUrl?: string;
  updatedOrder?: OrvaOrder | null;
  message?: string;
}

export interface BulkStatusUpdateResult {
  success: boolean;
  updatedCount: number;
  failedCount: number;
  updatedOrderIds: string[];
}

export interface AuditLogEntry {
  id: string;
  action: string;
  orderId: string;
  timestamp: string;
  actor: string;
  details: Record<string, unknown>;
}

export type RepositoryMode = "mock" | "live";

export interface IOrdersRepository {
  getMode(): RepositoryMode;
  setMode(mode: RepositoryMode): void;
  getOrders(): Promise<OrvaOrder[]>;
  getOrderById(id: string): Promise<OrvaOrder | null>;
  updateOrderStatus(orderId: string, status: OrderStatus | string, actor?: string): Promise<OrvaOrder>;
  bulkUpdateStatus(orderIds: string[], status: OrderStatus | string, actor?: string): Promise<BulkStatusUpdateResult>;
  switchOrder(payload: SwitchOrderPayload): Promise<SwitchOrderResult>;
  pushOrder(payload: PushOrderPayload): Promise<PushOrderResult>;
  deleteOrder(orderId: string): Promise<boolean>;
  getAuditLogs(): Promise<AuditLogEntry[]>;
  resetToDefaultMockData(): Promise<void>;
}

export * from "./product-types";

