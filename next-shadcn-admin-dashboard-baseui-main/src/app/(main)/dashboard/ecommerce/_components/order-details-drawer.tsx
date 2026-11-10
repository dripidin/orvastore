"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import {
  Ban,
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
  Truck,
  User,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatDzd } from "@/lib/orva-api";

import type { OrderRow } from "./recent-orders-table/schema";

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
    const d = typeof dateStr === "string" ? parseISO(dateStr) : new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return format(d, "dd MMM yyyy — HH:mm");
  } catch {
    return String(dateStr);
  }
}

function resolveStatusLabel(order: OrderRow): { label: string; className: string } {
  const s = (order.status || "").toLowerCase();
  const cs = (order.carrier_status || "").toLowerCase();

  if (s === "cancelled" || s === "canceled" || s === "deleted") {
    return {
      label: "Canceled",
      className: "border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-300",
    };
  }
  if (s === "delivered") {
    return {
      label: "مسلّمة (Delivered)",
      className: "border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-300",
    };
  }
  if (s === "returned") {
    return {
      label: "مرتجعة (Returned)",
      className: "border-orange-600/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    };
  }
  if (s === "redex_station" || cs === "vers_station" || cs === "vers_hub") {
    return {
      label: "Redex Station",
      className: "border-purple-600/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
    };
  }
  if (s === "pushed" || order.in_redex || cs === "prete_a_expedier") {
    return {
      label: "Pushed to Redex",
      className: "border-cyan-600/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
    };
  }
  if (s === "confirmed") {
    return {
      label: "Confirmed not pushed",
      className: "border-blue-600/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    };
  }
  return {
    label: "قيد الانتظار (Pending)",
    className: "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  };
}

export function OrderDetailsDrawer({
  order,
  open,
  onOpenChange,
  onOpenSwitchDialog,
  onOpenPushDialog,
  onUpdateStatus,
}: OrderDetailsDrawerProps) {
  const [copiedId, setCopiedId] = React.useState(false);
  const [copiedTracking, setCopiedTracking] = React.useState(false);
  const [showMore, setShowMore] = React.useState(false);

  React.useEffect(() => {
    setShowMore(false);
  }, [open, order?.id]);

  if (!order) return null;

  const trackingCode =
    order.redex_tracking_code ||
    (order as any)?.tracking_code ||
    (order as any)?.tracking_number ||
    null;

  const isTerminal = ["delivered", "deleted", "reconciled"].includes(
    (order.status || "").toLowerCase()
  );
  const statusInfo = resolveStatusLabel(order);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      setCopiedId(true);
      toast.add({
        title: "تم نسخ المعرّف",
        description: `#${order.id}`,
        type: "success",
      });
      setTimeout(() => setCopiedId(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleCopyTracking = async () => {
    if (!trackingCode) return;
    try {
      await navigator.clipboard.writeText(trackingCode);
      setCopiedTracking(true);
      toast.add({
        title: "تم نسخ كود التتبع",
        description: trackingCode,
        type: "success",
      });
      setTimeout(() => setCopiedTracking(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[92vw] sm:max-w-[25vw] sm:min-w-[360px] max-h-[88vh] overflow-y-auto text-right p-4"
        dir="ltr"
      >
        <DialogHeader className="text-right border-b pb-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Package className="size-4 text-primary shrink-0" />
              <DialogTitle className="text-sm font-bold font-mono text-primary">
                {order.id}
              </DialogTitle>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={handleCopyId}
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                title="نسخ معرّف الطلبية"
              >
                {copiedId ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
              </Button>
            </div>
            <Badge variant="outline" className={`font-semibold text-[11px] ${statusInfo.className}`}>
              {statusInfo.label}
            </Badge>
          </div>
          <DialogDescription className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Calendar className="size-3" />
            <span>{formatDate(order.date)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          {/* Customer & Address */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <User className="size-3 text-primary" />
                الزبون:
              </span>
              <span className="font-semibold text-foreground">{order.customer}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <Phone className="size-3 text-primary" />
                الهاتف:
              </span>
              <a
                href={order.phone ? `tel:${order.phone}` : undefined}
                className="font-mono font-semibold text-foreground hover:underline"
                dir="ltr"
              >
                {order.phone || "—"}
              </a>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                <MapPin className="size-3 text-primary" />
                العنوان:
              </span>
              <span className="font-medium text-foreground">
                {order.wilaya} — {order.commune}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-[11px]">نوع التوصيل:</span>
              <span className="font-medium text-foreground">{order.deliveryType}</span>
            </div>
          </div>

          {/* Product & Total */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div>
              <span className="text-muted-foreground block text-[11px]">المنتج / العرض:</span>
              <span className="font-semibold text-foreground block mt-0.5">{order.items}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">
                السعر ({formatDzd(order.priceNum)}) + الشحن ({order.shippingFee})
              </span>
              <span className="font-bold text-primary tabular-nums text-sm">{order.total}</span>
            </div>
          </div>

          {/* Tracking if pushed */}
          {trackingCode && (
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Truck className="size-3.5 text-purple-600 shrink-0" />
                <span className="font-mono font-bold text-purple-700 dark:text-purple-300 text-xs">
                  {trackingCode}
                </span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={handleCopyTracking}
                  className="h-5 w-5"
                  title="نسخ كود التتبع"
                >
                  {copiedTracking ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
                </Button>
              </div>
              <Button
                size="xs"
                variant="outline"
                className="h-6 text-[11px] gap-1"
                onClick={() =>
                  window.open(
                    `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(trackingCode)}`,
                    "_blank"
                  )
                }
              >
                <Printer className="size-3" />
                <span>PDF</span>
              </Button>
            </div>
          )}

          {/* Optional Conversion History */}
          {order.conversions && order.conversions.length > 0 && (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowMore((v) => !v)}
                className="w-full justify-between text-[11px] text-muted-foreground"
              >
                <span className="flex items-center gap-1">
                  <History className="size-3" />
                  سجل التحويلات ({order.conversions.length})
                </span>
                <span>{showMore ? "إخفاء" : "عرض"}</span>
              </Button>
              {showMore && (
                <div className="mt-1.5 space-y-1.5 rounded-lg border p-2 bg-muted/10 text-[11px]">
                  {order.conversions.map((c, i) => (
                    <div key={i} className="border-b last:border-b-0 pb-1 last:pb-0">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>تحويل #{c.conversion_sequence || i + 1}</span>
                        <span>{formatDate(c.timestamp_utc)}</span>
                      </div>
                      {c.reason && <div className="text-foreground mt-0.5">{c.reason}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t pt-3 flex flex-wrap items-center justify-between gap-1.5">
          <Button variant="outline" size="xs" onClick={() => onOpenChange(false)} className="text-xs">
            إغلاق
          </Button>

          <div className="flex flex-wrap items-center gap-1.5">
            {onUpdateStatus && order.status === "pending" && (
              <Button
                size="xs"
                variant="outline"
                className="gap-1 text-xs text-blue-700 border-blue-500/40 hover:bg-blue-500/10"
                onClick={() => onUpdateStatus(order.id, "confirmed")}
              >
                <CheckCircle2 className="size-3" />
                <span>Confirm</span>
              </Button>
            )}

            {onUpdateStatus && order.status !== "cancelled" && !isTerminal && (
              <Button
                size="xs"
                variant="outline"
                className="gap-1 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={() => onUpdateStatus(order.id, "cancelled")}
              >
                <XCircle className="size-3" />
                <span>Cancel</span>
              </Button>
            )}

            {!isTerminal && onOpenSwitchDialog && (
              <Button
                size="xs"
                variant="outline"
                className="gap-1 text-xs"
                onClick={() => {
                  onOpenChange(false);
                  onOpenSwitchDialog(order);
                }}
              >
                <RefreshCw className="size-3" />
                <span>Switch</span>
              </Button>
            )}

            {!order.in_redex && !isTerminal && onOpenPushDialog && (
              <Button
                size="xs"
                className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                onClick={() => {
                  onOpenChange(false);
                  onOpenPushDialog(order);
                }}
              >
                <Truck className="size-3" />
                <span>Push</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
