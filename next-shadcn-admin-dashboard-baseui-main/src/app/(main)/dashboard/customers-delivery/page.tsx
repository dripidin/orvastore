"use client";

import * as React from "react";
import {
  Truck,
  RefreshCw,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDeliveryTracking } from "@/lib/delivery/use-delivery-tracking";
import { DeliveryKpiCards } from "./_components/delivery-kpi-cards";
import { DeliveryFilters } from "./_components/delivery-filters";
import { CustomersOrdersTable } from "./_components/customers-orders-table";
import { DeliveryTimelineDrawer } from "./_components/delivery-timeline-drawer";
import { CustomerDetailsDialog } from "./_components/customer-details-dialog";
import type { OrvaOrder } from "@/lib/repository/types";

export default function CustomersDeliveryPage() {
  React.useEffect(() => {
    document.title = "Customers & Delivery | ORVA Store Admin";
  }, []);

  const {
    repoMode,
    orders,
    filteredOrders,
    trackingMap,
    filters,
    setFilters,
    kpiMetrics,
    getCustomerOrders,
    isLoading,
    isSyncing,
    syncingOrderId,
    syncFeedback,
    refreshOrderTracking,
    refreshAllTracking,
    resetTrackingCache,
  } = useDeliveryTracking();

  // Selected Order for Timeline Drawer
  const [selectedTimelineOrder, setSelectedTimelineOrder] = React.useState<OrvaOrder | null>(null);

  // Selected Customer Order for Details Dialog
  const [selectedCustomerOrders, setSelectedCustomerOrders] = React.useState<OrvaOrder[] | null>(null);

  const handleOpenTimeline = (order: OrvaOrder) => {
    setSelectedTimelineOrder(order);
  };

  const handleOpenCustomerDetails = (order: OrvaOrder) => {
    const rawPhone = (order.phone || "").replace(/[^\d]/g, "");
    const rawName = (order.customer || "").trim();
    const key = rawPhone || rawName || order.id;
    const allForCustomer = getCustomerOrders(key);
    setSelectedCustomerOrders(allForCustomer.length > 0 ? allForCustomer : [order]);
  };

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6" dir="ltr">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Truck className="size-5" />
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
              Customers & Delivery
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            نظام موحد لمتابعة استلام العملاء، مزامنة شحنات ريديكس وإيكوتراك (Redex & Ecotrack)،
            والتحقق من حالة التسليم الفعلي عبر 58 ولاية جزائرية.
          </p>
        </div>

        {/* Global Synchronization Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetTrackingCache}
            disabled={isSyncing || isLoading}
            className="text-xs h-9 gap-1.5 cursor-pointer"
            title="إعادة ضبط بيانات التتبع التجريبية إلى الإعدادات الأولية"
          >
            <RotateCcw className="size-3.5 text-muted-foreground" />
            إعادة تعيين (Reset)
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={refreshAllTracking}
            disabled={isSyncing || isLoading}
            className="text-xs h-9 gap-2 shadow-xs cursor-pointer font-semibold"
          >
            <RefreshCw className={`size-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            مزامنة كافة الشحنات (Sync All)
          </Button>
        </div>
      </div>

      {/* Sync Feedback Toast / Banner */}
      {syncFeedback && (
        <Alert
          variant={syncFeedback.type === "error" ? "destructive" : "default"}
          className={`text-xs py-2.5 ${
            syncFeedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
              : syncFeedback.type === "info"
              ? "bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300"
              : ""
          }`}
        >
          {syncFeedback.type === "success" ? (
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          ) : syncFeedback.type === "error" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <Info className="size-4 text-blue-600 dark:text-blue-400" />
          )}
          <AlertTitle className="text-xs font-bold">
            {syncFeedback.type === "success"
              ? "اكتملت المزامنة بنجاح"
              : syncFeedback.type === "error"
              ? "تنبيه مزامنة التتبع"
              : "معلومات الشحنة"}
          </AlertTitle>
          <AlertDescription className="text-xs">
            {syncFeedback.message}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-5">
          <DeliveryKpiCards metrics={kpiMetrics} />

          <DeliveryFilters
            filters={filters}
            onFiltersChange={setFilters}
            onResetFilters={() =>
              setFilters({
                searchTerm: "",
                wilayaCode: "all",
                courierId: "all",
                orvaStatus: "all",
                courierStatus: "all",
                receiptStatus: "all",
                dateRange: "all",
              })
            }
            totalFilteredCount={filteredOrders.length}
            totalOrdersCount={orders.length}
          />

          <CustomersOrdersTable
            orders={filteredOrders}
            trackingMap={trackingMap}
            onSelectOrderTimeline={handleOpenTimeline}
            onSelectCustomerDetails={handleOpenCustomerDetails}
            onRefreshTracking={refreshOrderTracking}
            syncingOrderId={syncingOrderId}
            isSyncingBulk={isSyncing}
          />
      </div>

      {/* Delivery Timeline Drawer */}
      <DeliveryTimelineDrawer
        order={selectedTimelineOrder}
        tracking={selectedTimelineOrder ? trackingMap.get(selectedTimelineOrder.id) || null : null}
        isOpen={Boolean(selectedTimelineOrder)}
        onClose={() => setSelectedTimelineOrder(null)}
        onRefreshTracking={refreshOrderTracking}
        isSyncing={isSyncing}
      />

      {/* Customer Multi-Order Details Dialog */}
      <CustomerDetailsDialog
        customerOrders={selectedCustomerOrders || []}
        trackingMap={trackingMap}
        isOpen={Boolean(selectedCustomerOrders)}
        onClose={() => setSelectedCustomerOrders(null)}
        onSelectOrderForTimeline={handleOpenTimeline}
      />
    </div>
  );
}
