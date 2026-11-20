"use client";

import * as React from "react";

import { Calculator, Check, Copy, Link2, Megaphone, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { META_ADS_URL_PARAMS_TEMPLATE } from "@/lib/analytics/attribution-tracker";
import {
  type CampaignCostInput,
  computeCampaignProfitability,
  formatAttributionSourceLabel,
} from "@/lib/analytics/campaign-profitability";
import { formatDzd, type OrvaOrder } from "@/lib/orva-api";

const STORAGE_KEY = "orva_campaign_costs_v1";

interface StoredCostsState {
  defaultUnitCogsDzd: number;
  defaultReturnShippingLossDzd: number;
  campaigns: Record<string, Partial<CampaignCostInput>>;
}

const DEFAULT_STORED_COSTS: StoredCostsState = {
  defaultUnitCogsDzd: 0,
  defaultReturnShippingLossDzd: 450,
  campaigns: {},
};

function getDeliveryRateBadgeClass(ratePct: number): string {
  if (ratePct >= 70) return "border-emerald-500/30 text-emerald-600";
  if (ratePct > 0) return "border-amber-500/30 text-amber-600";
  return "";
}

export function CampaignProfitabilitySection({ orders, isLoading }: { orders: OrvaOrder[]; isLoading: boolean }) {
  const [costs, setCosts] = React.useState<StoredCostsState>(DEFAULT_STORED_COSTS);
  const [copiedTemplate, setCopiedTemplate] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredCostsState>;
        setCosts({
          defaultUnitCogsDzd: Number(parsed.defaultUnitCogsDzd ?? 0) || 0,
          defaultReturnShippingLossDzd: Number(parsed.defaultReturnShippingLossDzd ?? 450) || 450,
          campaigns: parsed.campaigns && typeof parsed.campaigns === "object" ? parsed.campaigns : {},
        });
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const persistCosts = React.useCallback((next: StoredCostsState) => {
    setCosts(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const updateAdSpend = (campaignKey: string, valueStr: string) => {
    const num = Math.max(0, Number(valueStr.replace(/[^\d.]/g, "")) || 0);
    persistCosts({
      ...costs,
      campaigns: {
        ...costs.campaigns,
        [campaignKey]: {
          ...costs.campaigns[campaignKey],
          adSpendDzd: num,
        },
      },
    });
  };

  const rows = React.useMemo(
    () =>
      computeCampaignProfitability(orders, costs.campaigns, {
        unitCogsDzd: costs.defaultUnitCogsDzd,
        returnShippingLossDzd: costs.defaultReturnShippingLossDzd,
      }),
    [orders, costs],
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
            <CardTitle className="flex items-center gap-2 font-bold text-base">
              <Calculator className="size-4 text-emerald-500" />
              محرك ربحية الحملات التلقائي
            </CardTitle>
            <CardDescription className="text-xs">
              يربط كل طلبية بمعرفات الحملة وحالة التسليم الفعلية في شركة التوصيل لحساب صافي الربح والعائد على الإنفاق الإعلاني لكل حملة.
            </CardDescription>
          </div>

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

        {/* Dynamic URL Parameters Helper + Default Cost Inputs */}
        <div className="grid gap-3 pt-1 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-2.5 text-xs">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
              <Link2 className="size-3.5 text-blue-500" />
              قالب تتبع الحملات التلقائي
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
            <Label htmlFor="default-unit-cogs" className="text-xs">
              تكلفة المنتج التقديرية لكل طلب مسلّم (COGS د.ج)
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
            <span className="block text-[11px] text-muted-foreground">إجمالي الإنفاق الإعلاني المُدخل</span>
            <span className="mt-0.5 block font-bold font-mono text-base text-blue-600 tabular-nums dark:text-blue-400">
              {isLoading ? "…" : formatDzd(totals.adSpend)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              ROAS الإجمالي:{" "}
              {totals.adSpend > 0 ? `${(totals.revenue / totals.adSpend).toFixed(2)}x` : "أدخل ميزانية الحملة"}
            </span>
          </div>

          <div className="rounded-lg border bg-card p-3">
            <span className="block text-[11px] text-muted-foreground">تكلفة البضاعة + خسائر المرتجعات</span>
            <span className="mt-0.5 block font-bold font-mono text-amber-600 text-base tabular-nums dark:text-amber-400">
              {isLoading ? "…" : formatDzd(totals.cogs + totals.returnLoss)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {totals.returned} طلب مرتجع ({formatDzd(totals.returnLoss)})
            </span>
          </div>

          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
            <span className="block text-[11px] text-muted-foreground">صافي الربح التقديري</span>
            <span
              className={`mt-0.5 flex items-center gap-1 font-extrabold font-mono text-base tabular-nums ${
                totals.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {totals.netProfit >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {isLoading ? "…" : formatDzd(totals.netProfit)}
            </span>
            <span className="text-[11px] text-muted-foreground">محسوب تلقائياً من الطلبات المسلّمة</span>
          </div>
        </div>

        {/* Per-Campaign Breakdown Table */}
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="text-right">الحملة / المصدر</TableHead>
                <TableHead className="text-center">الطلبات (Redex)</TableHead>
                <TableHead className="text-center">المسلّم / المرتجع</TableHead>
                <TableHead className="text-center">نسبة التسليم</TableHead>
                <TableHead className="text-right">الإيراد المحصّل</TableHead>
                <TableHead className="w-[150px] text-right">تكلفة الإعلان (د.ج)</TableHead>
                <TableHead className="text-center">CPD / ROAS</TableHead>
                <TableHead className="text-right">صافي الربح</TableHead>
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
                        {row.adsetCount > 0 && (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {row.adsetCount} AdSets • {row.adCount} Ads
                          </span>
                        )}
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
                      {formatDzd(row.deliveredProductRevenueDzd)}
                    </TableCell>

                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={row.adSpendDzd || ""}
                        placeholder="0"
                        onChange={(e) => updateAdSpend(row.campaignKey, e.target.value)}
                        className="h-7 w-28 font-mono text-xs"
                        dir="ltr"
                        aria-label={`تكلفة إعلان ${row.campaignName}`}
                      />
                    </TableCell>

                    <TableCell className="text-center font-mono text-[11px] tabular-nums">
                      <div>{row.costPerDeliveredDzd !== null ? `${row.costPerDeliveredDzd} د.ج` : "—"}</div>
                      <div className="text-muted-foreground">{row.roas !== null ? `${row.roas}x ROAS` : "—"}</div>
                    </TableCell>

                    <TableCell
                      className={`font-bold font-mono text-xs tabular-nums ${
                        row.netProfitDzd >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {formatDzd(row.netProfitDzd)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
