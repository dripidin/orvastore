"use client";

import * as React from "react";

import Link from "next/link";

import { differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, format } from "date-fns";
import { ArrowUpRight, Banknote, PackageCheck, ReceiptText, RotateCcw, ShoppingBag, Users } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatDzd } from "@/lib/orva-api";

import {
  getPeriodBounds,
  normalizeOrderStatusKey,
  parseOrderDate,
  resolveOrderAmountDzd,
  useEcommerceOverview,
} from "./ecommerce-overview-context";

interface SalesBucketPoint {
  key: string;
  label: string;
  tooltipLabel: string;
  delivered: number;
  pipeline: number;
  orders: number;
}

const revenueOverviewConfig = {
  delivered: {
    label: "Delivered Sales",
    color: "var(--foreground)",
  },
  pipeline: {
    label: "Orders Value",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig;

export function KpiStrip() {
  const { period, filteredOrders, inventoryStats, products, isLoadingOrders, isLoadingProducts } =
    useEcommerceOverview();

  const metrics = React.useMemo(() => {
    let pending = 0;
    let confirmed = 0;
    let shipped = 0;
    let delivered = 0;
    let returned = 0;
    let cancelled = 0;
    let redexCount = 0;

    let deliveredRevenueDzd = 0;
    let activePipelineDzd = 0;

    const customerOrderCounts = new Map<string, number>();
    const wilayas = new Set<string>();

    for (const order of filteredOrders) {
      const status = normalizeOrderStatusKey(order.status);
      const amount = resolveOrderAmountDzd(order);

      if (status === "delivered") {
        delivered += 1;
        deliveredRevenueDzd += amount;
      } else if (status === "returned") {
        returned += 1;
      } else if (status === "cancelled") {
        cancelled += 1;
      } else if (status === "shipped") {
        shipped += 1;
      } else if (status === "confirmed") {
        confirmed += 1;
      } else {
        pending += 1;
      }

      if (status !== "cancelled") {
        activePipelineDzd += amount;
      }

      if (order.inRedex || order.redexTrackingId || order.redexTrackingCode) {
        redexCount += 1;
      }

      const normPhone = (order.phone ?? "").replace(/\D/g, "");
      const customerKey = normPhone.length > 0 ? normPhone : (order.customer ?? "").trim().toLowerCase();
      if (customerKey) {
        customerOrderCounts.set(customerKey, (customerOrderCounts.get(customerKey) ?? 0) + 1);
      }

      const wilayaName = order.wilaya?.trim();
      if (wilayaName && wilayaName !== "—") {
        wilayas.add(wilayaName);
      }
    }

    const totalOrders = filteredOrders.length;
    const activeOrdersCount = totalOrders - cancelled;
    const uniqueCustomers = customerOrderCounts.size;
    let repeatCustomers = 0;
    for (const count of customerOrderCounts.values()) {
      if (count > 1) repeatCustomers += 1;
    }

    let avgOrderDzd = 0;
    if (delivered > 0) {
      avgOrderDzd = Math.round(deliveredRevenueDzd / delivered);
    } else if (activeOrdersCount > 0) {
      avgOrderDzd = Math.round(activePipelineDzd / activeOrdersCount);
    }

    const returnAndCancelCount = returned + cancelled;
    const returnAndCancelRate = totalOrders > 0 ? ((returnAndCancelCount / totalOrders) * 100).toFixed(1) : "0.0";

    return {
      totalOrders,
      activeOrdersCount,
      inProgressCount: pending + confirmed + shipped,
      delivered,
      returned,
      cancelled,
      returnAndCancelCount,
      returnAndCancelRate,
      redexCount,
      deliveredRevenueDzd,
      activePipelineDzd,
      uniqueCustomers,
      repeatCustomers,
      wilayasCount: wilayas.size,
      avgOrderDzd,
    };
  }, [filteredOrders]);

  const chartData = React.useMemo<SalesBucketPoint[]>(() => {
    const dated = filteredOrders
      .map((order) => ({ order, date: parseOrderDate(order.createdAt) }))
      .filter((item): item is { order: typeof item.order; date: Date } => item.date !== null);

    if (dated.length === 0) {
      const today = new Date();
      return [
        {
          key: format(today, "yyyy-MM-dd"),
          label: format(today, "dd MMM"),
          tooltipLabel: format(today, "dd MMM yyyy"),
          delivered: 0,
          pipeline: 0,
          orders: 0,
        },
      ];
    }

    const bounds = getPeriodBounds(period);
    const timestamps = dated.map((item) => item.date.getTime());
    const minOrderDate = new Date(Math.min(...timestamps));
    const maxOrderDate = new Date(Math.max(...timestamps));

    const rangeStart = bounds.start ?? minOrderDate;
    const rangeEnd = bounds.start ? bounds.end : maxOrderDate;
    const safeStart = rangeStart <= rangeEnd ? rangeStart : minOrderDate;
    const safeEnd = rangeEnd >= safeStart ? rangeEnd : maxOrderDate;

    const spanDays = Math.max(0, differenceInCalendarDays(safeEnd, safeStart));
    const useMonthly = spanDays > 45;

    const bucketsMap = new Map<string, SalesBucketPoint>();
    const intervals = useMonthly
      ? eachMonthOfInterval({ start: safeStart, end: safeEnd })
      : eachDayOfInterval({ start: safeStart, end: safeEnd });

    for (const date of intervals) {
      const key = format(date, useMonthly ? "yyyy-MM" : "yyyy-MM-dd");
      bucketsMap.set(key, {
        key,
        label: format(date, useMonthly ? "MMM yy" : "dd MMM"),
        tooltipLabel: format(date, useMonthly ? "MMMM yyyy" : "dd MMM yyyy"),
        delivered: 0,
        pipeline: 0,
        orders: 0,
      });
    }

    for (const { order, date } of dated) {
      const key = format(date, useMonthly ? "yyyy-MM" : "yyyy-MM-dd");
      let bucket = bucketsMap.get(key);
      if (!bucket) {
        bucket = {
          key,
          label: format(date, useMonthly ? "MMM yy" : "dd MMM"),
          tooltipLabel: format(date, useMonthly ? "MMMM yyyy" : "dd MMM yyyy"),
          delivered: 0,
          pipeline: 0,
          orders: 0,
        };
        bucketsMap.set(key, bucket);
      }

      const status = normalizeOrderStatusKey(order.status);
      const amount = resolveOrderAmountDzd(order);
      bucket.orders += 1;
      if (status !== "cancelled") {
        bucket.pipeline += amount;
      }
      if (status === "delivered") {
        bucket.delivered += amount;
      }
    }

    return Array.from(bucketsMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [filteredOrders, period]);

  const loadingPlaceholder = "…";
  const readyProductCount = inventoryStats.inStockProducts + inventoryStats.lowStockProducts;
  const stockDisplay =
    isLoadingProducts && products.length === 0 ? loadingPlaceholder : `${inventoryStats.availablePercent}%`;

  return (
    <div className="h-full overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 xl:col-span-12">
      <div>
        <div className="grid grid-cols-1 xl:grid-cols-12">
          <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-3 xl:col-span-5 xl:border-r">
            {/* 1. Total Sales (Delivered Only) */}
            <Card className="h-full rounded-none border-0 border-border border-b ring-0 md:border-r">
              <CardHeader>
                <div className="flex items-center gap-1.5">
                  <CardTitle className="font-normal text-sm">Total Sales</CardTitle>
                  <Badge
                    variant="outline"
                    className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  >
                    Delivered
                  </Badge>
                </div>
                <CardDescription className="text-2xl sm:text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {isLoadingOrders ? loadingPlaceholder : formatDzd(metrics.deliveredRevenueDzd)}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <Banknote className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-xs sm:text-sm">
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">
                    {metrics.delivered} delivered
                  </span>
                  <span className="text-muted-foreground"> • Active: {formatDzd(metrics.activePipelineDzd)}</span>
                </div>
              </CardContent>
            </Card>

            {/* 2. Total Orders */}
            <Card className="h-full rounded-none border-0 border-border border-b ring-0">
              <CardHeader>
                <CardTitle className="font-normal text-sm">Total Orders</CardTitle>
                <CardDescription className="text-2xl sm:text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {isLoadingOrders ? loadingPlaceholder : metrics.totalOrders.toLocaleString("en-US")}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <ShoppingBag className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-xs sm:text-sm">
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">
                    {metrics.inProgressCount} active
                  </span>
                  <span className="text-muted-foreground"> • {metrics.redexCount} in Redex</span>
                </div>
              </CardContent>
            </Card>

            {/* 3. Unique Customers */}
            <Card className="h-full rounded-none border-0 border-border border-b ring-0 md:border-r">
              <CardHeader>
                <CardTitle className="font-normal text-sm">Unique Customers</CardTitle>
                <CardDescription className="text-2xl sm:text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {isLoadingOrders ? loadingPlaceholder : metrics.uniqueCustomers.toLocaleString("en-US")}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <Users className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-xs sm:text-sm">
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">
                    {metrics.repeatCustomers} repeat
                  </span>
                  <span className="text-muted-foreground"> • {metrics.wilayasCount} wilayas</span>
                </div>
              </CardContent>
            </Card>

            {/* 4. Average Order Value (DZD) */}
            <Card className="h-full rounded-none border-0 border-border border-b ring-0">
              <CardHeader>
                <CardTitle className="font-normal text-sm">Average Order</CardTitle>
                <CardDescription className="text-2xl sm:text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {isLoadingOrders ? loadingPlaceholder : formatDzd(metrics.avgOrderDzd)}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <ReceiptText className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  {metrics.delivered > 0
                    ? `Across ${metrics.delivered} delivered orders`
                    : `Across ${metrics.activeOrdersCount} active orders`}
                </div>
              </CardContent>
            </Card>

            {/* 5. Returns & Cancelled */}
            <Card className="h-full rounded-none border-0 border-border border-b ring-0 md:border-r md:border-b-0">
              <CardHeader>
                <CardTitle className="font-normal text-sm">Returns &amp; Cancelled</CardTitle>
                <CardDescription className="text-2xl sm:text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {isLoadingOrders ? loadingPlaceholder : metrics.returnAndCancelCount.toLocaleString("en-US")}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <RotateCcw className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-xs sm:text-sm">
                  <span
                    className={
                      metrics.returnAndCancelCount > 0 ? "text-destructive font-medium" : "text-muted-foreground"
                    }
                  >
                    {metrics.returnAndCancelRate}%
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    ({metrics.returned} ret / {metrics.cancelled} canc)
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 6. Stock Availability (Catalog) */}
            <Card className="h-full rounded-none border-0 ring-0">
              <CardHeader>
                <CardTitle className="font-normal text-sm">Stock Availability</CardTitle>
                <CardDescription className="text-2xl sm:text-3xl text-foreground tabular-nums leading-none tracking-tight">
                  {stockDisplay}
                </CardDescription>
                <CardAction className="grid size-6 place-items-center rounded-sm bg-muted">
                  <PackageCheck className="size-3 text-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="text-xs sm:text-sm">
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">
                    {readyProductCount}/{inventoryStats.totalProducts}
                  </span>
                  <span className="text-muted-foreground"> products ready ({inventoryStats.totalUnits} pcs)</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Chart: Real Sales & Orders Pipeline Overview */}
          <Card className="h-full rounded-none border-0 ring-0 xl:col-span-7">
            <CardHeader>
              <div className="flex flex-col gap-0.5">
                <CardTitle className="font-normal">Sales Overview (Delivered vs Orders Value)</CardTitle>
                <p className="text-muted-foreground text-xs">
                  Collected delivered revenue ({formatDzd(metrics.deliveredRevenueDzd)}) vs active orders pipeline (
                  {formatDzd(metrics.activePipelineDzd)})
                </p>
              </div>
              <CardAction>
                <Link href="/dashboard/analytics" aria-label="Open Analytics Overview">
                  <ArrowUpRight className="size-4" />
                </Link>
              </CardAction>
            </CardHeader>

            <CardContent>
              <ChartContainer config={revenueOverviewConfig} className="h-74 w-full">
                <ComposedChart accessibilityLayer data={chartData} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
                  <defs>
                    <filter id="sales-line-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feFlood floodColor="var(--color-delivered)" floodOpacity="0.35" />
                      <feComposite in2="blur" operator="in" />
                      <feMerge>
                        <feMergeNode />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid yAxisId="amount" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    height={30}
                    minTickGap={24}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    yAxisId="amount"
                    hide
                    domain={[0, (dataMax: number) => Math.max(5000, Math.ceil(dataMax * 1.15))]}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        className="w-56"
                        labelFormatter={(_, payload) => {
                          const point = payload?.[0]?.payload as SalesBucketPoint | undefined;
                          if (!point) return "";
                          return `${point.tooltipLabel} (${point.orders} orders)`;
                        }}
                        formatter={(value, name, item) => (
                          <>
                            <div
                              className="size-2.5 shrink-0 rounded-[2px]"
                              style={{
                                backgroundColor: item.color,
                              }}
                            />
                            <div className="flex flex-1 items-center justify-between gap-2 leading-none">
                              <span className="text-muted-foreground">{String(name ?? "")}</span>
                              <span className="font-medium font-mono text-foreground tabular-nums">
                                {formatDzd(Number(value ?? 0))}
                              </span>
                            </div>
                          </>
                        )}
                      />
                    }
                    cursor={{
                      stroke: "var(--border)",
                      strokeDasharray: "4 4",
                    }}
                  />
                  <Bar
                    yAxisId="amount"
                    barSize={10}
                    dataKey="pipeline"
                    fill="var(--color-pipeline)"
                    name="Orders Value"
                    opacity={0.22}
                    radius={[4, 4, 0, 0]}
                  />
                  <Area
                    yAxisId="amount"
                    dataKey="delivered"
                    fill="none"
                    filter="url(#sales-line-glow)"
                    name="Delivered Sales"
                    stroke="var(--color-delivered)"
                    strokeWidth={2}
                    type="monotone"
                    activeDot={{
                      r: 4,
                      fill: "var(--background)",
                      stroke: "var(--color-delivered)",
                      strokeWidth: 2,
                    }}
                    dot={false}
                  />
                </ComposedChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
