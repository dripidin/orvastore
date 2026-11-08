"use client";

import * as React from "react";
import {
  CheckCircle2,
  Truck,
  XCircle,
  RotateCcw,
  Clock,
  HelpCircle,
  Package,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeliveryKPIMetrics } from "@/lib/delivery/delivery-tracking-types";

interface DeliveryKpiCardsProps {
  metrics: DeliveryKPIMetrics;
}

export function DeliveryKpiCards({ metrics }: DeliveryKpiCardsProps) {
  const cards = [
    {
      id: "delivered",
      title: "طلبات مسلّمة (Delivered)",
      value: metrics.deliveredOrders,
      desc: "تم تسليمها للزبون وتحصيل المبلغ",
      icon: CheckCircle2,
      badgeText: "مؤكد الاستلام",
      colorClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      iconColor: "text-emerald-500",
      progressColor: "bg-emerald-500",
    },
    {
      id: "in_transit",
      title: "قيد التوصيل والنقل (In Transit)",
      value: metrics.inTransitOrders,
      desc: metrics.returningOrders && metrics.returningOrders > 0
        ? `مع الناقل (${metrics.returningOrders} مرتجع في الطريق)`
        : "مع الناقل أو خرج للتسليم النهائي",
      icon: Truck,
      badgeText: "قيد المعالجة",
      colorClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      iconColor: "text-blue-500",
      progressColor: "bg-blue-500",
    },
    {
      id: "delivery_failed",
      title: "تعذر التسليم (Delivery Failed)",
      value: metrics.deliveryFailedOrders,
      desc: "فشل الاتصال بالزبون أو رفض الاستلام",
      icon: XCircle,
      badgeText: "تتطلب متابعة",
      colorClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
      iconColor: "text-rose-500",
      progressColor: "bg-rose-500",
    },
    {
      id: "returned",
      title: "مرتجع مؤكد (Confirmed Returned)",
      value: metrics.returnedOrders,
      desc: "أعيدت واستلمت فعلياً في المستودع",
      icon: RotateCcw,
      badgeText: "مرتجع مؤكد",
      colorClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
      iconColor: "text-orange-500",
      progressColor: "bg-orange-500",
    },
    {
      id: "pending_tracking",
      title: "بانتظار التتبع (Pending Tracking)",
      value: metrics.pendingTrackingOrders,
      desc: "طلبات جديدة أو بانتظار رمز التتبع",
      icon: Clock,
      badgeText: "قيد التحضير",
      colorClass: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
      iconColor: "text-slate-500",
      progressColor: "bg-slate-500",
    },
    {
      id: "unknown_status",
      title: "حالة غير معروفة (Unknown Status)",
      value: metrics.unknownStatusOrders,
      desc: "لا تتوفر معلومات تتبع كافية حالياً",
      icon: HelpCircle,
      badgeText: "غير مؤكد",
      colorClass: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
      iconColor: "text-zinc-400",
      progressColor: "bg-zinc-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        const total = metrics.totalOrders || 1;
        const pct = Math.round((card.value / total) * 100);

        return (
          <Card key={card.id} className="relative overflow-hidden border shadow-sm">
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between space-y-0">
              <span className="text-[11px] font-medium text-muted-foreground line-clamp-1">
                {card.title}
              </span>
              <div className={`p-1.5 rounded-lg ${card.colorClass}`}>
                <Icon className={`size-3.5 ${card.iconColor}`} />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-2xl font-bold tracking-tight">
                  {card.value.toLocaleString("en-US")}
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {pct}% من الطلبات
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
                {card.desc}
              </p>
              <div className="w-full bg-secondary h-1 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full ${card.progressColor} rounded-full transition-all duration-300`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
