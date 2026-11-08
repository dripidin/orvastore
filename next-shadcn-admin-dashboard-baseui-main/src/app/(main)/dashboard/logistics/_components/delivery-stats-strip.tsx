"use strict";
"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DeliveryStatsProps {
  orders: any[];
}

export function DeliveryStatsStrip({ orders }: DeliveryStatsProps) {
  const stats = React.useMemo(() => {
    let pending = 0;
    let confirmed = 0;
    let shipped = 0;
    let delivered = 0;
    let returned = 0;
    let inRedex = 0;

    orders.forEach((o) => {
      const s = (o.status || "").toLowerCase();
      if (s === "delivered") delivered++;
      else if (s === "shipped" || o.in_redex) shipped++;
      else if (s === "confirmed") confirmed++;
      else if (s.includes("retour") || s.includes("مرتجع") || s.includes("refus") || s === "returned") returned++;
      else pending++;

      if (o.in_redex || (o.redex_tracking_code && o.redex_tracking_code.length > 0)) {
        inRedex++;
      }
    });

    return {
      total: orders.length,
      pending,
      confirmed,
      shipped,
      delivered,
      returned,
      inRedex,
      deliverySuccessRate: orders.length > 0 ? Math.round((delivered / orders.length) * 100) : 0,
    };
  }, [orders]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 text-right" dir="ltr">
      {/* 1. Total Orders */}
      <Card className="border-border shadow-xs">
        <CardHeader className="p-3.5 pb-1">
          <CardDescription className="text-[11px] font-medium text-muted-foreground">
            إجمالي شحنات التوصيل
          </CardDescription>
          <CardTitle className="text-xl font-bold font-mono text-foreground">
            {stats.total}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3.5 pt-1 text-[10px] text-muted-foreground flex items-center gap-1">
          <Package className="size-3 text-primary" />
          <span>الطلبات المسجلة بالنظام</span>
        </CardContent>
      </Card>

      {/* 2. Confirmed Orders */}
      <Card className="border-border shadow-xs">
        <CardHeader className="p-3.5 pb-1">
          <CardDescription className="text-[11px] font-medium text-muted-foreground">
            مؤكدة وجاهزة للشحن
          </CardDescription>
          <CardTitle className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
            {stats.confirmed}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3.5 pt-1 text-[10px] text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="size-3 text-blue-500" />
          <span>تم تأكيد الهاتف والعنوان</span>
        </CardContent>
      </Card>

      {/* 3. Shipped Orders */}
      <Card className="border-border shadow-xs">
        <CardHeader className="p-3.5 pb-1">
          <CardDescription className="text-[11px] font-medium text-muted-foreground">
            مشحونة قيد النقل
          </CardDescription>
          <CardTitle className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {stats.shipped}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3.5 pt-1 text-[10px] text-muted-foreground flex items-center gap-1">
          <Truck className="size-3 text-amber-500" />
          <span>في طريقها للولايات</span>
        </CardContent>
      </Card>

      {/* 4. Delivered Orders */}
      <Card className="border-border shadow-xs">
        <CardHeader className="p-3.5 pb-1">
          <CardDescription className="text-[11px] font-medium text-muted-foreground">
            تم تسليمها بنجاح (COD)
          </CardDescription>
          <CardTitle className="text-xl font-bold font-mono text-green-600 dark:text-green-400">
            {stats.delivered}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3.5 pt-1 text-[10px] text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="size-3 text-green-500" />
          <span>تحصيل مؤكد ({stats.deliverySuccessRate}%)</span>
        </CardContent>
      </Card>

      {/* 5. Returned / Refused */}
      <Card className="border-border shadow-xs">
        <CardHeader className="p-3.5 pb-1">
          <CardDescription className="text-[11px] font-medium text-muted-foreground">
            شحنات مرتجعة / مرفوضة
          </CardDescription>
          <CardTitle className="text-xl font-bold font-mono text-red-600 dark:text-red-400">
            {stats.returned}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3.5 pt-1 text-[10px] text-muted-foreground flex items-center gap-1">
          <AlertTriangle className="size-3 text-red-500" />
          <span>متاحة لـ Switch Order</span>
        </CardContent>
      </Card>

      {/* 6. In Redex Courier */}
      <Card className="border-border shadow-xs">
        <CardHeader className="p-3.5 pb-1">
          <CardDescription className="text-[11px] font-medium text-muted-foreground">
            مسجلة لدى Redex
          </CardDescription>
          <CardTitle className="text-xl font-bold font-mono text-primary">
            {stats.inRedex}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3.5 pt-1 text-[10px] text-muted-foreground flex items-center gap-1">
          <ShieldCheck className="size-3 text-primary" />
          <span>تحمل كود بوليصة Redex</span>
        </CardContent>
      </Card>
    </div>
  );
}
