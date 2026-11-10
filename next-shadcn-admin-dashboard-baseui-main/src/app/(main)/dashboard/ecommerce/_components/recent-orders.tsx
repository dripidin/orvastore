"use client";

import * as React from "react";
import type {
  PaginationState,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Filter,
  MapPin,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Truck,
  X,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { ALGERIA_WILAYAS } from "@/data/algeria-locations";
import { dataTableFeatures } from "@/lib/data-table-features";
import { fetchOrvaOrders, formatDzd, getOrdersRepository, orvaRequestJson } from "@/lib/orva-api";

import { OrderDetailsDrawer } from "./order-details-drawer";
import { OrderSwitchDialog } from "./order-switch-dialog";
import { OrderPushDialog } from "./order-push-dialog";
import { RiskOverrideDialog } from "./risk-override-dialog";
import { createRecentOrdersColumns } from "./recent-orders-table/columns";
import { orderFilters, type OrderFilter, type OrderRow } from "./recent-orders-table/schema";

const allowedStatusTransitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "pending"],
  pushed: ["cancelled"],
  redex_station: ["cancelled"],
  cancelled: ["pending"],
  returned: ["pending"],
};

function extractConversionsFromRemarks(remarks: any): {
  conversions: any[];
  isSwitched: boolean;
  count: number;
} {
  const convList: any[] = [];
  if (!remarks) return { conversions: [], isSwitched: false, count: 0 };

  const list = Array.isArray(remarks) ? remarks : [remarks];
  for (const r of list) {
    if (typeof r === "object" && r !== null) {
      if (r.event === "ORDER_CONVERSION" || r.switch_status === "switched") {
        convList.push(r);
      }
    } else if (typeof r === "string") {
      if (r.includes("تحويل") || r.includes("Modifié par") || r.includes("ORDER_CONVERSION")) {
        convList.push({
          event: "ORDER_CONVERSION",
          switch_status: "switched",
          summary: r,
          reason: r,
          conversion_sequence: convList.length + 1,
        });
      }
    }
  }

  return {
    conversions: convList,
    isSwitched: convList.length > 0,
    count: convList.length,
  };
}

function matchesDateFilter(dateStr: string, range: string): boolean {
  if (range === "ALL") return true;
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    if (isNaN(d.getTime())) return true;
    if (range === "TODAY") {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }
    const diffDays = (now.getTime() - d.getTime()) / (1000 * 3600 * 24);
    if (range === "LAST_7") return diffDays <= 7;
    if (range === "LAST_30") return diffDays <= 30;
  } catch (e) {
    return true;
  }
  return true;
}

function matchesWilayaFilter(orderWilaya: string, selectedCode: string): boolean {
  if (selectedCode === "ALL") return true;
  if (!orderWilaya) return false;
  const match = orderWilaya.trim().match(/^(\d{1,2})/);
  if (match) {
    return parseInt(match[1], 10) === parseInt(selectedCode, 10);
  }
  const found = ALGERIA_WILAYAS.find(w => w.id === selectedCode);
  if (found) {
    return orderWilaya.includes(found.arName) || orderWilaya.includes(found.code);
  }
  return false;
}

function exportOrdersToCsv(ordersToExport: OrderRow[], filenamePrefix = "orva-orders") {
  const headers = [
    "معرف الطلبية",
    "تاريخ الإنشاء",
    "اسم الزبون",
    "رقم الهاتف",
    "الولاية",
    "البلدية",
    "نوع التوصيل",
    "المنتج / العرض",
    "رسوم الشحن",
    "إجمالي التحصيل COD",
    "الحالة التشغيلية",
    "حالة التحويل",
    "عدد التحويلات",
    "كود تتبع Redex",
  ];

  const rows = ordersToExport.map((o) => [
    `"${o.id}"`,
    `"${o.date}"`,
    `"${(o.customer || "").replace(/"/g, '""')}"`,
    `"${(o.phone || "").replace(/"/g, '""')}"`,
    `"${(o.wilaya || "").replace(/"/g, '""')}"`,
    `"${(o.commune || "").replace(/"/g, '""')}"`,
    `"${(o.deliveryType || "").replace(/"/g, '""')}"`,
    `"${(o.items || "").replace(/"/g, '""')}"`,
    `"${(o.shippingFee || "").replace(/"/g, '""')}"`,
    `"${(o.total || "").replace(/"/g, '""')}"`,
    `"${o.status}"`,
    `"${o.isSwitched ? "محوّل" : "أصلي"}"`,
    `"${o.conversionCount}"`,
    `"${o.redex_tracking_code || ""}"`,
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function RecentOrders() {
  const [orders, setOrders] = React.useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeFilter, setActiveFilter] = React.useState<OrderFilter>("All");
  const [selectedWilayaFilter, setSelectedWilayaFilter] = React.useState("ALL");
  const [selectedDateFilter, setSelectedDateFilter] = React.useState("ALL");

  const [selectedOrderForDetails, setSelectedOrderForDetails] = React.useState<OrderRow | null>(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = React.useState(false);

  const [selectedOrderForSwitch, setSelectedOrderForSwitch] = React.useState<OrderRow | null>(null);
  const [switchDialogOpen, setSwitchDialogOpen] = React.useState(false);

  const [selectedOrderForPush, setSelectedOrderForPush] = React.useState<OrderRow | null>(null);
  const [pushDialogOpen, setPushDialogOpen] = React.useState(false);
  const [selectedOrderForRisk, setSelectedOrderForRisk] = React.useState<OrderRow | null>(null);
  const [riskDialogOpen, setRiskDialogOpen] = React.useState(false);

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [pendingStatusById, setPendingStatusById] = React.useState<Record<string, boolean>>({});
  const pendingStatusIds = React.useRef(new Set<string>());
  const [isBulkUpdating, setIsBulkUpdating] = React.useState(false);
  const [isSyncingRedex, setIsSyncingRedex] = React.useState(false);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "date", desc: true }]);
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const fetchOrders = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const sourceOrders = await fetchOrvaOrders();
      setOrders(
        sourceOrders.map((order) => {
          const { conversions, isSwitched, count } = extractConversionsFromRemarks(order.remarks);
          return {
            id: order.id,
            date: order.createdAt || "",
            customer: order.customer || "—",
            phone: order.phone || "",
            wilaya: order.wilaya || "—",
            commune: order.commune || "—",
            deliveryType: order.deliveryType || "—",
            status: order.status,
            total: formatDzd(order.grandTotalDzd),
            items: order.productName || "تفاصيل المنتجات غير متوفرة",
            priceNum: order.priceDzd,
            shippingFee: formatDzd(order.shippingDzd),
            in_redex: order.inRedex,
            redex_tracking_code: order.redexTrackingCode,
            carrier_status: order.carrierStatus || (order.inRedex ? "prete_a_expedier" : null),
            carrier_status_ar: order.carrierStatusAr || (order.inRedex ? "جاهز للإرسال" : null),
            remarks: order.remarks,
            conversions,
            isSwitched,
            conversionCount: count,
            riskScore: order.riskScore || 0,
            riskLevel: order.riskLevel || "LOW",
            riskDecision: order.riskDecision || "ALLOW",
            riskReasons: order.riskReasons || [],
            rawOrder: order.raw,
          };
        }),
      );
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "تعذر تحميل بيانات الطلبات.";
      setOrders([]);
      setRowSelection({});
      setLoadError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchOrders();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const handleSync = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void fetchOrders();
      }, 50);
    };
    window.addEventListener("orva:orders-updated", handleSync);
    window.addEventListener("orva:repository-mode-changed", handleSync);

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== "undefined" && "BroadcastChannel" in window) {
        channel = new BroadcastChannel("orva_orders_channel");
        channel.onmessage = (event) => {
          if (event.data?.type === "ORDER_CREATED") {
            handleSync();
          }
        };
      }
    } catch (_) {}

    // Visibility-aware soft poll (classic panel used 20s; keep quieter)
    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchOrders();
    }, 30000);

    return () => {
      if (timer) clearTimeout(timer);
      window.clearInterval(pollId);
      if (channel) {
        try {
          channel.close();
        } catch (_) {}
      }
      window.removeEventListener("orva:orders-updated", handleSync);
      window.removeEventListener("orva:repository-mode-changed", handleSync);
    };
  }, [fetchOrders]);


  // Handle URL hash for direct filtering (e.g. #orders, #switched)
  React.useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash;
      if (hash === "#switched") {
        setActiveFilter("Switched Only");
      } else if (hash === "#risk") {
        setActiveFilter("Risk");
      } else if (hash === "#orders") {
        setActiveFilter("All");
      }
    };
    checkHash();
    window.addEventListener("hashchange", checkHash);
    return () => window.removeEventListener("hashchange", checkHash);
  }, []);

  // Handle URL search query (e.g. ?orderId=PACK2-67904 from Telegram direct notification)
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const targetOrderId = params.get("orderId");
      if (targetOrderId && targetOrderId.trim()) {
        const cleanTarget = targetOrderId.trim().toLowerCase();
        setSearchQuery(targetOrderId.trim());
        setActiveFilter("All");

        const match = orders.find(
          (o) =>
            (o.id && o.id.toLowerCase() === cleanTarget) ||
            (o.rawOrder?.order_id && String(o.rawOrder.order_id).toLowerCase() === cleanTarget) ||
            (o.rawOrder?.id && String(o.rawOrder.id).toLowerCase() === cleanTarget)
        );
        if (match) {
          setSelectedOrderForDetails(match);
        }
      }
    }
  }, [orders]);

  // Multi-Criteria Filtered orders calculation
  const filteredOrders = React.useMemo(() => {
    return orders.filter((order) => {
      // 1. Text Search Query (ID, Customer, Phone, Wilaya, Commune)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = (order.id || "").toLowerCase().includes(q);
        const matchesName = (order.customer || "").toLowerCase().includes(q);
        const matchesPhone = (order.phone || "").toLowerCase().includes(q);
        const matchesWilaya = (order.wilaya || "").toLowerCase().includes(q);
        const matchesCommune = (order.commune || "").toLowerCase().includes(q);
        if (!matchesId && !matchesName && !matchesPhone && !matchesWilaya && !matchesCommune) {
          return false;
        }
      }

      // 2. Status Tab Filter
      const s = (order.status || "").toLowerCase();
      const cs = (order.carrier_status || "").toLowerCase();
      if (activeFilter === "Pending" && s !== "pending") return false;
      if (activeFilter === "Confirmed" && !(s === "confirmed" && !order.in_redex)) return false;
      if (
        activeFilter === "Pushed to Redex" &&
        !(
          s === "pushed" ||
          (Boolean(order.in_redex) &&
            s !== "redex_station" &&
            cs !== "vers_station" &&
            cs !== "vers_hub" &&
            s !== "shipped" &&
            s !== "delivered" &&
            s !== "returned" &&
            s !== "cancelled")
        )
      )
        return false;
      if (activeFilter === "Shipped" && !(s === "shipped" || Boolean(order.in_redex))) return false;
      if (activeFilter === "Delivered" && s !== "delivered") return false;
      if (activeFilter === "Returned" && s !== "returned") return false;
      if (activeFilter === "Cancelled" && !(s === "cancelled" || s === "deleted")) return false;
      if (activeFilter === "Switched Only" && !order.isSwitched) return false;
      if (
        activeFilter === "Risk" &&
        !(
          (order.riskScore && order.riskScore >= 40) ||
          order.riskLevel === "HIGH" ||
          order.riskDecision === "BLOCK" ||
          order.riskDecision === "REVIEW" ||
          s === "review"
        )
      ) {
        return false;
      }

      // 3. Wilaya Filter Dropdown
      if (!matchesWilayaFilter(order.wilaya, selectedWilayaFilter)) {
        return false;
      }

      // 4. Date Range Filter Dropdown
      if (!matchesDateFilter(order.date, selectedDateFilter)) {
        return false;
      }

      return true;
    });
  }, [orders, searchQuery, activeFilter, selectedWilayaFilter, selectedDateFilter]);

  // Dynamic filter counts
  const filterCounts = React.useMemo(() => {
    return {
      All: orders.length,
      Pending: orders.filter((o) => o.status === "pending").length,
      Confirmed: orders.filter((o) => o.status === "confirmed" && !o.in_redex).length,
      "Pushed to Redex": orders.filter((o) => {
        const s = (o.status || "").toLowerCase();
        const cs = (o.carrier_status || "").toLowerCase();
        return (
          s === "pushed" ||
          (Boolean(o.in_redex) &&
            s !== "redex_station" &&
            cs !== "vers_station" &&
            cs !== "vers_hub" &&
            s !== "shipped" &&
            s !== "delivered" &&
            s !== "returned" &&
            s !== "cancelled")
        );
      }).length,
      "Redex Station": orders.filter((o) => {
        const s = (o.status || "").toLowerCase();
        const cs = (o.carrier_status || "").toLowerCase();
        return s === "redex_station" || cs === "vers_station" || cs === "vers_hub";
      }).length,
      Shipped: orders.filter((o) => o.status === "shipped" || Boolean(o.in_redex)).length,
      Delivered: orders.filter((o) => o.status === "delivered").length,
      Returned: orders.filter((o) => o.status === "returned").length,
      Cancelled: orders.filter((o) => o.status === "cancelled" || o.status === "deleted").length,
      "Switched Only": orders.filter((o) => o.isSwitched).length,
      Risk: orders.filter(
        (o) =>
          (o.riskScore && o.riskScore >= 40) ||
          o.riskLevel === "HIGH" ||
          o.riskDecision === "BLOCK" ||
          o.riskDecision === "REVIEW" ||
          o.status === "review",
      ).length,
    };
  }, [orders]);

  const handleOpenDetails = React.useCallback((row: OrderRow) => {
    setSelectedOrderForDetails(row);
    setDetailsDrawerOpen(true);
  }, []);

  const handleOpenSwitchDialog = React.useCallback((row: OrderRow) => {
    setSelectedOrderForSwitch(row);
    setSwitchDialogOpen(true);
  }, []);

  const handleOpenPushDialog = React.useCallback((row: OrderRow) => {
    setSelectedOrderForPush(row);
    setPushDialogOpen(true);
  }, []);

  const handleOpenRiskDialog = React.useCallback((row: OrderRow) => {
    setSelectedOrderForRisk(row);
    setRiskDialogOpen(true);
  }, []);

  const handleRiskUpdated = React.useCallback((orderId: string, patch: Partial<OrderRow>) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
    setSelectedOrderForDetails((prev) => (prev?.id === orderId ? { ...prev, ...patch } : prev));
    setSelectedOrderForRisk((prev) => (prev?.id === orderId ? { ...prev, ...patch } : prev));
  }, []);

  const handleOrderPushed = React.useCallback((updatedOrder: OrderRow) => {
    setOrders((prev) => prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)));
    setSelectedOrderForDetails((prev) => (prev?.id === updatedOrder.id ? updatedOrder : prev));
  }, []);

  const handleOrderSwitched = React.useCallback((updatedOrder: OrderRow, _redexComment: string) => {
    setOrders((prev) => prev.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)));
    setSelectedOrderForDetails((prev) => (prev?.id === updatedOrder.id ? updatedOrder : prev));
    toast.add({ title: "تم تحديث الطلبية", description: "تم تأكيد التعديل من خدمة الإدارة.", type: "success" });
  }, []);

  const handleSyncRedexTracking = React.useCallback(async () => {
    setIsSyncingRedex(true);
    try {
      const res = await fetch("/api/delivery?action=sync_all_active");
      const json = await res.json();
      if (json.success) {
        toast.add({
          title: "تمت مزامنة التتبع مع Redex",
          description: json.message || `تم فحص ${json.checkedCount || 0} شحنة وتحديث ${json.updatedCount || 0} طلب.`,
          type: "success",
        });
        await fetchOrders();
      } else {
        toast.add({
          title: "فشل مزامنة التتبع",
          description: json.error || "تعذر الاتصال بخادم Redex",
          type: "error",
        });
      }
    } catch (err: any) {
      toast.add({
        title: "خطأ في المزامنة",
        description: err?.message || "تحقق من اتصال الإنترنت",
        type: "error",
      });
    } finally {
      setIsSyncingRedex(false);
    }
  }, [fetchOrders]);

  // Direct Status Update Handler
  const handleUpdateStatus = React.useCallback(async (orderId: string, newStatus: string) => {
    if (pendingStatusIds.current.has(orderId)) return;
    const currentOrder = orders.find((order) => order.id === orderId);
    if (!currentOrder || !allowedStatusTransitions[currentOrder.status]?.includes(newStatus)) {
      toast.add({
        title: "الحالة غير متاحة",
        description: "لا تسمح قواعد الطلبية الحالية بهذا الانتقال.",
        type: "error",
      });
      return;
    }

    if (newStatus === "cancelled" && !window.confirm(`هل تريد إلغاء الطلبية ${orderId}؟`)) return;
    if (newStatus === "returned" && !window.confirm(`تأكيد تسجيل الطلبية ${orderId} كمرتجعة أو مرفوضة؟`)) return;

    pendingStatusIds.current.add(orderId);
    setPendingStatusById((previous) => ({ ...previous, [orderId]: true }));
    try {
      const repo = getOrdersRepository();
      await repo.updateOrderStatus(orderId, newStatus);

      setOrders((previous) => previous.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order)));
      setSelectedOrderForDetails((previous) => (previous?.id === orderId ? { ...previous, status: newStatus } : previous));
      toast.add({ title: "تم تحديث الحالة", description: `الحالة الجديدة: ${newStatus}.`, type: "success" });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("orva:orders-updated"));
      }
    } catch (reason) {
      toast.add({
        title: "تعذر تحديث الحالة",
        description: reason instanceof Error ? reason.message : "حاول مرة أخرى بعد التحقق من الاتصال.",
        type: "error",
      });
    } finally {
      pendingStatusIds.current.delete(orderId);
      setPendingStatusById((previous) => {
        const next = { ...previous };
        delete next[orderId];
        return next;
      });
    }
  }, [orders]);

  // Bulk Status Update Handler
  const handleBulkStatusChange = async (newStatus: string) => {
    if (isBulkUpdating) return;
    const selectedOrders = orders.filter((order) => rowSelection[order.id]);
    if (selectedOrders.length === 0) return;
    if (selectedOrders.some((order) => !allowedStatusTransitions[order.status]?.includes(newStatus))) {
      toast.add({
        title: "تعذر تنفيذ الإجراء الجماعي",
        description: "التحديد يحتوي على طلبيات لا تسمح حالتها بالانتقال المطلوب.",
        type: "error",
      });
      return;
    }

    if (newStatus === "cancelled" && !window.confirm(`تأكيد إلغاء ${selectedOrders.length} طلبية؟`)) return;
    if (newStatus === "returned" && !window.confirm(`تأكيد تسجيل ${selectedOrders.length} طلبية كمرتجعة أو مرفوضة؟`)) return;

    const selectedIds = selectedOrders.map((order) => order.id);
    setIsBulkUpdating(true);
    try {
      const repo = getOrdersRepository();
      const result = await repo.bulkUpdateStatus(selectedIds, newStatus);

      if (result.updatedCount > 0) {
        await fetchOrders();
        setRowSelection({});
        toast.add({ title: "تم تحديث الطلبات", description: `تم تحديث ${result.updatedCount} طلبية بنجاح.`, type: "success" });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("orva:orders-updated"));
        }
      } else {
        toast.add({ title: "تعذر تحديث الطلبات", description: "لم يتم تحديث أي طلبية.", type: "error" });
      }
    } catch (reason) {
      toast.add({
        title: "تعذر تحديث الطلبات",
        description: reason instanceof Error ? reason.message : "حاول مرة أخرى بعد التحقق من الاتصال.",
        type: "error",
      });
    } finally {
      setIsBulkUpdating(false);
    }
  };


  const handleCopyOrderId = React.useCallback(async (orderId: string) => {
    try {
      await navigator.clipboard.writeText(orderId);
      toast.add({ title: "تم نسخ رقم الطلبية", description: orderId, type: "success" });
    } catch {
      toast.add({ title: "تعذر النسخ", description: "اسمح للمتصفح بالوصول إلى الحافظة ثم أعد المحاولة.", type: "error" });
    }
  }, []);

  const columns = React.useMemo(
    () =>
      createRecentOrdersColumns(
        handleOpenDetails,
        handleOpenSwitchDialog,
        handleUpdateStatus,
        pendingStatusById,
        handleCopyOrderId,
        handleOpenPushDialog,
        handleOpenRiskDialog,
      ),
    [
      handleOpenDetails,
      handleOpenSwitchDialog,
      handleUpdateStatus,
      pendingStatusById,
      handleCopyOrderId,
      handleOpenPushDialog,
      handleOpenRiskDialog,
    ],
  );

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: filteredOrders,
    state: {
      pagination,
      rowSelection,
      sorting,
    },
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getRowId: (row) => row.id,
  });

  const selectedCount = Object.keys(rowSelection).filter((k) => rowSelection[k]).length;
  const isFiltersActive =
    searchQuery.trim() !== "" ||
    activeFilter !== "All" ||
    selectedWilayaFilter !== "ALL" ||
    selectedDateFilter !== "ALL";

  const handleResetFilters = () => {
    setSearchQuery("");
    setActiveFilter("All");
    setSelectedWilayaFilter("ALL");
    setSelectedDateFilter("ALL");
    table.setPageIndex(0);
  };

  return (
    <Card id="orders" className="xl:col-span-12 shadow-xs border-border/80">
      <CardHeader className="pb-3 text-right" dir="ltr">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Package className="size-5 text-primary" />
              <span>Orders Management</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              عرض تفاصيل الطلبيات، ومتابعة الحالات التشغيلية، والتحكم بالحالات الجماعية والتصدير إلى Excel (CSV).
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sync with Redex Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncRedexTracking}
              disabled={isSyncingRedex || isLoading}
              className="gap-1.5 text-xs h-8 font-medium text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-950/40"
              title="مزامنة وتحديث حالات التتبع لكل الشحنات النشطة مباشرة من منصة Redex"
            >
              <Truck className={`size-3.5 ${isSyncingRedex ? "animate-spin" : ""}`} />
              <span>مزامنة التتبع مع Redex</span>
            </Button>

            {/* Export to Excel CSV Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportOrdersToCsv(filteredOrders, "orva-orders")}
              className="gap-1.5 text-xs h-8 font-medium text-foreground hover:bg-muted"
              title="تصدير الطلبيات المعروضة إلى ملف Excel CSV متوافق مع اللغة العربية"
            >
              <FileSpreadsheet className="size-3.5 text-green-600 dark:text-green-400" />
              <span>تصدير إلى Excel (CSV)</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={fetchOrders}
              disabled={isLoading}
              className="gap-1.5 text-xs h-8"
              title="تحديث البيانات"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>تحديث البيانات</span>
            </Button>
          </div>
        </div>

        {loadError && (
          <Alert variant="destructive" dir="ltr">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>تعذر تحميل الطلبيات</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{loadError}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void fetchOrders()} disabled={isLoading}>
                {isLoading ? "جارٍ التحديث…" : "إعادة المحاولة"}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t mt-3">
          {orderFilters.map((filter) => {
            const count = filterCounts[filter];
            const isActive = activeFilter === filter;
            return (
              <button
                type="button"
                key={filter}
                onClick={() => {
                  setActiveFilter(filter);
                  table.setPageIndex(0);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span>
                  {filter === "All"
                    ? "الكل"
                    : filter === "Pending"
                    ? "قيد الانتظار (Pending)"
                    : filter === "Confirmed"
                    ? "Confirmed not pushed"
                    : filter === "Pushed to Redex"
                    ? "Pushed to Redex"
                    : filter === "Shipped"
                    ? "مشحونة"
                    : filter === "Delivered"
                    ? "مسلّمة"
                    : filter === "Returned"
                    ? "مرتجعة / رفض"
                    : filter === "Cancelled"
                    ? "Canceled"
                    : filter === "Risk"
                    ? "المخاطر (Risk)"
                    : "المحوّلة فقط"}
                </span>
                <span
                  className={`text-[10px] tabular-nums px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Multi-Criteria Search & Dropdown Filters Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-3">
          {/* 1. Text Search Input */}
          <div className="relative">
            <Search className="absolute right-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="بحث بالرقم، الاسم، أو الهاتف..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                table.setPageIndex(0);
              }}
              className="pr-8 h-8 text-xs bg-background"
            />
          </div>

          {/* 2. Wilaya Filter Dropdown */}
          <div>
            <Select
              value={selectedWilayaFilter}
              onValueChange={(val) => {
                if (!val) return;
                setSelectedWilayaFilter(val);
                table.setPageIndex(0);
              }}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <div className="flex items-center gap-1.5 truncate">
                  <MapPin className="size-3 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="الولاية (جميع الولايات)" />
                </div>
              </SelectTrigger>
              <SelectContent className="max-h-56">
                <SelectItem value="ALL" className="text-xs font-semibold">
                  جميع الولايات (58 ولاية)
                </SelectItem>
                {ALGERIA_WILAYAS.map((w) => (
                  <SelectItem key={w.id} value={w.id} className="text-xs">
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 3. Date Range Filter Dropdown */}
          <div>
            <Select
              value={selectedDateFilter}
              onValueChange={(val) => {
                if (!val) return;
                setSelectedDateFilter(val);
                table.setPageIndex(0);
              }}
            >
              <SelectTrigger className="h-8 text-xs bg-background">
                <div className="flex items-center gap-1.5 truncate">
                  <Calendar className="size-3 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="الفترة الزمنية..." />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-xs">
                  جميع الفترات الزمنية
                </SelectItem>
                <SelectItem value="TODAY" className="text-xs">
                  طلبات اليوم فقط
                </SelectItem>
                <SelectItem value="LAST_7" className="text-xs">
                  آخر 7 أيام
                </SelectItem>
                <SelectItem value="LAST_30" className="text-xs">
                  آخر 30 يومًا
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 4. Reset Filters Button */}
          <div>
            {isFiltersActive ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5 w-full justify-center border border-dashed"
              >
                <X className="size-3.5 text-destructive" />
                <span>إعادة ضبط الفلاتر</span>
              </Button>
            ) : (
              <div className="h-8 flex items-center justify-center text-[11px] text-muted-foreground font-mono">
                {filteredOrders.length} طلبية مطابقة
              </div>
            )}
          </div>
        </div>

        {/* Bulk Actions Floating/Sticky Bar */}
        {selectedCount > 0 && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-2.5 mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-primary text-primary-foreground font-bold">
                تم تحديد {selectedCount} طلبية
              </Badge>
              <span className="text-muted-foreground text-[11px]">
                تطبيق إجراء جماعي على الطلبيات المحددة:
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Select disabled={isBulkUpdating} onValueChange={(val) => { if (typeof val === "string") void handleBulkStatusChange(val); }}>
                <SelectTrigger className="h-7 text-xs bg-background font-semibold w-40">
                  <SelectValue placeholder="تغيير الحالة المجمّعة..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed" className="text-xs">
                    تأكيد الطلبات (Confirmed not pushed)
                  </SelectItem>
                  <SelectItem value="cancelled" className="text-xs">
                    إلغاء الطلبات (Canceled)
                  </SelectItem>
                  <SelectItem value="pending" className="text-xs">
                    إعادة لقيد الانتظار (Pending)
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                size="xs"
                variant="outline"
                disabled={isBulkUpdating}
                onClick={() => {
                  const selectedRows = filteredOrders.filter((o) => (rowSelection as any)[o.id]);
                  exportOrdersToCsv(selectedRows, "orva-selected-orders");
                }}
                className="h-7 text-xs gap-1 bg-background"
              >
                <Download className="size-3 text-green-600" />
                <span>تصدير المحدد (CSV)</span>
              </Button>

              <Button
                size="xs"
                variant="ghost"
                disabled={isBulkUpdating}
                onClick={() => setRowSelection({})}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                إلغاء التحديد
              </Button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="px-0 pb-0" dir="ltr">
        <div className="overflow-x-auto">
          <Table className="text-right">
            <TableHeader className="bg-muted/40 text-xs">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="text-right font-bold text-xs py-2.5 px-3 text-foreground"
                      colSpan={header.colSpan}
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody className="text-xs">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="hover:bg-muted/30 transition-colors border-b"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-2.5 px-3">
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground text-xs">
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="size-5 animate-spin text-primary" />
                        <span>جاري تحميل قائمة الطلبيات...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1.5">
                        <Package className="size-6 text-muted-foreground/60" />
                        <span className="font-medium">
                          {loadError
                            ? "لم نعرض بيانات تجريبية. أعد المحاولة بعد استعادة الاتصال بمصدر الطلبات."
                            : "لم يتم العثور على أي طلبيات تطابق الفلتر أو البحث."}
                        </span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t text-xs text-muted-foreground">
          <div>
            عرض {table.getRowModel().rows.length} من أصل {filteredOrders.length} طلبية
            {orders.length !== filteredOrders.length && ` (تمت التصفية من إجمالي ${orders.length})`}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-7 text-xs"
            >
              السابق
            </Button>
            <span className="tabular-nums font-mono">
              صفحة {table.state.pagination.pageIndex + 1} من {Math.max(1, table.getPageCount())}
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-7 text-xs"
            >
              التالي
            </Button>
          </div>
        </div>
      </CardContent>

      {/* Slide-Over Drawer for Hierarchical Details */}
      <OrderDetailsDrawer
        order={selectedOrderForDetails}
        open={detailsDrawerOpen}
        onOpenChange={setDetailsDrawerOpen}
        onOpenSwitchDialog={(order) => {
          setSelectedOrderForSwitch(order);
          setSwitchDialogOpen(true);
        }}
        onOpenPushDialog={(order) => {
          setSelectedOrderForPush(order);
          setPushDialogOpen(true);
        }}
        onUpdateStatus={handleUpdateStatus}
      />

      {/* Switch Order Modal */}
      <OrderSwitchDialog
        order={selectedOrderForSwitch}
        open={switchDialogOpen}
        onOpenChange={setSwitchDialogOpen}
        onOrderSwitched={handleOrderSwitched}
        allOrders={orders}
      />

      {/* Push Order Expedition Modal (CourierDZ Multi-Carrier) */}
      <OrderPushDialog
        order={selectedOrderForPush}
        open={pushDialogOpen}
        onOpenChange={setPushDialogOpen}
        onOrderPushed={handleOrderPushed}
      />

      <RiskOverrideDialog
        order={selectedOrderForRisk}
        open={riskDialogOpen}
        onOpenChange={setRiskDialogOpen}
        onUpdated={handleRiskUpdated}
      />
    </Card>
  );
}