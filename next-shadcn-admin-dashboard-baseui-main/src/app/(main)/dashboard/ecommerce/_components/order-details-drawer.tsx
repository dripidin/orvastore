"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  History,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Truck,
  User,
  X,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatDzd } from "@/lib/orva-api";

import type { ConversionEvent, OrderRow } from "./recent-orders-table/schema";

interface OrderDetailsDrawerProps {
  order: OrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSwitchDialog?: (order: OrderRow) => void;
  onUpdateStatus?: (orderId: string, newStatus: string) => void;
  onDeleteOrder?: (orderId: string) => void;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "-";
  try {
    const d = typeof dateStr === "string" ? parseISO(dateStr) : new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return format(d, "dd MMMM yyyy — HH:mm:ss");
  } catch (e) {
    return String(dateStr);
  }
}

const FIELD_LABELS: Record<string, string> = {
  full_name: "الاسم الكامل (Nom Client)",
  phone: "رقم الهاتف (Téléphone)",
  wilaya: "الولاية (Wilaya)",
  commune: "البلدية (Commune)",
  delivery_type: "نوع التوصيل (Mode de livraison)",
  shipping_fee: "رسوم التوصيل (Frais de livraison)",
  grand_total: "إجمالي التحصيل (Total à encaisser COD)",
  address: "العنوان",
};

export function OrderDetailsDrawer({
  order,
  open,
  onOpenChange,
  onOpenSwitchDialog,
  onUpdateStatus,
  onDeleteOrder,
}: OrderDetailsDrawerProps) {
  const [copiedId, setCopiedId] = React.useState(false);
  const [updatingStatus, setUpdatingStatus] = React.useState(false);

  if (!order) return null;

  const handleCopyOrderId = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      setCopiedId(true);
      toast.add({ title: "تم نسخ رقم الطلب بنجاح", type: "success" });
      setTimeout(() => setCopiedId(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const isTerminal = ["delivered", "reconciled"].includes(
    (order.status || "").toLowerCase()
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto p-6" dir="rtl">
        <DialogHeader className="border-b pb-4 text-right">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Package className="size-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <span>تفاصيل الطلبية:</span>
                  <span className="font-mono text-primary text-lg">{order.id}</span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={handleCopyOrderId}
                    title="نسخ رقم الطلب"
                  >
                    {copiedId ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
                  </Button>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <Calendar className="size-3.5" />
                  <span>تاريخ الإنشاء: {formatDate(order.date)}</span>
                </DialogDescription>
              </div>
            </div>

            {/* Badges & Status Updater */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Operational Status */}
              <Badge
                variant="outline"
                className={`font-semibold px-2.5 py-1 ${
                  order.status === "delivered"
                    ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
                    : order.status === "shipped"
                    ? "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                    : order.status === "confirmed"
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    : order.status === "returned"
                    ? "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                    : order.status === "cancelled"
                    ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                }`}
              >
                <span className="size-1.5 rounded-full bg-current ml-1.5" />
                الحالة التشغيلية: {order.status}
              </Badge>

              {/* Conversion Switch Status */}
              {order.isSwitched ? (
                <Badge
                  variant="outline"
                  className="border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-semibold px-2.5 py-1"
                >
                  <RefreshCw className="size-3 ml-1" />
                  محوّل ({order.conversionCount} عملية تحويل)
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground px-2 py-0.5 text-xs">
                  أصلي (لم يحوّل)
                </Badge>
              )}

              {/* Status Updater */}
              {onUpdateStatus && (
                <div className="flex items-center gap-1 mr-1">
                  <Select
                    value={order.status}
                    disabled={updatingStatus}
                    onValueChange={async (newSt) => {
                      if (!newSt) return;
                      setUpdatingStatus(true);
                      try {
                        await onUpdateStatus(order.id, newSt);
                      } finally {
                        setUpdatingStatus(false);
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs font-semibold w-40 bg-background">
                      <SelectValue placeholder="تغيير الحالة..." />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="pending" className="text-xs">قيد الانتظار (Pending)</SelectItem>
                      <SelectItem value="confirmed" className="text-xs">مؤكدة (Confirmed)</SelectItem>
                      <SelectItem value="shipped" className="text-xs">مشحونة (Shipped)</SelectItem>
                      <SelectItem value="delivered" className="text-xs">مسلّمة (Delivered)</SelectItem>
                      <SelectItem value="returned" className="text-xs">مرتجعة / رفض (Returned)</SelectItem>
                      <SelectItem value="cancelled" className="text-xs">ملغاة (Cancelled)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Section 1: Current Active Order Data */}
          <div>
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <User className="size-4 text-primary" />
              <span>البيانات الحالية للطلب والعميل:</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-4 text-xs">
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">الاسم الكامل:</span>
                <span className="font-semibold text-foreground text-sm">{order.customer || "—"}</span>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">رقم الهاتف:</span>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={order.phone ? `tel:${order.phone}` : undefined}
                    className="font-mono font-semibold text-primary hover:underline text-sm"
                    dir="ltr"
                  >
                    {order.phone || "—"}
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 text-muted-foreground hover:text-foreground cursor-pointer"
                    title="نسخ رقم الهاتف"
                    onClick={() => {
                      if (order.phone) {
                        navigator.clipboard.writeText(order.phone);
                        toast.add({ title: "تم نسخ رقم الهاتف", type: "success" });
                      }
                    }}
                  >
                    <Copy className="size-3" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">الولاية والبلدية:</span>
                <span className="font-medium text-foreground">
                  {order.wilaya} {order.commune ? `— ${order.commune}` : ""}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">نوع التوصيل:</span>
                <span className="font-medium text-foreground">{order.deliveryType}</span>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">المنتج / العرض:</span>
                <span className="font-medium text-foreground">{order.items}</span>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">المبلغ الإجمالي والتوصيل:</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-primary tabular-nums text-sm">{order.total}</span>
                  <span className="text-muted-foreground text-[11px]">
                    (سعر المنتج: {formatDzd(order.priceNum)} + الشحن: {order.shippingFee})
                  </span>
                </div>
              </div>

              {order.in_redex && (
                <div className="space-y-1 col-span-full border-t pt-2 mt-1">
                  <span className="text-muted-foreground block text-[11px]">حالة الشحن / شركة التوصيل:</span>
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-medium">
                    <Truck className="size-3.5" />
                    <span>مرسل إلى شركة التوصيل</span>
                    {order.redex_tracking_code && (
                      <span className="font-mono text-xs bg-purple-500/10 px-2 py-0.5 rounded">
                        كود التتبع: {order.redex_tracking_code}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Section 2: Hierarchical Timeline of Conversions (Tree View) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <History className="size-4 text-cyan-600" />
                <span>سجل التحويلات وإعادة التوجيه (تحويل الطلبية):</span>
              </h3>
              <span className="text-xs text-muted-foreground font-mono">
                {order.conversions.length} تحويلات مسجلة
              </span>
            </div>

            {order.conversions.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground bg-muted/10">
                <CheckCircle2 className="size-8 mx-auto mb-2 text-muted-foreground/60" />
                <p className="font-medium">البيانات أصلية — لا توجد أي عمليات تحويل سابقة على هذا الطلب.</p>
                <p className="text-[11px] opacity-75 mt-0.5">
                  عند إجراء أي عملية تحويل (تحويل الطلبية)، سيتم توثيق الفروق الزمنية والمشرف والوجهة الجديدة هنا بشكل هرمي متسلسل.
                </p>
              </div>
            ) : (
              <div className="relative border-r-2 border-primary/30 pr-4 space-y-4 mr-2">
                {order.conversions.map((conv, idx) => {
                  const seq = conv.conversion_sequence || idx + 1;
                  return (
                    <div key={conv.conversion_id || idx} className="relative group">
                      {/* Timeline Dot */}
                      <div className="absolute -right-[23px] top-1 size-3.5 rounded-full border-2 border-background bg-primary ring-2 ring-primary/20" />

                      <div className="rounded-xl border bg-card p-4 shadow-xs text-xs space-y-3">
                        {/* Event Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-primary/10 text-primary font-bold">
                              تحويل رقم #{seq}
                            </Badge>
                            <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                              <Clock className="size-3" />
                              {formatDate(conv.timestamp_utc)}
                            </span>
                          </div>

                          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <ShieldCheck className="size-3 text-primary" />
                            <span>المسؤول:</span>
                            <span className="font-medium text-foreground">{conv.operator || "Admin"}</span>
                          </div>
                        </div>

                        {/* Audit Reason */}
                        <div className="bg-muted/40 p-2.5 rounded-lg">
                          <span className="text-muted-foreground block text-[11px] mb-0.5">سبب التحويل:</span>
                          <p className="font-medium text-foreground text-xs">{conv.reason || "تعديل بيانات الطلب"}</p>
                        </div>

                        {/* Shipped Override notice if applied */}
                        {conv.override_applied && (
                          <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px]">
                            <AlertTriangle className="size-3.5 shrink-0" />
                            <span>تم تطبيق تجاوز الشحن (Operator Override): تم تأكيد التحديث اليدوي مع الموزع.</span>
                          </div>
                        )}

                        {/* Diffs: Only Changed Fields */}
                        {conv.diff && Object.keys(conv.diff).length > 0 && (
                          <div>
                            <span className="text-muted-foreground block text-[11px] mb-1.5 font-semibold">
                              الحقول التي تغيّرت في هذه العملية (Field Diffs):
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {Object.entries(conv.diff).map(([fieldName, diffObj]) => {
                                const label = FIELD_LABELS[fieldName] || fieldName;
                                return (
                                  <div key={fieldName} className="border rounded-md p-2 bg-background space-y-1">
                                    <span className="text-[10px] text-muted-foreground font-medium block">
                                      {label}
                                    </span>
                                    <div className="flex items-center justify-between gap-2 text-[11px]">
                                      <span className="line-through text-red-600/80 dark:text-red-400/80 bg-red-500/10 px-1.5 py-0.5 rounded">
                                        {String(diffObj.from || "فارغ")}
                                      </span>
                                      <span className="text-muted-foreground">←</span>
                                      <span className="font-semibold text-green-700 dark:text-green-300 bg-green-500/10 px-1.5 py-0.5 rounded">
                                        {String(diffObj.to || "فارغ")}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t pt-4 mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              إغلاق
            </Button>
            {onDeleteOrder && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 text-xs font-semibold"
                onClick={() => {
                  if (window.confirm(`هل أنت متأكد من حذف الطلبية #${order.id} نهائياً؟ سيتم مسحها من قاعدة البيانات.`)) {
                    onOpenChange(false);
                    onDeleteOrder(order.id);
                  }
                }}
              >
                <Trash2 className="size-3.5" />
                <span>حذف الطلبية</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isTerminal && onOpenSwitchDialog && (
              <Button
                size="sm"
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
                onClick={() => {
                  onOpenChange(false);
                  onOpenSwitchDialog(order);
                }}
              >
                <RefreshCw className="size-4" />
                <span>تحويل الطلبية (Réacheminement)</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
