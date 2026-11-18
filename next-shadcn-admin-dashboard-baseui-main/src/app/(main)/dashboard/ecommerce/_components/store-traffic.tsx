"use client";

import * as React from "react";

import Link from "next/link";

import { eachDayOfInterval, format } from "date-fns";
import { ArrowUpRight } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

import {
  getPeriodBounds,
  normalizeOrderStatusKey,
  parseOrderDate,
  useEcommerceOverview,
} from "./ecommerce-overview-context";

interface TrafficChartPoint {
  bucket: string;
  label: string;
  primary: number;
  secondary: number;
}

export function StoreTraffic() {
  const { period, filteredOrders, vercelAnalytics, isLoadingOrders, isLoadingAnalytics } = useEcommerceOverview();

  const isVercelConnected = Boolean(vercelAnalytics?.connected && vercelAnalytics.summary);

  const chartConfig = React.useMemo<ChartConfig>(() => {
    if (isVercelConnected) {
      return {
        primary: {
          label: "Visitors",
          color: "var(--chart-3)",
        },
        secondary: {
          label: "Pageviews",
          color: "var(--chart-1)",
        },
      };
    }
    return {
      primary: {
        label: "Orders",
        color: "var(--chart-3)",
      },
      secondary: {
        label: "Delivered",
        color: "var(--chart-2)",
      },
    };
  }, [isVercelConnected]);

  const trafficData = React.useMemo<TrafficChartPoint[]>(() => {
    if (isVercelConnected && vercelAnalytics?.timeseries && vercelAnalytics.timeseries.length > 0) {
      return vercelAnalytics.timeseries.map((point) => ({
        bucket: point.bucket,
        label: point.bucket,
        primary: Number(point.visitors || 0),
        secondary: Number(point.pageviews || 0),
      }));
    }

    const dated = filteredOrders
      .map((order) => ({ order, date: parseOrderDate(order.createdAt) }))
      .filter((item): item is { order: typeof item.order; date: Date } => item.date !== null);

    if (dated.length === 0) {
      const todayKey = format(new Date(), "yyyy-MM-dd");
      return [{ bucket: todayKey, label: todayKey, primary: 0, secondary: 0 }];
    }

    const bounds = getPeriodBounds(period);
    const timestamps = dated.map((d) => d.date.getTime());
    const minDate = new Date(Math.min(...timestamps));
    const maxDate = new Date(Math.max(...timestamps));
    const start = bounds.start && bounds.start <= maxDate ? bounds.start : minDate;
    const end = bounds.start ? bounds.end : maxDate;

    const map = new Map<string, TrafficChartPoint>();
    for (const day of eachDayOfInterval({ start: start <= end ? start : minDate, end: end >= start ? end : maxDate })) {
      const key = format(day, "yyyy-MM-dd");
      map.set(key, {
        bucket: key,
        label: format(day, "dd MMM yyyy"),
        primary: 0,
        secondary: 0,
      });
    }

    for (const { order, date } of dated) {
      const key = format(date, "yyyy-MM-dd");
      let point = map.get(key);
      if (!point) {
        point = {
          bucket: key,
          label: format(date, "dd MMM yyyy"),
          primary: 0,
          secondary: 0,
        };
        map.set(key, point);
      }
      point.primary += 1;
      if (normalizeOrderStatusKey(order.status) === "delivered") {
        point.secondary += 1;
      }
    }

    return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }, [isVercelConnected, vercelAnalytics, filteredOrders, period]);

  const firstTick = trafficData[0]?.bucket ?? "";
  const lastTick = trafficData.at(-1)?.bucket ?? "";

  function formatTrafficTick(value: string) {
    if (value === firstTick && firstTick !== lastTick) {
      return trafficData[0]?.label || value;
    }
    if (value === lastTick) {
      return trafficData.at(-1)?.label || value;
    }
    return "";
  }

  const headline = React.useMemo(() => {
    if (isLoadingAnalytics && isLoadingOrders) return "…";
    if (isVercelConnected && vercelAnalytics?.summary) {
      return `${vercelAnalytics.summary.visitors.toLocaleString("en-US")} visitors`;
    }
    return `${filteredOrders.length.toLocaleString("en-US")} orders`;
  }, [isLoadingAnalytics, isLoadingOrders, isVercelConnected, vercelAnalytics, filteredOrders.length]);

  const maxTrafficVal = Math.max(4, ...trafficData.map((pt) => Math.max(pt.primary, pt.secondary)));

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="font-normal text-muted-foreground text-sm">Store Traffic</CardTitle>
          {isVercelConnected ? (
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
            >
              Vercel Live
            </Badge>
          ) : (
            <Link href="/dashboard/settings?tab=analytics">
              <Badge variant="outline" className="cursor-pointer text-[10px] hover:bg-muted">
                Orders Activity • أضف VERCEL_TOKEN
              </Badge>
            </Link>
          )}
        </div>
        <CardDescription className="flex flex-wrap items-baseline gap-2 text-foreground text-xl tabular-nums leading-none tracking-tight">
          <span>{headline}</span>
          {isVercelConnected && vercelAnalytics?.summary && (
            <span className="font-normal text-muted-foreground text-xs">
              ({vercelAnalytics.summary.pageviews.toLocaleString("en-US")} pageviews)
            </span>
          )}
        </CardDescription>
        <CardAction>
          <Link href="/dashboard/store-traffic" aria-label="Open Store Traffic">
            <ArrowUpRight className="size-4" />
          </Link>
        </CardAction>
      </CardHeader>

      <CardContent>
        <ChartContainer config={chartConfig} className="h-54 w-full">
          <AreaChart accessibilityLayer data={trafficData} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
            <defs>
              <linearGradient id="fillVisitors" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="bucket"
              tick={{ fontSize: 10 }}
              tickFormatter={(val) => formatTrafficTick(String(val))}
              tickLine={false}
              tickMargin={10}
              ticks={firstTick === lastTick ? [firstTick] : [firstTick, lastTick]}
            />
            <YAxis
              axisLine={false}
              domain={[0, Math.ceil(maxTrafficVal * 1.15)]}
              allowDecimals={false}
              tickLine={false}
              tickMargin={6}
              width={36}
              yAxisId="traffic"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as TrafficChartPoint | undefined;
                    return p?.label ?? "";
                  }}
                />
              }
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
            />
            <ChartLegend align="right" verticalAlign="top" className="justify-end" content={<ChartLegendContent />} />
            <Area
              dataKey="primary"
              dot={false}
              fill="url(#fillVisitors)"
              stroke="var(--color-primary)"
              strokeWidth={2}
              type="monotone"
              yAxisId="traffic"
            />
            <Line
              dataKey="secondary"
              dot={false}
              stroke="var(--color-secondary)"
              strokeLinecap="round"
              strokeWidth={1.6}
              type="monotone"
              yAxisId="traffic"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
