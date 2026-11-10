import { DEFAULT_MOCK_ORDERS } from "./mock-orders-dataset";
import type {
  AuditLogEntry,
  BulkStatusUpdateResult,
  IOrdersRepository,
  OrderConversionRecord,
  OrderStatus,
  OrvaOrder,
  PushOrderPayload,
  PushOrderResult,
  ValidateOrderResult,
  RawOrvaOrder,
  RepositoryMode,
  SwitchOrderPayload,
  SwitchOrderResult,
} from "./types";
import { COURIER_DZ_PROVIDERS, generateSyntheticTrackingCode } from "../couriers/courier-catalog";

const STORAGE_KEY = "orva_mock_orders_v2";
const AUDIT_STORAGE_KEY = "orva_mock_audit_logs_v2";

function normalizeRawOrder(raw: RawOrvaOrder): OrvaOrder {
  const id = String(raw.orderId || raw.order_id || raw.id || "");
  const remarks = Array.isArray(raw.remarks)
    ? raw.remarks
    : typeof raw.remarks === "string"
      ? [raw.remarks]
      : [];

  // Extract conversions from remarks
  const conversions: OrderConversionRecord[] = [];
  for (const r of remarks) {
    if (typeof r === "object" && r !== null) {
      const rec = r as any;
      if (rec.event === "ORDER_CONVERSION" || rec.switch_status === "switched") {
        conversions.push(rec);
      }
    } else if (typeof r === "string" && (r.includes("تحويل") || r.includes("ORDER_CONVERSION"))) {
      conversions.push({
        event: "ORDER_CONVERSION",
        switch_status: "switched",
        conversion_sequence: conversions.length + 1,
        timestamp_utc: String(raw.created_at || new Date().toISOString()),
        operator: "Orva Admin",
        reason: r,
      });
    }
  }

  const parseDzd = (val: unknown): number | null => {
    if (typeof val === "number") return val;
    if (typeof val !== "string") return null;
    const num = Number(val.replace(/[^\d]/g, ""));
    return Number.isSafeInteger(num) && num >= 0 ? num : null;
  };

  const priceDzd = parseDzd(raw.priceNum ?? raw.price_num);
  const shippingDzd = parseDzd(raw.shippingFee ?? raw.shipping_fee);
  const grandTotalDzd = parseDzd(raw.grandTotal ?? raw.grand_total);
  const qty = typeof raw.quantity === "number" ? raw.quantity : 1;

  return {
    id,
    createdAt: (raw.created_at || raw.createdAt || raw.date || null) as string | null,
    customer: (raw.fullName || raw.full_name || raw.customer || null) as string | null,
    phone: (raw.phone || raw.phone_number || null) as string | null,
    productName: (raw.productName || raw.product_name || null) as string | null,
    status: (raw.status || "pending").toLowerCase(),
    wilaya: (raw.wilaya || null) as string | null,
    commune: (raw.commune || null) as string | null,
    deliveryType: (raw.deliveryType || raw.delivery_type || "توصيل للمنزل") as string | null,
    priceDzd,
    shippingDzd,
    grandTotalDzd,
    quantity: qty,
    inRedex: Boolean(raw.in_redex || raw.inRedex),
    redexTrackingCode: (raw.redex_tracking_code || raw.redexTrackingCode || null) as string | null,
    carrierStatus: (raw.carrier_status || (Boolean(raw.in_redex || raw.inRedex) ? "prete_a_expedier" : null)) as string | null,
    carrierStatusAr: (raw.carrier_status_ar || (Boolean(raw.in_redex || raw.inRedex) ? "جاهز للإرسال" : null)) as string | null,
    remarks,
    conversions,
    isSwitched: conversions.length > 0,
    conversionCount: conversions.length,
    raw,
  };
}

export class MockOrdersRepository implements IOrdersRepository {
  private mode: RepositoryMode = "mock";
  private orders: RawOrvaOrder[] = [];
  private auditLogs: AuditLogEntry[] = [];
  private initialized = false;
  private broadcastChannel: BroadcastChannel | null = null;
  private syncListenersAttached = false;

  constructor() {
    this.init();
    this.setupCrossTabSync();
  }

  private setupCrossTabSync() {
    if (typeof window === "undefined" || this.syncListenersAttached) return;
    this.syncListenersAttached = true;

    // 1. BroadcastChannel API for modern browsers (instant sub-millisecond cross-tab sync)
    if (typeof window.BroadcastChannel !== "undefined") {
      try {
        this.broadcastChannel = new BroadcastChannel("orva_orders_cross_tab_v2");
        this.broadcastChannel.onmessage = (event) => {
          const data = event.data;
          if (data && (data.type === "ORDERS_UPDATED" || data.type === "ORDERS_RESET")) {
            this.reloadFromStorage();
            window.dispatchEvent(
              new CustomEvent("orva:orders-updated", {
                detail: { source: "broadcast-channel", action: data.action, timestamp: data.timestamp },
              })
            );
          }
        };
      } catch (_) {}
    }

    // 2. Standard window 'storage' event listener for broad cross-tab compatibility
    window.addEventListener("storage", (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === AUDIT_STORAGE_KEY) {
        this.reloadFromStorage();
        window.dispatchEvent(
          new CustomEvent("orva:orders-updated", {
            detail: { source: "storage-event", key: event.key, timestamp: Date.now() },
          })
        );
      }
    });
  }

  public reloadFromStorage(): boolean {
    if (typeof window === "undefined") return false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.orders = parsed;
          this.loadAuditLogs();
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  private notifyUpdate(action: string, orderId?: string) {
    if (typeof window === "undefined") return;

    // Dispatch locally for current tab components
    window.dispatchEvent(
      new CustomEvent("orva:orders-updated", {
        detail: { source: "local", action, orderId, timestamp: Date.now() },
      })
    );

    // Broadcast to other open tabs
    try {
      this.broadcastChannel?.postMessage({
        type: action === "RESET" ? "ORDERS_RESET" : "ORDERS_UPDATED",
        action,
        orderId,
        timestamp: Date.now(),
      });
    } catch (_) {}
  }

  private init() {
    if (typeof window === "undefined") {
      this.orders = [...DEFAULT_MOCK_ORDERS];
      this.initialized = true;
      return;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.orders = parsed;
          this.initialized = true;
          this.loadAuditLogs();
          return;
        }
      }
    } catch (_) {
      // Fallback to default
    }

    this.orders = [...DEFAULT_MOCK_ORDERS];
    this.persist(false);
    this.loadAuditLogs();
    this.initialized = true;
  }

  private persist(notify = true) {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.orders));
        if (notify) {
          this.notifyUpdate("PERSIST");
        }
      } catch (err) {
        console.warn("[MockOrdersRepository] localStorage persist error:", err);
      }
    }
  }

  private loadAuditLogs() {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(AUDIT_STORAGE_KEY);
        if (stored) {
          this.auditLogs = JSON.parse(stored);
          return;
        }
      } catch (_) {}
    }
    this.auditLogs = [];
  }

  private persistAuditLogs() {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(this.auditLogs));
      } catch (_) {}
    }
  }

  private addAudit(action: string, orderId: string, actor: string, details: Record<string, unknown>) {
    const entry: AuditLogEntry = {
      id: `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      action,
      orderId,
      timestamp: new Date().toISOString(),
      actor,
      details,
    };
    this.auditLogs.unshift(entry);
    this.persistAuditLogs();
  }

  getMode(): RepositoryMode {
    return this.mode;
  }

  setMode(mode: RepositoryMode): void {
    this.mode = mode;
  }

  async getOrders(): Promise<OrvaOrder[]> {
    if (!this.initialized) this.init();
    return this.orders.map(normalizeRawOrder);
  }

  async getOrderById(id: string): Promise<OrvaOrder | null> {
    if (!this.initialized) this.init();
    const cleanId = id.trim().toLowerCase();
    const raw = this.orders.find(
      (o) => String(o.orderId || o.id || "").toLowerCase() === cleanId
    );
    return raw ? normalizeRawOrder(raw) : null;
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus | string,
    actor = "Orva Admin"
  ): Promise<OrvaOrder> {
    if (!this.initialized) this.init();
    const index = this.orders.findIndex(
      (o) => String(o.orderId || o.id || "").trim() === orderId.trim()
    );
    if (index === -1) {
      throw new Error(`الطلبية رقم ${orderId} غير موجودة.`);
    }

    const previousStatus = this.orders[index].status;
    const cleanStatus = status.toLowerCase();

    // If changing to shipped and no tracking code, assign mock tracking
    let tracking = this.orders[index].redex_tracking_code;
    let inRedex = this.orders[index].in_redex;
    if (cleanStatus === "shipped" && !tracking) {
      tracking = `RDX-DZ-${Math.floor(100000 + Math.random() * 900000)}`;
      inRedex = true;
    }

    this.orders[index] = {
      ...this.orders[index],
      status: cleanStatus,
      in_redex: inRedex,
      redex_tracking_code: tracking,
    };

    this.persist();
    this.addAudit("STATUS_UPDATE", orderId, actor, {
      from: previousStatus,
      to: cleanStatus,
      tracking,
    });

    return normalizeRawOrder(this.orders[index]);
  }

  async bulkUpdateStatus(
    orderIds: string[],
    status: OrderStatus | string,
    actor = "Orva Admin"
  ): Promise<BulkStatusUpdateResult> {
    if (!this.initialized) this.init();
    const updatedOrderIds: string[] = [];
    let updatedCount = 0;
    let failedCount = 0;

    for (const id of orderIds) {
      try {
        await this.updateOrderStatus(id, status, actor);
        updatedOrderIds.push(id);
        updatedCount++;
      } catch (_) {
        failedCount++;
      }
    }

    return {
      success: updatedCount > 0,
      updatedCount,
      failedCount,
      updatedOrderIds,
    };
  }

  async switchOrder(payload: SwitchOrderPayload): Promise<SwitchOrderResult> {
    if (!this.initialized) this.init();
    const cleanId = payload.orderId.trim();
    const index = this.orders.findIndex(
      (o) => String(o.orderId || o.id || "").trim() === cleanId
    );

    if (index === -1) {
      throw new Error(`الطلبية رقم ${cleanId} غير موجودة.`);
    }

    const existing = this.orders[index];
    const existingStatus = (existing.status || "").toLowerCase();
    if (existingStatus === "delivered" || existingStatus === "cancelled" || existingStatus === "deleted") {
      throw new Error("لا يمكن تحويل الطلبيات المسلّمة أو الملغاة.");
    }

    const currentRemarks = Array.isArray(existing.remarks) ? [...existing.remarks] : [];
    const existingConversions = currentRemarks.filter(
      (r: any) => typeof r === "object" && r !== null && (r.event === "ORDER_CONVERSION" || r.switch_status === "switched")
    );
    const nextSeq = existingConversions.length + 1;

    const diff: Record<string, { from: any; to: any }> = {};
    if (existing.fullName !== payload.fullName) {
      diff.fullName = { from: existing.fullName, to: payload.fullName };
    }
    if (existing.phone !== payload.phone) {
      diff.phone = { from: existing.phone, to: payload.phone };
    }
    if (existing.wilaya !== payload.wilaya) {
      diff.wilaya = { from: existing.wilaya, to: payload.wilaya };
    }
    if (existing.commune !== payload.commune) {
      diff.commune = { from: existing.commune, to: payload.commune };
    }
    if (existing.deliveryType !== payload.deliveryType) {
      diff.deliveryType = { from: existing.deliveryType, to: payload.deliveryType };
    }
    if (existing.shippingFee !== payload.shippingFee) {
      diff.shippingFee = { from: existing.shippingFee, to: payload.shippingFee };
    }
    if (existing.grandTotal !== payload.grandTotal) {
      diff.grandTotal = { from: existing.grandTotal, to: payload.grandTotal };
    }
    if (payload.productName && existing.productName !== payload.productName) {
      diff.productName = { from: existing.productName, to: payload.productName };
    }

    const operatorName = payload.claimedOperatorName?.trim()
      ? `Orva Admin [${payload.claimedOperatorName.trim()}]`
      : "Orva Admin [Dev Session]";

    const conversionRecord: OrderConversionRecord = {
      event: "ORDER_CONVERSION",
      switch_status: "switched",
      conversion_sequence: nextSeq,
      timestamp_utc: new Date().toISOString(),
      operator: operatorName,
      reason: payload.reason.trim(),
      override_applied: Boolean(payload.operatorOverride),
      redex_tracking_code: existing.redex_tracking_code || null,
      previous_product: existing.productName,
      new_product: payload.productName || existing.productName,
      previous_wilaya: existing.wilaya,
      new_wilaya: payload.wilaya,
      previous_total: existing.grandTotal,
      new_total: payload.grandTotal,
      diff,
    };

    currentRemarks.push(conversionRecord);

    // Build formatted Redex dispatch note
    let redexNote = `🔄 [طلب محوّل — Switch Order #${nextSeq}]\n`;
    redexNote += `• رقم الطلبية الأصلي: ${cleanId}\n`;
    redexNote += `• نقطة الانطلاق: بسكرة (07 - Biskra Hub)\n`;
    redexNote += `• المستلم المحدث: ${payload.fullName.trim()} (${payload.phone.trim()})\n`;
    redexNote += `• وجهة التسليم: ${payload.wilaya.trim()} — بلدية: ${payload.commune.trim()}\n`;
    redexNote += `• نوع التوصيل: ${payload.deliveryType.trim()}\n`;
    redexNote += `• المنتج المطلوب: ${payload.productName || existing.productName}\n`;
    redexNote += `• رسوم التوصيل: ${payload.shippingFee}\n`;
    redexNote += `• المبلغ الواجب تحصيله نقداً (COD): ${payload.grandTotal}\n`;
    redexNote += `• سبب التحويل: ${payload.reason.trim()}\n`;
    redexNote += `• المسؤول: ${operatorName}\n`;
    if (existingStatus === "shipped" || existing.in_redex) {
      redexNote += `⚠️ تنبيه: الطلب مشحون مسبقاً، يرجى تحديث بيانات البوليصة يدوياً في لوحة Redex.\n`;
    }

    // Update state while preserving orderId strictly
    this.orders[index] = {
      ...existing,
      fullName: payload.fullName.trim(),
      phone: payload.phone.trim(),
      wilaya: payload.wilaya.trim(),
      commune: payload.commune.trim(),
      deliveryType: payload.deliveryType.trim(),
      shippingFee: payload.shippingFee,
      grandTotal: payload.grandTotal,
      productName: payload.productName || existing.productName,
      priceNum: payload.priceNum ?? existing.priceNum,
      remarks: currentRemarks,
    };

    this.persist();
    this.addAudit("SWITCH_ORDER", cleanId, operatorName, {
      sequence: nextSeq,
      reason: payload.reason,
      diff,
    });

    const updated = normalizeRawOrder(this.orders[index]);

    return {
      success: true,
      orderId: cleanId,
      updatedOrder: updated,
      redexComment: redexNote,
      message: "تم تحويل الطلبية بنجاح وتحديث كافة السجلات محلياً.",
    };
  }

  async pushOrder(payload: PushOrderPayload): Promise<PushOrderResult> {
    if (!this.initialized) this.init();
    const cleanId = payload.orderId.trim();
    const index = this.orders.findIndex(
      (o) => String(o.orderId || o.id || "").trim().toLowerCase() === cleanId.toLowerCase()
    );

    if (index === -1) {
      throw new Error(`الطلبية رقم ${cleanId} غير موجودة.`);
    }

    const existing = this.orders[index];
    const status = (existing.status || "").toLowerCase();
    if (status === "delivered" || status === "cancelled" || status === "deleted") {
      throw new Error("لا يمكن إرسال الطلبيات المسلّمة أو الملغاة.");
    }

    const trackingCode = generateSyntheticTrackingCode(payload.courierId);
    const courier = COURIER_DZ_PROVIDERS.find((c) => c.id === payload.courierId) || COURIER_DZ_PROVIDERS[0];
    const operatorName = payload.operatorName || "Orva Admin";
    const currentRemarks = Array.isArray(existing.remarks) ? [...existing.remarks] : [];

    const dispatchNote = `🚚 [إرسال للشحن — CourierDZ: ${courier.name}]
رقم التتبع: ${trackingCode}
الناقل: ${courier.nameAr} (${courier.family.toUpperCase()})
طريقة التوصيل: ${payload.deliveryType === "desk" ? "استلام من المكتب (Stop Desk)" : "توصيل للمنزل"}
${payload.notes ? `ملاحظات: ${payload.notes}\n` : ""}بواسطة: ${operatorName} في ${new Date().toLocaleString("ar-DZ")}`;

    currentRemarks.unshift({
      event: "ORDER_DISPATCH",
      courier_id: courier.id,
      courier_name: courier.name,
      tracking_code: trackingCode,
      timestamp_utc: new Date().toISOString(),
      operator: operatorName,
      delivery_type: payload.deliveryType || "home",
      notes: payload.notes || "",
    });
    currentRemarks.unshift(dispatchNote);

    const toStation = Boolean(payload.sendToStation);
    this.orders[index] = {
      ...existing,
      status: toStation ? "redex_station" : "pushed",
      in_redex: true,
      redex_tracking_code: trackingCode,
      carrier_status: toStation ? "vers_station" : "prete_a_expedier",
      carrier_status_ar: toStation ? "في الطريق إلى مركز التوزيع" : "جاهز للإرسال",
      deliveryType: payload.deliveryType === "desk" ? "استلام من المكتب (Stop Desk)" : "توصيل للمنزل",
      remarks: currentRemarks,
    };

    this.persist();
    this.addAudit("PUSH_ORDER", cleanId, operatorName, {
      courierId: courier.id,
      courierName: courier.name,
      trackingCode,
      deliveryType: payload.deliveryType,
    });

    const updated = normalizeRawOrder(this.orders[index]);

    return {
      success: true,
      orderId: cleanId,
      trackingCode,
      courierId: courier.id,
      courierName: courier.name,
      labelUrl: `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(trackingCode)}`,
      updatedOrder: updated,
      sentToStation: toStation,
      message: `تم إرسال الطلبية بنجاح إلى شركة ${courier.nameAr}. رقم التتبع: ${trackingCode}`,
    };
  }

  async validateOrder(trackingOrOrderId: string, askCollection: number = 0): Promise<ValidateOrderResult> {
    if (!this.initialized) this.init();
    const clean = trackingOrOrderId.trim().toLowerCase();
    const index = this.orders.findIndex(
      (o) =>
        String(o.orderId || o.id || "").trim().toLowerCase() === clean ||
        String(o.trackingCode || (o as any).redex_tracking_code || "").trim().toLowerCase() === clean
    );

    const trackingCode = index !== -1
      ? String(this.orders[index].trackingCode || (this.orders[index] as any).redex_tracking_code || clean)
      : clean;

    const carrierStatus = askCollection === 1 ? "en_ramassage" : "vers_station";
    const carrierStatusAr = askCollection === 1 ? "قيد الاستلام من المتجر" : "في الطريق إلى مركز التوزيع";

    if (index !== -1) {
      (this.orders[index] as any).carrier_status = carrierStatus;
      (this.orders[index] as any).carrier_status_ar = carrierStatusAr;
      (this.orders[index] as any).validated = true;
      (this.orders[index] as any).validation_lifecycle = "SYNCHRONIZED";
      this.persist();
      this.notifyUpdate("VALIDATE_ORDER");
    }

    return {
      success: true,
      trackingCode,
      status: carrierStatus,
      carrierStatus,
      carrierStatusAr,
      askCollection,
      message: `تم تأكيد إرسالية الطرد بنجاح لدى Redex Express (${carrierStatusAr}). رقم التتبع: ${trackingCode}`,
    };
  }

  async deleteOrder(orderId: string): Promise<boolean> {
    if (!this.initialized) this.init();
    const cleanId = orderId.trim();
    const index = this.orders.findIndex(
      (o) => String(o.orderId || o.id || "").trim().toLowerCase() === cleanId.toLowerCase()
    );
    if (index !== -1) {
      this.orders.splice(index, 1);
      this.persist();
      this.notifyUpdate("DELETE_ORDER");
      return true;
    }
    return false;
  }

  async getAuditLogs(): Promise<AuditLogEntry[]> {
    if (!this.initialized) this.init();
    return [...this.auditLogs];
  }

  async resetToDefaultMockData(): Promise<void> {
    this.orders = [...DEFAULT_MOCK_ORDERS];
    this.auditLogs = [];
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(AUDIT_STORAGE_KEY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.orders));
      } catch (_) {}
    }
    this.initialized = true;
    this.notifyUpdate("RESET");
  }
}
