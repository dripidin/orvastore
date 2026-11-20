"use client";

import * as React from "react";

import { endOfMonth, format, startOfDay, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";

import { formatDzd, type OrvaOrder } from "@/lib/orva-api";
import { getApiProductsRepository } from "@/lib/repository/api-products-repository";
import { matchOrderToProduct, type Product } from "@/lib/repository/product-types";
import { useOrvaOrders } from "@/lib/use-orva-orders";

export type EcommercePeriod =
  | "all-time"
  | "this-month"
  | "last-month"
  | "last-30-days"
  | "last-7-days"
  | "year-to-date";

export type EcommerceChannel = "all-channels" | "meta" | "direct" | "tiktok" | "google" | "manual";

export interface TopProductItem {
  id: string;
  name: string;
  sku: string;
  totalOrders: number;
  deliveredOrders: number;
  collectedRevenueDzd: number;
  pipelineRevenueDzd: number;
  sharePct: number;
  salesDisplay: string;
  stockQuantity: number | null;
}

export interface InventoryBreakdownStats {
  inStockProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  inStockUnits: number;
  lowStockUnits: number;
  totalUnits: number;
  totalProducts: number;
  availablePercent: number;
}

export function resolveOrderAmountDzd(order: OrvaOrder): number {
  return Math.max(0, Number(order.grandTotalDzd ?? order.priceDzd ?? 0) || 0);
}

export function normalizeOrderStatusKey(status?: string | null): string {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "delivered") return "delivered";
  if (s === "returned") return "returned";
  if (s === "cancelled" || s === "deleted") return "cancelled";
  if (s === "shipped" || s === "in_transit" || s === "out_for_delivery" || s === "redex_station") return "shipped";
  if (s === "confirmed" || s === "pushed") return "confirmed";
  return "pending";
}

export function parseOrderDate(createdAt?: string | null): Date | null {
  if (!createdAt) return null;
  const trimmed = createdAt.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed.includes("T") || !trimmed.includes(" ") ? trimmed : trimmed.replace(" ", "T"));
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function resolveOrderChannelKey(order: OrvaOrder): Exclude<EcommerceChannel, "all-channels"> {
  const src = (order.attributionSource ?? "").trim().toLowerCase();
  if (
    src.includes("facebook") ||
    src.includes("instagram") ||
    src.includes("meta") ||
    order.fbCampaignId?.trim() ||
    order.fbclid?.trim()
  ) {
    return "meta";
  }
  if (src.includes("tiktok")) return "tiktok";
  if (src.includes("google")) return "google";
  if (src.includes("whatsapp") || src.includes("phone") || src.includes("manual")) return "manual";
  return "direct";
}

export function getPeriodBounds(period: EcommercePeriod, now = new Date()): { start: Date | null; end: Date } {
  const end = now;
  switch (period) {
    case "this-month":
      return { start: startOfMonth(now), end };
    case "last-month": {
      const prevMonthDate = subMonths(now, 1);
      return { start: startOfMonth(prevMonthDate), end: endOfMonth(prevMonthDate) };
    }
    case "last-30-days":
      return { start: startOfDay(subDays(now, 29)), end };
    case "last-7-days":
      return { start: startOfDay(subDays(now, 6)), end };
    case "year-to-date":
      return { start: startOfYear(now), end };
    default:
      return { start: null, end };
  }
}

export function filterOrdersByOverviewFilters(
  orders: OrvaOrder[],
  period: EcommercePeriod,
  channel: EcommerceChannel,
  now = new Date(),
): OrvaOrder[] {
  const { start, end } = getPeriodBounds(period, now);
  return orders.filter((order) => {
    if (channel !== "all-channels" && resolveOrderChannelKey(order) !== channel) {
      return false;
    }
    if (!start) return true;
    const d = parseOrderDate(order.createdAt);
    if (!d) return false;
    return d >= start && d <= end;
  });
}

export function buildTopProductsData(orders: OrvaOrder[], products: Product[]): TopProductItem[] {
  const catalogById = new Map<string, Product>();
  const catalogBySlug = new Map<string, Product>();
  const catalogByTitle = new Map<string, Product>();

  for (const product of products) {
    catalogById.set(product.id, product);
    if (product.slug) catalogBySlug.set(product.slug.trim().toLowerCase(), product);
    if (product.sku) catalogBySlug.set(product.sku.trim().toLowerCase(), product);
    catalogByTitle.set(product.title.trim().toLowerCase(), product);
  }

  interface AggEntry {
    id: string;
    name: string;
    sku: string;
    totalOrders: number;
    deliveredOrders: number;
    collectedRevenueDzd: number;
    pipelineRevenueDzd: number;
    stockQuantity: number | null;
  }

  const buckets = new Map<string, AggEntry>();

  const ensureCatalogBucket = (p: Product): AggEntry => {
    const key = `cat:${p.id}`;
    let entry = buckets.get(key);
    if (!entry) {
      entry = {
        id: p.id,
        name: p.title,
        sku: p.sku || p.slug?.toUpperCase() || "ORVA",
        totalOrders: 0,
        deliveredOrders: 0,
        collectedRevenueDzd: 0,
        pipelineRevenueDzd: 0,
        stockQuantity: p.stockQuantity,
      };
      buckets.set(key, entry);
    }
    return entry;
  };

  for (const order of orders) {
    const status = normalizeOrderStatusKey(order.status);
    if (status === "cancelled") continue;

    const rawPackId = String(order.raw.pack_id ?? "")
      .trim()
      .toLowerCase();
    const rawTitle = (order.productName ?? "").trim();
    const normTitle = rawTitle.toLowerCase();

    let matchedProduct: Product | undefined =
      (rawPackId ? catalogBySlug.get(rawPackId) : undefined) || (normTitle ? catalogByTitle.get(normTitle) : undefined);

    if (!matchedProduct && rawTitle) {
      const mapping = matchOrderToProduct(rawTitle);
      if (mapping.matchedProductId) {
        matchedProduct =
          catalogById.get(mapping.matchedProductId) ||
          (mapping.matchedSku ? catalogBySlug.get(mapping.matchedSku.toLowerCase()) : undefined);
      }
    }

    if (!matchedProduct && normTitle) {
      matchedProduct = products.find(
        (p) => normTitle.includes(p.title.trim().toLowerCase()) || p.title.trim().toLowerCase().includes(normTitle),
      );
    }

    let entry: AggEntry;
    if (matchedProduct) {
      entry = ensureCatalogBucket(matchedProduct);
    } else {
      const fallbackName = rawTitle || "منتج ORVA";
      const fallbackKey = `ord:${fallbackName.toLowerCase()}`;
      const existing = buckets.get(fallbackKey);
      if (existing) {
        entry = existing;
      } else {
        entry = {
          id: fallbackKey,
          name: fallbackName,
          sku: rawPackId ? rawPackId.toUpperCase() : "ORVA",
          totalOrders: 0,
          deliveredOrders: 0,
          collectedRevenueDzd: 0,
          pipelineRevenueDzd: 0,
          stockQuantity: null,
        };
        buckets.set(fallbackKey, entry);
      }
    }

    const amount = resolveOrderAmountDzd(order);
    entry.totalOrders += 1;
    entry.pipelineRevenueDzd += amount;
    if (status === "delivered") {
      entry.deliveredOrders += 1;
      entry.collectedRevenueDzd += amount;
    }
  }

  // Include active catalog products that currently have 0 orders in the selected filter
  for (const product of products) {
    if (product.status === "archived") continue;
    ensureCatalogBucket(product);
  }

  const list = Array.from(buckets.values()).filter((item) => item.totalOrders > 0 || item.stockQuantity !== null);
  const totalCollected = list.reduce((sum, item) => sum + item.collectedRevenueDzd, 0);
  const totalPipeline = list.reduce((sum, item) => sum + item.pipelineRevenueDzd, 0);
  const denominator = totalCollected > 0 ? totalCollected : totalPipeline;

  return list
    .sort(
      (a, b) =>
        b.collectedRevenueDzd - a.collectedRevenueDzd ||
        b.deliveredOrders - a.deliveredOrders ||
        b.totalOrders - a.totalOrders ||
        b.pipelineRevenueDzd - a.pipelineRevenueDzd,
    )
    .map((item) => {
      const numerator = totalCollected > 0 ? item.collectedRevenueDzd : item.pipelineRevenueDzd;
      const sharePct = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
      const displayVal = item.collectedRevenueDzd > 0 ? item.collectedRevenueDzd : item.pipelineRevenueDzd;
      return {
        ...item,
        sharePct,
        salesDisplay: formatDzd(displayVal),
      };
    });
}

export function computeInventoryStats(products: Product[]): InventoryBreakdownStats {
  const nonArchived = products.filter((p) => p.status !== "archived");
  const target = nonArchived.length > 0 ? nonArchived : products;

  let inStockProducts = 0;
  let lowStockProducts = 0;
  let outOfStockProducts = 0;
  let inStockUnits = 0;
  let lowStockUnits = 0;

  for (const p of target) {
    const qty = Math.max(0, Number(p.stockQuantity) || 0);
    const threshold = Math.max(1, Number(p.lowStockThreshold) || 5);
    if (p.showOutOfStock === true || qty <= 0) {
      outOfStockProducts += 1;
    } else if (qty <= threshold) {
      lowStockProducts += 1;
      lowStockUnits += qty;
    } else {
      inStockProducts += 1;
      inStockUnits += qty;
    }
  }

  const totalProducts = target.length;
  const availableProducts = inStockProducts + lowStockProducts;
  const availablePercent = totalProducts > 0 ? Math.round((availableProducts / totalProducts) * 100) : 0;

  return {
    inStockProducts,
    lowStockProducts,
    outOfStockProducts,
    inStockUnits,
    lowStockUnits,
    totalUnits: inStockUnits + lowStockUnits,
    totalProducts,
    availablePercent,
  };
}

export interface EcommerceOverviewContextValue {
  period: EcommercePeriod;
  setPeriod: (p: EcommercePeriod) => void;
  channel: EcommerceChannel;
  setChannel: (c: EcommerceChannel) => void;
  allOrders: OrvaOrder[];
  filteredOrders: OrvaOrder[];
  products: Product[];
  inventoryStats: InventoryBreakdownStats;
  topProducts: TopProductItem[];
  isLoadingOrders: boolean;
  isLoadingProducts: boolean;
  isRefreshing: boolean;
  refreshAll: () => Promise<void>;
  formattedToday: string;
}

const EcommerceOverviewContext = React.createContext<EcommerceOverviewContextValue | null>(null);

export function useOptionalEcommerceOverview(): EcommerceOverviewContextValue | null {
  return React.useContext(EcommerceOverviewContext);
}

export function useEcommerceOverview(): EcommerceOverviewContextValue {
  const ctx = React.useContext(EcommerceOverviewContext);
  if (!ctx) {
    throw new Error("useEcommerceOverview must be used inside <EcommerceOverviewProvider>");
  }
  return ctx;
}

export function EcommerceOverviewProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriod] = React.useState<EcommercePeriod>("all-time");
  const [channel, setChannel] = React.useState<EcommerceChannel>("all-channels");
  const {
    orders,
    isLoading: isLoadingOrders,
    isRefreshing: isRefreshingOrders,
    refresh: refreshOrders,
  } = useOrvaOrders();

  const [products, setProducts] = React.useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = React.useState(true);
  const [manualRefreshing, setManualRefreshing] = React.useState(false);

  const loadProducts = React.useCallback(async () => {
    try {
      const repo = getApiProductsRepository();
      const list = await repo.getProducts();
      setProducts(list);
    } catch (err) {
      console.warn("[EcommerceOverview] Could not load catalog products:", err);
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  React.useEffect(() => {
    void loadProducts();
    const handleCatalogUpdate = () => void loadProducts();
    window.addEventListener("orva:catalog-updated", handleCatalogUpdate);
    window.addEventListener("orva:products-updated", handleCatalogUpdate);
    return () => {
      window.removeEventListener("orva:catalog-updated", handleCatalogUpdate);
      window.removeEventListener("orva:products-updated", handleCatalogUpdate);
    };
  }, [loadProducts]);

  const refreshAll = React.useCallback(async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([refreshOrders(), loadProducts()]);
    } finally {
      setManualRefreshing(false);
    }
  }, [refreshOrders, loadProducts]);

  const filteredOrders = React.useMemo(
    () => filterOrdersByOverviewFilters(orders, period, channel),
    [orders, period, channel],
  );

  const inventoryStats = React.useMemo(() => computeInventoryStats(products), [products]);
  const topProducts = React.useMemo(() => buildTopProductsData(filteredOrders, products), [filteredOrders, products]);

  const formattedToday = React.useMemo(() => format(new Date(), "EEEE, do MMMM yyyy"), []);

  const value = React.useMemo<EcommerceOverviewContextValue>(
    () => ({
      period,
      setPeriod,
      channel,
      setChannel,
      allOrders: orders,
      filteredOrders,
      products,
      inventoryStats,
      topProducts,
      isLoadingOrders,
      isLoadingProducts,
      isRefreshing: isRefreshingOrders || manualRefreshing,
      refreshAll,
      formattedToday,
    }),
    [
      period,
      channel,
      orders,
      filteredOrders,
      products,
      inventoryStats,
      topProducts,
      isLoadingOrders,
      isLoadingProducts,
      isRefreshingOrders,
      manualRefreshing,
      refreshAll,
      formattedToday,
    ],
  );

  return <EcommerceOverviewContext.Provider value={value}>{children}</EcommerceOverviewContext.Provider>;
}
