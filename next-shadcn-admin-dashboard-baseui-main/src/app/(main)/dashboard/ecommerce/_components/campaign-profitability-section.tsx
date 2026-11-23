"use client";

import * as React from "react";

import Link from "next/link";

import {
  Bot,
  Calculator,
  Check,
  Copy,
  Link2,
  Megaphone,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { META_ADS_URL_PARAMS_TEMPLATE } from "@/lib/analytics/attribution-tracker";
import {
  type AdSpendSourceType,
  type CampaignCostInput,
  computeCampaignProfitability,
  formatAttributionSourceLabel,
} from "@/lib/analytics/campaign-profitability";
import { formatDzd, type OrvaOrder, orvaFetch } from "@/lib/orva-api";
import { getApiProductsRepository } from "@/lib/repository/api-products-repository";
import type { Product } from "@/lib/repository/product-types";

import { AiMarketingAdvisorDialog } from "./ai-marketing-advisor-dialog";

const STORAGE_KEY = "orva_campaign_costs_v2";

interface StoredCostsState {
  defaultUnitCogsDzd: number;
  defaultReturnShippingLossDzd: number;
  defaultEstimatedMetaCpaDzd: number;
  campaigns: Record<string, Partial<CampaignCostInput>>;
}

const DEFAULT_STORED_COSTS: StoredCostsState = {
  defaultUnitCogsDzd: 0,
  defaultReturnShippingLossDzd: 450,
  defaultEstimatedMetaCpaDzd: 850,
  campaigns: {},
};

function getDeliveryRateBadgeClass(ratePct: number): string {
  if (ratePct >= 70) return "border-emerald-500/30 text-emerald-600";
  if (ratePct > 0) return "border-amber-500/30 text-amber-600";
  return "";
}

function renderAdSpendSourceBadge(source: AdSpendSourceType) {
  if (source === "meta_api") {
    return (
      <Badge
        variant="outline"
        className="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-700 dark:text-blue-300"
      >
        مزامنة Meta API
      </Badge>
    );
  }
  if (source === "product_link") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
      >
        تلقائي (مربوط بالمنتج)
      </Badge>
    );
  }
  if (source === "manual") {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
      >
        معدّل يدوياً
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-primary/30 bg-primary/5 text-[10px] text-primary">
      تقدير Meta Ads تلقائي
    </Badge>
  );
}

export function CampaignProfitabilitySection({
  orders,
  isLoading,
  returnFeesByWilaya,
  defaultTimeRange = "last_7d",
}: {
  orders: OrvaOrder[];
  isLoading: boolean;
  returnFeesByWilaya?: Record<number, number>;
  defaultTimeRange?: string;
}) {
  const [costs, setCosts] = React.useState<StoredCostsState>(DEFAULT_STORED_COSTS);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [syncedReturnFees, setSyncedReturnFees] = React.useState<Record<number, number>>(returnFeesByWilaya ?? {});
  const [isSyncingMeta, setIsSyncingMeta] = React.useState(false);
  const [copiedTemplate, setCopiedTemplate] = React.useState(false);
  const [advisorOpen, setAdvisorOpen] = React.useState(false);

  React.useEffect(() => {
    if (returnFeesByWilaya && Object.keys(returnFeesByWilaya).length > 0) {
      setSyncedReturnFees(returnFeesByWilaya);
    }
  }, [returnFeesByWilaya]);

  const loadProductsAndMeta = React.useCallback(async () => {
    try {
      const repo = getApiProductsRepository();
      const [prods, metaRes] = await Promise.all([
        repo.getProducts().catch(() => []),
        orvaFetch(`/api/integrations/meta-ads?timeRange=${encodeURIComponent(defaultTimeRange)}&limit=10`)
          .then((r) => r.json())
          .catch(() => null),
      ]);
      if (Array.isArray(prods) && prods.length > 0) {
        setProducts(prods);
      }
      if (metaRes?.returnFeesByWilaya && typeof metaRes.returnFeesByWilaya === "object") {
        setSyncedReturnFees(metaRes.returnFeesByWilaya);
      }
      if (metaRes?.success && Array.isArray(metaRes.campaigns)) {
        setCosts((prev) => {
          const nextCampaigns = { ...prev.campaigns };
          for (const c of metaRes.campaigns) {
            if (c.source === "meta_graph_api" && Number(c.spendDzd) > 0) {
              nextCampaigns[c.campaignKey] = {
                ...nextCampaigns[c.campaignKey],
                metaApiSpendDzd: Number(c.spendDzd),
              };
            }
          }
          return { ...prev, campaigns: nextCampaigns };
        });
      }
    } catch {
      // Ignore catalog fetch errors
    }
  }, [defaultTimeRange]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredCostsState>;
        setCosts({
          defaultUnitCogsDzd: Number(parsed.defaultUnitCogsDzd ?? 0) || 0,
          defaultReturnShippingLossDzd: Number(parsed.defaultReturnShippingLossDzd ?? 450) || 450,
          defaultEstimatedMetaCpaDzd: Number(parsed.defaultEstimatedMetaCpaDzd ?? 850) || 850,
          campaigns: parsed.campaigns && typeof parsed.campaigns === "object" ? parsed.campaigns : {},
        });
      }
    } catch {
      // ignore storage errors
    }
    void loadProductsAndMeta();

    const handleCatalogUpdate = () => void loadProductsAndMeta();
    window.addEventListener("orva:catalog-updated", handleCatalogUpdate);
    window.addEventListener("orva:products-updated", handleCatalogUpdate);
    return () => {
      window.removeEventListener("orva:catalog-updated", handleCatalogUpdate);
      window.removeEventListener("orva:products-updated", handleCatalogUpdate);
    };
  }, [loadProductsAndMeta]);

  const persistCosts = React.useCallback((next: StoredCostsState) => {
    setCosts(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const updateAdSpend = (campaignKey: string, valueStr: string) => {
    const trimmed = valueStr.trim();
    if (!trimmed) {
      // Reset to automatic Meta Ads estimation
      resetCampaignToAutoMeta(campaignKey);
      return;
    }
    const num = Math.max(0, Number(trimmed.replace(/[^\d.]/g, "")) || 0);
    persistCosts({
      ...costs,
      campaigns: {
        ...costs.campaigns,
        [campaignKey]: {
          ...costs.campaigns[campaignKey],
          adSpendDzd: num,
          isManualOverride: true,
        },
      },
    });
  };

  const resetCampaignToAutoMeta = (campaignKey: string) => {
    const nextCampaigns = { ...costs.campaigns };
    if (nextCampaigns[campaignKey]) {
      const { adSpendDzd: _removed, isManualOverride: _removedFlag, ...rest } = nextCampaigns[campaignKey]!;
      nextCampaigns[campaignKey] = { ...rest, isManualOverride: false };
    }
    persistCosts({
      ...costs,
      campaigns: nextCampaigns,
    });
  };

  const handleSyncMetaEstimates = async () => {
    setIsSyncingMeta(true);
    try {
      await loadProductsAndMeta();
      // Reset all non-locked campaigns to fresh Meta Ads automatic calculation
      const nextCampaigns: Record<string, Partial<CampaignCostInput>> = {};
      for (const [k, v] of Object.entries(costs.campaigns)) {
        if (v?.metaApiSpendDzd) {
          nextCampaigns[k] = { metaApiSpendDzd: v.metaApiSpendDzd, isManualOverride: false };
        }
      }
      persistCosts({
        ...costs,
        campaigns: nextCampaigns,
      });
      toast.add({
        title: "تم تحديث تقديرات تكلفة إعلانات Meta Ads تلقائياً",
        description: "تم احتساب تكلفة الإعلان وصافي الربح لكل حملة بناءً على ربط المنتجات ومعايير Meta Ads.",
        type: "success",
      });
    } finally {
      setIsSyncingMeta(false);
    }
  };

  const rows = React.useMemo(
    () =>
      computeCampaignProfitability(
        orders,
        costs.campaigns,
        {
          unitCogsDzd: costs.defaultUnitCogsDzd,
          returnShippingLossDzd: costs.defaultReturnShippingLossDzd,
          estimatedMetaCpaDzd: costs.defaultEstimatedMetaCpaDzd,
        },
        products,
        syncedReturnFees,
      ),
    [orders, costs, products, syncedReturnFees],
  );

  const totals = React.useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.revenue += r.deliveredProductRevenueDzd;
        acc.adSpend += r.adSpendDzd;
        acc.cogs += r.totalCogsDzd;
        acc.returnLoss += r.totalReturnLossDzd;
        acc.netProfit += r.netProfitDzd;
        acc.delivered += r.deliveredOrders;
        acc.returned += r.returnedOrders;
        acc.redexMatched += r.redexMatchedOrders;
        return acc;
      },
      {
        revenue: 0,
        adSpend: 0,
        cogs: 0,
        returnLoss: 0,
        netProfit: 0,
        delivered: 0,
        returned: 0,
        redexMatched: 0,
      },
    );
  }, [rows]);

  const copyMetaTemplate = async () => {
    try {
      await navigator.clipboard.writeText(META_ADS_URL_PARAMS_TEMPLATE);
      setCopiedTemplate(true);
      toast.add({
        title: "تم نسخ قالب معلمات Meta Ads",
        description: "ألصقه في خانة URL Parameters في مدير إعلانات فيسبوك لتعبئة الحقول تلقائياً.",
        type: "success",
      });
      setTimeout(() => setCopiedTemplate(false), 2000);
    } catch {
      toast.add({ title: "تعذر النسخ", type: "error" });
    }
  };

  return (
    <Card className="border-emerald-500/20 shadow-xs" dir="rtl">
      <CardHeader className="space-y-3 border-b pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2 font-bold text-base">
              <Calculator className="size-4 text-emerald-500" />
              <span>محرك ربحية الحملات التلقائي (Meta Ads &amp; Redex)</span>
              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
              >
                حساب تلقائي لتكلفة الإعلان وصافي الربح
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              يحتسب تكلفة الإعلان تلقائياً حسب تقدير Meta Ads وربط الإعلانات بالمنتجات، ويخصم تكلفة البضاعة والمرتجعات
              لإعطاء صافي الربح النهائي تلقائياً.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => setAdvisorOpen(true)}
              className="h-8 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
            >
              <Bot className="size-3.5" />
              <span>مستشار التسويق الذكي (AI Media Buyer)</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleSyncMetaEstimates()}
              disabled={isSyncingMeta}
              className="h-8 gap-1.5 text-xs"
              title="إعادة احتساب ومزامنة تقديرات تكلفة الإعلان تلقائياً من Meta Ads والمنتجات المربوطة"
            >
              <RefreshCw className={`size-3.5 ${isSyncingMeta ? "animate-spin" : ""}`} />
              <span>مزامنة تقدير Meta Ads</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyMetaTemplate()}
              className="h-8 shrink-0 gap-1.5 border-emerald-500/30 text-xs hover:bg-emerald-500/10"
            >
              {copiedTemplate ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              نسخ قالب URL لمدير إعلانات Meta
            </Button>
          </div>
        </div>

        {/* Dynamic URL Parameters Helper + Default Cost Inputs */}
        <div className="grid gap-3 pt-1 md:grid-cols-4">
          <div className="rounded-lg border bg-muted/30 p-2.5 text-xs">
            <div className="mb-1 flex items-center justify-between gap-1.5 font-semibold text-foreground">
              <span className="flex items-center gap-1.5">
                <Link2 className="size-3.5 text-blue-500" />
                قالب تتبع الحملات التلقائي
              </span>
              <Link href="/dashboard/products" className="text-[10px] text-primary hover:underline">
                ربط إعلان بمنتج ←
              </Link>
            </div>
            <p
              className="truncate font-mono text-[11px] text-muted-foreground"
              dir="ltr"
              title={META_ADS_URL_PARAMS_TEMPLATE}
            >
              {META_ADS_URL_PARAMS_TEMPLATE}
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="default-meta-cpa" className="text-xs">
              تقدير Meta Ads الافتراضي للطلب (CPA د.ج)
            </Label>
            <Input
              id="default-meta-cpa"
              type="number"
              min={0}
              value={costs.defaultEstimatedMetaCpaDzd}
              onChange={(e) =>
                persistCosts({
                  ...costs,
                  defaultEstimatedMetaCpaDzd: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="h-8 font-mono text-xs"
              dir="ltr"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="default-unit-cogs" className="text-xs">
              تكلفة البضاعة الافتراضية (0 = تلقائي من المنتج)
            </Label>
            <Input
              id="default-unit-cogs"
              type="number"
              min={0}
              value={costs.defaultUnitCogsDzd}
              onChange={(e) =>
                persistCosts({
                  ...costs,
                  defaultUnitCogsDzd: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="h-8 font-mono text-xs"
              dir="ltr"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="default-return-loss" className="text-xs">
              خسارة الشحن لكل طلب مرتجع (د.ج)
            </Label>
            <Input
              id="default-return-loss"
              type="number"
              min={0}
              value={costs.defaultReturnShippingLossDzd}
              onChange={(e) =>
                persistCosts({
                  ...costs,
                  defaultReturnShippingLossDzd: Math.max(0, Number(e.target.value) || 0),
                })
              }
              className="h-8 font-mono text-xs"
              dir="ltr"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Global Profitability Totals */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-3">
            <span className="block text-[11px] text-muted-foreground">إيراد المسلّم المحصّل (Redex)</span>
            <span className="mt-0.5 block font-bold font-mono text-base tabular-nums">
              {isLoading ? "…" : formatDzd(totals.revenue)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {totals.delivered} مسلّم / {totals.redexMatched} مربوط بـ Redex
            </span>
          </div>

          <div className="rounded-lg border bg-card p-3">
            <span className="block text-[11px] text-muted-foreground">إجمالي تكلفة الإعلانات (تقدير Meta Ads)</span>
            <span className="mt-0.5 block font-bold font-mono text-base text-blue-600 tabular-nums dark:text-blue-400">
              {isLoading ? "…" : formatDzd(totals.adSpend)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              ROAS الإجمالي: {totals.adSpend > 0 ? `${(totals.revenue / totals.adSpend).toFixed(2)}x` : "—"}
            </span>
          </div>

          <div className="rounded-lg border bg-card p-3">
            <span className="block text-[11px] text-muted-foreground">تكلفة البضاعة التلقائية + المرتجعات</span>
            <span className="mt-0.5 block font-bold font-mono text-amber-600 text-base tabular-nums dark:text-amber-400">
              {isLoading ? "…" : formatDzd(totals.cogs + totals.returnLoss)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              بضاعة: {formatDzd(totals.cogs)} • مرتجعات ({totals.returned}): {formatDzd(totals.returnLoss)}
            </span>
          </div>

          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
            <span className="block text-[11px] text-muted-foreground">صافي الربح النهائي التلقائي</span>
            <span
              className={`mt-0.5 flex items-center gap-1 font-extrabold font-mono text-base tabular-nums ${
                totals.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {totals.netProfit >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {isLoading ? "…" : formatDzd(totals.netProfit)}
            </span>
            <span className="text-[11px] text-muted-foreground">محسوب تلقائياً بعد خصم الإعلان والبضاعة والمرتجع</span>
          </div>
        </div>

        {/* Per-Campaign Breakdown Table */}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right">الحملة / المنتج المربوط</TableHead>
                <TableHead className="text-center">الطلبات (Redex)</TableHead>
                <TableHead className="text-center">المسلّم / المرتجع</TableHead>
                <TableHead className="text-center">نسبة التسليم</TableHead>
                <TableHead className="text-right">الإيراد المحصّل</TableHead>
                <TableHead className="w-[185px] text-right">تكلفة الإعلان (Meta Ads د.ج)</TableHead>
                <TableHead className="text-center">CPA / CPD / ROAS</TableHead>
                <TableHead className="text-right">صافي الربح التلقائي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground text-xs">
                    لا توجد طلبات ضمن الفترة المحددة بعد.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.campaignKey}>
                    <TableCell className="space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                        <Megaphone className="size-3.5 shrink-0 text-primary" />
                        <span>{row.campaignName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {formatAttributionSourceLabel(row.attributionSource)}
                        </Badge>
                        {row.fbCampaignId && (
                          <Badge variant="secondary" className="font-mono text-[10px]" dir="ltr">
                            ID: {row.fbCampaignId}
                          </Badge>
                        )}
                        {row.linkedProducts.slice(0, 2).map((lp) => (
                          <Badge
                            key={lp.productId}
                            variant="outline"
                            className="border-emerald-500/30 bg-emerald-500/5 text-[10px] text-emerald-700 dark:text-emerald-300"
                            title={`تكلفة التسويق للطلب: ${lp.marketingCostPerOrderDzd} د.ج | تكلفة الشراء: ${lp.purchaseCostDzd} د.ج`}
                          >
                            {lp.title} ({lp.marketingCostPerOrderDzd} د.ج/طلب)
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    <TableCell className="text-center font-mono text-xs tabular-nums">
                      <span className="font-bold">{row.totalOrders}</span>
                      <span className="block text-[10px] text-muted-foreground">{row.redexMatchedOrders} في Redex</span>
                    </TableCell>

                    <TableCell className="text-center font-mono text-xs tabular-nums">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {row.deliveredOrders}
                      </span>
                      {" / "}
                      <span className="text-orange-600 dark:text-orange-400">{row.returnedOrders}</span>
                    </TableCell>

                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={`font-mono text-[11px] ${getDeliveryRateBadgeClass(row.deliveryRatePct)}`}
                      >
                        {row.deliveryRatePct}%
                      </Badge>
                    </TableCell>

                    <TableCell className="font-mono font-semibold text-xs tabular-nums">
                      <div>{formatDzd(row.deliveredProductRevenueDzd)}</div>
                      {row.totalCogsDzd > 0 && (
                        <div className="text-[10px] text-muted-foreground font-normal">
                          بضاعة: {formatDzd(row.totalCogsDzd)}
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            value={row.adSpendDzd}
                            onChange={(e) => updateAdSpend(row.campaignKey, e.target.value)}
                            className="h-7 w-28 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400"
                            dir="ltr"
                            aria-label={`تكلفة إعلان ${row.campaignName}`}
                          />
                          {row.adSpendSource === "manual" && (
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => resetCampaignToAutoMeta(row.campaignKey)}
                              title={`إعادة للحساب التلقائي من Meta Ads (${formatDzd(row.estimatedMetaSpendDzd)})`}
                              className="size-6 text-muted-foreground hover:text-primary"
                            >
                              <RotateCcw className="size-3" />
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-1">{renderAdSpendSourceBadge(row.adSpendSource)}</div>
                      </div>
                    </TableCell>

                    <TableCell className="text-center font-mono text-[11px] tabular-nums">
                      <div title="تكلفة الطلب الإعلانية (CPA)">
                        CPA: {row.costPerOrderDzd !== null ? `${row.costPerOrderDzd} د.ج` : "—"}
                      </div>
                      <div className="text-muted-foreground" title="تكلفة الطلب المسلّم (CPD)">
                        CPD: {row.costPerDeliveredDzd !== null ? `${row.costPerDeliveredDzd} د.ج` : "—"}
                      </div>
                      <div className="font-semibold text-blue-600 dark:text-blue-400">
                        {row.roas !== null ? `${row.roas}x ROAS` : "—"}
                      </div>
                    </TableCell>

                    <TableCell
                      className={`font-bold font-mono text-xs tabular-nums ${
                        row.netProfitDzd >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      <div>{formatDzd(row.netProfitDzd)}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {row.netProfitDzd >= 0 ? "حملة رابحة ✓" : "تحتاج تحسين ⚠"}
                      </div>
                      {row.totalReturnLossDzd > 0 && (
                        <div className="text-[10px] font-normal text-rose-600">
                          مرتجعات: {formatDzd(row.totalReturnLossDzd)}{" "}
                          {row.returnLossSource === "courier_synced" ? "(tarif_retour)" : "(تقدير)"}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <AiMarketingAdvisorDialog
        open={advisorOpen}
        onOpenChange={setAdvisorOpen}
        campaigns={rows}
        products={products}
        totals={totals}
      />
    </Card>
  );
}
