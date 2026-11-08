"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Package,
  RotateCcw,
  ShoppingBag,
  Truck,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrvaOrders } from "@/lib/use-orva-orders";

export function KpiStrip() {
  const { orders, isLoading, error, refresh } = useOrvaOrders();
  const delivered = orders.filter((order) => order.status === "delivered");
  const switchedCount = orders.filter((order) =>
    order.remarks.some((remark) => {
      if (typeof remark === "string") return remark.includes("ORDER_CONVERSION");
      if (!remark || typeof remark !== "object") return false;
      const event = "event" in remark ? remark.event : undefined;
      const status = "switch_status" in remark ? remark.switch_status : undefined;
      return event === "ORDER_CONVERSION" || status === "switched";
    }),
  ).length;

  const count = (predicate: (status: string) => boolean) => orders.filter((order) => predicate(order.status)).length;
  const value = (countValue: number) => (isLoading ? "…" : error ? "—" : countValue.toLocaleString("fr-DZ"));

  const kpis = [
    { title: "إجمالي الطلبات", sub: "All orders", value: value(orders.length), icon: ShoppingBag },
    { title: "قيد الانتظار", sub: "Pending", value: value(count((status) => status === "pending")), icon: Clock },
    { title: "طلبات مؤكدة", sub: "Confirmed", value: value(count((status) => status === "confirmed")), icon: CheckCircle2 },
    { title: "طلبات مشحونة", sub: "Shipped", value: value(count((status) => status === "shipped")), icon: Truck },
    { title: "طلبات مسلّمة", sub: "Delivered", value: value(delivered.length), icon: Package },
    {
      title: "طلبات ملغاة",
      sub: "Cancelled",
      value: value(count((status) => status === "cancelled" || status === "deleted")),
      icon: XCircle,
    },
  ];

  return (
    <div className="flex flex-col gap-4 xl:col-span-12" dir="ltr">
      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>ملخص الطلبات غير متاح</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void refresh()} disabled={isLoading}>
              إعادة المحاولة
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4">
        <Card className="border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-background shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                <RotateCcw aria-hidden="true" data-icon="inline-start" />
                الطلبيات المحوّلة
              </span>
              <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-800 dark:text-cyan-200">
                سجل الطلبات
              </span>
            </div>
            <CardTitle className="pt-1 text-3xl font-extrabold tabular-nums tracking-tight text-cyan-700 dark:text-cyan-300">
              {value(switchedCount)}
            </CardTitle>
            <CardDescription className="text-xs">يُحتسب كل رقم طلب مرة واحدة، حتى عند وجود أكثر من عملية تحويل.</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.title} className="border shadow-xs transition-colors hover:border-primary/40">
              <CardContent className="flex flex-col gap-2 p-3.5">
                <span className="grid size-8 place-items-center rounded-lg bg-muted/60 text-primary">
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <div className="text-2xl font-bold tabular-nums tracking-tight">{kpi.value}</div>
                  <div className="mt-0.5 text-xs font-semibold">{kpi.title}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{kpi.sub}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
