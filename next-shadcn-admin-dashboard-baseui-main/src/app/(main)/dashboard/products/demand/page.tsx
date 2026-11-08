"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Filter,
  Globe2,
  Layers,
  MapPin,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DevEnvironmentBanner } from "@/components/dev-environment-banner";

import {
  AlgeriaMap,
  WilayaDemandMetricItem,
} from "../../logistics/_components/algeria-map";

import { getMockProductsRepository } from "@/lib/repository/mock-products-repository";
import { getOrdersRepository, getAppRepositoryMode } from "@/lib/orva-api";
import { getMockVisitorAnalyticsRepository } from "@/lib/analytics/mock-visitor-analytics-repository";

import type { Product } from "@/lib/repository/product-types";
import type { OrvaOrder, RepositoryMode } from "@/lib/repository/types";
import type { VisitorSessionRecord } from "@/lib/analytics/visitor-analytics-types";

import {
  GeographicalFilterState,
  GeographicalMetricType,
  GeographicalSummary,
  OrderStatusFilter,
  ProductComparisonItem,
  TimeRangeFilter,
  WilayaDemandRecord,
} from "@/lib/analytics/wilaya-demand-types";

import {
  computeGeographicalDemand,
  computeProductComparisons,
} from "@/lib/analytics/wilaya-demand-calculator";

const INITIAL_FILTER: GeographicalFilterState = {
  selectedProductId: "all",
  timeRange: "all",
  statusFilter: "all",
  activeMetric: "demand_share",
  searchQuery: "",
};

export default function ProductDemandByWilayaPage() {
  const productsRepo = useMemo(() => getMockProductsRepository(), []);
  const analyticsRepo = useMemo(() => getMockVisitorAnalyticsRepository(), []);

  const [repoMode, setRepoMode] = useState<RepositoryMode>("mock");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrvaOrder[]>([]);
  const [sessions, setSessions] = useState<VisitorSessionRecord[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<GeographicalFilterState>(INITIAL_FILTER);

  // Selected Wilaya for Map & Drawer Details
  const [selectedWilayaCode, setSelectedWilayaCode] = useState<number | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // Product Comparison Selection (Dynamically initialized from catalog)
  const [comparisonProductIds, setComparisonProductIds] = useState<string[]>([]);
  const hasInitializedComparison = useRef<boolean>(false);

  // Table pagination & sorting
  const [tableSortField, setTableSortField] = useState<keyof WilayaDemandRecord>("totalOrders");
  const [tableSortAsc, setTableSortAsc] = useState<boolean>(false);
  const [tablePage, setTablePage] = useState<number>(1);
  const PAGE_SIZE = 12;

  // Load repositories data using the centralized getOrdersRepository()
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const ordersRepo = getOrdersRepository();
      const [prods, ords, sess] = await Promise.all([
        productsRepo.getProducts(),
        ordersRepo.getOrders(),
        analyticsRepo.getSessions(),
      ]);
      setProducts(prods);
      setOrders(ords);
      setSessions(sess);
    } catch (err: any) {
      console.error("Failed to load demand analytics data:", err);
      // Strictly show explicit error, never fallback to mock data in live mode failure
      setLoadError(err?.message || "تعذر تحميل بيانات الطلبات من المصدر المركزي المحدد.");
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, [productsRepo, analyticsRepo]);

  // Initial load and listen for repository mode change events
  useEffect(() => {
    setRepoMode(getAppRepositoryMode());
    loadData();

    const handleModeChange = () => {
      setRepoMode(getAppRepositoryMode());
      loadData();
    };

    window.addEventListener("orva:repository-mode-changed", handleModeChange);
    return () => window.removeEventListener("orva:repository-mode-changed", handleModeChange);
  }, [loadData]);

  // Deduplicated products ensuring single canonical Sac Banane
  const uniqueProducts = useMemo(() => {
    const seenTitles = new Set<string>();
    const list: Product[] = [];
    for (const p of products) {
      if (p.id === "prod_sac_bundle") continue;
      const normTitle = p.title.toLowerCase().startsWith("sac banane") ? "sac banane moto yamaha" : p.title;
      if (!seenTitles.has(normTitle)) {
        seenTitles.add(normTitle);
        list.push(p);
      }
    }
    return list;
  }, [products]);

  // Synchronize comparison product selection dynamically from loaded products
  useEffect(() => {
    if (uniqueProducts.length === 0) {
      setComparisonProductIds([]);
      return;
    }

    setComparisonProductIds((prev) => {
      const validProductIds = new Set(uniqueProducts.map((p) => p.id));
      // Remove any archived / deleted product IDs
      const filtered = prev.filter((id) => validProductIds.has(id));
      const uniqueExisting = Array.from(new Set(filtered));

      // If comparison has not been initialized yet or all selections were purged
      if (!hasInitializedComparison.current || uniqueExisting.length === 0) {
        hasInitializedComparison.current = true;
        // Select first 2 available products if 2+ exist, or the single available product
        const initial = uniqueProducts.slice(0, 2).map((p) => p.id);
        return Array.from(new Set(initial));
      }

      // Preserve supervisor's manual selection
      return uniqueExisting;
    });
  }, [uniqueProducts]);

  // Compute Geographical Summary via calculator
  const geoSummary: GeographicalSummary = useMemo(() => {
    return computeGeographicalDemand({
      orders,
      products: uniqueProducts,
      sessions,
      filter,
    });
  }, [orders, uniqueProducts, sessions, filter]);

  // Compute Product Comparisons
  const comparisons: ProductComparisonItem[] = useMemo(() => {
    if (comparisonProductIds.length === 0) return [];
    return computeProductComparisons({
      orders,
      products: uniqueProducts,
      sessions,
      productIds: comparisonProductIds,
    });
  }, [orders, uniqueProducts, sessions, comparisonProductIds]);

  // Convert wilaya breakdown to Map for AlgeriaMap choropleth
  const demandMetricsMap = useMemo(() => {
    const map = new Map<number, WilayaDemandMetricItem>();
    for (const w of geoSummary.wilayaBreakdown) {
      let metricValue = 0;
      let formattedValue = "0";

      switch (filter.activeMetric) {
        case "demand_share":
          metricValue = w.demandSharePercentage;
          formattedValue = `${w.demandSharePercentage}%`;
          break;
        case "product_mix":
          metricValue = w.productMixPercentage;
          formattedValue = `${w.productMixPercentage}%`;
          break;
        case "regional_cvr":
          metricValue = w.regionalConversionRate ?? 0;
          formattedValue = w.regionalConversionRate !== null ? `${w.regionalConversionRate}%` : "غير متاح";
          break;
        case "total_orders":
          metricValue = w.totalOrders;
          formattedValue = `${w.totalOrders} طلب`;
          break;
      }

      map.set(w.numericCode, {
        wilayaCode: w.numericCode,
        metricValue,
        formattedValue,
        totalOrders: w.totalOrders,
        deliveredOrders: w.deliveredOrders,
        returnedOrders: w.returnedOrders,
        regionalConversionRate: w.regionalConversionRate,
        knownViewSessions: w.knownViewSessions,
      });
    }
    return map;
  }, [geoSummary.wilayaBreakdown, filter.activeMetric]);

  // Determine Max Metric Value for Choropleth scale
  const maxMetricValue = useMemo(() => {
    let max = 0;
    demandMetricsMap.forEach((item) => {
      if (item.metricValue > max) max = item.metricValue;
    });
    return max > 0 ? max : 100;
  }, [demandMetricsMap]);

  // Active Metric Label in Arabic
  const activeMetricTitle = useMemo(() => {
    switch (filter.activeMetric) {
      case "demand_share":
        return "حصة الطلب الجغرافي (Demand Share)";
      case "product_mix":
        return "مزيج منتجات الولاية (Product Mix)";
      case "regional_cvr":
        return "معدل التحويل الإقليمي (Regional CVR)";
      case "total_orders":
        return "إجمالي الطلبات (Total Orders)";
    }
  }, [filter.activeMetric]);

  // Filter & Sort Wilayas for Ranking Table
  const filteredWilayas = useMemo(() => {
    let list = [...geoSummary.wilayaBreakdown];

    // Search query
    if (filter.searchQuery.trim()) {
      const q = filter.searchQuery.trim().toLowerCase();
      list = list.filter(
        (w) =>
          w.wilayaCode.includes(q) ||
          w.wilayaName.toLowerCase().includes(q) ||
          w.wilayaNameFr.toLowerCase().includes(q)
      );
    }

    // Sort
    list.sort((a, b) => {
      const valA = a[tableSortField] ?? 0;
      const valB = b[tableSortField] ?? 0;
      if (typeof valA === "number" && typeof valB === "number") {
        return tableSortAsc ? valA - valB : valB - valA;
      }
      return tableSortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

    return list;
  }, [geoSummary.wilayaBreakdown, filter.searchQuery, tableSortField, tableSortAsc]);

  // Paginated Wilayas
  const paginatedWilayas = useMemo(() => {
    const start = (tablePage - 1) * PAGE_SIZE;
    return filteredWilayas.slice(start, start + PAGE_SIZE);
  }, [filteredWilayas, tablePage]);

  const totalPages = Math.max(1, Math.ceil(filteredWilayas.length / PAGE_SIZE));

  // Selected Wilaya Record for Drawer
  const selectedWilayaRecord = useMemo(() => {
    if (!selectedWilayaCode) return null;
    return geoSummary.wilayaBreakdown.find((w) => w.numericCode === selectedWilayaCode) || null;
  }, [geoSummary.wilayaBreakdown, selectedWilayaCode]);

  // Handle Map Selection
  const handleSelectWilayaFromMap = (code: number | null) => {
    setSelectedWilayaCode(code);
    if (code) {
      setIsDrawerOpen(true);
    }
  };

  // Handle Sort Change
  const handleSort = (field: keyof WilayaDemandRecord) => {
    if (tableSortField === field) {
      setTableSortAsc((prev) => !prev);
    } else {
      setTableSortField(field);
      setTableSortAsc(false);
    }
  };

  // Toggle comparison product (ensures no duplicate IDs and handles single selection)
  const toggleComparisonProduct = (pId: string) => {
    setComparisonProductIds((prev) => {
      if (prev.includes(pId)) {
        if (prev.length <= 1) return prev; // Keep at least one
        return prev.filter((id) => id !== pId);
      }
      return Array.from(new Set([...prev, pId]));
    });
  };

  // Convert OrvaOrder[] to AlgeriaMap OrderItem[] format
  const mapOrderItems = useMemo(() => {
    return orders.map((o) => ({
      id: o.id,
      customer: "زبون معتمد",
      phone: "0555••••56",
      wilaya: o.wilaya || "",
      commune: o.commune || "",
      status: o.status || "confirmed",
      total: `${o.grandTotalDzd ?? 0} د.ج`,
      shippingFee: o.shippingDzd ? `${o.shippingDzd} د.ج` : undefined,
      isSwitched: o.conversions && o.conversions.length > 0,
      remarks: o.remarks,
    }));
  }, [orders]);

  return (
    <div className="flex flex-col gap-6" dir="ltr">
      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-1 border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/products"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <ArrowLeft className="size-3" />
                العودة لإدارة المنتجات
              </Link>
              <span className="text-muted-foreground">•</span>
              <Link
                href="/dashboard/analytics"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                التحليلات العامة
              </Link>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5 mt-1">
              <Globe2 className="size-7 text-primary" />
              <span>طلب المنتجات حسب الولايات (Product Demand by Wilaya)</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              تحليل جغرافي لتوزيع الطلبات ومعدلات التحويل وحصة كل ولاية عبر خريطة الجزائر التفاعلية (58 ولاية).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilter(INITIAL_FILTER);
                setSelectedWilayaCode(null);
              }}
              className="gap-1.5 text-xs"
            >
              <RotateCcw className="size-3.5" />
              إعادة ضبط الفلاتر
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              تحديث البيانات
            </Button>
          </div>
        </div>
      </header>

      {/* Dev Environment Banner */}
      <DevEnvironmentBanner />

      {/* Load Error Alert (Live Mode connection failure) */}
      {loadError && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/30">
          <AlertCircle className="size-4" />
          <AlertTitle className="font-bold">تعذر تحميل بيانات الطلبات</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs mt-1">
            <span>{loadError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="gap-1.5 text-xs border-destructive/40 hover:bg-destructive/10 self-start sm:self-auto"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              إعادة المحاولة (Retry)
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* ── Privacy & Geographic Notice ─────────────────────────────────────── */}
      <div className="bg-blue-500/10 border border-blue-500/30 p-3.5 rounded-xl flex items-start justify-between gap-3 text-xs">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="size-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-blue-950 dark:text-blue-200 flex items-center gap-2">
              <span>
                {repoMode === "live"
                  ? "نظام تحليلات جغرافية خصوصي 100% — وضع الخادم الحي (Live Repository)"
                  : "نظام تحليلات جغرافية خصوصي 100% — بيانات تجريبية (Mock Repository)"}
              </span>
              <Badge variant="outline" className="text-[10px] bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-400">
                58 WILAYAS SUPPORTED
              </Badge>
            </div>
            <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
              تعتمد التحليلات الجغرافية حصراً على الولاية المختارة طوعياً من الزبون عند الطلب (`selectedWilaya`). لا يتم استخدام أي تتبع للعنوان الرقمي (No IP Geolocation) ولا تخمين للولاية. الجلسات التي لم تختر ولاية تصنف ضمن Unknown Wilaya. نقطة الانطلاق اللوجستية المركزية محفوظة في بسكرة (07 - Biskra Hub).
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 1: Filters Toolbar ──────────────────────────────────────── */}
      <Card className="border shadow-xs">
        <CardContent className="p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Filter className="size-4 text-primary" />
              <span>فلاتر التحليل الجغرافي:</span>
            </div>
            {geoSummary.unmatchedOrdersCount > 0 && (
              <Badge variant="outline" className="text-[11px] text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/40">
                طلبات غير مطابقة بالكتالوج: {geoSummary.unmatchedOrdersCount}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Filter 1: Product Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground block">
                المنتج المستهدف:
              </label>
              <select
                value={filter.selectedProductId}
                onChange={(e) => setFilter((prev) => ({ ...prev, selectedProductId: e.target.value }))}
                className="w-full bg-background border rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="all">📦 جميع منتجات الكتالوج (إجمالي المتجر)</option>
                {uniqueProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 2: Time Range */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground block">
                الفترة الزمنية:
              </label>
              <select
                value={filter.timeRange}
                onChange={(e) => setFilter((prev) => ({ ...prev, timeRange: e.target.value as TimeRangeFilter }))}
                className="w-full bg-background border rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="all">كل الأوقات (سجل العينة كاملاً)</option>
                <option value="today">اليوم (آخر 24 ساعة)</option>
                <option value="last_7_days">آخر 7 أيام</option>
                <option value="last_30_days">آخر 30 يوماً</option>
              </select>
            </div>

            {/* Filter 3: Order Status */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground block">
                حالة الطلب:
              </label>
              <select
                value={filter.statusFilter}
                onChange={(e) => setFilter((prev) => ({ ...prev, statusFilter: e.target.value as OrderStatusFilter }))}
                className="w-full bg-background border rounded-lg px-2.5 py-1.5 text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="all">جميع الحالات التشغيلية</option>
                <option value="delivered">مسلّمة فقط (Delivered)</option>
                <option value="shipped">قيد الشحن (Shipped)</option>
                <option value="confirmed">مؤكدة (Confirmed)</option>
                <option value="returned">مرتجعة (Returned)</option>
                <option value="cancelled">ملغاة (Cancelled)</option>
              </select>
            </div>

            {/* Filter 4: Metric Display Selector */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground block">
                المؤشر المعروض على الخريطة:
              </label>
              <select
                value={filter.activeMetric}
                onChange={(e) => setFilter((prev) => ({ ...prev, activeMetric: e.target.value as GeographicalMetricType }))}
                className="w-full bg-background border rounded-lg px-2.5 py-1.5 text-xs font-bold text-primary focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="demand_share">حصة الطلب (Product Demand Share %)</option>
                <option value="product_mix">مزيج المنتجات (Product Mix %)</option>
                <option value="regional_cvr">معدل التحويل الإقليمي (Regional CVR %)</option>
                <option value="total_orders">إجمالي عدد الطلبات (Total Orders)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 2: Primary KPI Cards ────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Orders & Execution Status */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-1 p-3">
            <CardDescription className="flex items-center justify-between text-[11px] font-semibold">
              <span>إجمالي الطلبيات وحالة التنفيذ</span>
              <Package className="size-3.5 text-primary" />
            </CardDescription>
            <CardTitle className="text-2xl font-black tabular-nums tracking-tight text-foreground">
              {geoSummary.totalOrders}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 text-[10px] text-muted-foreground">
            <span>{geoSummary.activeOrders} نشطة • {geoSummary.cancelledOrders} ملغاة</span>
          </CardContent>
        </Card>

        {/* Card 2: Geographical Wilayas Coverage */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-1 p-3">
            <CardDescription className="flex items-center justify-between text-[11px] font-semibold">
              <span>التغطية الجغرافية للولايات</span>
              <MapPin className="size-3.5 text-emerald-500" />
            </CardDescription>
            <CardTitle className="text-2xl font-black tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
              {geoSummary.activeWilayasCount} <span className="text-xs font-normal text-muted-foreground">/ 58 ولاية</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 text-[10px] text-muted-foreground">
            <span>تغطية {Math.round((geoSummary.activeWilayasCount / 58) * 100)}% • تغطية الجلسات {geoSummary.geographicCoveragePercentage}%</span>
          </CardContent>
        </Card>

        {/* Card 3: Top Wilaya Demand & Share */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-1 p-3">
            <CardDescription className="flex items-center justify-between text-[11px] font-semibold">
              <span>الولاية الأكثر طلباً وحصتها</span>
              <TrendingUp className="size-3.5 text-blue-500" />
            </CardDescription>
            <CardTitle className="text-lg font-black truncate text-blue-600 dark:text-blue-400">
              {geoSummary.topWilaya ? `${geoSummary.topWilaya.name} (${geoSummary.topWilaya.code})` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 text-[10px] text-muted-foreground">
            <span>{geoSummary.topWilaya ? `${geoSummary.topWilaya.orderCount} طلبات • حصة ${geoSummary.topWilaya.sharePercentage}%` : "لا توجد طلبات"}</span>
          </CardContent>
        </Card>

        {/* Card 4: Fulfillment & Returns Indicators */}
        <Card className="border shadow-xs">
          <CardHeader className="pb-1 p-3">
            <CardDescription className="flex items-center justify-between text-[11px] font-semibold">
              <span>مؤشرات التسليم والإرجاع</span>
              <CheckCircle2 className="size-3.5 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-black tabular-nums tracking-tight text-emerald-700 dark:text-emerald-400">
              {geoSummary.totalOrders > 0 ? Math.round((geoSummary.deliveredOrders / geoSummary.totalOrders) * 100) : 0}% <span className="text-xs font-normal text-muted-foreground">تسليم</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 text-[10px] text-muted-foreground">
            <span>مسلّمة: {geoSummary.deliveredOrders} • مرتجعة: {geoSummary.returnedOrders} ({geoSummary.totalOrders > 0 ? Math.round((geoSummary.returnedOrders / geoSummary.totalOrders) * 100) : 0}%)</span>
          </CardContent>
        </Card>
      </div>

      {/* ── Section 3: Algeria Interactive Map ──────────────────────────────── */}
      <Card className="border shadow-xs overflow-hidden">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Globe2 className="size-4 text-primary" />
                <span>خريطة التوزيع الجغرافي للطلب عبر الـ 58 ولاية الجزائرية</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                تلوين تفاعلي للولايات حسب: <span className="font-semibold text-primary">{activeMetricTitle}</span>. انقر على أي ولاية لعرض تفاصيلها الدقيقة.
              </CardDescription>
            </div>

            {/* Map Legend */}
            <div className="flex items-center gap-2 text-[10px] bg-background border px-2.5 py-1 rounded-lg">
              <span className="text-muted-foreground">تدرج الكثافة:</span>
              <div className="flex items-center gap-1">
                <span className="size-2.5 rounded-sm bg-slate-200 dark:bg-slate-700 inline-block" title="بدون بيانات" />
                <span className="size-2.5 rounded-sm bg-blue-200 inline-block" title="منخفض" />
                <span className="size-2.5 rounded-sm bg-blue-400 inline-block" title="متوسط" />
                <span className="size-2.5 rounded-sm bg-blue-500 inline-block" title="مرتفع" />
                <span className="size-2.5 rounded-sm bg-blue-700 inline-block" title="كثيف جداً" />
              </div>
              <span className="text-muted-foreground font-mono">0% → {maxMetricValue}%</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <AlgeriaMap
            orders={mapOrderItems}
            selectedWilayaCode={selectedWilayaCode}
            onSelectWilaya={handleSelectWilayaFromMap}
            demandMetrics={demandMetricsMap}
            activeMetricTitle={activeMetricTitle}
            maxMetricValue={maxMetricValue}
            onSelectWilayaDemand={(d) => {
              setSelectedWilayaCode(d.wilayaCode);
              setIsDrawerOpen(true);
            }}
          />
        </CardContent>
      </Card>

      {/* ── Section 4: Wilaya Ranking Table ─────────────────────────────────── */}
      <Card className="border shadow-xs">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <BarChart3 className="size-4 text-primary" />
                <span>جدول ترتيب الولايات حسب الطلب والمؤشرات</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                عرض شامل لجميع الولايات الـ 58 مع الفرز والبحث وتفاصيل التحويل وحصة الطلب
              </CardDescription>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute right-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="ابحث بالاسم أو رمز الولاية..."
                value={filter.searchQuery}
                onChange={(e) => {
                  setFilter((prev) => ({ ...prev, searchQuery: e.target.value }));
                  setTablePage(1);
                }}
                className="pr-8 h-8 text-xs bg-background"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground font-semibold">
                  <th className="p-2.5 text-center w-12">#</th>
                  <th
                    className="p-2.5 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("numericCode")}
                  >
                    الرمز {tableSortField === "numericCode" && (tableSortAsc ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-2.5 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("wilayaName")}
                  >
                    الولاية {tableSortField === "wilayaName" && (tableSortAsc ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-2.5 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("totalOrders")}
                  >
                    الطلبات {tableSortField === "totalOrders" && (tableSortAsc ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-2.5 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("deliveredOrders")}
                  >
                    مسلّمة {tableSortField === "deliveredOrders" && (tableSortAsc ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-2.5 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("returnedOrders")}
                  >
                    مرتجعة {tableSortField === "returnedOrders" && (tableSortAsc ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-2.5 cursor-pointer hover:text-foreground transition-colors font-bold text-primary"
                    onClick={() => handleSort("demandSharePercentage")}
                  >
                    حصة الطلب {tableSortField === "demandSharePercentage" && (tableSortAsc ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-2.5 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("productMixPercentage")}
                  >
                    مزيج الولاية {tableSortField === "productMixPercentage" && (tableSortAsc ? "↑" : "↓")}
                  </th>
                  <th
                    className="p-2.5 cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => handleSort("regionalConversionRate")}
                  >
                    التحويل الإقليمي {tableSortField === "regionalConversionRate" && (tableSortAsc ? "↑" : "↓")}
                  </th>
                  <th className="p-2.5 text-center">المشاهدات المعروفة</th>
                  <th className="p-2.5 text-center">تفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {paginatedWilayas.map((w, index) => {
                  const globalIndex = (tablePage - 1) * PAGE_SIZE + index + 1;
                  const isSelected = selectedWilayaCode === w.numericCode;

                  return (
                    <tr
                      key={w.wilayaCode}
                      onClick={() => {
                        setSelectedWilayaCode(w.numericCode);
                        setIsDrawerOpen(true);
                      }}
                      className={`border-b transition-colors cursor-pointer hover:bg-muted/50 ${
                        isSelected ? "bg-primary/5 font-semibold" : ""
                      } ${w.totalOrders === 0 ? "opacity-60" : ""}`}
                    >
                      <td className="p-2.5 text-center font-mono text-muted-foreground">{globalIndex}</td>
                      <td className="p-2.5 font-mono font-bold text-foreground">{w.wilayaCode}</td>
                      <td className="p-2.5">
                        <div className="font-semibold text-foreground flex items-center gap-1.5">
                          <span>{w.wilayaName}</span>
                          <span className="text-[10px] text-muted-foreground font-normal">({w.wilayaNameFr})</span>
                          {w.numericCode === 7 && (
                            <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-700 border-amber-400 py-0 px-1">
                              Origin Hub
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-2.5 font-mono font-bold">{w.totalOrders}</td>
                      <td className="p-2.5 font-mono text-emerald-600">{w.deliveredOrders}</td>
                      <td className="p-2.5 font-mono text-destructive">{w.returnedOrders}</td>
                      <td className="p-2.5 font-mono font-bold text-primary">
                        {w.demandSharePercentage > 0 ? `${w.demandSharePercentage}%` : "—"}
                      </td>
                      <td className="p-2.5 font-mono text-muted-foreground">
                        {w.productMixPercentage > 0 ? `${w.productMixPercentage}%` : "—"}
                      </td>
                      <td className="p-2.5 font-mono">
                        {w.regionalConversionRate !== null ? (
                          <span className="text-emerald-600 font-bold">{w.regionalConversionRate}%</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-mono text-muted-foreground">
                        {w.knownViewSessions > 0 ? `${w.knownViewSessions} جلسة` : "—"}
                      </td>
                      <td className="p-2.5 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedWilayaCode(w.numericCode);
                            setIsDrawerOpen(true);
                          }}
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Pagination */}
          <div className="flex items-center justify-between p-3 border-t text-xs text-muted-foreground">
            <div>
              عرض {Math.min(filteredWilayas.length, (tablePage - 1) * PAGE_SIZE + 1)} إلى{" "}
              {Math.min(filteredWilayas.length, tablePage * PAGE_SIZE)} من أصل {filteredWilayas.length} ولاية
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={tablePage <= 1}
                onClick={() => setTablePage((p) => p - 1)}
                className="h-7 text-xs px-2.5"
              >
                السابق
              </Button>
              <span className="font-mono text-xs">
                {tablePage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={tablePage >= totalPages}
                onClick={() => setTablePage((p) => p + 1)}
                className="h-7 text-xs px-2.5"
              >
                التالي
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 5: Product Comparison ───────────────────────────────────── */}
      <Card className="border shadow-xs">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                <span>مقارنة المنتجات جغرافياً (Product Demand Comparison)</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                مقارنة متعددة بين المنتجات من حيث الانتشار الجغرافي والولايات الأكثر طلباً والحصة السوقية
              </CardDescription>
            </div>

            {/* Product selection chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">اختر للمقارنة:</span>
              {uniqueProducts.length === 0 ? (
                <span className="text-xs text-muted-foreground">لا توجد منتجات متاحة للمقارنة</span>
              ) : (
                uniqueProducts.map((p) => {
                  const isSelected = comparisonProductIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleComparisonProduct(p.id)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary font-semibold"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {p.title}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {comparisons.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {products.length === 0
                ? "لا توجد منتجات متاحة في الكتالوج الحالي."
                : "لم يتم اختيار أي منتج للمقارنة. اختر منتجاً من القائمة أعلاه."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {comparisons.map((item) => (
              <div
                key={item.productId}
                className="p-3.5 rounded-xl border bg-card/60 space-y-3 shadow-xs hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between border-b pb-2">
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{item.productTitle}</h4>
                    <span className="font-mono text-[10px] text-muted-foreground">{item.sku}</span>
                  </div>
                  <Badge variant="secondary" className="font-mono text-xs font-bold">
                    {item.totalOrders} طلب
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-muted/40 p-2 rounded-lg">
                    <div className="text-[10px] text-muted-foreground">مسلّمة</div>
                    <div className="font-bold text-emerald-600 font-mono">{item.deliveredOrders}</div>
                  </div>
                  <div className="bg-muted/40 p-2 rounded-lg">
                    <div className="text-[10px] text-muted-foreground">الولايات</div>
                    <div className="font-bold text-primary font-mono">{item.activeWilayasCount}</div>
                  </div>
                  <div className="bg-muted/40 p-2 rounded-lg">
                    <div className="text-[10px] text-muted-foreground">حصة المتجر</div>
                    <div className="font-bold text-indigo-600 font-mono">{item.storeSharePercentage}%</div>
                  </div>
                </div>

                {/* Top 3 Wilayas */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-bold text-foreground">الولايات الأكثر طلباً:</div>
                  {item.topWilayas.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground">لا توجد طلبات مسجلة بعد</div>
                  ) : (
                    <div className="space-y-1">
                      {item.topWilayas.map((tw) => (
                        <div key={tw.code} className="flex justify-between items-center text-xs">
                          <span className="text-muted-foreground">
                            {tw.code} - {tw.name}
                          </span>
                          <span className="font-mono font-bold text-foreground">
                            {tw.count} طلب ({tw.share}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Conversion rate */}
                <div className="border-t pt-2 flex justify-between items-center text-xs">
                  <span className="text-muted-foreground text-[11px]">التحويل الإقليمي (المعروف):</span>
                  <span className="font-mono font-bold text-emerald-600">
                    {item.regionalConversionRate !== null ? `${item.regionalConversionRate}%` : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      </Card>

      {/* ── Section 6: Wilaya Details Drawer (Sheet) ────────────────────────── */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent side="left" className="w-full sm:max-w-md p-0 flex flex-col" dir="ltr">
          {selectedWilayaRecord ? (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="p-4 border-b bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="size-5 text-primary" />
                    <SheetTitle className="text-lg font-black text-foreground">
                      {selectedWilayaRecord.wilayaFullName}
                    </SheetTitle>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs font-bold">
                    ولاية #{selectedWilayaRecord.wilayaCode}
                  </Badge>
                </div>
                <SheetDescription className="text-xs text-muted-foreground mt-1">
                  تفاصيل الطلبات والمزيج السلعي ومعدلات التحويل الجغرافي للولاية
                </SheetDescription>
              </div>

              {/* Body */}
              <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
                {/* 4 Stat Cards */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-muted/40 p-3 rounded-xl border text-center space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">إجمالي الطلبات</div>
                    <div className="text-xl font-black text-foreground font-mono">
                      {selectedWilayaRecord.totalOrders}
                    </div>
                  </div>
                  <div className="bg-muted/40 p-3 rounded-xl border text-center space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">حصة الطلب (Share)</div>
                    <div className="text-xl font-black text-primary font-mono">
                      {selectedWilayaRecord.demandSharePercentage}%
                    </div>
                  </div>
                  <div className="bg-muted/40 p-3 rounded-xl border text-center space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">الطلبات المسلّمة</div>
                    <div className="text-xl font-black text-emerald-600 font-mono">
                      {selectedWilayaRecord.deliveredOrders}
                    </div>
                  </div>
                  <div className="bg-muted/40 p-3 rounded-xl border text-center space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">الطلبات المرتجعة</div>
                    <div className="text-xl font-black text-destructive font-mono">
                      {selectedWilayaRecord.returnedOrders}
                    </div>
                  </div>
                </div>

                {/* Conversion & Sessions Details */}
                <div className="p-3 bg-card border rounded-xl space-y-2">
                  <div className="font-bold text-foreground text-xs flex items-center justify-between border-b pb-1.5">
                    <span>مؤشرات الزيارات وسلوك الشراء في الولاية</span>
                    <Users className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">مشاهدات المنتج المعروفة طوعياً:</span>
                      <span className="font-mono font-bold">{selectedWilayaRecord.knownViewSessions} جلسة</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">جلسات الشراء المؤكدة:</span>
                      <span className="font-mono font-bold text-emerald-600">
                        {selectedWilayaRecord.purchasingProductSessions} جلسة
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-1">
                      <span className="text-muted-foreground">معدل التحويل الإقليمي (Regional CVR):</span>
                      <span className="font-mono font-black text-emerald-600">
                        {selectedWilayaRecord.regionalConversionRate !== null
                          ? `${selectedWilayaRecord.regionalConversionRate}%`
                          : "غير متوفر (لم تسجل مشاهدات معروفة)"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Products Breakdown in this Wilaya */}
                <div className="space-y-2">
                  <div className="font-bold text-foreground text-xs">
                    توزيع المنتجات داخل الولاية (Product Mix):
                  </div>
                  {selectedWilayaRecord.productBreakdown && selectedWilayaRecord.productBreakdown.length > 0 ? (
                    <div className="space-y-2">
                      {selectedWilayaRecord.productBreakdown.map((pb) => (
                        <div key={pb.productId} className="space-y-1 bg-muted/20 p-2.5 rounded-lg border">
                          <div className="flex justify-between text-xs">
                            <span className="font-semibold text-foreground">{pb.productTitle}</span>
                            <span className="font-mono text-muted-foreground">
                              {pb.orderCount} طلب ({pb.shareInWilaya}%)
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${Math.min(100, pb.shareInWilaya)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground p-3 border rounded-lg text-center">
                      لا توجد طلبات مسجلة لهذه الولاية في التصفية الحالية.
                    </div>
                  )}
                </div>

                {/* Privacy Guarantee Note */}
                <div className="bg-muted/40 p-2.5 rounded-lg border text-[10px] text-muted-foreground leading-relaxed">
                  🔒 ضمان الخصوصية: لا يتم عرض أي أسماء شخصية أو أرقام هواتف أو عناوين تفصيلية داخل هذه التحليلات الجغرافية.
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-muted-foreground">
              يرجى اختيار ولاية لعرض التفاصيل.
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
