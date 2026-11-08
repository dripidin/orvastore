"use client";

import * as React from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Info,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  ShieldAlert,
  Truck,
  User,
  X,
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
  generateCourierInstructionNote,
  isTerminalStatus,
  type OrderReRoutingPayload,
  type OrderReRoutingResult,
} from "@/lib/types/re-routing";
import { rerouteOrderAction } from "@/app/actions/reroute";
import { ALGERIA_COMMUNES_BY_WILAYA_ID } from "@/data/algeria-locations";
import type { OrderRow } from "@/app/(main)/dashboard/ecommerce/_components/recent-orders-table/schema";

export interface OrderRerouteDialogProps {
  order: OrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: OrderReRoutingResult) => void;
}

export function OrderRerouteDialog({
  order,
  open,
  onOpenChange,
  onSuccess,
}: OrderRerouteDialogProps) {
  if (!order) return null;

  return (
    <OrderRerouteDialogInner
      order={order}
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />
  );
}

function OrderRerouteDialogInner({
  order,
  open,
  onOpenChange,
  onSuccess,
}: {
  order: OrderRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: OrderReRoutingResult) => void;
}) {
  // Form state
  const [newCustomerName, setNewCustomerName] = React.useState("");
  const [newCustomerPhone, setNewCustomerPhone] = React.useState("");
  const [newCustomerPhone2, setNewCustomerPhone2] = React.useState("");
  const [selectedWilayaCode, setSelectedWilayaCode] = React.useState<number>(16); // Default Alger
  const [newCommuneName, setNewCommuneName] = React.useState<string>("");
  const [newDeliveryType, setNewDeliveryType] = React.useState<"DOMICILE" | "STOP_DESK">("DOMICILE");
  const [newDeliveryAddress, setNewDeliveryAddress] = React.useState<string>("");
  const [reason, setReason] = React.useState<string>(
    "الزبون الأصلي ألغى/رفض الاستلام؛ تم إعادة توجيه الطرد لزبون جديد"
  );
  const [operator, setOperator] = React.useState<string>("مسؤول العمليات — Orva COD");
  const [shippedOverrideConfirmed, setShippedOverrideConfirmed] = React.useState<boolean>(false);

  // UI state
  const [copied, setCopied] = React.useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [phoneError, setPhoneError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Status checks
  const isDelivered = isTerminalStatus(order.status);
  const isShipped =
    order.status?.toLowerCase() === "shipped" || Boolean(order.in_redex);

  // Selected Wilaya record
  const selectedWilaya = React.useMemo(() => {
    return ALGERIA_58_WILAYAS.find((w) => w.code === selectedWilayaCode) || ALGERIA_58_WILAYAS[15];
  }, [selectedWilayaCode]);

  // Available communes for current Wilaya
  const availableCommunes = React.useMemo(() => {
    return ALGERIA_COMMUNES_BY_WILAYA_ID[String(selectedWilayaCode)] || [];
  }, [selectedWilayaCode]);

  // Stop-Desk allowed for current Wilaya
  const stopDeskAllowed = React.useMemo(() => {
    return isStopDeskAllowed(selectedWilayaCode);
  }, [selectedWilayaCode]);

  // Auto-switch to Domicile if Wilaya prohibits Stop-Desk
  React.useEffect(() => {
    if (!stopDeskAllowed && newDeliveryType === "STOP_DESK") {
      setNewDeliveryType("DOMICILE");
    }
  }, [stopDeskAllowed, newDeliveryType]);

  // Auto-select first commune when Wilaya changes
  React.useEffect(() => {
    if (availableCommunes.length > 0 && !availableCommunes.includes(newCommuneName)) {
      setNewCommuneName(availableCommunes[0]);
    }
  }, [availableCommunes, newCommuneName]);

  // Product price & Dynamic shipping tariff calculation
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

  // Real-time Phone Validation
  const handlePhoneChange = (val: string) => {
    setNewCustomerPhone(val);
    if (!val.trim()) {
      setPhoneError("رقم الهاتف مطلوب");
      return;
    }
    if (!isValidAlgerianPhone(val)) {
      setPhoneError("رقم هاتف غير صالح. يجب أن يبدأ بـ 05 أو 06 أو 07 ويتكون من 10 أرقام");
    } else {
      setPhoneError(null);
    }
  };

  // Structured Courier Instruction Note Generation
  const generatedCourierNote = React.useMemo(() => {
    const timestamp = new Date().toLocaleString("ar-DZ", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const deliveryTypeAr =
      newDeliveryType === "STOP_DESK"
        ? "استلام من مكتب التوصيل (Stop-Desk Bureau)"
        : "توصيل لباب المنزل (À Domicile)";

    return [
      "════════════════════════════════════════════",
      "طلب تحويل طرد (Réacheminement de Colis)",
      "════════════════════════════════════════════",
      `رقم الطلب الأصلي: ${order.id}`,
      `العميل الجديد: ${newCustomerName.trim() || "[اسم العميل الجديد]"}`,
      `الهاتف: ${normalizeAlgerianPhone(newCustomerPhone) || "[رقم الهاتف]"}`,
      `الوجهة الجديدة: [${selectedWilayaCode}] ${selectedWilaya.nameAr} (${selectedWilaya.nameFr}) — ${newCommuneName || "[البلدية]"}`,
      `نوع التوصيل: ${deliveryTypeAr}`,
      `العنوان: ${newDeliveryAddress.trim() || (newDeliveryType === "STOP_DESK" ? "مكتب التوصيل الرئيسي" : "[العنوان التفصيلي]")}`,
      `المبلغ الصافي المطلوب تحصيله (COD): ${updatedTotal.toLocaleString("fr-DZ")} د.ج`,
      `سبب التحويل: ${reason.trim() || "تحويل طرد لدى شركة التوصيل"}`,
      `المشرف المنفّذ: ${operator.trim()}`,
      `تاريخ التحويل: ${timestamp}`,
      "════════════════════════════════════════════",
    ].join("\n");
  }, [
    order.id,
    newCustomerName,
    newCustomerPhone,
    selectedWilayaCode,
    selectedWilaya,
    newCommuneName,
    newDeliveryType,
    newDeliveryAddress,
    updatedTotal,
    reason,
    operator,
  ]);

  // 1-Click Clipboard Copy Handler
  const handleCopyNote = async () => {
    try {
      await navigator.clipboard.writeText(generatedCourierNote);
      setCopied(true);
      toast.add({
        title: "تم النسخ بنجاح! 📋",
        description: "تم نسخ تعليمات تحويل الطرد الموجهة لشركة التوصيل للحافظة.",
        type: "success",
      });
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      toast.add({
        title: "تعذر النسخ",
        description: "يرجى تحديد النص ونسخه يدوياً.",
        type: "error",
      });
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation checks
    if (isDelivered) {
      setFormError("لا يمكن تحويل الطلبيات المسلمة نهائياً (Delivered).");
      return;
    }

    if (!newCustomerName.trim() || newCustomerName.trim().length < 2) {
      setFormError("يرجى إدخال اسم العميل الجديد (حرفين على الأقل)");
      return;
    }

    if (!isValidAlgerianPhone(newCustomerPhone)) {
      setFormError("رقم هاتف العميل الجديد غير صالح (يجب أن يبدأ بـ 05 أو 06 أو 07)");
      return;
    }

    if (newCustomerPhone2.trim() && !isValidAlgerianPhone(newCustomerPhone2)) {
      setFormError("رقم الهاتف الثانوي غير صالح");
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
      setFormError(`خدمة الاستلام من المكتب غير متوفرة في ولاية ${selectedWilaya.nameAr}`);
      return;
    }

    if (newDeliveryType === "DOMICILE" && (!newDeliveryAddress || newDeliveryAddress.trim().length < 3)) {
      setFormError("يرجى كتابة عنوان التوصيل لباب المنزل بالتفصيل");
      return;
    }

    if (isShipped && !shippedOverrideConfirmed) {
      setFormError("يرجى تفعيل خانة التأكيد لتحويل طرد تم شحنه بالفعل لدى شركة التوصيل");
      return;
    }

    if (!reason.trim() || reason.trim().length < 3) {
      setFormError("يرجى توضيح سبب تحويل الطلبية");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: OrderReRoutingPayload = {
        orderId: order.id,
        sourceOrderId: order.id,
        newCustomerName: newCustomerName.trim(),
        newCustomerPhone: normalizeAlgerianPhone(newCustomerPhone),
        newCustomerPhone2: newCustomerPhone2.trim() ? normalizeAlgerianPhone(newCustomerPhone2) : undefined,
        newWilayaCode: selectedWilayaCode,
        newWilayaName: `${selectedWilaya.nameAr} (${selectedWilaya.nameFr})`,
        newCommuneName: newCommuneName.trim(),
        newDeliveryType,
        newDeliveryAddress: newDeliveryAddress.trim() || (newDeliveryType === "STOP_DESK" ? "Bureau Stop-Desk" : undefined),
        reason: reason.trim(),
        operator: operator.trim() || "Admin",
        shippedOverrideConfirmed,
      };

      const result = await rerouteOrderAction(payload);

      if (result.success) {
        toast.add({
          title: "تم تحويل الطلبية بنجاح! 🎉",
          description: `تم إنشاء الطلبية المحولة برقم: ${result.orderId}`,
          type: "success",
        });

        // Trigger sync event for admin tables
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("orva:orders-updated"));
        }

        onSuccess?.(result);
        onOpenChange(false);
      } else {
        setFormError(result.error || "تعذر إكمال عملية التحويل.");
      }
    } catch (err: any) {
      console.error("[Reroute Dialog Error]:", err);
      setFormError(err?.message || "حدث خطأ غير متوقع أثناء معالجة الطلب.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl max-h-[92vh] overflow-y-auto p-6"
        dir="rtl"
      >
        <DialogHeader className="border-b pb-4 text-right">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <RefreshCw className="size-6 animate-pulse" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  <span>تحويل الطلبية (Réacheminement de Colis)</span>
                  <Badge variant="outline" className="font-mono text-xs">
                    {order.id}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  توجيه طرد عالق أو ملغى أو مرتجع لدى مركز التوصيل نحو عميل جديد مع حساب تسعيرة الشحن وتوليد مذكرة التتبع.
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Terminal State Warning Barrier */}
        {isDelivered && (
          <div className="my-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-red-700 dark:text-red-300 text-xs flex items-start gap-2.5">
            <ShieldAlert className="size-5 shrink-0 mt-0.5 text-red-600" />
            <div>
              <p className="font-bold">حاجز الحماية: لا يمكن تحويل الطلبيات المسلّمة نهائياً (Delivered)</p>
              <p className="mt-1">
                هذه الطلبية تم تسليمها للزبون وتحصيل قيمتها. خاصية التحويل مخصصة حصراً للطلبيات المرتجعة، الملغاة، أو المشحونة العالقة في مكاتب ومستودعات التوصيل.
              </p>
            </div>
          </div>
        )}

        {/* Source Order Context Banner */}
        <div className="my-2 grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-lg border bg-muted/40 p-3 text-xs">
          <div>
            <span className="text-muted-foreground block text-[11px]">الزبون الحالي:</span>
            <span className="font-semibold text-foreground">{order.customer || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">الوجهة الحالية:</span>
            <span className="font-semibold text-foreground">
              {order.wilaya || "—"} ({order.commune || "—"})
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">حالة الطرد:</span>
            <Badge
              variant="outline"
              className={
                isShipped
                  ? "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300"
                  : order.status === "returned"
                    ? "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                    : "border-muted text-muted-foreground"
              }
            >
              {order.status}
            </Badge>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">سعر المنتج (ثابت):</span>
            <span className="font-bold text-primary">{productPrice.toLocaleString()} د.ج</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {formError && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Customer Information Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <User className="size-3.5 text-primary" />
              <span>بيانات المستلم الجديد</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="newCustomerName" className="text-xs">
                  الاسم الكامل للزبون الجديد <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="newCustomerName"
                  placeholder="مثال: يوسف بلقاسم"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  disabled={isDelivered || isSubmitting}
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newCustomerPhone" className="text-xs">
                  رقم الهاتف الأساسي (05/06/07) <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="newCustomerPhone"
                    placeholder="0770123456"
                    value={newCustomerPhone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    disabled={isDelivered || isSubmitting}
                    dir="ltr"
                    className={`h-9 text-xs pl-8 ${phoneError ? "border-red-500" : ""}`}
                    required
                  />
                  <Phone className="size-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                </div>
                {phoneError && <p className="text-[11px] text-red-500 font-medium">{phoneError}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="newCustomerPhone2" className="text-xs">
                  رقم هاتف احتياطي (اختياري)
                </Label>
                <Input
                  id="newCustomerPhone2"
                  placeholder="0550123456"
                  value={newCustomerPhone2}
                  onChange={(e) => setNewCustomerPhone2(e.target.value)}
                  disabled={isDelivered || isSubmitting}
                  dir="ltr"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="operator" className="text-xs">
                  اسم المشرف المنفذ <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="operator"
                  placeholder="مثال: كمال (مسؤول المستودع)"
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  disabled={isDelivered || isSubmitting}
                  className="h-9 text-xs"
                  required
                />
              </div>
            </div>
          </div>

          {/* Logistics & Delivery Section */}
          <div className="space-y-3 pt-1 border-t">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mt-2">
              <MapPin className="size-3.5 text-primary" />
              <span>الوجهة الجديدة وطريقة الشحن (مركز التوزيع بسكرة 07)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Cascading 58 Wilayas Selector */}
              <div className="space-y-1.5">
                <Label htmlFor="wilayaSelect" className="text-xs">
                  الولاية الجديدة (58 ولاية) <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={String(selectedWilayaCode)}
                  onValueChange={(val) => {
                    if (val) setSelectedWilayaCode(Number(val));
                  }}
                  disabled={isDelivered || isSubmitting}
                >
                  <SelectTrigger id="wilayaSelect" className="h-9 text-xs">
                    <SelectValue placeholder="اختر الولاية" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60" dir="rtl">
                    {ALGERIA_58_WILAYAS.map((w) => (
                      <SelectItem key={w.code} value={String(w.code)} className="text-xs">
                        {w.code.toString().padStart(2, "0")} — {w.nameAr} ({w.nameFr})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Cascading Communes Selector */}
              <div className="space-y-1.5">
                <Label htmlFor="communeSelect" className="text-xs">
                  البلدية <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={newCommuneName}
                  onValueChange={(val) => {
                    if (val) setNewCommuneName(val);
                  }}
                  disabled={isDelivered || isSubmitting || availableCommunes.length === 0}
                >
                  <SelectTrigger id="communeSelect" className="h-9 text-xs">
                    <SelectValue placeholder="اختر البلدية" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60" dir="rtl">
                    {availableCommunes.map((comm) => (
                      <SelectItem key={comm} value={comm} className="text-xs">
                        {comm}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Delivery Type with Zone 5 Stop-Desk Barrier */}
              <div className="space-y-1.5">
                <Label htmlFor="deliveryTypeSelect" className="text-xs">
                  طريقة التوصيل <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={newDeliveryType}
                  onValueChange={(val) => {
                    if (val === "DOMICILE" || val === "STOP_DESK") setNewDeliveryType(val);
                  }}
                  disabled={isDelivered || isSubmitting}
                >
                  <SelectTrigger id="deliveryTypeSelect" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="DOMICILE" className="text-xs">
                      🏠 توصيل لباب المنزل (Domicile)
                    </SelectItem>
                    <SelectItem
                      value="STOP_DESK"
                      disabled={!stopDeskAllowed}
                      className="text-xs"
                    >
                      🏢 استلام من المكتب (Stop-Desk) {!stopDeskAllowed && "— غير متوفر"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Zone 5 Barrier Warning */}
            {!stopDeskAllowed && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <Info className="size-4 shrink-0 text-amber-600" />
                <span>
                  تنبيه لوجستي: خدمة الاستلام من المكتب (Stop-Desk) غير متاحة لولاية ({selectedWilaya.nameAr}). تم توجيه الطلبية تلقائياً إلى التوصيل المنزلي.
                </span>
              </div>
            )}

            {/* Delivery Address (Required for Domicile) */}
            {newDeliveryType === "DOMICILE" && (
              <div className="space-y-1.5">
                <Label htmlFor="newDeliveryAddress" className="text-xs">
                  عنوان التوصيل بالتفصيل (الحي، الشارع، رقم العمارة/المنزل) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="newDeliveryAddress"
                  placeholder="مثال: حي 500 مسكن، عمارة ب، شقة 14"
                  value={newDeliveryAddress}
                  onChange={(e) => setNewDeliveryAddress(e.target.value)}
                  disabled={isDelivered || isSubmitting}
                  className="h-9 text-xs"
                  required
                />
              </div>
            )}
          </div>

          {/* Financial Recalculation Bar */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px]">تسعيرة التوصيل من بسكرة (07):</span>
              <span className="font-semibold text-foreground">
                {newShippingFee.toLocaleString()} د.ج ({newDeliveryType === "STOP_DESK" ? "مكتب" : "منزل"})
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">سعر المنتج (ثابت):</span>
              <span className="font-semibold text-foreground">{productPrice.toLocaleString()} د.ج</span>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-muted-foreground block text-[11px]">المبلغ الإجمالي الجديد للتحصيل (COD):</span>
              <span className="text-base font-extrabold text-primary">
                {updatedTotal.toLocaleString("fr-DZ")} د.ج
              </span>
            </div>
          </div>

          {/* Reason & Shipped Confirmation */}
          <div className="space-y-3 pt-1 border-t">
            <div className="space-y-1.5">
              <Label htmlFor="reason" className="text-xs">
                سبب التحويل وملاحظات التشغيل <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="وضح سبب التحويل بدقة (مثلاً: الزبون الأصلي لم يرد على مكالمات شركة التوصيل وتم إعادة البيع لزبون مؤكد)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isDelivered || isSubmitting}
                className="text-xs min-h-[50px] resize-none"
                required
              />
            </div>

            {/* Shipped Barrier Confirmation Checkbox */}
            {isShipped && (
              <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 p-3 flex items-start gap-3">
                <Checkbox
                  id="shippedOverrideConfirmed"
                  checked={shippedOverrideConfirmed}
                  onCheckedChange={(c) => setShippedOverrideConfirmed(Boolean(c))}
                  disabled={isDelivered || isSubmitting}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="shippedOverrideConfirmed"
                    className="text-xs font-semibold cursor-pointer text-purple-900 dark:text-purple-200"
                  >
                    تأكيد تحويل طرد مشحون بالفعل لدى شركة التوصيل (Shipped Parcel Override)
                  </Label>
                  <p className="text-[11px] text-purple-700/80 dark:text-purple-300/80 leading-relaxed">
                    أؤكد أن الطرد متواجد حالياً في مركز فرز شركة التوصيل أو مكتب الاستلام، وسيتم إرسال مذكرة التحويل المرفقة لمصلحة الزبائن لدى شركة الشحن لتحديث البوليصة فوراً.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Pre-formatted Courier Support Note Section */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold flex items-center gap-1.5">
                <Truck className="size-3.5 text-primary" />
                <span>مذكرة التوجيه الجاهزة لشركة التوصيل (Courier Support Note)</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleCopyNote}
                className="h-7 text-xs gap-1.5 font-medium border-primary/30 hover:bg-primary/10 hover:text-primary"
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-emerald-600" />
                    <span className="text-emerald-600 font-bold">تم النسخ بنجاح!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    <span>نسخ النص بضغطة واحدة (1-Click Copy)</span>
                  </>
                )}
              </Button>
            </div>

            <pre className="p-3 bg-muted/60 dark:bg-muted/20 border rounded-md text-[11px] font-mono leading-relaxed whitespace-pre-wrap select-all max-h-36 overflow-y-auto text-foreground">
              {generatedCourierNote}
            </pre>
          </div>

          <DialogFooter className="border-t pt-3 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              إلغاء
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopyNote}
                className="gap-1 text-xs"
              >
                <Copy className="size-3.5" />
                <span>نسخ المذكرة</span>
              </Button>

              <Button
                type="submit"
                size="sm"
                disabled={isDelivered || isSubmitting || (isShipped && !shippedOverrideConfirmed)}
                className="gap-2 text-xs font-bold"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    <span>جاري معالجة التحويل...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    <span>تأكيد وتحويل الطلبية</span>
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
