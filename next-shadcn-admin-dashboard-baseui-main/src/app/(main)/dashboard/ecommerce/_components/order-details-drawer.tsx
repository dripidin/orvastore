"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import {
  AlertTriangle,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  FileDown,
  History,
  MapPin,
  Package,
  Phone,
  Printer,
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
import { OrderTrackingPipeline } from "./order-tracking-pipeline";

import type { ConversionEvent, OrderRow } from "./recent-orders-table/schema";

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
    return format(d, "dd MMMM yyyy — HH:mm:ss");
  } catch {
    return String(dateStr);
  }
}

const FIELD_LABELS: Record<string, string> = {
  full_name: "الاسم الكامل (Nom Client)",
  phone: "رقم الهاتف (Téléphone)",
  wilaya: "الولاية (Wilaya)",
  commune: "البلدية (Commune)",
  delivery_type: "نوع التوصيل (Mode de livraison)",
  address: "العنوان الدقيق (Adresse)",
  price_num: "سعر المنتج (Prix Produit)",
  total: "المبلغ الإجمالي (Total COD)",
};

export function OrderDetailsDrawer({
  order,
  open,
  onOpenChange,
  onOpenSwitchDialog,
  onOpenPushDialog,
  onUpdateStatus,
  onDeleteOrder,
}: OrderDetailsDrawerProps) {
  const [copiedId, setCopiedId] = React.useState(false);
  const [copiedTracking, setCopiedTracking] = React.useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState(false);

  // Real-time Redex Tracking State
  const [trackingLoading, setTrackingLoading] = React.useState(false);
  const [trackingData, setTrackingData] = React.useState<any>(null);

  const trackingCode = order?.redex_tracking_code || null;

  const fetchTracking = React.useCallback(async (code: string) => {
    if (!code) return;
    setTrackingLoading(true);
    try {
      const res = await fetch(`/api/delivery?action=track&tracking=${encodeURIComponent(code)}`);
      const json = await res.json();
      if (json.success) {
        setTrackingData(json);
      }
    } catch (err) {
      console.warn("Failed to fetch tracking info:", err);
    } finally {
      setTrackingLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open && trackingCode) {
      fetchTracking(trackingCode);
    } else {
      setTrackingData(null);
    }
  }, [open, trackingCode, fetchTracking]);

  if (!order) return null;

  const isTerminal = order.status === "cancelled" || order.status === "deleted";

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(order.id);
      setCopiedId(true);
      toast.add({
        title: "تم نسخ المعرّف",
        description: `معرّف الطلبية #${order.id} منسوخ في الحافظة.`,
        type: "success",
      });
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      toast.add({
        title: "تعذر النسخ",
        description: "يرجى منح الإذن للمتصفح للوصول للحافظة.",
        type: "error",
      });
    }
  };

  const handleCopyTracking = async () => {
    if (!trackingCode) return;
    try {
      await navigator.clipboard.writeText(trackingCode);
      setCopiedTracking(true);
      toast.add({
        title: "تم نسخ كود التتبع",
        description: `كود التتبع ${trackingCode} منسوخ في الحافظة.`,
        type: "success",
      });
      setTimeout(() => setCopiedTracking(false), 2000);
    } catch {
      toast.add({
        title: "تعذر النسخ",
        description: "يرجى منح الإذن للمتصفح للوصول للحافظة.",
        type: "error",
      });
    }
  };

  const handleStatusSelect = async (newStatus: string) => {
    if (!onUpdateStatus || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      await onUpdateStatus(order.id, newStatus);
      toast.add({
        title: "تم تحديث الحالة",
        description: `تم تغيير حالة الطلبية إلى "${newStatus}".`,
        type: "success",
      });
    } catch {
      toast.add({
        title: "خطأ في التحديث",
        description: "تعذر تحديث حالة الطلبية، يرجى المحاولة لاحقاً.",
        type: "error",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order || isUpdatingStatus) return;
    if (!window.confirm(`هل أنت متأكد من رغبتك في إلغاء الطلبية #${order.id}؟`)) return;
    setIsUpdatingStatus(true);
    try {
      if (onUpdateStatus) {
        await onUpdateStatus(order.id, "cancelled");
      }
      if (order.redex_tracking_code) {
        try {
          await fetch(`/api/delivery?action=delete&tracking=${encodeURIComponent(order.redex_tracking_code)}`, {
            method: "POST",
          });
        } catch {
          // ignore external cancel error
        }
      }
      toast.add({
        title: "تم إلغاء الطلبية",
        description: `تم تحديث حالة الطلبية #${order.id} إلى ملغاة بنجاح.`,
        type: "success",
      });
      onOpenChange(false);
    } catch {
      toast.add({
        title: "فشل الإلغاء",
        description: "تعذر تحديث حالة الطلبية.",
        type: "error",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto text-right" dir="ltr">
        <DialogHeader className="text-right border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Package className="size-5 text-primary" />
              <DialogTitle className="text-lg font-bold">
                تفاصيل الطلبية: <span className="font-mono text-primary">{order.id}</span>
              </DialogTitle>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={handleCopyId}
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                title="نسخ معرّف الطلبية"
              >
                {copiedId ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {/* Operational Status Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">الحالة التشغيلية:</span>
                <Select
                  value={order.status.toLowerCase()}
                  onValueChange={(val) => {
                    if (val) void handleStatusSelect(val);
                  }}
                  disabled={isUpdatingStatus || !onUpdateStatus}
                >
                  <SelectTrigger className="h-7 text-xs font-semibold bg-background w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending" className="text-xs">معلقة (Pending)</SelectItem>
                    <SelectItem value="confirmed" className="text-xs">مؤكدة (Confirmed)</SelectItem>
                    <SelectItem value="shipped" className="text-xs">مشحونة (Shipped)</SelectItem>
                    <SelectItem value="delivered" className="text-xs">مسلّمة (Delivered)</SelectItem>
                    <SelectItem value="returned" className="text-xs">مرتجعة (Returned)</SelectItem>
                    <SelectItem value="cancelled" className="text-xs">ملغاة (Cancelled)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {order.isSwitched ? (
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold text-xs gap-1">
                  <AlertTriangle className="size-3" />
                  <span>محوّلة (Rerouted)</span>
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium text-xs">
                  أصلي (لم يحوّل)
                </Badge>
              )}
            </div>
          </div>

          <DialogDescription className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
            <Calendar className="size-3.5" />
            <span>تاريخ الإنشاء: {formatDate(order.date)}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Section 1: Customer & Order Overview */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <User className="size-4 text-primary" />
              <span>البيانات الحالية للطلب والعميل:</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">الاسم الكامل:</span>
                <span className="font-semibold text-foreground">{order.customer}</span>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">رقم الهاتف:</span>
                <span className="font-mono text-foreground font-medium" dir="ltr">
                  {order.phone || "—"}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-muted-foreground block text-[11px]">الولاية والبلدية:</span>
                <div className="flex items-center gap-1 text-foreground">
                  <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                  <span>{order.wilaya} — {order.commune}</span>
                </div>
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
            </div>
          </div>

          {/* Section 2: Redex EcoTrack Live Courier Logistics Card */}
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-500/20 pb-2.5">
              <div className="flex items-center gap-2">
                <Truck className="size-4 text-purple-700 dark:text-purple-300" />
                <span className="text-sm font-bold text-purple-900 dark:text-purple-100">
                  شركة التوصيل: Redex Express (EcoTrack Platform)
                </span>
              </div>

              {trackingCode ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => fetchTracking(trackingCode)}
                    disabled={trackingLoading}
                    className="h-7 text-xs gap-1 bg-background border-purple-300 dark:border-purple-800"
                    title="تحديث التتبع من Redex الآن"
                  >
                    <RefreshCw className={`size-3 text-purple-600 ${trackingLoading ? "animate-spin" : ""}`} />
                    <span>تحديث التتبع</span>
                  </Button>

                  <Button
                    size="xs"
                    className="h-7 text-xs gap-1.5 bg-purple-700 hover:bg-purple-800 text-white font-medium"
                    onClick={() => {
                      window.open(`/api/delivery?action=label_pdf&tracking=${encodeURIComponent(trackingCode)}`, "_blank");
                    }}
                    title="طباعة وتحميل بوليصة الشحن الرسمية PDF"
                  >
                    <Printer className="size-3.5" />
                    <span>طباعة البوليصة (PDF)</span>
                  </Button>
                </div>
              ) : (
                !isTerminal && onOpenPushDialog && (
                  <Button
                    size="xs"
                    className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenPushDialog(order);
                    }}
                  >
                    <Truck className="size-3.5" />
                    <span>إرسال لـ Redex الآن</span>
                  </Button>
                )
              )}
            </div>

            {trackingCode ? (
              <div className="space-y-3 text-xs">
                {/* Visual Interactive EcoTrack Pipeline Stepper */}
                <OrderTrackingPipeline
                  status={trackingData?.status || "prete_a_expedier"}
                  statusAr={trackingData?.statusAr || "جاهز للإرسال"}
                  currentStation={trackingData?.currentStation}
                  activity={trackingData?.activity}
                />

                <div className="flex flex-wrap items-center justify-between gap-2 bg-background/80 rounded-lg p-2.5 border">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[11px]">رقم التتبع:</span>
                    <span className="font-mono font-bold text-purple-700 dark:text-purple-300 text-xs">
                      {trackingCode}
                    </span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={handleCopyTracking}
                      className="h-5 w-5 text-muted-foreground hover:text-foreground"
                      title="نسخ كود التتبع"
                    >
                      {copiedTracking ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-[11px]">الحالة اللوجستية:</span>
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold border-purple-500/30">
                      {trackingData?.statusAr || "قيد المعالجة لدى الناقل"}
                    </Badge>
                  </div>

                  {trackingData?.currentStation && (
                    <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                      <span>المحطة الحالية:</span>
                      <span className="font-semibold text-foreground">{trackingData.currentStation}</span>
                    </div>
                  )}
                </div>

                {/* Tracking Activity Events Timeline */}
                <div className="space-y-2 pt-1">
                  <span className="text-[11px] font-bold text-muted-foreground block">
                    مسار الرحلة والأحداث المسجلة لدى Redex:
                  </span>

                  {trackingLoading ? (
                    <div className="py-4 text-center text-muted-foreground flex items-center justify-center gap-2">
                      <RefreshCw className="size-3.5 animate-spin text-purple-600" />
                      <span>جارٍ جلب مسار الشحنة من خادم Redex...</span>
                    </div>
                  ) : trackingData?.activity && trackingData.activity.length > 0 ? (
                    <div className="relative border-r border-purple-500/30 pr-3 space-y-2 mr-1">
                      {trackingData.activity.map((act: any, i: number) => (
                        <div key={i} className="relative text-[11px]">
                          <div className="absolute -right-[16px] top-1.5 size-2 rounded-full bg-purple-600 ring-2 ring-purple-200 dark:ring-purple-900" />
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="font-semibold text-foreground">{act.statusAr || act.status}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {act.date} {act.time}
                            </span>
                          </div>
                          {(act.station || act.details || act.scanLocation) && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {act.station && `المحطة: ${act.station} `}
                              {act.scanLocation && `(${act.scanLocation}) `}
                              {act.details && `— ${act.details}`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground bg-background/50">
                      تم تسجيل الطلب لدى Redex. ستظهر تحديثات مراكز الفرز والتوزيع هنا فور مسح الطرد من طرف الموزع.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                لم يتم إرسال هذه الطلبية إلى شركة التوصيل بعد. يمكنك إرسالها واعتمادها مباشرة بنقرة واحدة عبر الزر أعلاه.
              </div>
            )}
          </div>

          <Separator />

          {/* Section 3: Hierarchical Timeline of Conversions (Tree View) */}
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

                          <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                            <User className="size-3 text-primary" />
                            <span>المشرف: <strong className="text-foreground">{conv.operator || "Admin"}</strong></span>
                          </div>
                        </div>

                        {/* Reason / Note */}
                        {conv.reason && (
                          <div className="text-muted-foreground bg-muted/30 p-2 rounded-md">
                            <span className="font-medium text-foreground">سبب التحويل: </span>
                            {conv.reason}
                          </div>
                        )}

                        {/* Hierarchical Diff Tree */}
                        {conv.diff && Object.keys(conv.diff).length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-muted-foreground font-medium block text-[11px]">التعديلات المطبقة:</span>
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
                                      <span className="text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">
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

          <div className="flex flex-wrap items-center gap-2">
            {!order.in_redex && !isTerminal && onOpenPushDialog && (
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                onClick={() => {
                  onOpenChange(false);
                  onOpenPushDialog(order);
                }}
              >
                <Truck className="size-3.5" />
                <span>إرسال لـ Redex (Push)</span>
              </Button>
            )}

            {!isTerminal && onOpenSwitchDialog && (
              <Button
                size="sm"
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-xs"
                onClick={() => {
                  onOpenChange(false);
                  onOpenSwitchDialog(order);
                }}
              >
                <RefreshCw className="size-3.5" />
                <span>تحويل الطلبية (Switch)</span>
              </Button>
            )}

            {!isTerminal && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs font-semibold text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                onClick={handleCancelOrder}
                disabled={isUpdatingStatus}
              >
                <Ban className="size-3.5" />
                <span>إلغاء الطلبية (Annuler)</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
