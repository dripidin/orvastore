export const orderFilters = [
  "All",
  "Pending",
  "Confirmed",
  "Shipped",
  "Delivered",
  "Returned",
  "Cancelled",
  "Switched Only",
  "Risk",
] as const;

export type OrderFilter = (typeof orderFilters)[number];

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
  redex_tracking_code?: string | null;
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
