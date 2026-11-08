"use strict";
"use client";

import * as React from "react";
import {
  AlertCircle,
  Forklift,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchOrvaOrders, formatDzd, type OrvaOrder } from "@/lib/orva-api";

import { DevEnvironmentBanner } from "@/components/dev-environment-banner";
import { OrderSwitchDialog } from "../../ecommerce/_components/order-switch-dialog";
import { AlgeriaMap } from "./algeria-map";
import { DeliveryStatsStrip } from "./delivery-stats-strip";
import { ShipmentDetailsCard } from "./shipment-details-card";
import { SelectedShipmentSummary } from "./selected-shipment-summary";
import { ShipmentsTable } from "./shipments-table";


function extractConversionsFromRemarks(remarks: any): { isSwitched: boolean } {
  if (!remarks) return { isSwitched: false };
  const list = Array.isArray(remarks) ? remarks : [remarks];
  for (const r of list) {
    if (typeof r === "object" && r !== null) {
      if (r.event === "ORDER_CONVERSION" || r.switch_status === "switched") {
        return { isSwitched: true };
      }
    } else if (typeof r === "string" && (r.includes("تحويل") || r.includes("ORDER_CONVERSION"))) {
      return { isSwitched: true };
    }
  }
  return { isSwitched: false };
}

export function Logistics() {
  const [orders, setOrders] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedWilayaCode, setSelectedWilayaCode] = React.useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<any | null>(null);
  const shipmentsTableRef = React.useRef<HTMLDivElement>(null);

  // Switch Order Dialog State
  const [switchDialogOpen, setSwitchDialogOpen] = React.useState(false);
  const [orderToSwitch, setOrderToSwitch] = React.useState<any | null>(null);

  // Fetch orders with stable function reference and unmount protection
  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchOrders = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const liveOrders = await fetchOrvaOrders();
      const mapped = liveOrders.map(toLogisticsOrder);
      if (isMountedRef.current) {
        setOrders(mapped);
        setSelectedOrder((previous: any) => mapped.find((order) => order.id === previous?.id) || mapped[0] || null);
      }
    } catch (reason) {
      if (isMountedRef.current) {
        setOrders([]);
        setSelectedOrder(null);
        setLoadError(reason instanceof Error ? reason.message : "تعذر تحميل الشحنات.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []); // Stable reference with empty dependency array!

  React.useEffect(() => {
    void fetchOrders();

    const handleSync = () => void fetchOrders();
    window.addEventListener("orva:orders-updated", handleSync);
    window.addEventListener("orva:repository-mode-changed", handleSync);
    return () => {
      window.removeEventListener("orva:orders-updated", handleSync);
      window.removeEventListener("orva:repository-mode-changed", handleSync);
    };
  }, [fetchOrders]);


  const handleOpenSwitch = (ord: any) => {
    setOrderToSwitch(ord);
    setSwitchDialogOpen(true);
  };

  const handleOrderSwitched = (updatedOrder: any) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === updatedOrder.id ? { ...o, ...updatedOrder, isSwitched: true } : o))
    );
    if (selectedOrder && selectedOrder.id === updatedOrder.id) {
      setSelectedOrder({ ...selectedOrder, ...updatedOrder, isSwitched: true });
    }
    void fetchOrders();
  };

  const handleSelectWilaya = React.useCallback((code: number | null) => {
    const normalizedCode = code === null ? null : Number(code);
    setSelectedWilayaCode(Number.isInteger(normalizedCode) ? normalizedCode : null);
    setSelectedOrder(null);

    if (normalizedCode !== null && Number.isInteger(normalizedCode)) {
      window.requestAnimationFrame(() => {
        shipmentsTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  return (
    <div className="flex flex-col gap-6 text-right pb-10" dir="ltr">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
              <Forklift className="size-6 text-primary" />
              <span>ORVA STORE — LOGISTICS</span>
            </h1>
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 text-xs font-semibold">
              Origin Hub: Biskra (07)
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm flex items-center gap-2">
            <span>نظام لوجستي متكامل لإدارة وجهات الشحن، وحساب المسافات الجغرافية، وتتبع بوليصات Redex</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium text-xs">
              <ShieldCheck className="size-3.5" /> بيانات GeoAlgeria الرسمية مفعلة
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={fetchOrders}
            disabled={isLoading}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>تحديث الشحنات</span>
          </Button>


        </div>
      </div>

      <DevEnvironmentBanner />

      {loadError && (

        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>بيانات الشحن غير متاحة</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{loadError}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void fetchOrders()} disabled={isLoading}>إعادة المحاولة</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* 1. Delivery Statistics Cards (Section 3.1) */}
      <DeliveryStatsStrip orders={orders} />

      {/* 2. Interactive Map & Selected Shipment Details (Section 3.2 & 3.3) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Algeria Map (8 columns on lg) */}
        <div className="lg:col-span-8">
          <AlgeriaMap
            orders={orders}
            selectedWilayaCode={selectedWilayaCode}
            onSelectWilaya={handleSelectWilaya}
            selectedOrder={selectedOrder}
            onSelectOrder={(order) => setSelectedOrder(order)}
          />
        </div>

        {/* Selected Shipment & Route Details (4 columns on lg) */}
        <div className="lg:col-span-4 h-full min-h-[520px]">
          <ShipmentDetailsCard
            order={selectedOrder}
            onClose={() => setSelectedOrder(null)}
            onOpenSwitch={handleOpenSwitch}
          />
        </div>
      </div>

      {/* 3. Shipments Management Table (Section 5) */}
      <div ref={shipmentsTableRef} id="shipments-table" className="scroll-mt-4">
        <ShipmentsTable
          orders={orders}
          selectedOrderId={selectedOrder?.id || null}
          onSelectOrder={(ord) => setSelectedOrder(ord)}
          selectedWilayaCode={selectedWilayaCode}
          onSelectWilaya={handleSelectWilaya}
        />
      </div>

      {selectedOrder && <SelectedShipmentSummary order={selectedOrder} />}

      {/* Switch Order Dialog */}
      {orderToSwitch && (
        <OrderSwitchDialog
          order={orderToSwitch}
          open={switchDialogOpen}
          onOpenChange={setSwitchDialogOpen}
          onOrderSwitched={handleOrderSwitched}
          allOrders={orders}
        />
      )}
    </div>
  );
}

function toLogisticsOrder(order: OrvaOrder) {
  const { isSwitched } = extractConversionsFromRemarks(order.remarks);
  return {
    id: order.id,
    date: order.createdAt ?? "",
    customer: order.customer ?? "",
    phone: order.phone ?? "",
    wilaya: order.wilaya ?? "",
    commune: order.commune ?? "",
    deliveryType: order.deliveryType ?? "",
    status: order.status,
    total: formatDzd(order.grandTotalDzd),
    shippingFee: formatDzd(order.shippingDzd),
    priceNum: order.priceDzd ?? undefined,
    in_redex: order.inRedex,
    redex_tracking_code: order.redexTrackingCode,
    remarks: order.remarks,
    isSwitched,
    rawOrder: order.raw,
  };
}
