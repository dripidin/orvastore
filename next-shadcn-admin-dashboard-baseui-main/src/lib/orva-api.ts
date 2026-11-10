export type RawOrvaOrder = Record<string, unknown>;

export interface OrvaOrder {

  id: string;
  createdAt: string | null;
  customer: string | null;
  phone: string | null;
  productName: string | null;
  status: string;
  wilaya: string | null;
  commune: string | null;
  deliveryType: string | null;
  priceDzd: number | null;
  shippingDzd: number | null;
  grandTotalDzd: number | null;
  quantity: number | null;
  inRedex: boolean;
  redexTrackingCode: string | null;
  carrierStatus?: string | null;
  carrierStatusAr?: string | null;
  remarks: unknown[];
  conversions?: any[];
  isSwitched?: boolean;
  conversionCount?: number;
  riskScore?: number;
  riskLevel?: string;
  riskDecision?: string;
  riskReasons?: string[];
  raw: RawOrvaOrder;
}


interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  error_code?: string;
}

export class OrvaApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code?: string) {
    super(getSafeApiMessage(status));
    this.name = "OrvaApiError";
    this.status = status;
    this.code = code;
  }
}

function getSafeApiMessage(status: number) {
  if (status === 401 || status === 403) return "انتهت جلسة الإدارة أو لا تملك صلاحية هذا الإجراء. سجّل الدخول مجددًا.";
  if (status === 404) return "خدمة الإدارة المطلوبة غير متاحة على هذا الخادم.";
  if (status === 409 || status === 422) return "تعذر تنفيذ الإجراء بسبب حالة الطلب الحالية.";
  if (status >= 500) return "تعذر إكمال الإجراء من الخادم. حاول مرة أخرى لاحقًا.";
  return "تعذر إكمال الإجراء. راجع البيانات وحاول مرة أخرى.";
}

export async function orvaFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (typeof window !== "undefined" && !headers.has("Authorization")) {
    try {
      const token = window.localStorage.getItem("orva_admin_token");
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // Ignore storage access errors
    }
  }

  return fetch(input, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });
}

export async function orvaRequestJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await orvaFetch(input, init);
  } catch {
    throw new OrvaApiError(0);
  }

  const payload = (await response.json().catch(() => null)) as (ApiEnvelope<T> & T) | null;
  if (!response.ok || !payload || payload.success === false) {
    throw new OrvaApiError(response.status, payload?.error_code ?? payload?.error);
  }

  return payload;
}

import { getOrdersRepository } from "./repository/orders-repository-factory";
export { getOrdersRepository, getAppRepositoryMode, setAppRepositoryMode } from "./repository/orders-repository-factory";
export type { IOrdersRepository, RepositoryMode, SwitchOrderPayload, SwitchOrderResult, PushOrderPayload, PushOrderResult, BulkStatusUpdateResult, AuditLogEntry } from "./repository/types";

export async function fetchOrvaOrders(): Promise<OrvaOrder[]> {
  try {
    const repo = getOrdersRepository();
    const orders = await repo.getOrders();
    return orders;
  } catch (err) {
    throw new OrvaApiError(500, err instanceof Error ? err.message : undefined);
  }
}

export function normalizeOrvaOrder(value: unknown): OrvaOrder | null {

  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const raw = value as RawOrvaOrder;
  const id = readString(raw, "orderId", "order_id", "id");
  if (!id) return null;

  const remarks = readRemarks(raw.remarks);
  const conversions: any[] = [];
  for (const r of remarks) {
    if (typeof r === "object" && r !== null) {
      const rec = r as any;
      if (rec.event === "ORDER_CONVERSION" || rec.switch_status === "switched") {
        conversions.push(rec);
      }
    } else if (typeof r === "string" && (r.includes("تحويل") || r.includes("ORDER_CONVERSION"))) {
      conversions.push({ event: "ORDER_CONVERSION", switch_status: "switched", reason: r });
    }
  }

  return {

    id,
    createdAt: readOptionalString(raw, "created_at", "createdAt", "date"),
    customer: readOptionalString(raw, "fullName", "full_name", "customer", "customer_name", "customerName"),
    phone: readOptionalString(raw, "phone", "phone_number", "customer_phone", "customerPhone"),
    productName: readOptionalString(raw, "productName", "product_name", "product", "product_title", "productTitle"),
    status: readString(raw, "status").toLowerCase() || "unknown",
    wilaya: readOptionalString(raw, "wilaya"),
    commune: readOptionalString(raw, "commune"),
    deliveryType: readOptionalString(raw, "deliveryType", "delivery_type"),
    ...(() => {
      const rawGrandTotal = readDzdAmount(raw.grandTotal ?? raw.grand_total);
      const rawPriceNum = readDzdAmount(raw.priceNum ?? raw.price_num);
      const shippingDzd = readDzdAmount(raw.shippingFee ?? raw.shipping_fee) ?? (rawGrandTotal && rawPriceNum && rawGrandTotal > rawPriceNum ? rawGrandTotal - rawPriceNum : 0);
      const rawProductTotal = readDzdAmount(raw.productTotal ?? raw.product_total);

      let priceDzd = rawProductTotal;
      let grandTotalDzd = rawGrandTotal;

      if (priceDzd === null) {
        if (rawGrandTotal !== null && shippingDzd > 0 && rawGrandTotal > shippingDzd && rawPriceNum === rawGrandTotal) {
          priceDzd = rawGrandTotal - shippingDzd;
        } else {
          priceDzd = rawPriceNum;
        }
      }

      if (grandTotalDzd === null && priceDzd !== null) {
        grandTotalDzd = priceDzd + shippingDzd;
      }

      return {
        priceDzd,
        shippingDzd,
        grandTotalDzd,
      };
    })(),
    quantity: readQuantity(raw.quantity ?? raw.qty),
    inRedex: raw.in_redex === true || raw.inRedex === true,
    redexTrackingCode: readOptionalString(raw, "redex_tracking_code", "redexTrackingCode"),
    carrierStatus: readOptionalString(raw, "carrier_status", "carrierStatus") || ((raw.in_redex === true || raw.inRedex === true) ? "prete_a_expedier" : null),
    carrierStatusAr: readOptionalString(raw, "carrier_status_ar", "carrierStatusAr") || ((raw.in_redex === true || raw.inRedex === true) ? "جاهز للإرسال" : null),
    remarks,
    conversions,
    isSwitched: conversions.length > 0,
    conversionCount: conversions.length,
    riskScore: (() => {
      const n = Number(raw.riskScore ?? raw.risk_score ?? 0);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
    })(),
    riskLevel: readString(raw, "riskLevel", "risk_level") || "LOW",
    riskDecision: readString(raw, "riskDecision", "risk_decision") || "ALLOW",
    riskReasons: (() => {
      const v = raw.riskReasons ?? raw.risk_reasons;
      if (Array.isArray(v)) return v.map(String).filter(Boolean);
      if (typeof v === "string" && v.trim()) {
        return v.split("|").map((s) => s.trim()).filter(Boolean);
      }
      return [];
    })(),
    raw,
  };
}


export function readString(record: RawOrvaOrder, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return "";
}

export function readOptionalString(record: RawOrvaOrder, ...keys: string[]): string | null {
  return readString(record, ...keys) || null;
}

export function readDzdAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;

  const cleaned = value.replace(/[\s\u00a0]/g, "").replace(/[.,](?=\d{3}(?:\D|$))/g, "");
  const digits = cleaned.replace(/[^\d]/g, "");
  if (!digits) return null;

  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function formatDzd(amount: number | null | undefined) {
  return amount === null || amount === undefined ? "غير متوفر" : `${new Intl.NumberFormat("fr-DZ").format(amount)} د.ج`;
}

function readQuantity(value: unknown): number | null {
  const quantity = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

function readRemarks(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value.trim() ? [value] : [];
    } catch {
      return value.trim() ? [value] : [];
    }
  }
  return [];
}
