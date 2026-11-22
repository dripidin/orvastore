"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import {
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  History,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Phone,
  Printer,
  RefreshCw,
  RotateCcw,
  Truck,
  User,
  X,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { formatDzd, orvaFetch } from "@/lib/orva-api";
import { formatAttributionSourceLabel } from "@/lib/analytics/campaign-profitability";

import { resolveOperationalOrderBucket, type OrderRow } from "./recent-orders-table/schema";
import { getAvailableTransitions } from "./recent-orders-table/status-transitions";
import { ShipmentTrackingPanel } from "./shipment-tracking-panel";

interface OrderDetailsDrawerProps {
  order: OrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSwitchDialog?: (order: OrderRow) => void;
  onOpenPushDialog?: (order: OrderRow) => void;
  onUpdateStatus?: (orderId: string, newStatus: string) => void;
  onDeleteOrder?: (orderId: string) => void;
  onDiscountUpdated?: (orderId: string, discountDzd: number, finalTotalDzd: number, originalTotalDzd: number) => void;
  onCustomerNameUpdated?: (orderId: string, newCustomerName: string, previousName: string) => void;
}

function numericAmount(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseStrictDiscountInput(value: string | null, fallbackValue: number): number | null {
  if (value === null) return fallbackValue;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "-";
  try {
    const d = parseISO(dateStr);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    return format(d, "dd MMM yyyy — HH:mm");
  } catch {
    return String(dateStr);
  }
}

function resolveStatusLabel(order: OrderRow): { label: string; className: string } {
  const bucket = resolveOperationalOrderBucket(order);

  if (bucket === "Cancelled") {
    return { label: "ملغاة (Cancelled)", className: "border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-300" };
  }
  if (bucket === "Delivered") {
    return {
      label: "مسلّمة (Delivered)",
      className: "border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-300",
    };
  }
  if (bucket === "Returned") {
    return {
      label: "مرتجعة (Returned)",
      className: "border-orange-600/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    };
  }
  if (bucket === "Shipped") {
    return {
      label: "مشحونة (Shipped)",
      className: "border-purple-600/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
    };
  }
  if (bucket === "Pushed to Redex") {
    return {
      label: "Pushed to Redex (جاهز للإرسال)",
      className: "border-cyan-600/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    };
  }
  if (bucket === "Confirmed") {
    return { label: "مؤكدة (Confirmed)", className: "border-blue-600/30 bg-blue-500/10 text-blue-700 dark:text-blue-300" };
  }
  return {
    label: "قيد الانتظار (Pending)",
    className: "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  };
}

function InfoRow({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="min-w-0 text-left font-medium text-foreground">{children}</span>
    </div>
  );
}

export function OrderDetailsDrawer({
  order,
  open,
  onOpenChange,
  onOpenSwitchDialog,
  onOpenPushDialog,
  onUpdateStatus,
  onDiscountUpdated,
  onCustomerNameUpdated,
}: OrderDetailsDrawerProps) {
  const [copied, setCopied] = React.useState<"id" | "tracking" | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const [discountInput, setDiscountInput] = React.useState<string | null>(null);
  const [savingDiscount, setSavingDiscount] = React.useState(false);
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [customerNameDraft, setCustomerNameDraft] = React.useState("");
  const [savingCustomerName, setSavingCustomerName] = React.useState(false);

  React.useEffect(() => {
    setShowHistory(false);
    setIsEditingName(false);
    setCustomerNameDraft(order?.customer && order.customer !== "—" ? order.customer : "");
  }, [open, order?.id, order?.customer]);

  React.useEffect(() => {
    const raw = order?.rawOrder as Record<string, unknown> | undefined;
    const metadata = raw?.metadata && typeof raw.metadata === "object" ? raw.metadata as Record<string, unknown> : {};
    const discount = metadata.orderDiscount && typeof metadata.orderDiscount === "object" ? metadata.orderDiscount as Record<string, unknown> : null;
    setDiscountInput(Number(discount?.amountDzd) > 0 ? String(discount?.amountDzd) : "");
  }, [open, order?.id]);

  if (!order) return null;

  const raw = order.rawOrder as Record<string, unknown> | undefined;
  const trackingCode =
    order.redex_tracking_id ||
    order.redex_tracking_code ||
    (typeof raw?.redex_tracking_id === "string" ? raw.redex_tracking_id : null) ||
    (typeof raw?.tracking_code === "string" ? raw.tracking_code : null) ||
    (typeof raw?.tracking_number === "string" ? raw.tracking_number : null);
  const address = typeof raw?.delivery_address === "string" ? raw.delivery_address : null;
  const attributionSource = order.attribution_source || (typeof raw?.attribution_source === "string" ? raw.attribution_source : "direct");
  const utmCampaign = order.utm_campaign || (typeof raw?.utm_campaign === "string" ? raw.utm_campaign : null);
  const fbCampaignId = order.fb_campaign_id || (typeof raw?.fb_campaign_id === "string" ? raw.fb_campaign_id : null);
  const fbAdsetId = order.fb_adset_id || (typeof raw?.fb_adset_id === "string" ? raw.fb_adset_id : null);
  const fbAdId = order.fb_ad_id || (typeof raw?.fb_ad_id === "string" ? raw.fb_ad_id : null);
  const fbclid = order.fbclid || (typeof raw?.fbclid === "string" ? raw.fbclid : null);

  const isTerminal = ["delivered", "deleted", "reconciled"].includes((order.status || "").toLowerCase());
  const statusInfo = resolveStatusLabel(order);
  const transitions = getAvailableTransitions(order);
  const sentToCourier = Boolean(order.in_redex || trackingCode);

  const copy = async (value: string, kind: "id" | "tracking") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast.add({ title: kind === "id" ? "تم نسخ رقم الطلبية" : "تم نسخ كود التتبع", description: value, type: "success" });
      setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.add({ title: "تعذر النسخ", type: "error" });
    }
  };

  const metadata = raw?.metadata && typeof raw.metadata === "object" ? raw.metadata as Record<string, unknown> : {};
  const discountMetadata = metadata.orderDiscount && typeof metadata.orderDiscount === "object" ? metadata.orderDiscount as Record<string, unknown> : null;
  const originalTotalDzd = numericAmount(discountMetadata?.originalTotalDzd) || numericAmount(order.total);
  const currentDiscountDzd = numericAmount(discountMetadata?.amountDzd);
  const parsedDraftDiscount = parseStrictDiscountInput(discountInput, currentDiscountDzd);
  const draftDiscountDzd = parsedDraftDiscount ?? currentDiscountDzd;
  const isDraftValid = parsedDraftDiscount !== null && parsedDraftDiscount >= 0 && parsedDraftDiscount < originalTotalDzd;
  const previewTotalDzd = isDraftValid ? Math.max(0, originalTotalDzd - parsedDraftDiscount) : Math.max(0, originalTotalDzd - currentDiscountDzd);
  const discountChanged = parsedDraftDiscount !== null ? parsedDraftDiscount !== currentDiscountDzd : (discountInput !== null && discountInput.trim() !== (currentDiscountDzd ? String(currentDiscountDzd) : ""));
  const saveDiscount = async () => {
    if (parsedDraftDiscount === null || !Number.isInteger(parsedDraftDiscount) || parsedDraftDiscount < 0 || parsedDraftDiscount >= originalTotalDzd) {
      toast.add({ title: "قيمة الخصم غير صالحة", description: "أدخل خصماً صحيحاً بدون كسور أو رموز وأقل من إجمالي الطلبية (أو 0 لإلغاء الخصم).", type: "error" });
      return;
    }
    setSavingDiscount(true);
    try {
      const response = await orvaFetch("/api/delivery?action=apply_discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, discountDzd: parsedDraftDiscount }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.error || "تعذر حفظ الخصم.");
      const savedDiscount = Number(result.discountDzd) || 0;
      setDiscountInput(savedDiscount ? String(savedDiscount) : "");
      onDiscountUpdated?.(order.id, savedDiscount, Number(result.finalTotalDzd), Number(result.originalTotalDzd));
      toast.add({ title: savedDiscount ? "تم حفظ الخصم" : "تم إلغاء الخصم", description: `المبلغ الجديد عند الاستلام: ${formatDzd(Number(result.finalTotalDzd))}`, type: "success" });
    } catch (error) {
      toast.add({ title: "تعذر حفظ الخصم", description: error instanceof Error ? error.message : "حاول مرة أخرى.", type: "error" });
    } finally { setSavingDiscount(false); }
  };

  const runStatus = (status: string) => onUpdateStatus?.(order.id, status);

  const saveCustomerName = async () => {
    const clean = customerNameDraft.replace(/\s+/g, " ").trim();
    if (clean.length < 2 || clean.length > 120 || /[\u0000-\u001F\u007F<>]/.test(clean) || !/[\p{L}]/u.test(clean)) {
      toast.add({
        title: "اسم الزبون غير صالح",
        description: "يرجى إدخال اسم صحيح لا يقل عن حرفين ويحتوي على أحرف صالحة.",
        type: "error",
      });
      return;
    }
    if (clean === (order.customer || "").trim()) {
      setIsEditingName(false);
      return;
    }
    setSavingCustomerName(true);
    try {
      const response = await orvaFetch("/api/delivery?action=update_customer_name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, customerName: clean }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر تحديث اسم الزبون.");
      }
      const savedName = String(result.customerName || clean);
      const prevName = String(result.previousName || order.customer || "—");
      onCustomerNameUpdated?.(order.id, savedName, prevName);
      setIsEditingName(false);
      toast.add({
        title: "تم تحديث اسم الزبون",
        description: `"${prevName}" ← "${savedName}"`,
        type: "success",
      });
    } catch (error) {
      toast.add({
        title: "تعذر تحديث اسم الزبون",
        description: error instanceof Error ? error.message : "حاول مرة أخرى.",
        type: "error",
      });
    } finally {
      setSavingCustomerName(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[90vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 text-right sm:max-w-3xl"
        dir="rtl"
      >
        {/* Header */}
        <DialogHeader className="space-y-1 border-b bg-muted/40 px-6 py-4 text-right">
          <div className="flex flex-wrap items-center gap-2 pl-8">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Package className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-1.5 font-bold text-base">
                <span>تفاصيل الطلبية</span>
                <span className="font-mono text-primary" dir="ltr">
                  {order.id}
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => void copy(order.id, "id")}
                  className="size-6 text-muted-foreground"
                  aria-label="نسخ رقم الطلبية"
                >
                  {copied === "id" ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
                </Button>
              </DialogTitle>
              <DialogDescription className="flex items-center gap-1 text-muted-foreground text-xs">
                <Calendar className="size-3" />
                <span>{formatDate(order.date)}</span>
              </DialogDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={`font-semibold text-[11px] ${statusInfo.className}`}>
                {statusInfo.label}
              </Badge>
              {order.isSwitched && (
                <Badge variant="outline" className="border-cyan-600/30 bg-cyan-500/10 text-[11px] text-cyan-700">
                  محوّلة (#{order.conversionCount})
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-xs">
          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border p-4">
              <h3 className="mb-2 font-bold text-foreground text-sm">الزبون والتوصيل</h3>
              <div className="divide-y">
                <InfoRow icon={<User className="size-3.5 text-primary" />} label="الاسم">
                  {isEditingName ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={customerNameDraft}
                        onChange={(e) => setCustomerNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveCustomerName();
                          } else if (e.key === "Escape") {
                            setIsEditingName(false);
                            setCustomerNameDraft(order.customer && order.customer !== "—" ? order.customer : "");
                          }
                        }}
                        className="h-7 w-40 text-xs"
                        placeholder="اسم الزبون..."
                        autoFocus
                        disabled={savingCustomerName}
                      />
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="default"
                        onClick={() => void saveCustomerName()}
                        disabled={savingCustomerName}
                        title="حفظ الاسم"
                        className="size-7"
                      >
                        {savingCustomerName ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      </Button>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => {
                          setIsEditingName(false);
                          setCustomerNameDraft(order.customer && order.customer !== "—" ? order.customer : "");
                        }}
                        disabled={savingCustomerName}
                        title="إلغاء"
                        className="size-7"
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span>{order.customer}</span>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => {
                          setCustomerNameDraft(order.customer && order.customer !== "—" ? order.customer : "");
                          setIsEditingName(true);
                        }}
                        className="size-6 text-muted-foreground hover:text-primary"
                        title="تغيير اسم الزبون"
                        aria-label="تغيير اسم الزبون"
                      >
                        <Pencil className="size-3" />
                      </Button>
                    </div>
                  )}
                </InfoRow>
                <InfoRow icon={<Phone className="size-3.5 text-primary" />} label="الهاتف">
                  {order.phone ? (
                    <a href={`tel:${order.phone}`} className="font-mono text-primary hover:underline" dir="ltr">
                      {order.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </InfoRow>
                <InfoRow icon={<MapPin className="size-3.5 text-primary" />} label="الولاية / البلدية">
                  {order.wilaya} — {order.commune}
                </InfoRow>
                {address && <InfoRow label="العنوان">{address}</InfoRow>}
                <InfoRow icon={<Truck className="size-3.5 text-primary" />} label="نوع التوصيل">
                  {order.deliveryType}
                </InfoRow>
              </div>
            </section>

            <section className="rounded-xl border p-4">
              <h3 className="mb-2 font-bold text-foreground text-sm">الطلب والمبلغ</h3>
              <div className="divide-y">
                <InfoRow label="المنتج / العرض">{order.items}</InfoRow>
                <InfoRow label="سعر المنتج">{formatDzd(order.priceNum)}</InfoRow>
                <InfoRow label="مصاريف الشحن">{order.shippingFee}</InfoRow>
                {currentDiscountDzd > 0 && <InfoRow label="الإجمالي قبل الخصم">{formatDzd(originalTotalDzd)}</InfoRow>}
                {(isDraftValid ? draftDiscountDzd : currentDiscountDzd) > 0 && <InfoRow label="الخصم الحالي">− {formatDzd(isDraftValid ? draftDiscountDzd : currentDiscountDzd)}</InfoRow>}
              </div>
              <div className="mt-3 space-y-2 rounded-lg border border-dashed p-3">
                <label htmlFor="order-discount" className="block font-semibold text-foreground">خصم من إجمالي الطلبية (د.ج)</label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input id="order-discount" type="number" min="0" max={Math.max(0, originalTotalDzd - 1)} step="1" value={discountInput ?? (currentDiscountDzd ? String(currentDiscountDzd) : "")} onChange={(event) => setDiscountInput(event.target.value)} className="h-9 min-w-0 flex-1" placeholder="0" />
                  <Button type="button" size="sm" variant="outline" onClick={() => void saveDiscount()} disabled={savingDiscount || !discountChanged || sentToCourier} className="shrink-0">{savingDiscount ? "جارٍ الحفظ..." : currentDiscountDzd && parsedDraftDiscount === 0 ? "إلغاء الخصم" : "حفظ الخصم"}</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">الإجمالي بعد الخصم: <strong className="text-foreground">{formatDzd(previewTotalDzd)}</strong>{sentToCourier ? " · لا يمكن تعديل الخصم بعد تسجيل الشحنة لدى شركة التوصيل." : " · بعد الحفظ يُرسل هذا المبلغ تلقائياً كمبلغ تحصيل في البوليصة."}</p>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2.5">
                <span className="font-semibold text-muted-foreground">{discountChanged ? "المبلغ بعد الخصم (معاينة)" : "المبلغ عند الاستلام"}</span>
                <span className="font-bold text-base text-primary tabular-nums">{formatDzd(previewTotalDzd)}</span>
              </div>
            </section>
          </div>

          {trackingCode && (
            <section className="space-y-3 rounded-xl border border-purple-500/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Truck className="size-4 text-purple-600" />
                  <span className="font-bold text-sm">الشحنة</span>
                  <span className="font-mono font-bold text-purple-700 dark:text-purple-300" dir="ltr">
                    {trackingCode}
                  </span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => void copy(trackingCode, "tracking")}
                    className="size-6"
                    aria-label="نسخ كود التتبع"
                  >
                    {copied === "tracking" ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
                  </Button>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() =>
                    window.open(`/api/delivery?action=label_pdf&tracking=${encodeURIComponent(trackingCode)}`, "_blank")
                  }
                >
                  <Printer className="size-3" />
                  <span>طباعة البوليصة</span>
                </Button>
              </div>
              <ShipmentTrackingPanel trackingCode={trackingCode} />
            </section>
          )}

          <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <h3 className="mb-2 font-bold text-foreground text-sm">تتبع الحملة والمصدر (Attribution &amp; Redex)</h3>
            <div className="divide-y">
              <InfoRow label="مصدر الطلب (attribution_source)">
                <Badge variant="outline" className="text-[11px]">
                  {formatAttributionSourceLabel(attributionSource)} ({attributionSource})
                </Badge>
              </InfoRow>
              {utmCampaign && (
                <InfoRow label="الحملة (utm_campaign)">
                  <span className="font-mono">{utmCampaign}</span>
                </InfoRow>
              )}
              {fbCampaignId && (
                <InfoRow label="معرف الحملة (fb_campaign_id)">
                  <span className="font-mono" dir="ltr">{fbCampaignId}</span>
                </InfoRow>
              )}
              {fbAdsetId && (
                <InfoRow label="المجموعة الإعلانية (fb_adset_id)">
                  <span className="font-mono" dir="ltr">{fbAdsetId}</span>
                </InfoRow>
              )}
              {fbAdId && (
                <InfoRow label="الإعلان (fb_ad_id)">
                  <span className="font-mono" dir="ltr">{fbAdId}</span>
                </InfoRow>
              )}
              {fbclid && (
                <InfoRow label="معرف النقرة (fbclid)">
                  <span className="max-w-[220px] truncate font-mono text-[11px]" dir="ltr" title={fbclid}>
                    {fbclid}
                  </span>
                </InfoRow>
              )}
              <InfoRow label="مطابقة التوصيل (redex_tracking_id)">
                <span className="font-mono" dir="ltr">{trackingCode || "لم يُربط بعد"}</span>
              </InfoRow>
            </div>
          </section>

          {order.conversions && order.conversions.length > 0 && (
            <section className="rounded-xl border p-3">
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="flex w-full items-center justify-between text-muted-foreground"
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  <History className="size-3.5" />
                  سجل التحويلات ({order.conversions.length})
                </span>
                <span>{showHistory ? "إخفاء" : "عرض"}</span>
              </button>
              {showHistory && (
                <ol className="mt-2 space-y-2">
                  {order.conversions.map((c, i) => (
                    <li key={c.conversion_id ?? `${c.timestamp_utc}-${i}`} className="rounded-md bg-muted/30 p-2">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>تحويل #{c.conversion_sequence || i + 1}</span>
                        <span>{formatDate(c.timestamp_utc)}</span>
                      </div>
                      {c.reason && <div className="mt-0.5 text-foreground">{c.reason}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>

        {/* Footer: one row for outcome statuses, one group for routing actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-6 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {onUpdateStatus && transitions.includes("confirmed") && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-blue-700 border-blue-500/40 hover:bg-blue-500/10"
                onClick={() => runStatus("confirmed")}
              >
                <CheckCircle2 className="size-3.5" />
                تأكيد
              </Button>
            )}
            {onUpdateStatus && transitions.includes("delivered") && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-emerald-700 border-emerald-500/40 hover:bg-emerald-500/10"
                onClick={() => runStatus("delivered")}
              >
                <CheckCircle2 className="size-3.5" />
                مستلمة
              </Button>
            )}
            {onUpdateStatus && transitions.includes("returned") && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-orange-700 border-orange-500/40 hover:bg-orange-500/10"
                onClick={() => runStatus("returned")}
              >
                <RotateCcw className="size-3.5" />
                مرتجعة
              </Button>
            )}
            {onUpdateStatus && transitions.includes("cancelled") && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-red-700 border-red-500/40 hover:bg-red-500/10"
                onClick={() => runStatus("cancelled")}
              >
                <XCircle className="size-3.5" />
                إلغاء
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {!isTerminal && onOpenSwitchDialog && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  onOpenChange(false);
                  onOpenSwitchDialog(order);
                }}
              >
                <RefreshCw className="size-3.5" />
                تحويل
              </Button>
            )}
            {!sentToCourier && !isTerminal && onOpenPushDialog && (
              <Button
                size="sm"
                className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => {
                  onOpenChange(false);
                  onOpenPushDialog(order);
                }}
              >
                <Truck className="size-3.5" />
                إرسال للتوصيل
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
              إغلاق
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
