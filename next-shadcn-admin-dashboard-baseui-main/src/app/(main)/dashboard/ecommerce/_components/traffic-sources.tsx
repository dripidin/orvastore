"use client";

import * as React from "react";

import Link from "next/link";

import { ArrowUpRight, Globe } from "lucide-react";
import { Bar, BarChart, LabelList, type LabelProps, XAxis, YAxis } from "recharts";
import { type SimpleIcon as SimpleIconType, siGoogle, siMeta, siTiktok, siWhatsapp } from "simple-icons";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";

import { resolveOrderChannelKey, useEcommerceOverview } from "./ecommerce-overview-context";

interface TrafficSourceItem {
  key: string;
  name: string;
  count: number;
  countLabel: string;
  share: number;
  shareText: string;
  icon: SimpleIconType | null;
}

const trafficSourcesConfig = {
  share: {
    label: "Share %",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

type IconLabelProps = {
  height?: number | string;
  index?: number;
  width?: number | string;
  x?: number | string;
  y?: number | string;
  items: TrafficSourceItem[];
};

type SourceLabelProps = LabelProps & {
  index?: number;
  items: TrafficSourceItem[];
};

type SourceChangeLabelProps = LabelProps & {
  value?: number | string;
};

function getNumber(value: number | string | undefined) {
  return typeof value === "number" ? value : Number(value);
}

function classifyHostname(rawLabel: string): {
  key: string;
  name: string;
  icon: SimpleIconType | null;
} {
  const lower = rawLabel.trim().toLowerCase();
  if (!lower || lower.includes("مباشر") || lower === "direct" || lower.includes("orva-store")) {
    return { key: "direct", name: "Direct", icon: null };
  }
  if (lower.includes("facebook") || lower.includes("fb.com") || lower.includes("instagram") || lower.includes("meta")) {
    return { key: "meta", name: "Meta Ads", icon: siMeta };
  }
  if (lower.includes("google")) {
    return { key: "google", name: "Google", icon: siGoogle };
  }
  if (lower.includes("tiktok")) {
    return { key: "tiktok", name: "TikTok", icon: siTiktok };
  }
  if (lower.includes("whatsapp") || lower.includes("wa.me")) {
    return { key: "whatsapp", name: "WhatsApp", icon: siWhatsapp };
  }
  return { key: `ref:${lower}`, name: rawLabel, icon: null };
}

function TrafficSourceIconLabel({ height, index, width, x, y, items }: IconLabelProps) {
  if (typeof index !== "number") return null;

  const source = items[index];
  const xValue = getNumber(x);
  const yValue = getNumber(y);
  const widthValue = getNumber(width);
  const heightValue = getNumber(height);

  if (
    !source ||
    Number.isNaN(xValue) ||
    Number.isNaN(yValue) ||
    Number.isNaN(widthValue) ||
    Number.isNaN(heightValue)
  ) {
    return null;
  }

  const iconSize = 16;
  const iconX = Math.max(xValue + 10, xValue + widthValue - iconSize - 10);
  const iconY = yValue + (heightValue - iconSize) / 2;

  return (
    <foreignObject height={iconSize} x={iconX} y={iconY} width={iconSize}>
      {source.icon ? (
        <SimpleIcon icon={source.icon} className="size-4 fill-foreground" />
      ) : (
        <Globe className="size-4 text-foreground" />
      )}
    </foreignObject>
  );
}

function TrafficSourceNameLabel({ height, index, x, y, items }: SourceLabelProps) {
  if (typeof index !== "number") return null;

  const source = items[index];
  const xValue = getNumber(x);
  const yValue = getNumber(y);
  const heightValue = getNumber(height);

  if (!source || Number.isNaN(xValue) || Number.isNaN(yValue) || Number.isNaN(heightValue)) {
    return null;
  }

  return (
    <text dominantBaseline="middle" textAnchor="start" x={2} y={yValue + heightValue / 2}>
      <tspan className="fill-foreground font-medium" fontSize={13} x={2} y={yValue + heightValue / 2 - 7}>
        {source.name}
      </tspan>
      <tspan className="fill-muted-foreground" fontSize={12} x={2} y={yValue + heightValue / 2 + 11}>
        {source.countLabel}
      </tspan>
    </text>
  );
}

function TrafficSourceShareLabel({ height, value, y }: SourceChangeLabelProps) {
  const yValue = getNumber(y);
  const heightValue = getNumber(height);

  if (typeof value !== "string" || Number.isNaN(yValue) || Number.isNaN(heightValue)) {
    return null;
  }

  return (
    <text
      className="fill-muted-foreground font-medium tabular-nums"
      dominantBaseline="middle"
      dx={-6}
      fontSize={12}
      textAnchor="end"
      x="100%"
      y={yValue + heightValue / 2}
    >
      {value}
    </text>
  );
}

export function TrafficSources() {
  const { channel, filteredOrders, vercelAnalytics, isLoadingOrders, isLoadingAnalytics } = useEcommerceOverview();

  const hasVercelReferrers = Boolean(
    vercelAnalytics?.connected && vercelAnalytics.panels.referrers && vercelAnalytics.panels.referrers.length > 0,
  );

  const [modeOverride, setModeOverride] = React.useState<"auto" | "vercel" | "orders">("auto");

  const activeMode: "vercel" | "orders" = React.useMemo(() => {
    if (modeOverride === "orders") return "orders";
    if (modeOverride === "vercel" && hasVercelReferrers) return "vercel";
    if (channel === "all-channels" && hasVercelReferrers) return "vercel";
    return "orders";
  }, [modeOverride, hasVercelReferrers, channel]);

  const { trafficSources, totalCount } = React.useMemo<{
    trafficSources: TrafficSourceItem[];
    totalCount: number;
  }>(() => {
    if (activeMode === "vercel" && vercelAnalytics?.panels.referrers) {
      const grouped = new Map<string, { name: string; count: number; icon: SimpleIconType | null }>();

      for (const row of vercelAnalytics.panels.referrers) {
        const classified = classifyHostname(row.label);
        const prev = grouped.get(classified.key) ?? {
          name: classified.name,
          count: 0,
          icon: classified.icon,
        };
        prev.count += Number(row.visitors || 0);
        grouped.set(classified.key, prev);
      }

      const entries = Array.from(grouped.entries())
        .filter(([, item]) => item.count > 0)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);

      const total = entries.reduce((sum, [, item]) => sum + item.count, 0);
      return {
        totalCount: vercelAnalytics.summary?.visitors ?? total,
        trafficSources: entries.map(([key, item]) => {
          const share = total > 0 ? Math.max(4, Math.round((item.count / total) * 100)) : 0;
          const realPct = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return {
            key,
            name: item.name,
            count: item.count,
            countLabel: `${item.count.toLocaleString("en-US")} visits`,
            share,
            shareText: `${realPct}%`,
            icon: item.icon,
          };
        }),
      };
    }

    // Real Order Attribution sources from Supabase orders
    const orderGroups = new Map<string, { name: string; count: number; icon: SimpleIconType | null }>();
    for (const order of filteredOrders) {
      const ch = resolveOrderChannelKey(order);
      let label = "Direct";
      let icon: SimpleIconType | null = null;
      if (ch === "meta") {
        label = "Meta Ads";
        icon = siMeta;
      } else if (ch === "tiktok") {
        label = "TikTok";
        icon = siTiktok;
      } else if (ch === "google") {
        label = "Google";
        icon = siGoogle;
      } else if (ch === "manual") {
        label = "WhatsApp / Phone";
        icon = siWhatsapp;
      }
      const prev = orderGroups.get(ch) ?? { name: label, count: 0, icon };
      prev.count += 1;
      orderGroups.set(ch, prev);
    }

    const entries = Array.from(orderGroups.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    const total = filteredOrders.length;
    return {
      totalCount: total,
      trafficSources: entries.map(([key, item]) => {
        const realPct = total > 0 ? Math.round((item.count / total) * 100) : 0;
        return {
          key,
          name: item.name,
          count: item.count,
          countLabel: `${item.count.toLocaleString("en-US")} orders`,
          share: total > 0 ? Math.max(4, realPct) : 0,
          shareText: `${realPct}%`,
          icon: item.icon,
        };
      }),
    };
  }, [activeMode, vercelAnalytics, filteredOrders]);

  const headline = React.useMemo(() => {
    if (isLoadingOrders && isLoadingAnalytics) return "…";
    return activeMode === "vercel"
      ? `${totalCount.toLocaleString("en-US")} visits`
      : `${totalCount.toLocaleString("en-US")} attributed orders`;
  }, [isLoadingOrders, isLoadingAnalytics, activeMode, totalCount]);

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-normal text-muted-foreground text-sm">Traffic Sources</CardTitle>
          {hasVercelReferrers && (
            <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
              <Button
                type="button"
                size="xs"
                variant={activeMode === "vercel" ? "secondary" : "ghost"}
                onClick={() => setModeOverride("vercel")}
                className="h-5 px-2 text-[10px]"
              >
                Vercel Visits
              </Button>
              <Button
                type="button"
                size="xs"
                variant={activeMode === "orders" ? "secondary" : "ghost"}
                onClick={() => setModeOverride("orders")}
                className="h-5 px-2 text-[10px]"
              >
                Order Attribution
              </Button>
            </div>
          )}
        </div>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {headline}
        </CardDescription>
        <CardAction>
          <Link href="/dashboard/store-traffic" aria-label="Open Traffic Sources Analytics">
            <ArrowUpRight className="size-4" />
          </Link>
        </CardAction>
      </CardHeader>

      <CardContent>
        {trafficSources.length === 0 ? (
          <div className="flex h-54 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-xs">
            No source records found for the selected filter.
          </div>
        ) : (
          <ChartContainer config={trafficSourcesConfig} className="h-54 w-full">
            <BarChart
              accessibilityLayer
              barCategoryGap={12}
              data={trafficSources}
              layout="vertical"
              margin={{ bottom: 0, left: 108, right: 50, top: 0 }}
            >
              <defs>
                <pattern
                  height="4"
                  id="ecommerce-traffic-source-background-pattern"
                  patternTransform="rotate(45)"
                  patternUnits="userSpaceOnUse"
                  width="4"
                >
                  <rect height="6" width="6" fill="var(--muted)" fillOpacity="0.5" />
                  <line
                    stroke="var(--muted-foreground)"
                    strokeOpacity="0.10"
                    strokeWidth="1.25"
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="6"
                  />
                </pattern>
              </defs>
              <XAxis dataKey="share" domain={[0, 100]} hide type="number" />
              <YAxis dataKey="name" hide type="category" />
              <Bar
                background={{ fill: "url(#ecommerce-traffic-source-background-pattern)", radius: 8 }}
                barSize={36}
                dataKey="share"
                fill="var(--color-share)"
                fillOpacity={0.5}
                name="Share"
                radius={8}
                stroke="var(--color-share)"
                strokeOpacity={0.1}
                strokeWidth={0.5}
              >
                <LabelList
                  content={(props) => <TrafficSourceNameLabel {...props} items={trafficSources} />}
                  dataKey="name"
                />
                <LabelList
                  content={(props) => (
                    <TrafficSourceIconLabel
                      x={props.x}
                      y={props.y}
                      width={props.width}
                      height={props.height}
                      index={props.index}
                      items={trafficSources}
                    />
                  )}
                  dataKey="share"
                />
                <LabelList content={<TrafficSourceShareLabel />} dataKey="shareText" />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
