"use client";

import * as React from "react";

import { Globe } from "lucide-react";
import { Bar, BarChart, LabelList, type LabelProps, XAxis, YAxis } from "recharts";
import { type SimpleIcon as SimpleIconType, siGoogle, siMeta, siTiktok, siWhatsapp } from "simple-icons";

import { SimpleIcon } from "@/components/simple-icon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const { filteredOrders, isLoadingOrders } = useEcommerceOverview();

  const { trafficSources, totalCount } = React.useMemo<{
    trafficSources: TrafficSourceItem[];
    totalCount: number;
  }>(() => {
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
  }, [filteredOrders]);

  const headline = React.useMemo(() => {
    if (isLoadingOrders) return "…";
    return `${totalCount.toLocaleString("en-US")} attributed orders`;
  }, [isLoadingOrders, totalCount]);

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-normal text-muted-foreground text-sm">Order Attribution Sources</CardTitle>
        </div>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {headline}
        </CardDescription>
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
