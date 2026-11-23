import { throttledCourierFetch } from "./ecotrack-rate-limiter";
import type {
  CourierConnectionResult,
  CourierParcelRequest,
  CourierParcelResponse,
  CourierProvider,
  CourierTrackingStatus,
} from "./types";

/**
 * NOEST Express Provider (Algeria)
 * Auth: POST body / query `api_token` + `user_guid`
 */
export class NoestCourierProvider implements CourierProvider {
  readonly id: string;
  readonly name: string;
  readonly supportsStopDesk = true;
  private readonly baseUrl: string;

  constructor(options?: { id?: string; name?: string; baseUrl?: string }) {
    this.id = options?.id || "noest";
    this.name = options?.name || "NOEST Express";
    this.baseUrl = (options?.baseUrl || "https://app.noest-dz.com").replace(/\/+$/, "");
  }

  async testConnection(credentials?: Record<string, string>): Promise<CourierConnectionResult> {
    const apiToken = credentials?.apiToken || credentials?.token || process.env.NOEST_API_TOKEN || "";
    const userGuid = credentials?.apiId || credentials?.accountId || process.env.NOEST_USER_GUID || "";
    if (!apiToken || !userGuid) {
      return { success: false, message: "مطلوب رمز API Token و User GUID لشركة NOEST" };
    }
    try {
      const start = Date.now();
      const res = await throttledCourierFetch({
        courierId: this.id,
        url: `${this.baseUrl}/api/public/fees`,
        endpointLabel: "POST /api/public/fees (NOEST)",
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ api_token: apiToken, user_guid: userGuid }),
          signal: AbortSignal.timeout(5000),
        },
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { success: true, message: "تم التحقق من اتصال NOEST Express بنجاح", latencyMs };
      }
      return { success: false, message: `رفضت NOEST الاتصال (HTTP ${res.status})`, latencyMs };
    } catch (err: any) {
      return { success: false, message: err?.message || "تعذر الاتصال بخادم NOEST Express" };
    }
  }

  async createParcel(
    request: CourierParcelRequest,
    credentials?: Record<string, string>,
  ): Promise<CourierParcelResponse> {
    const apiToken = credentials?.apiToken || credentials?.token || process.env.NOEST_API_TOKEN || "";
    const userGuid = credentials?.apiId || credentials?.accountId || process.env.NOEST_USER_GUID || "";
    if (!apiToken || !userGuid) {
      return { success: false, trackingCode: "", error: "بيانات اعتماد NOEST غير مضبوطة" };
    }

    try {
      const res = await throttledCourierFetch({
        courierId: this.id,
        url: `${this.baseUrl}/api/public/create/order`,
        endpointLabel: "POST /api/public/create/order (NOEST)",
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            api_token: apiToken,
            user_guid: userGuid,
            reference: request.orderNumber,
            client: request.customerName,
            phone: request.customerPhone,
            phone_2: request.customerPhone2 || "",
            adresse: request.address,
            wilaya_id: request.wilayaCode > 58 ? request.wilayaCode : request.wilayaCode,
            commune: request.communeName,
            montant: Math.round(request.amountToCollect),
            produit: request.productDescription,
            remarque: request.remark || "",
            type_id: request.orderType ?? 1,
            poids: request.weightKg ?? 1,
            stop_desk: request.deliveryType === "STOP_DESK" ? 1 : 0,
            station_code: request.stopDeskId || undefined,
          }),
        },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && (data?.tracking || data?.order_tracking)) {
        const tracking = String(data.tracking || data.order_tracking);
        return {
          success: true,
          trackingCode: tracking,
          trackingUrl: `${this.baseUrl}/tracking/${encodeURIComponent(tracking)}`,
          rawResponse: data,
        };
      }
      return {
        success: false,
        trackingCode: "",
        error: data?.message || `فشل إنشاء الطرد في NOEST (HTTP ${res.status})`,
        rawResponse: data,
      };
    } catch (err: any) {
      return { success: false, trackingCode: "", error: err?.message || "خطأ اتصال مع NOEST" };
    }
  }

  async getTrackingStatus(trackingCode: string, credentials?: Record<string, string>): Promise<CourierTrackingStatus> {
    const apiToken = credentials?.apiToken || credentials?.token || process.env.NOEST_API_TOKEN || "";
    const userGuid = credentials?.apiId || credentials?.accountId || process.env.NOEST_USER_GUID || "";
    if (!apiToken || !userGuid) {
      return { status: "UNKNOWN", description: "بيانات اعتماد NOEST مفقودة", updatedAt: new Date().toISOString() };
    }

    try {
      const res = await throttledCourierFetch({
        courierId: this.id,
        url: `${this.baseUrl}/api/public/get/trackings/info`,
        endpointLabel: "POST /api/public/get/trackings/info (NOEST)",
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ api_token: apiToken, user_guid: userGuid, trackings: [trackingCode] }),
        },
      });
      const data = await res.json().catch(() => null);
      const entry = data?.[trackingCode] || data?.data?.[0] || null;
      if (entry) {
        const activity = Array.isArray(entry.activity) ? entry.activity : [];
        const latest = activity[activity.length - 1];
        return {
          status: String(latest?.event || entry.status || "IN_TRANSIT"),
          description: String(latest?.event || entry.status || "في مسار التوصيل"),
          updatedAt: latest?.date || new Date().toISOString(),
        };
      }
    } catch {
      // Fallback below
    }
    return { status: "UNKNOWN", description: "تعذر جلب حالة التتبع من NOEST", updatedAt: new Date().toISOString() };
  }
}
