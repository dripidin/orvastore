"use client";

/**
 * ORVA Store — Phase 7G useDeliveryTracking Hook
 *
 * Manages customer and delivery tracking state, manual courier synchronization,
 * search and filters, and customer multi-order inspection.
 *
 * Invariants:
 * - External tracking refresh NEVER mutates internal order.status.
 * - External tracking refresh NEVER changes orderId, prices, COD, or customer data.
 * - In Live Mode, zero fake tracking data is shown; "Not Connected" is returned.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { getAppRepositoryMode, getOrdersRepository } from "@/lib/orva-api";
import type { OrvaOrder, RepositoryMode } from "@/lib/repository/types";

import {
  computeDeliveryKPIs,
  extractUniqueCustomers,
  filterDeliveryOrders,
  resolveOrderTrackingCode,
} from "./delivery-metrics-calculator";
import type {
  CourierTrackingResult,
  CustomerOrderSummary,
  DeliveryFilterOptions,
  DeliveryKPIMetrics,
} from "./delivery-tracking-types";
import { getMockCourierAdapter } from "./mock-courier-adapter";

const TRACKING_CACHE_KEY = "orva_delivery_tracking_cache_v1";

const DEFAULT_FILTERS: DeliveryFilterOptions = {
  searchTerm: "",
  wilayaCode: "all",
  courierId: "all",
  orvaStatus: "all",
  courierStatus: "all",
  receiptStatus: "all",
  dateRange: "all",
};

export function useDeliveryTracking() {
  const [repoMode, setRepoMode] = useState<RepositoryMode>("mock");
  const [orders, setOrders] = useState<OrvaOrder[]>([]);
  const [trackingMap, setTrackingMap] = useState<Map<string, CourierTrackingResult>>(new Map());
  const [filters, setFilters] = useState<DeliveryFilterOptions>(DEFAULT_FILTERS);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{
    type: "success" | "error" | "info";
    message: string;
    timestamp: number;
  } | null>(null);

  const courierAdapter = useMemo(() => getMockCourierAdapter(), []);

  // 1. Initial Load of Orders and Seed Tracking
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const mode = getAppRepositoryMode();
      setRepoMode(mode);

      const repo = getOrdersRepository();
      const allOrders = await repo.getOrders();
      setOrders(allOrders);

      // Load cached tracking map from storage
      const initialMap = new Map<string, CourierTrackingResult>();
      if (typeof window !== "undefined") {
        try {
          const cached = window.localStorage.getItem(TRACKING_CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
              for (const item of parsed) {
                if (item && item.orderId) {
                  initialMap.set(item.orderId, item);
                }
              }
            }
          }
        } catch {
          // Ignore cache read errors
        }
      }

      // In mock mode, if cache is empty, seed initial tracking for known orders
      if (mode === "mock" && initialMap.size === 0) {
        for (const ord of allOrders) {
          const trackingCode = resolveOrderTrackingCode(ord);
          if (trackingCode) {
            const res = await courierAdapter.getTrackingStatus(trackingCode, ord.id);
            initialMap.set(ord.id, res);
          }
        }

        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(TRACKING_CACHE_KEY, JSON.stringify(Array.from(initialMap.values())));
          } catch {
            // Ignore storage write errors
          }
        }
      }

      setTrackingMap(initialMap);
    } catch (err: any) {
      console.error("Failed to load delivery tracking data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [courierAdapter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Save tracking map to storage whenever updated
  const persistTrackingMap = useCallback((newMap: Map<string, CourierTrackingResult>) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(TRACKING_CACHE_KEY, JSON.stringify(Array.from(newMap.values())));
      } catch {
        // Ignore storage write errors
      }
    }
  }, []);

  // 2. Manual Tracking Refresh for a Single Order
  const refreshOrderTracking = useCallback(
    async (orderId: string) => {
      const targetOrder = orders.find((o) => o.id === orderId);
      if (!targetOrder) return;

      const trackingCode = resolveOrderTrackingCode(targetOrder);
      if (!trackingCode) {
        setSyncFeedback({
          type: "info",
          message: `الطلب ${orderId} ليس لديه رمز تتبع مسجل لدى الناقل حالياً.`,
          timestamp: Date.now(),
        });
        return;
      }

      setSyncingOrderId(orderId);
      setIsSyncing(true);
      try {
        let result: CourierTrackingResult;
        if (repoMode !== "mock") {
          const params = new URLSearchParams({
            action: "track",
            tracking: trackingCode,
          });
          if (targetOrder.courierId) params.set("courierId", targetOrder.courierId);
          const res = await fetch(`/api/delivery?${params.toString()}`, {
            cache: "no-store",
            credentials: "same-origin",
          });
          const json = await res.json().catch(() => null);
          const nowIso = new Date().toISOString();
          if (res.ok && json?.success) {
            const rawCode = String(json.status || "UNKNOWN");
            const rich = await import("./courier-status-mapper").then((m) => m.mapExternalCourierStatus(rawCode));
            result = {
              orderId,
              courierName: targetOrder.courierName || json.courierId || "Redex Express",
              courierId: json.courierId || targetOrder.courierId || "redex",
              trackingCode,
              externalStatusCode: rawCode,
              normalizedStatus: rich.normalizedStatus,
              receiptClassification: rich.receiptClassification,
              lastSyncedAt: nowIso,
              syncResult: "success",
              safeMessage: json.statusAr || rich.labelAr || rawCode,
              timelineEvents: Array.isArray(json.activity)
                ? json.activity.map((a: any, idx: number) => ({
                    id: `${orderId}-act-${idx}`,
                    stepKey: a.status || `step-${idx}`,
                    titleAr: a.statusAr || a.status || "تحديث",
                    titleEn: a.status || "Update",
                    descriptionAr: [a.station, a.driver, a.reason || a.details].filter(Boolean).join(" • "),
                    timestamp: [a.date, a.time].filter(Boolean).join(" ") || null,
                    category: "courier_external",
                    status: "completed",
                  }))
                : [],
            };
          } else {
            result = {
              orderId,
              courierName: targetOrder.courierName || "شركة التوصيل",
              courierId: targetOrder.courierId || "redex",
              trackingCode,
              externalStatusCode: "UNKNOWN",
              normalizedStatus: "UNKNOWN",
              receiptClassification: "Unknown",
              lastSyncedAt: nowIso,
              syncResult: res.status === 404 ? "not_found" : "failed",
              safeMessage: json?.error || "تعذر جلب حالة التتبع الحية",
              timelineEvents: [],
            };
          }
        } else {
          result = await courierAdapter.getTrackingStatus(trackingCode, orderId);
        }

        setTrackingMap((prev) => {
          const next = new Map(prev);
          next.set(orderId, result);
          persistTrackingMap(next);
          return next;
        });

        if (result.syncResult === "success") {
          setSyncFeedback({
            type: "success",
            message: `تم تحديث حالة التتبع بنجاح للطلب ${orderId} (${result.courierName}): ${result.safeMessage}`,
            timestamp: Date.now(),
          });
        } else if (result.syncResult === "not_found") {
          setSyncFeedback({
            type: "info",
            message: `رمز التتبع ${trackingCode} غير مسجل حتى الآن لدى الناقل.`,
            timestamp: Date.now(),
          });
        } else {
          setSyncFeedback({
            type: "error",
            message: `فشل مزامنة التتبع للطلب ${orderId}: ${result.safeMessage}`,
            timestamp: Date.now(),
          });
        }
      } catch (err: any) {
        setSyncFeedback({
          type: "error",
          message: `حدث خطأ أثناء الاتصال بمزود التتبع: ${err?.message || "خطأ غير معروف"}`,
          timestamp: Date.now(),
        });
      } finally {
        setSyncingOrderId(null);
        setIsSyncing(false);
      }
    },
    [orders, courierAdapter, persistTrackingMap],
  );

  // 3. Bulk Manual Tracking Refresh
  const refreshAllTracking = useCallback(async () => {
    setIsSyncing(true);
    try {
      const updatedMap = new Map(trackingMap);
      let successCount = 0;
      let failedCount = 0;

      if (repoMode !== "mock") {
        await fetch("/api/delivery?action=sync_all_active", {
          cache: "no-store",
          credentials: "same-origin",
        }).catch(() => undefined);

        const trackedOrders = orders.filter((o) => Boolean(resolveOrderTrackingCode(o))).slice(0, 40);
        for (const ord of trackedOrders) {
          const trackingCode = resolveOrderTrackingCode(ord)!;
          const res = await fetch(
            `/api/delivery?action=track&tracking=${encodeURIComponent(trackingCode)}${ord.courierId ? `&courierId=${encodeURIComponent(ord.courierId)}` : ""}`,
            { cache: "no-store", credentials: "same-origin" },
          )
            .then((r) => r.json().catch(() => null))
            .catch(() => null);
          if (res?.success) {
            const rawCode = String(res.status || "UNKNOWN");
            const rich = await import("./courier-status-mapper").then((m) => m.mapExternalCourierStatus(rawCode));
            updatedMap.set(ord.id, {
              orderId: ord.id,
              courierName: ord.courierName || res.courierId || "Redex Express",
              courierId: res.courierId || ord.courierId || "redex",
              trackingCode,
              externalStatusCode: rawCode,
              normalizedStatus: rich.normalizedStatus,
              receiptClassification: rich.receiptClassification,
              lastSyncedAt: new Date().toISOString(),
              syncResult: "success",
              safeMessage: res.statusAr || rich.labelAr || rawCode,
              timelineEvents: [],
            });
            successCount++;
          } else {
            failedCount++;
          }
        }
      } else {
        for (const ord of orders) {
          const trackingCode = resolveOrderTrackingCode(ord);
          if (trackingCode) {
            const res = await courierAdapter.getTrackingStatus(trackingCode, ord.id);
            updatedMap.set(ord.id, res);
            if (res.syncResult === "success") successCount++;
            else failedCount++;
          }
        }
      }

      setTrackingMap(updatedMap);
      persistTrackingMap(updatedMap);

      setSyncFeedback({
        type: "success",
        message: `اكتملت مزامنة كافة الشحنات: تم تحديث ${successCount} شحنة بنجاح${failedCount > 0 ? ` (${failedCount} تعذر)` : ""}.`,
        timestamp: Date.now(),
      });
    } catch (err: any) {
      setSyncFeedback({
        type: "error",
        message: "تعذرت مزامنة الشحنات الكلية.",
        timestamp: Date.now(),
      });
    } finally {
      setIsSyncing(false);
    }
  }, [orders, trackingMap, repoMode, courierAdapter, persistTrackingMap]);

  // 4. Reset Tracking Cache
  const resetTrackingCache = useCallback(async () => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(TRACKING_CACHE_KEY);
      } catch {
        // ignore
      }
    }
    await loadData();
  }, [loadData]);

  // 5. Computed KPI Metrics & Filtered Orders
  const kpiMetrics: DeliveryKPIMetrics = useMemo(() => {
    return computeDeliveryKPIs(orders, trackingMap);
  }, [orders, trackingMap]);

  const filteredOrders: OrvaOrder[] = useMemo(() => {
    return filterDeliveryOrders(orders, trackingMap, filters);
  }, [orders, trackingMap, filters]);

  const uniqueCustomers: CustomerOrderSummary[] = useMemo(() => {
    return extractUniqueCustomers(orders);
  }, [orders]);

  const getCustomerOrders = useCallback(
    (customerKey: string): OrvaOrder[] => {
      return orders.filter((o) => {
        const rawPhone = (o.phone || "").replace(/[^\d]/g, "");
        const rawName = (o.customer || "").trim();
        return rawPhone === customerKey || rawName === customerKey || o.id === customerKey;
      });
    },
    [orders],
  );

  return {
    repoMode,
    orders,
    filteredOrders,
    trackingMap,
    filters,
    setFilters,
    kpiMetrics,
    uniqueCustomers,
    getCustomerOrders,
    isLoading,
    isSyncing,
    syncingOrderId,
    syncFeedback,
    refreshOrderTracking,
    refreshAllTracking,
    resetTrackingCache,
    reload: loadData,
  };
}
