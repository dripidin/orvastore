"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  MapPin,
  Phone,
  RefreshCw,
  ShieldAlert,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  ALGERIA_58_WILAYAS,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  isValidAlgerianPhone,
  normalizeAlgerianPhone,
} from "@/lib/types/checkout";
import {
  isTerminalStatus,
  type OrderReRoutingPayload,
  type OrderReRoutingResult,
} from "@/lib/types/re-routing";
import { rerouteOrderAction } from "@/app/actions/reroute";
import { ALGERIA_COMMUNES_BY_WILAYA_ID } from "@/data/algeria-locations";
import type { OrderRow } from "@/app/(main)/dashboard/ecommerce/_components/recent-orders-table/schema";

export interface OrderRerouteDialogProps {
  order: OrderRow | null;
  allOrders?: OrderRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: OrderReRoutingResult) => void;
}

export function OrderRerouteDialog({
  order,
  allOrders,
  open,
  onOpenChange,
  onSuccess,
}: OrderRerouteDialogProps) {
  if (!order) return null;

  return (
    <OrderRerouteDialogInner
      order={order}
      allOrders={allOrders}
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />
  );
}

function OrderRerouteDialogInner({
  order: initialOrder,
  allOrders = [],
  open,
  onOpenChange,
  onSuccess,
}: {
  order: OrderRow;
  allOrders?: OrderRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: OrderReRoutingResult) => void;
}) {
  // Selected source order (defaults to clicked order, admin can switch to any other order)
  const [selectedOrderId, setSelectedOrderId] = React.useState<string>(initialOrder.id);

  React.useEffect(() => {
    setSelectedOrderId(initialOrder.id);
  }, [initialOrder.id, open]);

  const order = React.useMemo(() => {
    return allOrders.find((o) => o.id === selectedOrderId) || initialOrder;
  }, [allOrders, selectedOrderId, initialOrder]);

  // Selectable orders (non-delivered)
  const selectableOrders = React.useMemo(() => {
    const list = allOrders.length > 0 ? allOrders : [initialOrder];
    return list.filter((o) => !isTerminalStatus(o.status));
  }, [allOrders, initialOrder]);

  // Form state
  const [newCustomerName, setNewCustomerName] = React.useState("");
  const [newCustomerPhone, setNewCustomerPhone] = React.useState("");
  const [selectedWilayaCode, setSelectedWilayaCode] = React.useState<number>(16);
  const [newCommuneName, setNewCommuneName] = React.useState<string>("");
  const [newDeliveryType, setNewDeliveryType] = React.useState<"DOMICILE" | "STOP_DESK">("DOMICILE");
  const [newDeliveryAddress, setNewDeliveryAddress] = React.useState<string>("");
  const [reason, setReason] = React.useState<string>(
    "الزبون الأصلي ألغى/رفض الاستلام؛ تم إعادة توجيه الطرد لزبون جديد"
  );
  const [shippedOverrideConfirmed, setShippedOverrideConfirmed] = React.useState<boolean>(false);

  // UI state
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [phoneError, setPhoneError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const isDelivered = isTerminalStatus(order.status);
  const isShipped =
    order.status?.toLowerCase() === "shipped" || Boolean(order.in_redex);

  const selectedWilaya = React.useMemo(() => {
    return ALGERIA_58_WILAYAS.find((w) => w.code === selectedWilayaCode) || ALGERIA_58_WILAYAS[15];
  }, [selectedWilayaCode]);

  const availableCommunes = React.useMemo(() => {
    return ALGERIA_COMMUNES_BY_WILAYA_ID[String(selectedWilayaCode)] || [];
  }, [selectedWilayaCode]);

  const stopDeskAllowed = React.useMemo(() => {
    return isStopDeskAllowed(selectedWilayaCode);
  }, [selectedWilayaCode]);

  React.useEffect(() => {
    if (!stopDeskAllowed && newDeliveryType === "STOP_DESK") {
      setNewDeliveryType("DOMICILE");
    }
  }, [stopDeskAllowed, newDeliveryType]);

  React.useEffect(() => {
    if (availableCommunes.length > 0 && !availableCommunes.includes(newCommuneName)) {
      setNewCommuneName(availableCommunes[0]);
    }
  }, [availableCommunes, newCommuneName]);

  const productPrice = React.useMemo(() => {
    if (order.priceNum && order.priceNum > 0) return order.priceNum;
    return 4950;
  }, [order.priceNum]);

  const newShippingFee = React.useMemo(() => {
    try {
      return calculateDeliveryTariff(selectedWilayaCode, newDeliveryType);
    } catch {
      return 500;
    }
  }, [selectedWilayaCode, newDeliveryType]);

  const updatedTotal = productPrice + newShippingFee;

  const handlePhoneChange = (val: string) => {
    setNewCustomerPhone(val);
    if (!val.trim()) {
      setPhoneError("رقم الهاتف مطلوب");
      return;
    }
    if (!isValidAlgerianPhone(val)) {
      setPhoneError("رقم هاتف غير صالح (05/06/07 — 10 أرقام)");
    } else {
      setPhoneError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (isDelivered) {
      setFormError("لا يمكن تحويل الطلبيات المسلمة نهائياً (Delivered).");
      return;
    }
    if (!newCustomerName.trim() || newCustomerName.trim().length < 2) {
      setFormError("يرجى إدخال اسم العميل الجديد");
      return;
    }
    if (!isValidAlgerianPhone(newCustomerPhone)) {
      setFormError("رقم هاتف العميل الجديد غير صالح");
      return;
    }
    if (!selectedWilayaCode || selectedWilayaCode < 1 || selectedWilayaCode > 58) {
      setFormError("يرجى اختيار ولاية صالحة");
      return;
    }
    if (!newCommuneName.trim()) {
      setFormError("يرجى اختيار البلدية");
      return;
    }
    if (newDeliveryType === "STOP_DESK" && !stopDeskAllowed) {
      setFormError(`الاستلام من المكتب غير متوفر في ولاية ${selectedWilaya.nameAr}`);
      return;
    }
    if (newDeliveryType === "DOMICILE" && (!newDeliveryAddress || newDeliveryAddress.trim().length < 3)) {
      setFormError("يرجى كتابة عنوان التوصيل");
      return;
    }
    if (isShipped && !shippedOverrideConfirmed) {
      setFormError("يرجى تأكيد تحويل الطرد المشحون");
      return;
    }
    if (!reason.trim() || reason.trim().length < 3) {
      setFormError("يرجى توضيح سبب التحويل");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: OrderReRoutingPayload = {
        orderId: order.id,
        sourceOrderId: order.id,
        newCustomerName: newCustomerName.trim(),
        newCustomerPhone: normalizeAlgerianPhone(newCustomerPhone),
        newWilayaCode: selectedWilayaCode,
        newWilayaName: `${selectedWilaya.nameAr} (${selectedWilaya.nameFr})`,
        newCommuneName: newCommuneName.trim(),
        newDeliveryType,
        newDeliveryAddress:
          newDeliveryAddress.trim() ||
          (newDeliveryType === "STOP_DESK" ? "Bureau Stop-Desk" : undefined),
        reason: reason.trim(),
        operator: "Admin",
        shippedOverrideConfirmed,
      };

      const result = await rerouteOrderAction(payload);

      if (result.success) {
        toast.add({
          title: "تم تحويل الطلبية بنجاح! 🎉",
          description: `تم إنشاء الطلبية المحولة برقم: ${result.orderId}`,
          type: "success",
        });

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("orva:orders-updated"));
        }

        onSuccess?.(result);
        onOpenChange(false);
      } else {
        setFormError(result.error || "تعذر إكمال عملية التحويل.");
      }
    } catch (err: any) {
      setFormError(err?.message || "حدث خطأ غير متوقع أثناء معالجة الطلب.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[92vw] sm:max-w-[480px] sm:min-w-[400px] max-h-[90vh] overflow-y-auto gap-3 rounded-xl border-zinc-200 p-0 text-right shadow-xl dark:border-zinc-800"
        dir="rtl"
      >
        <DialogHeader className="space-y-1 border-b border-zinc-200 bg-zinc-50/80 px-5 py-4 text-right backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><RefreshCw className="size-4" /></span>
              <span>تحويل الطلبية (Switch Order)</span>
            </DialogTitle>
            <Badge variant="outline" className="rounded-md bg-background font-mono text-[11px] tracking-tight">
              {order.id}
            </Badge>
          </div>
          <DialogDescription className="text-[11px] text-muted-foreground">
            اختر الطلبية وأدخل بيانات المستلم الجديد
          </DialogDescription>
        </DialogHeader>

        {isDelivered && (
          <div className="mx-5 my-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
            <ShieldAlert className="size-4 shrink-0 mt-0.5 text-red-600" />
            <span>لا يمكن تحويل الطلبيات المسلّمة نهائياً (Delivered).</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 pt-1 text-xs [&>*:not(:last-child)]:mx-5">
          {formError && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2.5 text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* 1. Select any order to switch */}
          <div className="space-y-1">
            <Label htmlFor="selectSourceOrder" className="text-xs font-semibold">
              اختر الطلبية للتحويل (Select Order)
            </Label>
            <Select
              value={selectedOrderId}
              onValueChange={(val) => {
                if (val) setSelectedOrderId(val);
              }}
              disabled={isSubmitting}
            >
              <SelectTrigger id="selectSourceOrder" className="h-8 text-xs">
                <SelectValue placeholder="اختر الطلبية..." />
              </SelectTrigger>
              <SelectContent className="max-h-60" dir="rtl">
                {selectableOrders.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-xs">
                    {o.id} — {o.customer || "بدون اسم"} ({o.wilaya || "—"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="rounded-md border bg-muted/30 p-2 text-[11px] flex items-center justify-between">
              <span className="text-muted-foreground truncate">
                الحالي: <strong className="text-foreground">{order.customer}</strong> ({order.wilaya})
              </span>
              <span className="font-bold text-primary shrink-0">{productPrice.toLocaleString()} د.ج</span>
            </div>
          </div>

          {/* 2. New Customer Name & Phone */}
          <div className="space-y-2">
            <div className="space-y-1">
              <Label htmlFor="newCustomerName" className="text-xs flex items-center gap-1">
                <User className="size-3 text-primary" />
                <span>الاسم الكامل للزبون الجديد *</span>
              </Label>
              <Input
                id="newCustomerName"
                placeholder="مثال: يوسف بلقاسم"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                disabled={isDelivered || isSubmitting}
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="newCustomerPhone" className="text-xs flex items-center gap-1">
                <Phone className="size-3 text-primary" />
                <span>رقم الهاتف (05/06/07) *</span>
              </Label>
              <Input
                id="newCustomerPhone"
                placeholder="0770123456"
                value={newCustomerPhone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                disabled={isDelivered || isSubmitting}
                dir="ltr"
                className={`h-8 text-xs ${phoneError ? "border-red-500" : ""}`}
                required
              />
              {phoneError && <p className="text-[10px] text-red-500">{phoneError}</p>}
            </div>
          </div>

          {/* 3. Destination Wilaya, Commune, Delivery Type */}
          <div className="space-y-2 border-t pt-2">
            <div className="space-y-1">
              <Label htmlFor="wilayaSelect" className="text-xs flex items-center gap-1">
                <MapPin className="size-3 text-primary" />
                <span>الولاية الجديدة *</span>
              </Label>
              <Select
                value={String(selectedWilayaCode)}
                onValueChange={(val) => {
                  if (val) setSelectedWilayaCode(Number(val));
                }}
                disabled={isDelivered || isSubmitting}
              >
                <SelectTrigger id="wilayaSelect" className="h-8 text-xs">
                  <SelectValue placeholder="اختر الولاية" />
                </SelectTrigger>
                <SelectContent className="max-h-56" dir="rtl">
                  {ALGERIA_58_WILAYAS.map((w) => (
                    <SelectItem key={w.code} value={String(w.code)} className="text-xs">
                      {w.code.toString().padStart(2, "0")} — {w.nameAr} ({w.nameFr})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="communeSelect" className="text-xs">
                  البلدية *
                </Label>
                <Select
                  value={newCommuneName}
                  onValueChange={(val) => {
                    if (val) setNewCommuneName(val);
                  }}
                  disabled={isDelivered || isSubmitting || availableCommunes.length === 0}
                >
                  <SelectTrigger id="communeSelect" className="h-8 text-xs">
                    <SelectValue placeholder="اختر البلدية" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56" dir="rtl">
                    {availableCommunes.map((comm) => (
                      <SelectItem key={comm} value={comm} className="text-xs">
                        {comm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="deliveryTypeSelect" className="text-xs">
                  طريقة التوصيل *
                </Label>
                <Select
                  value={newDeliveryType}
                  onValueChange={(val) => {
                    if (val === "DOMICILE" || val === "STOP_DESK") setNewDeliveryType(val);
                  }}
                  disabled={isDelivered || isSubmitting}
                >
                  <SelectTrigger id="deliveryTypeSelect" className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="DOMICILE" className="text-xs">
                      توصيل للمنزل
                    </SelectItem>
                    <SelectItem value="STOP_DESK" disabled={!stopDeskAllowed} className="text-xs">
                      مكتب (Stop-Desk)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newDeliveryType === "DOMICILE" && (
              <div className="space-y-1">
                <Label htmlFor="newDeliveryAddress" className="text-xs">
                  عنوان التوصيل *
                </Label>
                <Input
                  id="newDeliveryAddress"
                  placeholder="الحي، الشارع، رقم المنزل"
                  value={newDeliveryAddress}
                  onChange={(e) => setNewDeliveryAddress(e.target.value)}
                  disabled={isDelivered || isSubmitting}
                  className="h-8 text-xs"
                  required
                />
              </div>
            )}
          </div>

          {/* 4. Total Summary & Reason */}
          <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              الشحن: {newShippingFee.toLocaleString()} د.ج
            </span>
            <span className="text-xs font-bold text-primary">
              الإجمالي: {updatedTotal.toLocaleString("fr-DZ")} د.ج
            </span>
          </div>

          <div className="space-y-1">
            <Label htmlFor="reason" className="text-xs">
              سبب التحويل *
            </Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isDelivered || isSubmitting}
              className="text-xs min-h-[42px] resize-none"
              required
            />
          </div>

          {isShipped && (
            <div className="rounded-md border border-purple-500/30 bg-purple-500/10 p-2 flex items-start gap-2">
              <Checkbox
                id="shippedOverrideConfirmed"
                checked={shippedOverrideConfirmed}
                onCheckedChange={(c) => setShippedOverrideConfirmed(Boolean(c))}
                disabled={isDelivered || isSubmitting}
                className="mt-0.5"
              />
              <Label
                htmlFor="shippedOverrideConfirmed"
                className="text-[11px] font-medium cursor-pointer text-purple-900 dark:text-purple-200"
              >
                تأكيد تحويل طرد مُرسل لشركة التوصيل
              </Label>
            </div>
          )}

          <DialogFooter className="sticky bottom-0 -mx-0 flex flex-row-reverse items-center justify-between gap-2 border-t border-zinc-200 bg-background/90 px-5 py-3 backdrop-blur-md dark:border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-xs"
            >
              إلغاء
            </Button>

            <Button
              type="submit"
              size="xs"
              disabled={isDelivered || isSubmitting || (isShipped && !shippedOverrideConfirmed)}
              className="gap-1.5 text-xs font-bold"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="size-3 animate-spin" />
                  <span>جارٍ التحويل...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3" />
                  <span>تأكيد التحويل</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
