"use client";

import * as React from "react";

import Link from "next/link";

import { Calculator, Link2, Megaphone, RefreshCw, Truck, Wallet } from "lucide-react";

import { CampaignProfitabilitySection } from "@/app/(main)/dashboard/ecommerce/_components/campaign-profitability-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDzd, orvaFetch } from "@/lib/orva-api";
import { useOrvaOrders } from "@/lib/use-orva-orders";

export function ProfitabilityWorkspace() {
  const { orders, isLoading } = useOrvaOrders();
  const [timeRange, setTimeRange] = React.useState("last_7d");
  const [limit, setLimit] = React.useState(10);
  const [metaMeta, setMetaMeta] = React.useState<{
    returnFeeWilayasSynced: number;
    liveGraphConnected: boolean;
    hasMore: boolean;
    totalCampaignsCount: number;
    returnFeesByWilaya: Record<number, number>;
    products: Array<{
      id: string;
      title: string;
      marketingCostPerOrder: number;
      metaAdsLinks?: Array<{ campaignName?: string | null; computedCpaDzd: number; allocationWeight?: number }>;
    }>;
  } | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadMetaOverview = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await orvaFetch(
        `/api/integrations/meta-ads?timeRange=${encodeURIComponent(timeRange)}&limit=${limit}`,
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setMetaMeta({
          returnFeeWilayasSynced: Number(data.returnFeeWilayasSynced ?? 0),
          liveGraphConnected: Boolean(data.liveGraphConnected),
          hasMore: Boolean(data.hasMore),
          totalCampaignsCount: Number(data.totalCampaignsCount ?? 0),
          returnFeesByWilaya: data.returnFeesByWilaya ?? {},
          products: data.products ?? [],
        });
      }
    } finally {
      setRefreshing(false);
    }
  }, [timeRange, limit]);

  React.useEffect(() => {
    void loadMetaOverview();
  }, [loadMetaOverview]);

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="size-6 text-emerald-600" />
            محرك ربحية الحملات التلقائي (Meta Ads &amp; Redex)
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            تحكم كامل في ربحية حملات Meta Ads، الربط المتعدد بين المنتجات والحملات، وحساب خسائر الإرجاع تلقائياً حسب
            تسعيرة كل ولاية (tarif_retour).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={timeRange}
            onValueChange={(v) => {
              if (v) setTimeRange(v);
            }}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_7d">آخر 7 أيام (افتراضي)</SelectItem>
              <SelectItem value="last_14d">آخر 14 يوماً</SelectItem>
              <SelectItem value="last_30d">آخر 30 يوماً</SelectItem>
              <SelectItem value="this_month">هذا الشهر</SelectItem>
              <SelectItem value="today">اليوم</SelectItem>
            </SelectContent>
          </Select>

          <Button size="sm" variant="outline" onClick={() => void loadMetaOverview()} disabled={refreshing}>
            <RefreshCw className={`size-3.5 me-1.5 ${refreshing ? "animate-spin" : ""}`} />
            تحديث الحقول والتسعيرة
          </Button>

          <Button nativeButton={false} render={<Link href="/dashboard/products" />} size="sm" variant="outline">
            <Link2 className="size-3.5 me-1.5" />
            ربط المنتجات بالحملات
          </Button>
        </div>
      </div>

      {/* Courier Return Fee + Meta Connection Status Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-emerald-500/20">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <Truck className="size-3.5 text-emerald-600" />
              تسعيرة الارتجاع التلقائية (tarif_retour)
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 text-xs flex items-center justify-between">
            <span>الولايات المتزامنة من شركات الشحن:</span>
            <Badge variant="outline" className="font-mono text-emerald-600">
              {metaMeta?.returnFeeWilayasSynced ?? 0} / 69 ولاية
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <Megaphone className="size-3.5 text-blue-600" />
              بوابة Meta Graph API ({timeRange})
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 text-xs flex items-center justify-between">
            <span>حالة الاتصال والتغطية:</span>
            <Badge variant="outline">
              {metaMeta?.liveGraphConnected ? "متصل مباشر" : "تتبع المتجر + ربط المنتجات"}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <Wallet className="size-3.5 text-primary" />
              الربط المتعدد (Many-to-Many)
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 text-xs flex items-center justify-between">
            <span>المنتجات ذات الحملات المربوطة:</span>
            <Badge variant="secondary">
              {(metaMeta?.products ?? []).filter((p) => (p.metaAdsLinks?.length ?? 0) > 0).length} منتج
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Main Campaign Profitability Engine */}
      <CampaignProfitabilitySection
        orders={orders}
        isLoading={isLoading}
        returnFeesByWilaya={metaMeta?.returnFeesByWilaya}
        defaultTimeRange={timeRange}
      />

      {metaMeta?.hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((prev) => prev + 20)}>
            عرض باقي الحملات ({metaMeta.totalCampaignsCount})
          </Button>
        </div>
      )}

      {/* Product-to-Multi-Campaign Allocation Matrix */}
      {metaMeta && metaMeta.products.some((p) => (p.metaAdsLinks?.length ?? 0) > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">مصفوفة ربط المنتجات بعدة حملات Meta Ads</CardTitle>
            <CardDescription className="text-xs">
              تعرض الحملات التسويقية المتعددة المربوطة بكل منتج ومتوسط CPA المرجّح بدون تكرار احتساب الإنفاق المشترك.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {metaMeta.products
              .filter((p) => (p.metaAdsLinks?.length ?? 0) > 0)
              .map((p) => (
                <div key={p.id} className="rounded-lg border p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold truncate">{p.title}</span>
                    <Badge variant="outline" className="font-mono text-[10px] text-amber-600">
                      CPA مرجّح: {formatDzd(p.marketingCostPerOrder)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.metaAdsLinks?.map((lnk, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {lnk.campaignName || "حملة"} ({lnk.computedCpaDzd} د.ج)
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
