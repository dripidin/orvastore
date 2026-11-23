import { throttledCourierFetch } from "./ecotrack-rate-limiter";
import type {
  CourierConnectionResult,
  CourierParcelRequest,
  CourierParcelResponse,
  CourierProvider,
  CourierTrackingStatus,
} from "./types";

/**
 * Maystro Delivery Provider (Algeria)
 * Uses `Authorization: Token <token>` with JSON payloads (`body: JSON.stringify(...)`).
 */
export class MaystroCourierProvider implements CourierProvider {
  readonly id: string;
  readonly name: string;
  readonly supportsStopDesk = true;
  private readonly baseUrl: string;

  constructor(options?: { id?: string; name?: string; baseUrl?: string }) {
    this.id = options?.id || "maystro";
    this.name = options?.name || "Maystro Delivery";
    this.baseUrl = (options?.baseUrl || "https://api.maystro-delivery.com").replace(/\/+$/, "");
  }

  private headers(token: string) {
    return {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async testConnection(credentials?: Record<string, string>): Promise<CourierConnectionResult> {
    const token = credentials?.token || credentials?.apiToken || process.env.MAYSTRO_API_TOKEN || "";
    if (!token) {
      return { success: false, message: "رمز API Token الخاص بـ Maystro غير مضبوط" };
    }
    try {
      const start = Date.now();
      const res = await throttledCourierFetch({
        courierId: this.id,
        url: `${this.baseUrl}/api/shared/wilayas/`,
        endpointLabel: "GET /api/shared/wilayas/ (Maystro)",
        init: { method: "GET", headers: this.headers(token), signal: AbortSignal.timeout(5000) },
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: "تم التحقق من اتصال Maystro Delivery بنجاح", latencyMs };
      }
      return { success: false, message: `رفضت Maystro الاتصال (HTTP ${res.status})`, latencyMs };
    } catch (err: any) {
      return { success: false, message: err?.message || "فشل الاتصال بخادم Maystro" };
    }
  }

  async createParcel(
    request: CourierParcelRequest,
    credentials?: Record<string, string>,
  ): Promise<CourierParcelResponse> {
    const token = credentials?.token || credentials?.apiToken || process.env.MAYSTRO_API_TOKEN || "";
    if (!token) {
      return { success: false, trackingCode: "", error: "بيانات اعتماد Maystro غير مضبوطة" };
    }
    try {
      const res = await throttledCourierFetch({
        courierId: this.id,
        url: `${this.baseUrl}/api/stores/orders/`,
        endpointLabel: "POST /api/stores/orders/ (Maystro)",
        init: {
          method: "POST",
          headers: this.headers(token),
          body: JSON.stringify({
            external_order_id: request.orderNumber,
            customer_name: request.customerName,
            customer_phone: request.customerPhone,
            destination_text: `${request.communeName} — ${request.address}`,
            wilaya: request.wilayaCode,
            commune_name: request.communeName,
            product_price: Math.round(request.amountToCollect),
            delivery_type: request.deliveryType === "STOP_DESK" ? 2 : 1,
            note_to_driver: request.remark || "",
          }),
        },
      });
      const data = await res.json().catch(() => null);
      const tracking = data?.id || data?.tracking || data?.code;
      if (res.ok && tracking) {
        return {
          success: true,
          trackingCode: String(tracking),
          trackingUrl: `${this.baseUrl}/track/${encodeURIComponent(String(tracking))}`,
          rawResponse: data,
        };
      }
      return {
        success: false,
        trackingCode: "",
        error: data?.detail || data?.message || `فشل إنشاء الطرد في Maystro (HTTP ${res.status})`,
        rawResponse: data,
      };
    } catch (err: any) {
      return { success: false, trackingCode: "", error: err?.message || "خطأ اتصال مع Maystro" };
    }
  }

  async getTrackingStatus(trackingCode: string, credentials?: Record<string, string>): Promise<CourierTrackingStatus> {
    const token = credentials?.token || credentials?.apiToken || process.env.MAYSTRO_API_TOKEN || "";
    if (!token) {
      return { status: "UNKNOWN", description: "بيانات اعتماد Maystro مفقودة", updatedAt: new Date().toISOString() };
    }
    try {
      const res = await throttledCourierFetch({
        courierId: this.id,
        url: `${this.baseUrl}/api/stores/orders/${encodeURIComponent(trackingCode)}/`,
        endpointLabel: "GET /api/stores/orders/{id}/ (Maystro)",
        init: { method: "GET", headers: this.headers(token) },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        return {
          status: String(data.status || data.state || "IN_TRANSIT"),
          description: String(data.status_name || data.status || "قيد المعالجة"),
          updatedAt: String(data.updated_at || new Date().toISOString()),
        };
      }
    } catch {
      // Fallback below
    }
    return { status: "UNKNOWN", description: "تعذر جلب حالة التتبع من Maystro", updatedAt: new Date().toISOString() };
  }
}
