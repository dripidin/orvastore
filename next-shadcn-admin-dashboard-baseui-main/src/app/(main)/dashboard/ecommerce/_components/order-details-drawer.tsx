"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import {
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  History,
  MapPin,
  Package,
  Phone,
  Printer,
  RefreshCw,
  RotateCcw,
  Truck,
  User,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { formatDzd } from "@/lib/orva-api";

import type { OrderRow } from "./recent-orders-table/schema";
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
  const s = (order.status || "").toLowerCase();
  const cs = (order.carrier_status || "").toLowerCase();

  if (s === "cancelled" || s === "canceled" || s === "deleted") {
    return { label: "ملغاة (Cancelled)", className: "border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-300" };
  }
  if (s === "delivered") {
    return {
      label: "مستلمة (Delivered)",
      className: "border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-300",
    };
  }
  if (s === "returned") {
    return {
      label: "مرتجعة (Returned)",
      className: "border-orange-600/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    };
  }
  if (s === "redex_station" || cs === "vers_station" || cs === "vers_hub" || s === "shipped") {
    return {
      label: "مشحونة (Shipped)",
      className: "border-purple-600/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
    };
  }
  if (s === "pushed" || order.in_redex || cs === "prete_a_expedier") {
    return {
      label: "مُرسلة لشركة التوصيل",
      className: "border-cyan-600/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    };
  }
  if (s === "confirmed") {
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
}: OrderDetailsDrawerProps) {
  const [copied, setCopied] = React.useState<"id" | "tracking" | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);

  React.useEffect(() => {
    setShowHistory(false);
  }, [open, order?.id]);

  if (!order) return null;

  const raw = order.rawOrder as Record<string, unknown> | undefined;
  const trackingCode =
    order.redex_tracking_code ||
    (typeof raw?.tracking_code === "string" ? raw.tracking_code : null) ||
    (typeof raw?.tracking_number === "string" ? raw.tracking_number : null);
  const address = typeof raw?.delivery_address === "string" ? raw.delivery_address : null;

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

  const runStatus = (status: string) => onUpdateStatus?.(order.id, status);

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
                  {order.customer}
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
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2.5">
                <span className="font-semibold text-muted-foreground">المبلغ عند الاستلام</span>
                <span className="font-bold text-base text-primary tabular-nums">{order.total}</span>
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
