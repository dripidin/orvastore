"use client";

import * as React from "react";
import {
  User,
  Phone,
  MapPin,
  Package,
  Calendar,
  Layers,
  ShoppingBag,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { OrvaOrder } from "@/lib/repository/types";
import type { CourierTrackingResult } from "@/lib/delivery/delivery-tracking-types";
import { resolveOrderTrackingCode } from "@/lib/delivery/delivery-metrics-calculator";
import {
  mapExternalCourierStatus,
  getReceiptClassificationBadge,
} from "@/lib/delivery/courier-status-mapper";
import { maskDemoPhone } from "@/lib/phone-utils";

interface CustomerDetailsDialogProps {
  customerOrders: OrvaOrder[];
  trackingMap: Map<string, CourierTrackingResult>;
  isOpen: boolean;
  onClose: () => void;
  onSelectOrderForTimeline?: (order: OrvaOrder) => void;
}

export function CustomerDetailsDialog({
  customerOrders,
  trackingMap,
  isOpen,
  onClose,
  onSelectOrderForTimeline,
}: CustomerDetailsDialogProps) {
  if (!customerOrders || customerOrders.length === 0) return null;

  const firstOrder = customerOrders[0];
  const customerName = firstOrder.customer || "عميل غير معروف";
  const customerPhone = firstOrder.phone || "";
  const wilaya = firstOrder.wilaya || "—";
  const commune = firstOrder.commune || "—";
  const totalOrders = customerOrders.length;
  const deliveredOrders = customerOrders.filter((o) => o.status === "delivered").length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto" dir="ltr">
        <DialogHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <User className="size-5 text-primary" />
              سجل العميل والطلبات المرتبطة
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              {totalOrders > 1 ? `عميل متكرر (${totalOrders} طلبات)` : "طلب فردي (1)"}
            </Badge>
          </div>
          <DialogDescription className="text-xs">
            عرض مستقل لكافة طلبات العميل دون خلط لحالات التوصيل أو بيانات الشحن
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-4">
          {/* Customer Profile Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/30 rounded-xl border text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <User className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">الاسم الكامل:</span>
                <strong className="text-foreground">{customerName}</strong>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">رقم الهاتف:</span>
                <a href={customerPhone ? `tel:${customerPhone}` : undefined} className="font-mono text-primary font-semibold hover:underline">
                  {customerPhone || "—"}
                </a>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <MapPin className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">العنوان:</span>
                <span>{wilaya} • {commune}</span>
              </div>
              <div className="flex items-center gap-2">
                <ShoppingBag className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">إحصائية الطلبات:</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {deliveredOrders} مسلّمة من أصل {totalOrders} إجمالي
                </span>
              </div>
            </div>
          </div>

          {/* Safety Notice */}
          <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-800 dark:text-amber-300">
            <ShieldAlert className="size-4 shrink-0 text-amber-600" />
            <span>
              قاعدة العزل: كل طلب يعامل بصورة مستقلة بـ Order ID ورمز تتبع خاص، دون إسناد حالة توصيل طلب إلى آخر.
            </span>
          </div>

          {/* Independent Orders List */}
          <div>
            <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
              <Package className="size-3.5 text-muted-foreground" />
              الطلبات المسجلة لهذا العميل ({customerOrders.length})
            </h4>

            <div className="space-y-2.5">
              {customerOrders.map((ord) => {
                const tracking = trackingMap.get(ord.id);
                const trackingCode = resolveOrderTrackingCode(ord) || "—";
                const receiptBadge = getReceiptClassificationBadge(tracking?.receiptClassification || "Unknown");

                return (
                  <div
                    key={ord.id}
                    className="p-3 bg-card rounded-xl border shadow-2xs text-xs space-y-2 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">{ord.id}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {ord.deliveryType || "توصيل للمنزل"}
                        </Badge>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${receiptBadge.badgeClass}`}>
                        {receiptBadge.labelAr}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t text-[11px]">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">المنتج:</span>
                        <strong className="text-foreground">{ord.productName || "—"}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">المبلغ المحصل (COD):</span>
                        <strong className="text-foreground">
                          {ord.grandTotalDzd ? `${ord.grandTotalDzd.toLocaleString()} دج` : "—"}
                        </strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">الحالة الداخلية (ORVA):</span>
                        <span className="font-semibold">{ord.status}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">رمز التتبع:</span>
                        <span className="font-mono font-bold">{trackingCode}</span>
                      </div>
                    </div>

                    {onSelectOrderForTimeline && (
                      <div className="flex justify-end pt-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            onClose();
                            onSelectOrderForTimeline(ord);
                          }}
                          className="text-[11px] h-6 text-primary hover:underline gap-1 cursor-pointer"
                        >
                          <ExternalLink className="size-3" />
                          عرض المخطط الزمني الكامل
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
