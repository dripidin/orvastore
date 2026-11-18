"use client";

import * as React from "react";

import Link from "next/link";

import { ArrowUpRight, PackageCheck, PackageX, TriangleAlert } from "lucide-react";
import { Label, Pie, PieChart } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";

import { useEcommerceOverview } from "./ecommerce-overview-context";

const GAUGE_SEGMENT_COUNT = 32;

const chartConfig = {
  "in-stock": {
    label: "In stock",
    color: "var(--chart-2)",
  },
  "low-stock": {
    label: "Low stock",
    color: "var(--chart-1)",
  },
  "out-of-stock": {
    label: "Out of stock",
    color: "var(--destructive)",
  },
  empty: {
    label: "No data",
    color: "var(--muted)",
  },
} satisfies ChartConfig;

export function Inventory() {
  const { inventoryStats, isLoadingProducts, products } = useEcommerceOverview();

  const {
    inStockProducts,
    lowStockProducts,
    outOfStockProducts,
    inStockUnits,
    lowStockUnits,
    totalUnits,
    totalProducts,
    availablePercent,
  } = inventoryStats;

  const gaugeSegments = React.useMemo(() => {
    if (totalProducts === 0) {
      return Array.from({ length: GAUGE_SEGMENT_COUNT }, (_, index) => ({
        fill: "var(--color-empty)",
        id: `segment-${index + 1}`,
        status: "empty",
        value: 1,
      }));
    }

    let inSeg = Math.round((inStockProducts / totalProducts) * GAUGE_SEGMENT_COUNT);
    let lowSeg = Math.round((lowStockProducts / totalProducts) * GAUGE_SEGMENT_COUNT);
    let outSeg = Math.max(0, GAUGE_SEGMENT_COUNT - inSeg - lowSeg);

    if (outOfStockProducts > 0 && outSeg === 0) {
      outSeg = 1;
      if (inSeg > lowSeg && inSeg > 0) inSeg -= 1;
      else if (lowSeg > 0) lowSeg -= 1;
    }

    return Array.from({ length: GAUGE_SEGMENT_COUNT }, (_, index) => {
      let status: "in-stock" | "low-stock" | "out-of-stock" = "out-of-stock";
      if (index < inSeg) status = "in-stock";
      else if (index < inSeg + lowSeg) status = "low-stock";
      return {
        fill: `var(--color-${status})`,
        id: `segment-${index + 1}`,
        status,
        value: 1,
      };
    });
  }, [totalProducts, inStockProducts, lowStockProducts, outOfStockProducts]);

  const inventorySummary = React.useMemo(
    () => [
      {
        icon: PackageCheck,
        label: "In stock",
        value: inStockProducts,
        subLabel: `${inStockUnits.toLocaleString("en-US")} pcs`,
      },
      {
        icon: TriangleAlert,
        label: "Low stock",
        value: lowStockProducts,
        subLabel: `${lowStockUnits.toLocaleString("en-US")} pcs`,
      },
      {
        icon: PackageX,
        label: "Out",
        value: outOfStockProducts,
        subLabel: "0 pcs",
      },
    ],
    [inStockProducts, lowStockProducts, outOfStockProducts, inStockUnits, lowStockUnits],
  );

  const isLoading = isLoadingProducts && products.length === 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Inventory</CardTitle>
        <CardDescription className="flex flex-wrap items-baseline gap-2 text-foreground text-xl tabular-nums leading-none tracking-tight">
          <span>{isLoading ? "…" : `${availablePercent}% available`}</span>
          {!isLoading && (
            <span className="font-normal text-muted-foreground text-xs">
              ({totalUnits.toLocaleString("en-US")} pcs • {totalProducts} products)
            </span>
          )}
        </CardDescription>
        <CardAction>
          <Link href="/dashboard/products" aria-label="Manage Products & Inventory">
            <ArrowUpRight className="size-4" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChartContainer config={chartConfig} className="mx-auto h-30 w-full">
          <PieChart>
            <Pie
              cx="50%"
              cy="100%"
              cornerRadius={6}
              data={gaugeSegments}
              dataKey="value"
              endAngle={0}
              innerRadius={80}
              outerRadius={110}
              paddingAngle={2}
              startAngle={180}
              stroke="var(--card)"
              strokeWidth={1}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text textAnchor="middle" x={viewBox.cx} y={viewBox.cy}>
                        <tspan
                          className="fill-foreground font-medium text-2xl tabular-nums"
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 22}
                        >
                          {isLoading ? "…" : `${availablePercent}%`}
                        </tspan>
                        <tspan className="fill-muted-foreground text-xs" x={viewBox.cx} y={(viewBox.cy || 0) + 38}>
                          Available
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <Separator />

        <div className="grid grid-cols-3 divide-x">
          {inventorySummary.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-2 text-center">
              <div className="grid size-9 place-items-center rounded-full bg-muted">
                <item.icon className="size-4 text-muted-foreground" />
              </div>
              <div>
                <div className="text-muted-foreground text-xs leading-none">{item.label}</div>
                <div className="mt-1 font-medium text-sm tabular-nums">
                  {isLoading ? "…" : item.value.toLocaleString("en-US")}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">{item.subLabel}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
