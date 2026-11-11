"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Home,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  ShieldAlert,
  User,
  Warehouse,
} from "lucide-react";

import type { OrderRow } from "@/app/(main)/dashboard/ecommerce/_components/recent-orders-table/schema";
import { rerouteOrderAction } from "@/app/actions/reroute";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import communesRawData from "@/data/geoalgeria/communes.json";
import {
  ALGERIA_58_WILAYAS,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  isValidAlgerianPhone,
  normalizeAlgerianPhone,
  setLiveTariffs,
} from "@/lib/types/checkout";
import { isTerminalStatus, type OrderReRoutingPayload, type OrderReRoutingResult } from "@/lib/types/re-routing";
import { useDeliveryOffices } from "@/lib/use-delivery-offices";

interface RawCommune {
  id: number;
  commune_name_fr: string;
  commune_name_ar: string;
  wilaya_code: number;
}

const communesData = communesRawData as RawCommune[];
const HUB_LABEL = "بسكرة (07)";

export interface OrderRerouteDialogProps {
  order: OrderRow | null;
  allOrders?: OrderRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: OrderReRoutingResult) => void;
}

export function OrderRerouteDialog({ order, allOrders, open, onOpenChange, onSuccess }: OrderRerouteDialogProps) {
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

function SectionTitle({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 font-bold text-foreground text-sm">
      <span className="grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
        {step}
      </span>
      {children}
    </h3>
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
  const [selectedOrderId, setSelectedOrderId] = React.useState<string>(initialOrder.id);

  React.useEffect(() => {
    if (open) setSelectedOrderId(initialOrder.id);
  }, [initialOrder.id, open]);

  const order = React.useMemo(
    () => allOrders.find((o) => o.id === selectedOrderId) || initialOrder,
    [allOrders, selectedOrderId, initialOrder],
  );

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
  const [reason, setReason] = React.useState<string>("الزبون الأصلي ألغى/رفض الاستلام؛ تم إعادة توجيه الطرد لزبون جديد");
  const [shippedOverrideConfirmed, setShippedOverrideConfirmed] = React.useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [phoneError, setPhoneError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const isDelivered = isTerminalStatus(order.status);
  const isShipped = order.status?.toLowerCase() === "shipped" || Boolean(order.in_redex);
  const locked = isDelivered || isSubmitting;

  const selectedWilaya = React.useMemo(
    () => ALGERIA_58_WILAYAS.find((w) => w.code === selectedWilayaCode) || ALGERIA_58_WILAYAS[15],
    [selectedWilayaCode],
  );

  const availableCommunes = React.useMemo(
    () => communesData.filter((c) => c.wilaya_code === selectedWilayaCode),
    [selectedWilayaCode],
  );

  React.useEffect(() => {
    if (availableCommunes.length > 0 && !availableCommunes.some((c) => c.commune_name_ar === newCommuneName)) {
      setNewCommuneName(availableCommunes[0].commune_name_ar);
    }
  }, [availableCommunes, newCommuneName]);

  // Delivery office (stop-desk) availability for the chosen commune
  const deliveryOffices = useDeliveryOffices(selectedWilayaCode);
  const communeHasOffice = deliveryOffices.hasOffice(newCommuneName);
  const wilayaStopDeskAllowed = isStopDeskAllowed(selectedWilayaCode);
  const stopDeskAllowed = wilayaStopDeskAllowed && communeHasOffice !== false;

  React.useEffect(() => {
    if (!stopDeskAllowed && newDeliveryType === "STOP_DESK") setNewDeliveryType("DOMICILE");
  }, [stopDeskAllowed, newDeliveryType]);

  // Same tariffs as a fresh order shipped from the hub: live EcoTrack fees, static matrix as fallback
  const [tariffSource, setTariffSource] = React.useState<"live" | "fallback">("fallback");
  const [tariffVersion, setTariffVersion] = React.useState(0);
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/delivery-fees", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.success || !d.fees) return;
        setLiveTariffs(d.fees);
        setTariffSource("live");
        setTariffVersion((v) => v + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  const productPrice = order.priceNum && order.priceNum > 0 ? order.priceNum : 4950;

  // biome-ignore lint/correctness/useExhaustiveDependencies: tariffVersion re-reads the live tariff table
  const newShippingFee = React.useMemo(() => {
    try {
      return calculateDeliveryTariff(selectedWilayaCode, newDeliveryType);
    } catch {
      return 500;
    }
  }, [selectedWilayaCode, newDeliveryType, tariffVersion]);

  const updatedTotal = productPrice + newShippingFee;

  const handlePhoneChange = (val: string) => {
    setNewCustomerPhone(val);
    if (!val.trim()) setPhoneError("رقم الهاتف مطلوب");
    else if (!isValidAlgerianPhone(val)) setPhoneError("رقم هاتف غير صالح (05/06/07 — 10 أرقام)");
    else setPhoneError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (isDelivered) return setFormError("لا يمكن تحويل الطلبيات المسلّمة نهائياً.");
    if (newCustomerName.trim().length < 2) return setFormError("يرجى إدخال اسم الزبون الجديد");
    if (!isValidAlgerianPhone(newCustomerPhone)) return setFormError("رقم هاتف الزبون الجديد غير صالح");
    if (!newCommuneName.trim()) return setFormError("يرجى اختيار البلدية");
    if (newDeliveryType === "STOP_DESK" && !stopDeskAllowed) {
      return setFormError(`لا يوجد مكتب توصيل في بلدية ${newCommuneName}`);
    }
    if (newDeliveryType === "DOMICILE" && newDeliveryAddress.trim().length < 3) {
      return setFormError("يرجى كتابة عنوان التوصيل");
    }
    if (isShipped && !shippedOverrideConfirmed) return setFormError("يرجى تأكيد تحويل الطرد المشحون");
    if (reason.trim().length < 3) return setFormError("يرجى توضيح سبب التحويل");

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
          newDeliveryAddress.trim() || (newDeliveryType === "STOP_DESK" ? "Bureau Stop-Desk" : undefined),
        reason: reason.trim(),
        operator: "Admin",
        shippedOverrideConfirmed,
      };

      const result = await rerouteOrderAction(payload);
      if (result.success) {
        toast.add({
          title: "تم تحويل الطلبية بنجاح",
          description: `رقم الطلبية المحوّلة: ${result.orderId} — التوصيل ${result.updatedShippingFee?.toLocaleString()} د.ج`,
          type: "success",
        });
        window.dispatchEvent(new CustomEvent("orva:orders-updated"));
        onSuccess?.(result);
        onOpenChange(false);
      } else {
        setFormError(result.error || "تعذر إكمال عملية التحويل.");
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "حدث خطأ غير متوقع أثناء معالجة الطلب.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 text-right sm:max-w-4xl"
        dir="rtl"
      >
        <DialogHeader className="space-y-1 border-b bg-muted/40 px-6 py-4 text-right">
          <div className="flex flex-wrap items-center gap-3 pl-8">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <RefreshCw className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-bold text-base">تحويل الطلبية إلى زبون آخر</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                يُحتسب التوصيل كأن الطرد يخرج من المستودع ({HUB_LABEL}) بنفس تعريفة الطلب العادي.
              </DialogDescription>
            </div>
            <Badge variant="outline" className="font-mono text-[11px]" dir="ltr">
              {order.id}
            </Badge>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-5 text-xs">
            {isDelivered && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-700 dark:text-red-300">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <span>لا يمكن تحويل الطلبيات المسلّمة نهائياً.</span>
              </div>
            )}
            {formError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 font-medium text-red-600 dark:text-red-400">
                <AlertCircle className="size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-5">
              {/* Source order + price summary */}
              <div className="space-y-4 lg:col-span-2">
                <section className="rounded-xl border p-4">
                  <SectionTitle step={1}>الطلبية الأصلية</SectionTitle>
                  <Select
                    value={selectedOrderId}
                    onValueChange={(val) => {
                      if (val) setSelectedOrderId(val);
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="selectSourceOrder" className="h-9 w-full text-xs">
                      <SelectValue placeholder="اختر الطلبية..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-64" dir="rtl">
                      {selectableOrders.map((o) => (
                        <SelectItem key={o.id} value={o.id} className="text-xs">
                          {o.id} — {o.customer || "بدون اسم"} ({o.wilaya || "—"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <dl className="mt-3 space-y-2">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">الزبون الحالي</dt>
                      <dd className="font-semibold">{order.customer}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">الوجهة الحالية</dt>
                      <dd className="font-semibold">
                        {order.wilaya} — {order.commune}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">المنتج</dt>
                      <dd className="truncate font-semibold">{order.items}</dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-bold text-sm">
                    <Package className="size-4 text-primary" />
                    ملخص المبلغ الجديد
                  </h3>
                  <dl className="space-y-2">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">سعر المنتج</dt>
                      <dd className="font-semibold tabular-nums">{productPrice.toLocaleString()} د.ج</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="flex items-center gap-1 text-muted-foreground">
                        <Warehouse className="size-3" />
                        التوصيل {HUB_LABEL} ← {selectedWilaya.nameAr} ({newDeliveryType === "STOP_DESK" ? "مكتب" : "منزل"})
                      </dt>
                      <dd className="font-semibold tabular-nums">{newShippingFee.toLocaleString()} د.ج</dd>
                    </div>
                    <div className="flex items-center justify-between border-t pt-2">
                      <dt className="font-bold">المبلغ عند الاستلام</dt>
                      <dd className="font-bold text-base text-primary tabular-nums">
                        {updatedTotal.toLocaleString()} د.ج
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {tariffSource === "live" ? "تعريفة EcoTrack الحية." : "التعريفة الاحتياطية (تعذر جلب التعريفة الحية)."}
                  </p>
                </section>
              </div>

              {/* New recipient */}
              <section className="space-y-4 rounded-xl border p-4 lg:col-span-3">
                <SectionTitle step={2}>بيانات الزبون الجديد</SectionTitle>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="newCustomerName" className="flex items-center gap-1 text-xs">
                      <User className="size-3 text-primary" /> الاسم الكامل *
                    </Label>
                    <Input
                      id="newCustomerName"
                      placeholder="مثال: يوسف بلقاسم"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      disabled={locked}
                      className="h-9 text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="newCustomerPhone" className="flex items-center gap-1 text-xs">
                      <Phone className="size-3 text-primary" /> رقم الهاتف *
                    </Label>
                    <Input
                      id="newCustomerPhone"
                      placeholder="0770123456"
                      value={newCustomerPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      disabled={locked}
                      dir="ltr"
                      className={`h-9 text-right text-xs ${phoneError ? "border-red-500" : ""}`}
                      required
                    />
                    {phoneError && <p className="text-[10px] text-red-500">{phoneError}</p>}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wilayaSelect" className="flex items-center gap-1 text-xs">
                      <MapPin className="size-3 text-primary" /> الولاية *
                    </Label>
                    <Select
                      value={String(selectedWilayaCode)}
                      onValueChange={(val) => {
                        if (val) setSelectedWilayaCode(Number(val));
                      }}
                      disabled={locked}
                    >
                      <SelectTrigger id="wilayaSelect" className="h-9 w-full text-xs">
                        <SelectValue placeholder="اختر الولاية" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64" dir="rtl">
                        {ALGERIA_58_WILAYAS.map((w) => (
                          <SelectItem key={w.code} value={String(w.code)} className="text-xs">
                            {w.code.toString().padStart(2, "0")} — {w.nameAr} ({w.nameFr})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="communeSelect" className="flex items-center gap-1 text-xs">
                      <Building2 className="size-3 text-primary" /> البلدية *
                    </Label>
                    <Select
                      value={newCommuneName}
                      onValueChange={(val) => {
                        if (val) setNewCommuneName(val);
                      }}
                      disabled={locked || availableCommunes.length === 0}
                    >
                      <SelectTrigger id="communeSelect" className="h-9 w-full text-xs">
                        <SelectValue placeholder="اختر البلدية" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64" dir="rtl">
                        {availableCommunes.map((c) => (
                          <SelectItem key={c.id} value={c.commune_name_ar} className="text-xs">
                            <span className="flex w-full items-center justify-between gap-2">
                              <span>
                                {c.commune_name_ar} ({c.commune_name_fr})
                              </span>
                              {deliveryOffices.hasOffice(c.commune_name_ar) && (
                                <span className="rounded-full bg-emerald-500/10 px-1.5 text-[10px] font-semibold text-emerald-700">
                                  مكتب التوصيل متوفر
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {communeHasOffice === true && (
                      <p className="flex items-center gap-1 font-semibold text-[11px] text-emerald-700">
                        <CheckCircle2 className="size-3" /> مكتب التوصيل متوفر في هذه البلدية
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">طريقة التوصيل *</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewDeliveryType("DOMICILE")}
                      disabled={locked}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-right transition ${
                        newDeliveryType === "DOMICILE"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <Home className="size-4 text-primary" />
                      <span className="font-semibold">توصيل للمنزل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => stopDeskAllowed && setNewDeliveryType("STOP_DESK")}
                      disabled={locked || !stopDeskAllowed}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-right transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        newDeliveryType === "STOP_DESK"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <Building2 className="size-4 text-primary" />
                      <span className="font-semibold">استلام من المكتب</span>
                    </button>
                  </div>

                  {communeHasOffice === false && wilayaStopDeskAllowed ? (
                    <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-900 dark:text-amber-200">
                      <p className="font-bold">
                        لا يوجد مكتب توصيل في بلدية {newCommuneName}، سيكون التوصيل عبر رجل التوصيل إلى المنزل ويُحتسب
                        سعر التوصيل للمنزل.
                      </p>
                      {deliveryOffices.offices.length > 0 && (
                        <p>
                          مكاتب التوصيل المتوفرة في ولاية {selectedWilaya.nameAr}:{" "}
                          <span className="font-semibold">{deliveryOffices.offices.map((o) => o.ar).join("، ")}</span>
                        </p>
                      )}
                    </div>
                  ) : (
                    !wilayaStopDeskAllowed && (
                      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-900 dark:text-amber-200">
                        الاستلام من المكتب غير متوفر في ولاية {selectedWilaya.nameAr}، سيكون التوصيل عبر رجل التوصيل إلى
                        المنزل.
                      </p>
                    )
                  )}
                </div>

                {newDeliveryType === "DOMICILE" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="newDeliveryAddress" className="text-xs">
                      عنوان التوصيل *
                    </Label>
                    <Input
                      id="newDeliveryAddress"
                      placeholder="الحي، الشارع، رقم المنزل"
                      value={newDeliveryAddress}
                      onChange={(e) => setNewDeliveryAddress(e.target.value)}
                      disabled={locked}
                      className="h-9 text-xs"
                      required
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="reason" className="text-xs">
                    سبب التحويل *
                  </Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={locked}
                    className="min-h-[56px] resize-none text-xs"
                    required
                  />
                </div>

                {isShipped && (
                  <div className="flex items-start gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 p-2.5">
                    <Checkbox
                      id="shippedOverrideConfirmed"
                      checked={shippedOverrideConfirmed}
                      onCheckedChange={(c) => setShippedOverrideConfirmed(Boolean(c))}
                      disabled={locked}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor="shippedOverrideConfirmed"
                      className="cursor-pointer font-medium text-[11px] text-purple-900 dark:text-purple-200"
                    >
                      أؤكد تحويل طرد سبق إرساله لشركة التوصيل
                    </Label>
                  </div>
                )}
              </section>
            </div>
          </div>

          <DialogFooter className="m-0 flex flex-row items-center justify-between gap-2 sm:justify-between rounded-none border-t bg-muted/30 px-6 py-3">
            <span className="hidden text-muted-foreground text-xs sm:inline">
              الإجمالي الجديد:{" "}
              <strong className="text-foreground tabular-nums">{updatedTotal.toLocaleString()} د.ج</strong>
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                إلغاء
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isDelivered || isSubmitting || (isShipped && !shippedOverrideConfirmed)}
                className="gap-1.5 font-bold"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    جارٍ التحويل...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    تأكيد التحويل
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
