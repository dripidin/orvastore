"use client";

import * as React from "react";

import Link from "next/link";

import { ArrowUpRight } from "lucide-react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatDzd } from "@/lib/orva-api";
import { getApiProductsRepository } from "@/lib/repository/api-products-repository";
import type { Product } from "@/lib/repository/product-types";
import { useOrvaOrders } from "@/lib/use-orva-orders";

import { buildTopProductsData, type TopProductItem, useOptionalEcommerceOverview } from "./ecommerce-overview-context";

const SEGMENT_COLORS = [
  "var(--chart-3)",
  "var(--chart-2)",
  "var(--chart-1)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

interface TopProductsViewProps {
  items: TopProductItem[];
  isLoading: boolean;
  showAll: boolean;
}

function TopProductsView({ items, isLoading, showAll }: TopProductsViewProps) {
  const visibleItems = showAll ? items : items.slice(0, 4);
  const topBarItems = items.filter((item) => item.sharePct > 0).slice(0, 4);

  const displayedShareTotal = visibleItems.reduce((sum, item) => sum + item.sharePct, 0);
  const totalCollectedDzd = items.reduce((sum, item) => sum + item.collectedRevenueDzd, 0);
  let headlineText = `${Math.min(100, displayedShareTotal)}% of sales`;
  if (isLoading) {
    headlineText = "…";
  } else if (items.length === 0) {
    headlineText = "0 د.ج";
  } else if (showAll) {
    headlineText = formatDzd(totalCollectedDzd);
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">
          {showAll ? "All Store Products Performance" : "Top Products"}
        </CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {headlineText}
        </CardDescription>
        <CardAction>
          {!showAll ? (
            <Link href="/dashboard/top-products" aria-label="Open Top Products">
              <ArrowUpRight className="size-4" />
            </Link>
          ) : (
            <Link href="/dashboard/ecommerce" aria-label="Back to Store Overview">
              <ArrowUpRight className="size-4" />
            </Link>
          )}
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div
            aria-label="Sales by top products"
            className="flex h-2 gap-1 overflow-hidden rounded-full bg-muted"
            role="img"
          >
            {topBarItems.length > 0 ? (
              topBarItems.map((item, idx) => (
                <div
                  aria-hidden="true"
                  key={item.id}
                  className="rounded-md"
                  style={{
                    backgroundColor: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
                    width: `${Math.max(4, item.sharePct)}%`,
                  }}
                />
              ))
            ) : (
              <div aria-hidden="true" className="w-full rounded-md bg-muted" />
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {topBarItems.map((item, idx) => (
              <div className="flex items-center gap-1.5" key={item.id}>
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: SEGMENT_COLORS[idx % SEGMENT_COLORS.length] }}
                />
                <span className="max-w-[140px] truncate text-muted-foreground text-xs" title={item.name}>
                  {item.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {visibleItems.length === 0 && !isLoading ? (
          <div className="py-6 text-center text-muted-foreground text-xs">
            No product sales recorded for this filter yet.
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-3">
            <div className="text-muted-foreground text-xs">Products</div>
            <div className="text-muted-foreground text-xs">Share</div>
            <div className="text-muted-foreground text-xs">Sales (Delivered)</div>

            {visibleItems.map((product) => (
              <div className="contents text-sm" key={product.id}>
                <div className="min-w-0">
                  <div className="truncate font-medium" title={product.name}>
                    {product.name}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {product.totalOrders} orders • {product.deliveredOrders} delivered
                  </div>
                </div>
                <div className="self-center text-muted-foreground tabular-nums">{product.sharePct}%</div>
                <div className="self-center text-right font-medium tabular-nums">
                  {formatDzd(product.collectedRevenueDzd)}
                  {product.collectedRevenueDzd === 0 && product.pipelineRevenueDzd > 0 && (
                    <div className="font-normal text-[10px] text-muted-foreground">
                      Active: {formatDzd(product.pipelineRevenueDzd)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopProductsStandalone({ showAll }: { showAll: boolean }) {
  const { orders, isLoading: isLoadingOrders } = useOrvaOrders();
  const [products, setProducts] = React.useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const list = await getApiProductsRepository().getProducts();
        if (active) setProducts(list);
      } catch (err) {
        console.warn("[TopProductsStandalone] Failed to load catalog:", err);
      } finally {
        if (active) setIsLoadingProducts(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const items = React.useMemo(() => buildTopProductsData(orders, products), [orders, products]);

  return <TopProductsView items={items} isLoading={isLoadingOrders || isLoadingProducts} showAll={showAll} />;
}

export function TopProducts({ showAll = false }: { showAll?: boolean } = {}) {
  const overview = useOptionalEcommerceOverview();

  if (overview) {
    return (
      <TopProductsView
        items={overview.topProducts}
        isLoading={overview.isLoadingOrders || overview.isLoadingProducts}
        showAll={showAll}
      />
    );
  }

  return <TopProductsStandalone showAll={showAll} />;
}
