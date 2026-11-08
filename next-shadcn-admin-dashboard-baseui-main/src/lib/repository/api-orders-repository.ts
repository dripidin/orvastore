import type {
  AuditLogEntry,
  BulkStatusUpdateResult,
  IOrdersRepository,
  OrderStatus,
  OrvaOrder,
  PushOrderPayload,
  PushOrderResult,
  RepositoryMode,
  SwitchOrderPayload,
  SwitchOrderResult,
} from "./types";

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  error_code?: string;
  message?: string;
}

export class ApiOrdersRepository implements IOrdersRepository {
  private mode: RepositoryMode = "live";

  getMode(): RepositoryMode {
    return this.mode;
  }

  setMode(mode: RepositoryMode): void {
    this.mode = mode;
  }

  private async requestJson<T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> {
    const response = await fetch(input, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
    });

    const payload = (await response.json().catch(() => null)) as (ApiEnvelope<T> & T) | null;
    if (!response.ok || !payload || payload.success === false) {
      throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
    }
    return payload;
  }

  async getOrders(): Promise<OrvaOrder[]> {
    const res = await this.requestJson<ApiEnvelope<any[]>>("/api/delivery?action=get_all_orders");
    if (!Array.isArray(res.data)) return [];
    const { normalizeOrvaOrder } = await import("@/lib/orva-api");
    return res.data.map(normalizeOrvaOrder).filter((o): o is OrvaOrder => o !== null);
  }

  async getOrderById(id: string): Promise<OrvaOrder | null> {
    const orders = await this.getOrders();
    const cleanId = id.trim().toLowerCase();
    return orders.find((o) => o.id.toLowerCase() === cleanId) || null;
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus | string,
    actor?: string
  ): Promise<OrvaOrder> {
    await this.requestJson("/api/delivery?action=update_status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, status, actor }),
    });
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error("تعذر جلب تفاصيل الطلبية بعد التحديث.");
    return order;
  }

  async bulkUpdateStatus(
    orderIds: string[],
    status: OrderStatus | string,
    actor?: string
  ): Promise<BulkStatusUpdateResult> {
    const res = await this.requestJson<any>("/api/delivery?action=bulk_update_status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds, status, actor }),
    });

    return {
      success: true,
      updatedCount: res.updatedCount || orderIds.length,
      failedCount: res.failedCount || 0,
      updatedOrderIds: res.updatedOrderIds || orderIds,
    };
  }

  async switchOrder(payload: SwitchOrderPayload): Promise<SwitchOrderResult> {
    const res = await this.requestJson<any>("/api/delivery?action=switch_order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const updated = await this.getOrderById(payload.orderId);
    return {
      success: true,
      orderId: payload.orderId,
      updatedOrder: updated as OrvaOrder,
      redexComment: res.redexComment || "",
      message: res.message || "تم تحويل الطلبية بنجاح عبر الخادم.",
    };
  }

  async pushOrder(payload: PushOrderPayload): Promise<PushOrderResult> {
    const res = await this.requestJson<any>("/api/delivery?action=create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let updated: OrvaOrder | null = null;
    try {
      updated = await this.getOrderById(payload.orderId);
    } catch {
      updated = null;
    }
    const tracking = res.trackingCode || res.trackingNumber || res.data?.tracking_code || res.data?.trackingCode || "";
    return {
      success: true,
      orderId: payload.orderId,
      trackingCode: tracking,
      courierId: payload.courierId,
      courierName: payload.courierName || res.courierName || res.courier || payload.courierId,
      labelUrl: res.labelUrl || (tracking ? `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(tracking)}` : undefined),
      updatedOrder: updated as OrvaOrder,
      message: res.message || "تم إرسال الطلبية بنجاح إلى شركة التوصيل.",
    };
  }

  async deleteOrder(orderId: string): Promise<boolean> {
    const res = await this.requestJson<any>("/api/delivery?action=delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    return res.success === true;
  }

  async getAuditLogs(): Promise<AuditLogEntry[]> {
    try {
      const res = await this.requestJson<ApiEnvelope<AuditLogEntry[]>>("/api/delivery?action=audit_logs");
      return Array.isArray(res.data) ? res.data : [];
    } catch (_) {
      return [];
    }
  }

  async resetToDefaultMockData(): Promise<void> {
    // No-op for remote API
  }
}
