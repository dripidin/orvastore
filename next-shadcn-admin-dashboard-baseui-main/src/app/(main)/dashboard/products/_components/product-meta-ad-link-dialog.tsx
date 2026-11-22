"use client";

import * as React from "react";
import { Calculator, Check, Link2, Loader2, Megaphone, Unlink } from "lucide-react";

import type { MetaAdCampaignSummary } from "@/app/api/integrations/meta-ads/route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { formatDzd, orvaFetch } from "@/lib/orva-api";
import {
  computeEstimatedOrderProfit,
  computeUnitMargin,
  type Product,
  type ProductMetaAdLink,
} from "@/lib/repository/product-types";

interface ProductMetaAdLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productTitle: string;
  sellingPriceDzd: number;
  purchaseCostDzd: number;
  defaultOrdersCount: number;
  currentMarketingCostDzd: number;
  currentLink: ProductMetaAdLink | null;
  /** If productId is provided and saveImmediately=true, persists via POST /api/integrations/meta-ads */
  productId?: string | null;
  saveImmediately?: boolean;
  onApply: (link: ProductMetaAdLink | null, computedCpaDzd: number, updatedProduct?: Product) => void;
}

export function ProductMetaAdLinkDialog({
  open,
  onOpenChange,
  productTitle,
  sellingPriceDzd,
  purchaseCostDzd,
  defaultOrdersCount,
  currentMarketingCostDzd,
  currentLink,
  productId,
  saveImmediately = false,
  onApply,
}: ProductMetaAdLinkDialogProps) {
  const [campaigns, setCampaigns] = React.useState<MetaAdCampaignSummary[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const [costMode, setCostMode] = React.useState<ProductMetaAdLink["costMode"]>("campaign_budget_cpa");
  const [campaignId, setCampaignId] = React.useState("");
  const [campaignName, setCampaignName] = React.useState("");
  const [adId, setAdId] = React.useState("");
  const [adName, setAdName] = React.useState("");
  const [currencyMode, setCurrencyMode] = React.useState<"USD" | "DZD">("USD");
  const [spendInput, setSpendInput] = React.useState<string>("25");
  const [exchangeRateDzd, setExchangeRateDzd] = React.useState<string>("245");
  const [ordersCountInput, setOrdersCountInput] = React.useState<string>("7");
  const [directCpaInput, setDirectCpaInput] = React.useState<string>("850");

  React.useEffect(() => {
    if (!open) return;
    setIsLoadingCampaigns(true);
    orvaFetch("/api/integrations/meta-ads")
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && Array.isArray(json.campaigns)) {
          setCampaigns(json.campaigns as MetaAdCampaignSummary[]);
        }
      })
      .catch(() => undefined)
      .finally(() => setIsLoadingCampaigns(false));
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (currentLink?.enabled) {
      setCostMode(currentLink.costMode || "campaign_budget_cpa");
      setCampaignId(currentLink.campaignId || "");
      setCampaignName(currentLink.campaignName || "");
      setAdId(currentLink.adId || "");
      setAdName(currentLink.adName || "");
      const rate = Number(currentLink.exchangeRateDzd) || 245;
      setExchangeRateDzd(String(rate));
      if (Number(currentLink.campaignSpendUsd) > 0) {
        setCurrencyMode("USD");
        setSpendInput(String(currentLink.campaignSpendUsd));
      } else if (Number(currentLink.campaignSpendDzd) > 0) {
        setCurrencyMode("DZD");
        setSpendInput(String(currentLink.campaignSpendDzd));
      }
      setOrdersCountInput(String(Math.max(1, Number(currentLink.attributedOrdersCount) || defaultOrdersCount || 5)));
      setDirectCpaInput(String(currentLink.computedCpaDzd || currentMarketingCostDzd || 850));
    } else {
      setCostMode("campaign_budget_cpa");
      setCampaignId("");
      setCampaignName(`حملة Meta — ${productTitle || "ORVA"}`);
      setAdId("");
      setAdName("");
      setCurrencyMode("USD");
      const safeOrders = Math.max(1, defaultOrdersCount || 10);
      setOrdersCountInput(String(safeOrders));
      const baseCpa = currentMarketingCostDzd > 0 ? currentMarketingCostDzd : 850;
      setDirectCpaInput(String(baseCpa));
      const estimatedUsd = Number(((baseCpa * safeOrders) / 245).toFixed(2));
      setSpendInput(String(estimatedUsd));
      setExchangeRateDzd("245");
    }
  }, [open, currentLink, productTitle, defaultOrdersCount, currentMarketingCostDzd]);

  const rateNum = Math.max(1, Number(exchangeRateDzd) || 245);
  const rawSpendNum = Math.max(0, Number(spendInput) || 0);
  const spendDzd = currencyMode === "USD" ? Math.round(rawSpendNum * rateNum) : Math.round(rawSpendNum);
  const spendUsd = currencyMode === "USD" ? rawSpendNum : Number((rawSpendNum / rateNum).toFixed(2));
  const ordersNum = Math.max(1, Math.round(Number(ordersCountInput) || 1));
  const directCpaNum = Math.max(0, Number(directCpaInput) || 0);
  const directCpaDzd = currencyMode === "USD" && costMode === "fixed_cpa" ? Math.round(directCpaNum * rateNum) : Math.round(directCpaNum);

  const computedCpaDzd =
    costMode === "campaign_budget_cpa"
      ? Math.max(0, Math.round(spendDzd / ordersNum))
      : directCpaDzd;

  const unitMarginDzd = computeUnitMargin(sellingPriceDzd, purchaseCostDzd);
  const estimatedOrderProfitDzd = computeEstimatedOrderProfit(
    sellingPriceDzd,
    purchaseCostDzd,
    computedCpaDzd,
    1,
  );
  const breakEvenCpaDzd = Math.max(0, unitMarginDzd - 200);
  const estimatedRoas =
    computedCpaDzd > 0 && sellingPriceDzd > 0 ? Number((sellingPriceDzd / computedCpaDzd).toFixed(2)) : null;

  const selectDetectedCampaign = (c: MetaAdCampaignSummary) => {
    setCampaignId(c.campaignId);
    setCampaignName(c.campaignName);
    if (c.adId) setAdId(c.adId);
    const ordCount = Math.max(1, c.totalOrders || defaultOrdersCount || 1);
    setOrdersCountInput(String(ordCount));
    if (c.spendDzd > 0) {
      setCostMode("campaign_budget_cpa");
      setCurrencyMode("DZD");
      setSpendInput(String(c.spendDzd));
    } else if (c.estimatedCpaDzd > 0) {
      setDirectCpaInput(String(c.estimatedCpaDzd));
    }
  };

  const handleSaveLink = async () => {
    const newLink: ProductMetaAdLink = {
      enabled: true,
      campaignId: campaignId.trim() || null,
      campaignName: campaignName.trim() || `حملة Meta — ${productTitle}`,
      adId: adId.trim() || null,
      adName: adName.trim() || null,
      costMode,
      campaignSpendUsd: spendUsd,
      campaignSpendDzd: spendDzd,
      exchangeRateDzd: rateNum,
      attributedOrdersCount: ordersNum,
      computedCpaDzd,
      lastSyncedAt: new Date().toISOString(),
    };

    if (saveImmediately && productId) {
      setIsSaving(true);
      try {
        const res = await orvaFetch("/api/integrations/meta-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            metaAdsLink: newLink,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "تعذر حفظ ربط الإعلان بالمنتج.");
        }
        onApply(newLink, computedCpaDzd, json.product as Product);
        toast.add({
          title: "تم ربط الإعلان بالمنتج وحساب التكلفة تلقائياً",
          description: `تكلفة التسويق للطلب: ${formatDzd(computedCpaDzd)}`,
          type: "success",
        });
        onOpenChange(false);
      } catch (err) {
        toast.add({
          title: "تعذر حفظ الربط",
          description: err instanceof Error ? err.message : "حاول مرة أخرى.",
          type: "error",
        });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    onApply(newLink, computedCpaDzd);
    toast.add({
      title: "تم تحديد تكلفة التسويق تلقائياً من إعلان Meta",
      description: `تكلفة التسويق المحسوبة للطلب: ${formatDzd(computedCpaDzd)} (احفظ المنتج لتثبيت التغيير).`,
      type: "success",
    });
    onOpenChange(false);
  };

  const handleUnlink = async () => {
    if (saveImmediately && productId) {
      setIsSaving(true);
      try {
        const res = await orvaFetch("/api/integrations/meta-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            unlink: true,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "تعذر فك الربط.");
        }
        onApply(null, currentMarketingCostDzd, json.product as Product);
        toast.add({ title: "تم فك ربط الإعلان عن المنتج", type: "info" });
        onOpenChange(false);
      } catch (err) {
        toast.add({
          title: "تعذر فك الربط",
          description: err instanceof Error ? err.message : "حاول مرة أخرى.",
          type: "error",
        });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    onApply(null, currentMarketingCostDzd);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl text-right" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 font-bold text-base">
            <span className="grid size-8 place-items-center rounded-lg bg-blue-500/10 text-blue-600">
              <Megaphone className="size-4" />
            </span>
            <span>ربط المنتج بإعلان Meta Ads والحساب التلقائي لتكلفة التسويق</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            اربط المنتج <strong>{productTitle || "الحالي"}</strong> بحملته الإعلانية في Meta Ads ليقوم النظام بحساب تكلفة التسويق للطلب الواحد (CPA) وصافي الربح تلقائياً.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 text-xs">
          {/* Detected Meta Ads Campaigns Picker */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              1. اختر حملة مكتشفة في المتجر / Meta Ads (أو أدخل بيانات الحملة أدناه):
            </Label>
            {isLoadingCampaigns ? (
              <div className="flex items-center gap-2 rounded-lg border p-2.5 text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                <span>جارٍ البحث عن الحملات الإعلانية...</span>
              </div>
            ) : campaigns.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto rounded-lg border bg-muted/20 p-2">
                {campaigns.map((c) => {
                  const selected = campaignId === c.campaignId || campaignName === c.campaignName;
                  return (
                    <button
                      key={c.campaignKey}
                      type="button"
                      onClick={() => selectDetectedCampaign(c)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-right text-[11px] transition-colors cursor-pointer ${
                        selected
                          ? "border-blue-600 bg-blue-500/10 font-bold text-blue-700 dark:text-blue-300"
                          : "bg-background hover:bg-muted"
                      }`}
                    >
                      <Megaphone className="size-3 text-blue-500" />
                      <span>{c.campaignName}</span>
                      <Badge variant="secondary" className="font-mono text-[9px]">
                        {c.totalOrders} طلب
                      </Badge>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {/* Campaign & Ad Identifiers */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="meta-link-campaign-name" className="text-xs font-semibold">
                اسم الحملة الإعلانية (Campaign Name)
              </Label>
              <Input
                id="meta-link-campaign-name"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="مثال: Crown Pack - Algeria Conv"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="meta-link-campaign-id" className="text-xs font-semibold">
                معرّف الحملة أو UTM (Campaign ID / UTM)
              </Label>
              <Input
                id="meta-link-campaign-id"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                placeholder="مثال: 12021094827162 أو pack2_crown"
                className="h-8 font-mono text-xs"
                dir="ltr"
              />
            </div>
          </div>

          {/* Calculation Mode Selector */}
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <Calculator className="size-3.5 text-emerald-600" />
                طريقة الحساب التلقائي لتكلفة التسويق (Meta Ads CPA):
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant={currencyMode === "USD" ? "default" : "outline"}
                  onClick={() => setCurrencyMode("USD")}
                  className="h-6 px-2 text-[10px]"
                >
                  بالدولار ($ USD)
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={currencyMode === "DZD" ? "default" : "outline"}
                  onClick={() => setCurrencyMode("DZD")}
                  className="h-6 px-2 text-[10px]"
                >
                  بالدينار (د.ج DZD)
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
              <button
                type="button"
                onClick={() => setCostMode("campaign_budget_cpa")}
                className={`rounded-lg border p-2.5 text-right transition-colors cursor-pointer ${
                  costMode === "campaign_budget_cpa"
                    ? "border-primary bg-primary/10 font-semibold text-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <div className="text-xs font-bold text-foreground">أ) قسمة ميزانية الحملة على عدد الطلبات</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  يحسب تلقائياً: (إجمالي الصرف في Meta Ads ÷ عدد الطلبات)
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCostMode("fixed_cpa")}
                className={`rounded-lg border p-2.5 text-right transition-colors cursor-pointer ${
                  costMode === "fixed_cpa"
                    ? "border-primary bg-primary/10 font-semibold text-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <div className="text-xs font-bold text-foreground">ب) إدخال تقدير تكلفة النتيجة من Meta</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  يحوّل Cost Per Purchase من مدير الإعلانات ($ أو د.ج) مباشرة
                </div>
              </button>
            </div>

            {costMode === "campaign_budget_cpa" ? (
              <div className="grid grid-cols-1 gap-2.5 pt-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">
                    إجمالي صرف الحملة ({currencyMode === "USD" ? "$ USD" : "د.ج DZD"})
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={spendInput}
                    onChange={(e) => setSpendInput(e.target.value)}
                    className="h-8 font-mono text-xs"
                    dir="ltr"
                  />
                </div>
                {currencyMode === "USD" && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">سعر صرف الدولار (د.ج لكل 1$)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={exchangeRateDzd}
                      onChange={(e) => setExchangeRateDzd(e.target.value)}
                      className="h-8 font-mono text-xs"
                      dir="ltr"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-[11px]">عدد الطلبات الناتجة عن الإعلان</Label>
                  <Input
                    type="number"
                    min="1"
                    value={ordersCountInput}
                    onChange={(e) => setOrdersCountInput(e.target.value)}
                    className="h-8 font-mono text-xs"
                    dir="ltr"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 pt-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">
                    تكلفة الطلب في Meta Ads ({currencyMode === "USD" ? "$ USD" : "د.ج DZD"})
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={directCpaInput}
                    onChange={(e) => setDirectCpaInput(e.target.value)}
                    className="h-8 font-mono text-xs"
                    dir="ltr"
                  />
                </div>
                {currencyMode === "USD" && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">سعر صرف الدولار (د.ج لكل 1$)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={exchangeRateDzd}
                      onChange={(e) => setExchangeRateDzd(e.target.value)}
                      className="h-8 font-mono text-xs"
                      dir="ltr"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Automatic Result Preview Card */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] text-muted-foreground">تكلفة التسويق المحسوبة تلقائياً للطلب الواحد:</div>
                <div className="font-extrabold font-mono text-lg text-emerald-600 dark:text-emerald-400">
                  {formatDzd(computedCpaDzd)} / طلب
                </div>
              </div>
              <div className="text-left">
                <Badge variant="outline" className="font-mono text-xs">
                  ROAS المتوقع: {estimatedRoas ? `${estimatedRoas}x` : "—"}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-emerald-500/20 pt-2 text-[11px]">
              <div>
                <span className="block text-muted-foreground">هامش القطعة:</span>
                <strong className="font-mono">{formatDzd(unitMarginDzd)}</strong>
              </div>
              <div>
                <span className="block text-muted-foreground">الحد الأقصى الآمن (Break-Even):</span>
                <strong className="font-mono">{formatDzd(breakEvenCpaDzd)}</strong>
              </div>
              <div>
                <span className="block text-muted-foreground">صافي ربح الطلب التلقائي:</span>
                <strong className={`font-mono ${estimatedOrderProfitDzd > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatDzd(estimatedOrderProfitDzd)}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-wrap flex-row-reverse sm:justify-between gap-2 pt-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSaveLink()}
              disabled={isSaving}
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              <span>تطبيق وحفظ التكلفة التلقائية ({formatDzd(computedCpaDzd)})</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              إلغاء
            </Button>
          </div>

          {currentLink?.enabled && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void handleUnlink()}
              disabled={isSaving}
              className="gap-1 text-destructive hover:bg-destructive/10"
            >
              <Unlink className="size-3.5" />
              <span>فك الربط</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
