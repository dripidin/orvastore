"use client";

import * as React from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock,
  Filter,
  Package,
  PieChart as PieChartIcon,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
  XCircle,
} from "lucide-react";
import { Cell, Pie, PieChart, Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { type AnalyticsPeriod, getSwitchCount } from "@/lib/orva-analytics";
import { formatDzd } from "@/lib/orva-api";
import { useOrvaOrders } from "@/lib/use-orva-orders";

const periodOptions: { value: AnalyticsPeriod; label: string }[] = [
  { value: "7d", label: "آخر 7 أيام" },
  { value: "30d", label: "آخر 30 يومًا" },
  { value: "90d", label: "آخر 90 يومًا" },
  { value: "all", label: "كل الفترات" },
];

const productFilterOptions = [
  { value: "all", label: "جميع المنتجات" },
  { value: "PACK1", label: "Pack 1 Pro 4-in-1" },
  { value: "PACK2", label: "Pack 2 Elite 5-in-1" },
  { value: "PACK3", label: "Pack 3 Ultra 6-in-1" },
  { value: "SAC_BANANE", label: "Sac Banane Moto Yamaha" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",   // Amber
  confirmed: "#3b82f6", // Blue
  shipped: "#8b5cf6",   // Purple
  delivered: "#10b981", // Emerald
  returned: "#f97316",  // Orange
  cancelled: "#ef4444", // Red
};

const STATUS_ARABIC: Record<string, string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكدة",
  shipped: "مشحونة",
  delivered: "مسلّمة",
  returned: "مرتجعة",
  cancelled: "ملغاة",
};

function matchesProduct(productName: string | null | undefined, filter: string): boolean {
  if (!filter || filter === "all" || filter === "جميع المنتجات") return true;
  if (!productName) return false;
  const name = productName.toLowerCase().trim();

  switch (filter) {
    case "PACK1":
    case "Pack 1 Pro 4-in-1":
      return name.includes("pack 1") || name.includes("pack1") || name.includes("pro 4-in-1");
    case "PACK2":
    case "Pack 2 Elite 5-in-1":
    case "Pack 2 Elite 6-in-1":
    case "Pack 2 Elite 5-in-1 / 6-in-1":
      return name.includes("pack 2") || name.includes("pack2") || name.includes("elite");
    case "PACK3":
    case "Pack 3 Ultra 6-in-1":
    case "Pack 3 Ultra":
      return name.includes("pack 3") || name.includes("pack3") || name.includes("ultra");
    case "SAC_BANANE":
    case "Sac Banane Moto Yamaha":
      return name.includes("sac") || name.includes("banane") || name.includes("yamaha");
    default:
      return name.includes(filter.toLowerCase());
  }
}

interface DeltaResult {
  pct: number;
  text: string;
  isPositive: boolean;
  isNeutral: boolean;
}

function calculateDelta(current: number, prior: number): DeltaResult {
  if (prior === 0) {
    if (current === 0) {
      return { pct: 0, text: "+0.0%", isPositive: true, isNeutral: true };
    }
    return { pct: 100, text: "+100.0%", isPositive: true, isNeutral: false };
  }
  const pct = ((current - prior) / prior) * 100;
  const isNeutral = Math.abs(pct) < 0.05;
  const isPositive = pct >= 0;
  const text = `${isPositive ? "+" : ""}${pct.toFixed(1)}%`;
  return { pct, text, isPositive, isNeutral };
}

function getDeltaBadgeClass(delta: DeltaResult): string {
  if (delta.isNeutral) {
    return "border-muted bg-muted/40 text-muted-foreground";
  }
  if (delta.isPositive) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
}

function getOrderTimestamp(order: { createdAt?: string | null }): number {
  if (!order.createdAt) return 0;
  const time = new Date(order.createdAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function AnalyticsOverview() {
  const { orders, isLoading, error, refresh } = useOrvaOrders();
  const [period, setPeriod] = React.useState<AnalyticsPeriod>("30d");
  const [selectedProduct, setSelectedProduct] = React.useState<string>("all");
  const [comparisonMode, setComparisonMode] = React.useState<boolean>(true);

  // Filter orders by product first
  const productFilteredOrders = React.useMemo(() => {
    return orders.filter((o) => matchesProduct(o.productName, selectedProduct));
  }, [orders, selectedProduct]);

  // Determine chronological anchor date for dataset
  const referenceAnchor = React.useMemo(() => {
    if (!orders || orders.length === 0) return new Date();
    const timestamps = orders
      .map((o) => (o.createdAt ? new Date(o.createdAt).getTime() : 0))
      .filter((t) => Number.isFinite(t) && t > 0);
    if (timestamps.length === 0) return new Date();
    const maxTime = Math.max(...timestamps);
    // If the latest order is more than 7 days in the past from Date.now(),
    // anchor to maxTime so period filter windows align with actual store data.
    if (Date.now() - maxTime > 7 * 24 * 60 * 60 * 1000) {
      return new Date(maxTime);
    }
    return new Date();
  }, [orders]);

  // Partition orders into current window and prior equivalent window for comparison
  const { currentOrders, priorOrders } = React.useMemo(() => {
    if (period === "all") {
      const sorted = [...productFilteredOrders]
        .filter((o) => getOrderTimestamp(o) > 0)
        .sort((a, b) => getOrderTimestamp(a) - getOrderTimestamp(b));

      if (sorted.length <= 1) {
        return { currentOrders: productFilteredOrders, priorOrders: [] };
      }
      const minTime = getOrderTimestamp(sorted[0]);
      const maxTime = getOrderTimestamp(sorted[sorted.length - 1]);
      const midTime = minTime + (maxTime - minTime) / 2;

      const firstHalf = sorted.filter((o) => getOrderTimestamp(o) < midTime);

      return {
        currentOrders: productFilteredOrders,
        priorOrders: firstHalf,
      };
    }

    let days = 90;
    if (period === "7d") {
      days = 7;
    } else if (period === "30d") {
      days = 30;
    }
    const curStart = new Date(referenceAnchor.getTime() - days * 24 * 60 * 60 * 1000);
    const priStart = new Date(curStart.getTime() - days * 24 * 60 * 60 * 1000);

    const cur = productFilteredOrders.filter((order) => {
      if (!order.createdAt) return false;
      const t = new Date(order.createdAt).getTime();
      return Number.isFinite(t) && t >= curStart.getTime() && t <= referenceAnchor.getTime();
    });

    const pri = productFilteredOrders.filter((order) => {
      if (!order.createdAt) return false;
      const t = new Date(order.createdAt).getTime();
      return Number.isFinite(t) && t >= priStart.getTime() && t < curStart.getTime();
    });

    return { currentOrders: cur, priorOrders: pri };
  }, [period, productFilteredOrders, referenceAnchor]);

  // Current period metrics
  const delivered = React.useMemo(() => currentOrders.filter((o) => o.status === "delivered"), [currentOrders]);
  const returned = React.useMemo(() => currentOrders.filter((o) => o.status === "returned"), [currentOrders]);
  const switchedCount = React.useMemo(() => getSwitchCount(currentOrders), [currentOrders]);

  // Delivered + Shipped estimated COD revenue
  const currentCodRevenue = React.useMemo(() => {
    return currentOrders
      .filter((o) => o.status === "delivered" || o.status === "shipped")
      .reduce((sum, o) => sum + (o.grandTotalDzd || o.priceDzd || 0), 0);
  }, [currentOrders]);

  // Delivery Success Rate: delivered / (delivered + returned)
  const deliveryRate = React.useMemo(() => {
    const totalOutcomes = delivered.length + returned.length;
    if (totalOutcomes === 0) return 0;
    return Math.round((delivered.length / totalOutcomes) * 100);
  }, [delivered.length, returned.length]);

  // Average Order Value (AOV)
  const averageOrderValue = React.useMemo(() => {
    if (currentOrders.length === 0) return 0;
    const totalValue = currentOrders.reduce((sum, o) => sum + (o.grandTotalDzd || o.priceDzd || 0), 0);
    return Math.round(totalValue / currentOrders.length);
  }, [currentOrders]);

  // Prior period metrics for comparison deltas
  const priorDelivered = React.useMemo(() => priorOrders.filter((o) => o.status === "delivered"), [priorOrders]);
  const priorReturned = React.useMemo(() => priorOrders.filter((o) => o.status === "returned"), [priorOrders]);

  const priorCodRevenue = React.useMemo(() => {
    return priorOrders
      .filter((o) => o.status === "delivered" || o.status === "shipped")
      .reduce((sum, o) => sum + (o.grandTotalDzd || o.priceDzd || 0), 0);
  }, [priorOrders]);

  const priorDeliveryRate = React.useMemo(() => {
    const totalOutcomes = priorDelivered.length + priorReturned.length;
    if (totalOutcomes === 0) return 0;
    return Math.round((priorDelivered.length / totalOutcomes) * 100);
  }, [priorDelivered.length, priorReturned.length]);

  const priorAverageOrderValue = React.useMemo(() => {
    if (priorOrders.length === 0) return 0;
    const totalValue = priorOrders.reduce((sum, o) => sum + (o.grandTotalDzd || o.priceDzd || 0), 0);
    return Math.round(totalValue / priorOrders.length);
  }, [priorOrders]);

  // Calculated deltas
  const ordersDelta = React.useMemo(() => calculateDelta(currentOrders.length, priorOrders.length), [currentOrders.length, priorOrders.length]);
  const revenueDelta = React.useMemo(() => calculateDelta(currentCodRevenue, priorCodRevenue), [currentCodRevenue, priorCodRevenue]);
  const deliveryDelta = React.useMemo(() => calculateDelta(deliveryRate, priorDeliveryRate), [deliveryRate, priorDeliveryRate]);
  const aovDelta = React.useMemo(() => calculateDelta(averageOrderValue, priorAverageOrderValue), [averageOrderValue, priorAverageOrderValue]);

  // Status breakdown data for Pie Chart
  const statusChartData = React.useMemo(() => {
    const counts: Record<string, number> = {
      pending: 0,
      confirmed: 0,
      shipped: 0,
      delivered: 0,
      returned: 0,
      cancelled: 0,
    };
    for (const o of currentOrders) {
      const s = (o.status || "").toLowerCase();
      if (counts[s] !== undefined) {
        counts[s]++;
      } else if (s === "deleted") {
        counts.cancelled++;
      }
    }
    return Object.entries(counts)
      .filter(([_, c]) => c > 0)
      .map(([status, c]) => ({
        status,
        name: STATUS_ARABIC[status] || status,
        count: c,
        fill: STATUS_COLORS[status] || "#94a3b8",
      }));
  }, [currentOrders]);

  // Top Wilayas by Order Volume
  const topWilayasData = React.useMemo(() => {
    const wilayaCounts: Record<string, number> = {};
    for (const o of currentOrders) {
      const w = o.wilaya || "غير محدد";
      const cleanW = w.replace(/^\d+\s*-\s*/, "").split("(")[0].trim();
      wilayaCounts[cleanW] = (wilayaCounts[cleanW] || 0) + 1;
    }
    return Object.entries(wilayaCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([wilaya, c]) => ({
        wilaya,
        orders: c,
      }));
  }, [currentOrders]);

  const count = (status: string) => currentOrders.filter((order) => order.status === status).length;

  return (
    <div className="space-y-6" dir="ltr">
      {/* Header controls toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Period selector */}
          <fieldset className="flex flex-wrap gap-1.5" aria-label="فترة التحليلات">
            <legend className="sr-only">فترة التحليلات</legend>
            {periodOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={period === option.value ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setPeriod(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </fieldset>

          {/* Product / Category filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <NativeSelect
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              size="sm"
              aria-label="تصفية حسب المنتج"
              className="w-[210px]"
            >
              {productFilterOptions.map((opt) => (
                <NativeSelectOption key={opt.value} value={opt.value}>
                  {opt.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        {/* Comparison toggle and refresh */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={comparisonMode ? "secondary" : "outline"}
            className="h-8 gap-1.5 text-xs font-medium"
            onClick={() => setComparisonMode(!comparisonMode)}
            aria-pressed={comparisonMode}
          >
            <TrendingUp className="size-3.5 text-primary" aria-hidden="true" />
            {comparisonMode ? "مقارنة الفترة: مفعّلة" : "تفعيل المقارنة"}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void refresh()}
            disabled={isLoading}
          >
            <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            تحديث
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>تعذر تحميل التحليلات</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* KPI Cards Grid (5 Cards: Total Orders, Revenue, Delivery Rate, AOV, Switched Orders) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* 1. Total Orders */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>إجمالي الطلبات</span>
              <ShoppingBag className="size-4 text-primary" />
            </CardDescription>
            <div className="flex items-baseline justify-between gap-2 pt-1">
              <CardTitle className="text-2xl font-bold tabular-nums">
                {isLoading ? "…" : currentOrders.length.toLocaleString("fr-DZ")}
              </CardTitle>
              {comparisonMode && (
                <Badge
                  variant="outline"
                  className={`text-[11px] font-semibold gap-1 px-1.5 py-0.5 tabular-nums ${getDeltaBadgeClass(ordersDelta)}`}
                >
                  {!ordersDelta.isNeutral && (
                    ordersDelta.isPositive ? (
                      <TrendingUp className="size-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <TrendingDown className="size-3 text-rose-600 dark:text-rose-400" />
                    )
                  )}
                  {ordersDelta.text}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground">
            {comparisonMode && priorOrders.length > 0 ? (
              <span>السابقة: {priorOrders.length.toLocaleString("fr-DZ")} طلب</span>
            ) : (
              <span>ضمن الفترة المحددة ({period})</span>
            )}
          </CardContent>
        </Card>

        {/* 2. Estimated COD Revenue */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>إيرادات COD المحصلة والمشحونة</span>
              <Package className="size-4 text-blue-600" />
            </CardDescription>
            <div className="flex items-baseline justify-between gap-2 pt-1">
              <CardTitle className="text-xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                {isLoading ? "…" : formatDzd(currentCodRevenue)}
              </CardTitle>
              {comparisonMode && (
                <Badge
                  variant="outline"
                  className={`text-[11px] font-semibold gap-1 px-1.5 py-0.5 tabular-nums ${getDeltaBadgeClass(revenueDelta)}`}
                >
                  {!revenueDelta.isNeutral && (
                    revenueDelta.isPositive ? (
                      <TrendingUp className="size-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <TrendingDown className="size-3 text-rose-600 dark:text-rose-400" />
                    )
                  )}
                  {revenueDelta.text}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground">
            {comparisonMode && priorOrders.length > 0 ? (
              <span>السابقة: {formatDzd(priorCodRevenue)}</span>
            ) : (
              <span>طلبيات مسلّمة وقيد الشحن</span>
            )}
          </CardContent>
        </Card>

        {/* 3. Delivery Success Rate */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>نسبة نجاح التسليم</span>
              <TrendingUp className="size-4 text-emerald-600" />
            </CardDescription>
            <div className="flex items-baseline justify-between gap-2 pt-1">
              <CardTitle className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {isLoading ? "…" : `${deliveryRate}%`}
              </CardTitle>
              {comparisonMode && (
                <Badge
                  variant="outline"
                  className={`text-[11px] font-semibold gap-1 px-1.5 py-0.5 tabular-nums ${getDeltaBadgeClass(deliveryDelta)}`}
                >
                  {!deliveryDelta.isNeutral && (
                    deliveryDelta.isPositive ? (
                      <TrendingUp className="size-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <TrendingDown className="size-3 text-rose-600 dark:text-rose-400" />
                    )
                  )}
                  {deliveryDelta.text}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground">
            {delivered.length} مسلّمة من أصل {delivered.length + returned.length} منتهية
          </CardContent>
        </Card>

        {/* 4. Average Order Value (AOV) */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>متوسط قيمة الطلب (AOV)</span>
              <Wallet className="size-4 text-amber-600" />
            </CardDescription>
            <div className="flex items-baseline justify-between gap-2 pt-1">
              <CardTitle className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {isLoading ? "…" : formatDzd(averageOrderValue)}
              </CardTitle>
              {comparisonMode && (
                <Badge
                  variant="outline"
                  className={`text-[11px] font-semibold gap-1 px-1.5 py-0.5 tabular-nums ${getDeltaBadgeClass(aovDelta)}`}
                >
                  {!aovDelta.isNeutral && (
                    aovDelta.isPositive ? (
                      <TrendingUp className="size-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <TrendingDown className="size-3 text-rose-600 dark:text-rose-400" />
                    )
                  )}
                  {aovDelta.text}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground">
            {comparisonMode && priorOrders.length > 0 ? (
              <span>السابقة: {formatDzd(priorAverageOrderValue)}</span>
            ) : (
              <span>متوسط سلة المبيعات لكل طلب</span>
            )}
          </CardContent>
        </Card>

        {/* 5. Switched Orders */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>الطلبيات المحوّلة (Switch Order)</span>
              <RotateCcw className="size-4 text-purple-600" />
            </CardDescription>
            <div className="flex items-baseline justify-between gap-2 pt-1">
              <CardTitle className="text-2xl font-bold tabular-nums text-purple-600 dark:text-purple-400">
                {isLoading ? "…" : switchedCount.toLocaleString("fr-DZ")}
              </CardTitle>
              <Badge variant="outline" className="text-[11px] font-medium border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300">
                {currentOrders.length > 0 ? `${Math.round((switchedCount / currentOrders.length) * 100)}% تحويل` : "0%"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="text-[11px] text-muted-foreground">
            طلبيات تم تعديل العرض أو الوجهة
          </CardContent>
        </Card>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Status Distribution Donut Chart */}
        <Card className="lg:col-span-5 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <PieChartIcon className="size-4 text-primary" />
              توزيع حالات الطلبات
            </CardTitle>
            <CardDescription className="text-xs">
              نسبة كل حالة تشغيلية من إجمالي الطلبات
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statusChartData.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground border rounded-lg border-dashed">
                لا توجد بيانات مطابقة للفلتر المحدد
              </div>
            ) : (
              <>
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusChartData}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                      >
                        {statusChartData.map((entry) => (
                          <Cell key={`cell-${entry.status}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Chart Legend */}
                <div className="grid grid-cols-2 gap-2 pt-3 border-t mt-2">
                  {statusChartData.map((item) => (
                    <div key={item.status} className="flex items-center gap-2 text-xs">
                      <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                      <span className="text-muted-foreground">{item.name}:</span>
                      <span className="font-bold tabular-nums">{item.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Top Wilayas Bar Chart */}
        <Card className="lg:col-span-7 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" />
              أكثر الولايات نشاطاً (Top Wilayas)
            </CardTitle>
            <CardDescription className="text-xs">
              توزيع عدد الطلبيات حسب ولاية التسليم
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topWilayasData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-xs text-muted-foreground border rounded-lg border-dashed">
                لا توجد طلبات مسجلة للولايات ضمن هذا الفلتر
              </div>
            ) : (
              <div className="h-[260px] w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topWilayasData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                    <XAxis dataKey="wilaya" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Bar dataKey="orders" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status Breakdown Summary Grid */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">الحالات التشغيلية التفصيلية</CardTitle>
          <CardDescription className="text-xs">
            أعداد الطلبات حسب حالتها الحالية في مخزن البيانات
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {[
              { label: "قيد الانتظار", key: "pending", icon: Clock, color: "text-amber-600 bg-amber-500/10 border-amber-500/20" },
              { label: "مؤكدة", key: "confirmed", icon: CheckCircle2, color: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
              { label: "مشحونة (Redex)", key: "shipped", icon: Truck, color: "text-purple-600 bg-purple-500/10 border-purple-500/20" },
              { label: "مسلّمة", key: "delivered", icon: Package, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
              { label: "مرتجعة", key: "returned", icon: RotateCcw, color: "text-orange-600 bg-orange-500/10 border-orange-500/20" },
              { label: "ملغاة", key: "cancelled", icon: XCircle, color: "text-red-600 bg-red-500/10 border-red-500/20" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className={`rounded-xl border p-3.5 flex flex-col gap-2 ${item.color}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{item.label}</span>
                    <Icon className="size-4" />
                  </div>
                  <div className="text-2xl font-extrabold tabular-nums">
                    {isLoading ? "…" : count(item.key).toLocaleString("fr-DZ")}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
