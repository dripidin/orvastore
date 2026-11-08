"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  Truck,
  RotateCcw,
  XCircle,
  AlertCircle,
  RefreshCw,
  Copy,
  ExternalLink,
  ShieldCheck,
  Building2,
  Package,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { OrvaOrder } from "@/lib/repository/types";
import type { CourierTrackingResult, DeliveryTimelineEvent } from "@/lib/delivery/delivery-tracking-types";
import {
  buildOrderTimeline,
  resolveOrderTrackingCode,
} from "@/lib/delivery/delivery-metrics-calculator";
import {
  mapExternalCourierStatus,
  getReceiptClassificationBadge,
} from "@/lib/delivery/courier-status-mapper";
import { maskDemoPhone } from "@/lib/phone-utils";

interface DeliveryTimelineDrawerProps {
  order: OrvaOrder | null;
  tracking: CourierTrackingResult | null;
  isOpen: boolean;
  onClose: () => void;
  onRefreshTracking: (orderId: string) => Promise<void>;
  isSyncing: boolean;
}

export function DeliveryTimelineDrawer({
  order,
  tracking,
  isOpen,
  onClose,
  onRefreshTracking,
  isSyncing,
}: DeliveryTimelineDrawerProps) {
  const [copiedCode, setCopiedCode] = React.useState(false);

  if (!order) return null;

  const trackingCode = resolveOrderTrackingCode(order) || tracking?.trackingCode || "—";
  const courierStatusInfo = mapExternalCourierStatus(tracking?.externalStatusCode);
  const receiptBadge = getReceiptClassificationBadge(tracking?.receiptClassification || "Unknown");
  const timelineEvents: DeliveryTimelineEvent[] = buildOrderTimeline(order, tracking);

  const handleCopyTracking = () => {
    if (!trackingCode || trackingCode === "—") return;
    navigator.clipboard.writeText(trackingCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto" dir="ltr">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="font-mono text-xs">
              {order.id}
            </Badge>
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${receiptBadge.badgeClass}`}>
                {receiptBadge.labelAr}
              </span>
            </div>
          </div>
          <SheetTitle className="text-base font-bold flex items-center gap-2 mt-1">
            <Truck className="size-5 text-primary" />
            المخطط الزمني لمتابعة الشحنة والتسليم
          </SheetTitle>
          <SheetDescription className="text-xs">
            سجل حركة الطرد بين مراكز التوزيع وتأكيد الاستلام لدى الزبون
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {/* Order & Customer Summary Card */}
          <div className="p-3 bg-muted/40 rounded-xl border space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">الزبون:</span>
              <strong className="font-medium text-foreground">{order.customer || "—"}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">رقم الهاتف (Demo):</span>
              <span className="font-mono text-muted-foreground">{maskDemoPhone(order.phone)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">الولاية والبلدية:</span>
              <span className="font-medium">{order.wilaya || "—"} • {order.commune || "—"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">المنتج والمبلغ:</span>
              <span>{order.productName || "—"} ({order.grandTotalDzd ? `${order.grandTotalDzd.toLocaleString()} دج` : "—"})</span>
            </div>

            <Separator className="my-2" />

            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">الناقل الخارجي:</span>
              <span className="font-semibold text-primary">
                {tracking?.courierName || "Redex Delivery DZ"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">رمز التتبع:</span>
              <div className="flex items-center gap-1">
                <span className="font-mono font-bold bg-background px-2 py-0.5 rounded border">
                  {trackingCode}
                </span>
                {trackingCode !== "—" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleCopyTracking}
                    title="نسخ رمز التتبع"
                  >
                    <Copy className="size-3" />
                  </Button>
                )}
              </div>
            </div>
            {copiedCode && (
              <p className="text-[10px] text-emerald-600 font-semibold text-left">
                ✓ تم نسخ رمز التتبع إلى الحافظة
              </p>
            )}

            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">آخر مزامنة:</span>
              <span className="text-[11px] text-muted-foreground font-mono">
                {tracking?.lastSyncedAt
                  ? new Date(tracking.lastSyncedAt).toLocaleString("ar-DZ")
                  : "لم تتم المزامنة بعد"}
              </span>
            </div>

            {/* Sync Action */}
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                المصدر: Mock Courier Synchronization (No external API calls)
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onRefreshTracking(order.id)}
                disabled={isSyncing}
                className="h-7 text-xs gap-1.5"
              >
                <RefreshCw className={`size-3 ${isSyncing ? "animate-spin" : ""}`} />
                تحديث الحالة (Mock)
              </Button>
            </div>
          </div>

          {/* Delivery Timeline Component */}
          <div>
            <h4 className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              المراحل التشغيلية لتوصيل الشحنة (Delivery Milestones)
            </h4>

            <div className="relative border-r-2 border-border/80 mr-3 pr-4 space-y-5">
              {timelineEvents.map((evt, idx) => {
                const isCompleted = evt.status === "completed";
                const isInProgress = evt.status === "in_progress";
                const isFailed = evt.status === "failed";

                return (
                  <div key={evt.id || idx} className="relative group">
                    {/* Circle Node on Timeline Bar */}
                    <div
                      className={`absolute -right-[23px] top-0.5 size-4 rounded-full border-2 bg-background flex items-center justify-center ${
                        isCompleted
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : isInProgress
                          ? "border-blue-500 bg-blue-500 text-white animate-pulse"
                          : isFailed
                          ? "border-rose-500 bg-rose-500 text-white"
                          : "border-muted-foreground/30 bg-background"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="size-3" />
                      ) : isFailed ? (
                        <XCircle className="size-3" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-current" />
                      )}
                    </div>

                    {/* Event Content */}
                    <div className="bg-card p-2.5 rounded-lg border text-xs shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-foreground">
                          {evt.titleAr}
                        </span>

                        {/* Event Category Badge */}
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-medium border ${
                            evt.category === "orva_internal"
                              ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                              : evt.category === "courier_external"
                              ? "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {evt.category === "orva_internal"
                            ? "داخلي ORVA"
                            : evt.category === "courier_external"
                            ? "مزود التوصيل"
                            : "محاكاة Mock"}
                        </span>
                      </div>

                      {evt.descriptionAr && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {evt.descriptionAr}
                        </p>
                      )}

                      {/* Authentic Timestamp (Strictly NO invented dates) */}
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2 pt-1 border-t border-border/40">
                        <span>الوقت المسجل:</span>
                        <span className="font-mono">
                          {evt.timestamp
                            ? new Date(evt.timestamp).toLocaleString("ar-DZ")
                            : "غير محدد في السجل (—)"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
