"use client";

import * as React from "react";

import { Calculator, Check, Link2, Loader2, Megaphone, Plus, Trash2, Unlink } from "lucide-react";

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
  computeWeightedProductCpa,
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
  currentLinks?: ProductMetaAdLink[];
  /** If productId is provided and saveImmediately=true, persists via POST /api/integrations/meta-ads */
  productId?: string | null;
  saveImmediately?: boolean;
  onApply: (
    link: ProductMetaAdLink | null,
    computedCpaDzd: number,
    updatedProduct?: Product,
    allLinks?: ProductMetaAdLink[],
  ) => void;
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
  currentLinks,
  productId,
  saveImmediately = false,
  onApply,
}: ProductMetaAdLinkDialogProps) {
  const [campaigns, setCampaigns] = React.useState<MetaAdCampaignSummary[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const [linksList, setLinksList] = React.useState<ProductMetaAdLink[]>([]);
  const [costMode, setCostMode] = React.useState<ProductMetaAdLink["costMode"]>("campaign_budget_cpa");
  const [campaignId, setCampaignId] = React.useState("");
  const [campaignName, setCampaignName] = React.useState("");
  const [adId, setAdId] = React.useState("");
  const [adName, setAdName] = React.useState("");
  const [currencyMode, setCurrencyMode] = React.useState<"USD" | "DZD">("USD");
  const [spendInput, setSpendInput] = React.useState<string>("25");
  const [exchangeRateDzd, setExchangeRateDzd] = React.useState<string>("245");
  const [ordersCountInput, setOrdersCountInput] = React.useState<string>("7");
  const [allocationWeightInput, setAllocationWeightInput] = React.useState<string>("1");
  const [directCpaInput, setDirectCpaInput] = React.useState<string>("850");

  React.useEffect(() => {
    if (!open) return;
    setIsLoadingCampaigns(true);
    orvaFetch("/api/integrations/meta-ads?timeRange=last_7d&limit=25")
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
    const seed = currentLinks && currentLinks.length > 0 ? currentLinks : currentLink?.enabled ? [currentLink] : [];
    setLinksList(seed);

    const primary = seed.find((l) => l.isPrimary) ?? seed[0] ?? currentLink;
    if (primary?.enabled) {
      setCostMode(primary.costMode || "campaign_budget_cpa");
      setCampaignId(primary.campaignId || "");
      setCampaignName(primary.campaignName || "");
      setAdId(primary.adId || "");
      setAdName(primary.adName || "");
      const rate = Number(primary.exchangeRateDzd) || 245;
      setExchangeRateDzd(String(rate));
      if (Number(primary.campaignSpendUsd) > 0) {
        setCurrencyMode("USD");
        setSpendInput(String(primary.campaignSpendUsd));
      } else if (Number(primary.campaignSpendDzd) > 0) {
        setCurrencyMode("DZD");
        setSpendInput(String(primary.campaignSpendDzd));
      }
      setOrdersCountInput(String(Math.max(1, Number(primary.attributedOrdersCount) || defaultOrdersCount || 5)));
      setAllocationWeightInput(String(Number(primary.allocationWeight ?? 1) || 1));
      setDirectCpaInput(String(primary.computedCpaDzd || currentMarketingCostDzd || 850));
    } else {
      setCostMode("campaign_budget_cpa");
      setCampaignId("");
      setCampaignName(`حملة Meta — ${productTitle || "ORVA"}`);
      setAdId("");
      setAdName("");
      setCurrencyMode("USD");
      const safeOrders = Math.max(1, defaultOrdersCount || 10);
      setOrdersCountInput(String(safeOrders));
      setAllocationWeightInput("1");
      const baseCpa = currentMarketingCostDzd > 0 ? currentMarketingCostDzd : 850;
      setDirectCpaInput(String(baseCpa));
      const estimatedUsd = Number(((baseCpa * safeOrders) / 245).toFixed(2));
      setSpendInput(String(estimatedUsd));
      setExchangeRateDzd("245");
    }
  }, [open, currentLink, currentLinks, productTitle, defaultOrdersCount, currentMarketingCostDzd]);

  const rateNum = Math.max(1, Number(exchangeRateDzd) || 245);
  const rawSpendNum = Math.max(0, Number(spendInput) || 0);
  const spendDzd = currencyMode === "USD" ? Math.round(rawSpendNum * rateNum) : Math.round(rawSpendNum);
  const spendUsd = currencyMode === "USD" ? rawSpendNum : Number((rawSpendNum / rateNum).toFixed(2));
  const ordersNum = Math.max(1, Math.round(Number(ordersCountInput) || 1));
  const weightNum = Math.max(0.05, Number(allocationWeightInput) || 1);
  const directCpaNum = Math.max(0, Number(directCpaInput) || 0);
  const directCpaDzd =
    currencyMode === "USD" && costMode === "fixed_cpa" ? Math.round(directCpaNum * rateNum) : Math.round(directCpaNum);

  const draftComputedCpa =
    costMode === "campaign_budget_cpa" ? Math.max(0, Math.round(spendDzd / ordersNum)) : directCpaDzd;

  const buildDraftLink = (): ProductMetaAdLink => ({
    id: `lnk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    allocationWeight: weightNum,
    isPrimary: linksList.length === 0,
    computedCpaDzd: draftComputedCpa,
    lastSyncedAt: new Date().toISOString(),
  });

  const handleAddDraftToList = () => {
    const newLnk = buildDraftLink();
    setLinksList((prev) => {
      const existsIdx = prev.findIndex(
        (p) =>
          (newLnk.campaignId && p.campaignId === newLnk.campaignId) ||
          (newLnk.campaignName && p.campaignName === newLnk.campaignName),
      );
      if (existsIdx >= 0) {
        return prev.map((item, i) => (i === existsIdx ? { ...newLnk, id: item.id, isPrimary: item.isPrimary } : item));
      }
      return [...prev, newLnk];
    });
  };

  const effectiveLinksForCalc = React.useMemo(() => {
    if (linksList.length > 0) return linksList;
    return [buildDraftLink()];
  }, [
    linksList,
    campaignId,
    campaignName,
    adId,
    adName,
    costMode,
    spendUsd,
    spendDzd,
    rateNum,
    ordersNum,
    weightNum,
    draftComputedCpa,
  ]);

  const weightedCpaDzd = computeWeightedProductCpa(effectiveLinksForCalc, draftComputedCpa);
  const unitMarginDzd = computeUnitMargin(sellingPriceDzd, purchaseCostDzd);
  const estimatedOrderProfitDzd = computeEstimatedOrderProfit(sellingPriceDzd, purchaseCostDzd, weightedCpaDzd, 1);
  const breakEvenCpaDzd = Math.max(0, unitMarginDzd - 200);
  const estimatedRoas =
    weightedCpaDzd > 0 && sellingPriceDzd > 0 ? Number((sellingPriceDzd / weightedCpaDzd).toFixed(2)) : null;

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

  const handleSaveAllLinks = async () => {
    const draft = buildDraftLink();
    const finalLinks: ProductMetaAdLink[] =
      linksList.length === 0
        ? [{ ...draft, isPrimary: true }]
        : linksList.some(
              (l) =>
                (draft.campaignId && l.campaignId === draft.campaignId) ||
                (draft.campaignName && l.campaignName === draft.campaignName),
            )
          ? linksList
          : [...linksList, draft];

    const normalized = finalLinks.map((l, idx) => ({
      ...l,
      isPrimary: finalLinks.some((x) => x.isPrimary) ? Boolean(l.isPrimary) : idx === 0,
    }));
    const primary = normalized.find((l) => l.isPrimary && l.enabled) ?? normalized[0] ?? null;
    const finalWeightedCpa = computeWeightedProductCpa(normalized, draftComputedCpa);

    if (saveImmediately && productId) {
      setIsSaving(true);
      try {
        const res = await orvaFetch("/api/integrations/meta-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            metaAdsLinks: normalized,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "تعذر حفظ ربط الحملات بالمنتج.");
        }
        onApply(primary, finalWeightedCpa, json.product as Product, normalized);
        toast.add({
          title: `تم ربط ${normalized.length} حملات Meta Ads بالمنتج`,
          description: `متوسط تكلفة التسويق المرجّح للطلب: ${formatDzd(finalWeightedCpa)}`,
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

    onApply(primary, finalWeightedCpa, undefined, normalized);
    toast.add({
      title: `تم تجهيز ربط ${normalized.length} حملة بالمنتج`,
      description: `تكلفة التسويق المحسوبة للطلب: ${formatDzd(finalWeightedCpa)} (احفظ المنتج لتثبيت التغيير).`,
      type: "success",
    });
    onOpenChange(false);
  };

  const handleUnlinkAll = async () => {
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
        onApply(null, currentMarketingCostDzd, json.product as Product, []);
        toast.add({ title: "تم فك ربط كافة الحملات عن المنتج", type: "info" });
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

    onApply(null, currentMarketingCostDzd, undefined, []);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <Megaphone className="size-4 text-blue-600" />
            ربط متعدد الحلقات مع Meta Ads — {productTitle}
          </DialogTitle>
          <DialogDescription className="text-xs">
            يمكنك ربط هذا المنتج بحملة تسويقية واحدة أو عدة حملات معاً (Many-to-Many) مع حساب CPA المرجّح تلقائياً ومنع
            تكرار الإنفاق.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          {/* Attached Campaigns Chips */}
          {linksList.length > 0 && (
            <div className="rounded-xl border bg-blue-500/5 border-blue-500/20 p-3 space-y-2">
              <div className="font-bold text-xs flex items-center justify-between">
                <span>الحملات المربوطة حالياً ({linksList.length})</span>
                <Badge variant="outline" className="font-mono text-emerald-600">
                  CPA مرجّح: {formatDzd(weightedCpaDzd)}
                </Badge>
              </div>
              <div className="space-y-1.5">
                {linksList.map((lnk, idx) => (
                  <div
                    key={lnk.id || idx}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Link2 className="size-3.5 text-blue-600 shrink-0" />
                      <span className="font-semibold truncate">{lnk.campaignName || lnk.campaignId}</span>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        CPA: {lnk.computedCpaDzd} د.ج
                      </Badge>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        الوزن: {lnk.allocationWeight ?? 1}
                      </Badge>
                      {lnk.isPrimary && <Badge className="text-[10px]">أساسية</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      {!lnk.isPrimary && (
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            setLinksList((prev) => prev.map((item, i) => ({ ...item, isPrimary: i === idx })))
                          }
                        >
                          تعيين كأساسية
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => setLinksList((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="size-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detected Meta Ads Campaigns */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">الحملات المرصودة في النظام (Meta Ads):</Label>
              {isLoadingCampaigns && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </div>
            {campaigns.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 rounded-lg border bg-muted/20">
                {campaigns.map((c) => {
                  const selected = campaignId === c.campaignId && campaignName === c.campaignName;
                  return (
                    <Button
                      key={c.campaignKey}
                      type="button"
                      size="xs"
                      variant={selected ? "default" : "outline"}
                      onClick={() => selectDetectedCampaign(c)}
                      className="text-[11px] gap-1"
                    >
                      {selected && <Check className="size-3" />}
                      <span>{c.campaignName}</span>
                      <span className="font-mono opacity-75">({c.estimatedCpaDzd} د.ج)</span>
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground">
                لم تُرصد حملات Meta خارجية بعد — يمكنك إدخال الحملة يدوياً أدناه لإضافتها.
              </div>
            )}
          </div>

          {/* Campaign Form */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border p-3 bg-muted/10">
            <div className="space-y-1">
              <Label className="text-xs">معرّف الحملة (fb_campaign_id)</Label>
              <Input
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                placeholder="1202104859..."
                className="h-8 font-mono text-xs"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">اسم الحملة (utm_campaign / Meta Name)</Label>
              <Input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="حملة Pack 1 — DZ"
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">معرّف الإعلان (fb_ad_id اختياري)</Label>
              <Input
                value={adId}
                onChange={(e) => setAdId(e.target.value)}
                placeholder="اختياري"
                className="h-8 font-mono text-xs"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">وزن التخصيص (للحملات متعددة المنتجات)</Label>
              <Input
                type="number"
                step="0.1"
                min="0.1"
                value={allocationWeightInput}
                onChange={(e) => setAllocationWeightInput(e.target.value)}
                className="h-8 font-mono text-xs"
                dir="ltr"
              />
            </div>

            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="xs"
                variant={costMode === "campaign_budget_cpa" ? "default" : "outline"}
                onClick={() => setCostMode("campaign_budget_cpa")}
              >
                حساب CPA تلقائياً من الإنفاق ÷ الطلبات
              </Button>
              <Button
                type="button"
                size="xs"
                variant={costMode === "fixed_cpa" ? "default" : "outline"}
                onClick={() => setCostMode("fixed_cpa")}
              >
                إدخال CPA ثابت لكل طلب
              </Button>
            </div>

            {costMode === "campaign_budget_cpa" ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">إنفاق الحملة</Label>
                  <div className="flex gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={spendInput}
                      onChange={(e) => setSpendInput(e.target.value)}
                      className="h-8 font-mono text-xs"
                      dir="ltr"
                    />
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setCurrencyMode((m) => (m === "USD" ? "DZD" : "USD"))}
                      className="h-8 font-mono shrink-0"
                    >
                      {currencyMode}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">عدد الطلبات</Label>
                    <Input
                      type="number"
                      min="1"
                      value={ordersCountInput}
                      onChange={(e) => setOrdersCountInput(e.target.value)}
                      className="h-8 font-mono text-xs"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">سعر الدولار (DZD)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={exchangeRateDzd}
                      onChange={(e) => setExchangeRateDzd(e.target.value)}
                      className="h-8 font-mono text-xs"
                      dir="ltr"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">تكلفة التسويق للطلب ({currencyMode})</Label>
                <div className="flex gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    value={directCpaInput}
                    onChange={(e) => setDirectCpaInput(e.target.value)}
                    className="h-8 font-mono text-xs"
                    dir="ltr"
                  />
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setCurrencyMode((m) => (m === "USD" ? "DZD" : "USD"))}
                    className="h-8 font-mono shrink-0"
                  >
                    {currencyMode}
                  </Button>
                </div>
              </div>
            )}

            <div className="sm:col-span-2 flex justify-end">
              <Button type="button" size="xs" variant="secondary" onClick={handleAddDraftToList} className="gap-1">
                <Plus className="size-3.5" />
                إضافة هذه الحملة إلى قائمة ربط المنتج (لربط أكثر من حملة)
              </Button>
            </div>
          </div>

          {/* Break-Even & Live Economics Box */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <div className="text-[10px] text-muted-foreground">تكلفة التسويق المحسوبة</div>
              <div className="font-bold font-mono text-amber-600">{formatDzd(weightedCpaDzd)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">صافي الربح المقدر للطلب</div>
              <div className="font-bold font-mono text-emerald-600">{formatDzd(estimatedOrderProfitDzd)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">حد الأمان (Break-Even CPA)</div>
              <div className="font-bold font-mono">{formatDzd(breakEvenCpaDzd)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">العائد المقدر (ROAS)</div>
              <div className="font-bold font-mono">{estimatedRoas ? `${estimatedRoas}x` : "—"}</div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-wrap justify-between gap-2">
          <div>
            {(linksList.length > 0 || currentLink?.enabled) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={isSaving}
                onClick={() => void handleUnlinkAll()}
              >
                <Unlink className="size-3.5 me-1" />
                فك ربط كافة الحملات
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="button" size="sm" disabled={isSaving} onClick={() => void handleSaveAllLinks()}>
              {isSaving ? <Loader2 className="size-3.5 me-1 animate-spin" /> : <Calculator className="size-3.5 me-1" />}
              حفظ واعتماد ربط الحملات ({effectiveLinksForCalc.length})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
