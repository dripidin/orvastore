"use client";

import * as React from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  KeyRound,
  Loader2,
  Package,
  Phone,
  Printer,
  Save,
  Send,
  Settings2,
  ShieldCheck,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";

import {
  COURIER_DZ_PROVIDERS,
  CourierDefinition,
  loadCourierPreTemplate,
  saveCourierPreTemplate,
  CourierPreTemplateSettings,
} from "@/lib/couriers/courier-catalog";
import { getOrdersRepository } from "@/lib/repository/orders-repository-factory";
import type { OrderRow } from "./recent-orders-table/schema";

interface OrderPushDialogProps {
  order: OrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderPushed?: (updatedOrder: OrderRow, trackingCode: string, courierName: string) => void;
}

export function OrderPushDialog({
  order,
  open,
  onOpenChange,
  onOrderPushed,
}: OrderPushDialogProps) {
  if (!order) return null;
  return (
    <OrderPushDialogForm
      order={order}
      open={open}
      onOpenChange={onOpenChange}
      onOrderPushed={onOrderPushed}
    />
  );
}

interface ActiveOrderPushDialogProps extends Omit<OrderPushDialogProps, "order"> {
  order: OrderRow;
}

function OrderPushDialogForm({
  order,
  open,
  onOpenChange,
  onOrderPushed,
}: ActiveOrderPushDialogProps) {
  const [template, setTemplate] = React.useState<CourierPreTemplateSettings>(() => loadCourierPreTemplate());
  const [selectedCourierId, setSelectedCourierId] = React.useState<string>(template.defaultCourierId || "redex");
  const [deliveryType, setDeliveryType] = React.useState<"home" | "desk">(
    order.deliveryType?.includes("مكتب") || order.deliveryType?.includes("Desk") ? "desk" : template.defaultDeliveryType || "home"
  );
  const [freeShipping, setFreeShipping] = React.useState<boolean>(template.freeShipping);
  const [notes, setNotes] = React.useState<string>(template.defaultNotes || "");
  const [saveAsDefault, setSaveAsDefault] = React.useState<boolean>(false);

  // Inline credential configuration
  const [showConfig, setShowConfig] = React.useState<boolean>(false);
  const [configToken, setConfigToken] = React.useState<string>("");
  const [configApiId, setConfigApiId] = React.useState<string>("");
  const [configKey, setConfigKey] = React.useState<string>("");

  // Submitting / Result state
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [pushedResult, setPushedResult] = React.useState<{
    trackingCode: string;
    courierName: string;
    labelUrl?: string;
  } | null>(
    order.in_redex && order.redex_tracking_code
      ? {
          trackingCode: order.redex_tracking_code,
          courierName: "Redex Delivery DZ",
          labelUrl: `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(order.redex_tracking_code)}`,
        }
      : null
  );

  const selectedCourier: CourierDefinition =
    COURIER_DZ_PROVIDERS.find((c) => c.id === selectedCourierId) || COURIER_DZ_PROVIDERS[0];

  const courierCreds = template.credentials[selectedCourier.id] || { configured: false };
  const isConfigured = Boolean(courierCreds.configured);

  const isTerminal = order.status === "cancelled" || order.status === "deleted";

  const handleSaveCredentials = () => {
    const updated = saveCourierPreTemplate({
      credentials: {
        ...template.credentials,
        [selectedCourier.id]: {
          configured: true,
          token: configToken.trim() || undefined,
          apiId: configApiId.trim() || undefined,
          key: configKey.trim() || undefined,
        },
      },
    });
    setTemplate(updated);
    setShowConfig(false);
    toast.add({
      title: "تم حفظ الإعدادات",
      description: `تم حفظ مفاتيح الربط لشركة ${selectedCourier.nameAr} بنجاح.`,
      type: "success",
    });
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.add({ title: "تم النسخ", description: `${label}: ${text}`, type: "success" });
    } catch {
      toast.add({ title: "تعذر النسخ", description: "اسمح للمتصفح بالوصول للحافظة", type: "error" });
    }
  };

  const handlePushOrder = async () => {
    if (isSubmitting) return;

    if (saveAsDefault) {
      saveCourierPreTemplate({
        defaultCourierId: selectedCourierId,
        defaultDeliveryType: deliveryType,
        freeShipping,
        defaultNotes: notes,
      });
    }

    setIsSubmitting(true);
    try {
      const repo = getOrdersRepository();
      const wilayaMatch = (order.wilaya || "").match(/\b(\d{1,2})\b/);
      const wilayaCode = wilayaMatch ? parseInt(wilayaMatch[1], 10) : undefined;
      const courierToken = template.credentials[selectedCourier.id]?.token;

      const result = await repo.pushOrder({
        orderId: order.id,
        courierId: selectedCourier.id,
        courierName: selectedCourier.name,
        deliveryType,
        freeShipping,
        notes: notes.trim(),
        codAmountDzd: typeof order.priceNum === "number" ? order.priceNum : undefined,
        fullName: order.customer,
        phone: order.phone,
        wilaya: order.wilaya,
        wilayaCode: wilayaCode,
        commune: order.commune,
        address: order.commune || order.wilaya || "Centre Ville",
        productName: order.items,
        price: typeof order.priceNum === "number" ? order.priceNum : undefined,
        token: courierToken || undefined,
        baseUrl: selectedCourier.baseUrl || undefined,
      });

      setPushedResult({
        trackingCode: result.trackingCode,
        courierName: result.courierName,
        labelUrl: result.labelUrl,
      });

      const updatedRow: OrderRow = {
        ...order,
        status: "shipped",
        in_redex: true,
        redex_tracking_code: result.trackingCode,
        deliveryType: deliveryType === "desk" ? "استلام من المكتب (Stop Desk)" : "توصيل للمنزل",
      };

      if (onOrderPushed) {
        onOrderPushed(updatedRow, result.trackingCode, result.courierName);
      }

      toast.add({
        title: "تم إرسال الطلبية بنجاح! 🚀",
        description: `رقم التتبع: ${result.trackingCode} عبر ${selectedCourier.nameAr}`,
        type: "success",
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("orva:orders-updated"));
      }
    } catch (err) {
      toast.add({
        title: "تعذر إرسال الطلبية",
        description: err instanceof Error ? err.message : "تحقق من إعدادات الاتصال وحاول مجدداً",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto text-right" dir="ltr">
        <DialogHeader className="gap-1 border-b pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Truck className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold font-arabic">
                  إرسال الطلب لشركة التوصيل (Push Expedition)
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground font-arabic">
                  منظومة الشحن المتعدد CourierDZ — الربط المباشر مع شركات التوصيل الجزائرية
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {order.id}
            </Badge>
          </div>
        </DialogHeader>

        {/* 1. Order Summary Card */}
        <div className="grid grid-cols-2 gap-2.5 rounded-lg border bg-muted/30 p-3 text-xs font-arabic">
          <div className="flex items-center gap-2">
            <User className="size-3.5 text-muted-foreground shrink-0" />
            <div>
              <span className="text-muted-foreground block text-[10px]">الزبون:</span>
              <span className="font-semibold text-foreground">{order.customer || "غير محدد"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Phone className="size-3.5 text-muted-foreground shrink-0" />
            <div>
              <span className="text-muted-foreground block text-[10px]">الهاتف:</span>
              <span className="font-mono font-medium text-foreground">{order.phone || "—"}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Package className="size-3.5 text-muted-foreground shrink-0" />
            <div>
              <span className="text-muted-foreground block text-[10px]">المنتج:</span>
              <span className="font-medium text-foreground truncate max-w-[170px] block" title={order.items}>
                {order.items || "طلب ORVA Store"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0 text-sm">د.ج</span>
            <div>
              <span className="text-muted-foreground block text-[10px]">المبلغ المطلوب تحصيله (COD):</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {order.total || "—"}
              </span>
            </div>
          </div>

          <div className="col-span-2 rounded border bg-background/70 px-2.5 py-2">
            <span className="text-muted-foreground block text-[10px]">عنوان التوصيل + تعريفة الولاية:</span>
            <p className="font-semibold text-foreground">
              {order.wilaya || "—"}
              {order.commune ? ` — ${order.commune}` : ""}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              نوع التوصيل: {order.deliveryType || "—"} · رسوم الشحن المسجّلة: {order.shippingFee || "—"}
            </p>
            <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
              التسعيرة النهائية تعتمد على جدول الـ 58 ولاية في الخادم (لا تُرسل شحنة حقيقية على localhost — mock).
            </p>
          </div>
        </div>

        {/* 2. Success Banner if Already Dispatched */}
        {pushedResult && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-arabic">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300 block">
                    الطلبية مرسلة بالفعل إلى شركة التوصيل
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    الناقل: <strong className="text-foreground">{pushedResult.courierName}</strong>
                  </span>
                </div>
              </div>
              <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px]">
                مُرسل وموثق
              </Badge>
            </div>

            <div className="mt-2.5 flex items-center justify-between rounded border bg-background/80 px-2.5 py-1.5 font-mono text-xs">
              <span className="text-muted-foreground text-[11px] font-arabic">رقم التتبع:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-primary">{pushedResult.trackingCode}</span>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => handleCopy(pushedResult.trackingCode, "رقم التتبع")}
                  title="نسخ رقم التتبع"
                >
                  <Copy className="size-3" />
                </Button>
              </div>
            </div>

            {pushedResult.labelUrl && (
              <div className="mt-2.5 flex justify-end gap-2">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => window.open(pushedResult.labelUrl, "_blank")}
                  className="gap-1 text-xs font-arabic h-7"
                >
                  <Printer className="size-3" />
                  <span>طباعة البوردورو (Label)</span>
                  <ExternalLink className="size-2.5 opacity-60" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* 3. Carrier Selection (CourierDZ Pre-Template System) */}
        <div className="space-y-3 font-arabic">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold flex items-center gap-1.5">
              <Settings2 className="size-3.5 text-primary" />
              <span>اختيار شركة التوصيل (قالب CourierDZ المسبق):</span>
            </Label>
            <span className="text-[11px] text-muted-foreground">
              {COURIER_DZ_PROVIDERS.length} شركات معتمدة
            </span>
          </div>

          {/* Quick Carousel / Grid of Top Algerian Couriers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {COURIER_DZ_PROVIDERS.slice(0, 4).map((c) => {
              const active = selectedCourierId === c.id;
              const hasConfig = Boolean(template.credentials[c.id]?.configured);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedCourierId(c.id);
                    setShowConfig(false);
                  }}
                  className={`flex flex-col items-start justify-between p-2.5 rounded-lg border text-right transition-all text-xs ${
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary shadow-xs"
                      : "border-border hover:border-muted-foreground/30 bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-bold text-[11px]">{c.name.split(" ")[0]}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                      {c.badge}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground line-clamp-1">{c.nameAr}</span>
                  <div className="flex items-center gap-1 mt-2 text-[9px]">
                    <div
                      className={`size-1.5 rounded-full ${
                        hasConfig ? "bg-emerald-500" : "bg-amber-400"
                      }`}
                    />
                    <span className={hasConfig ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}>
                      {hasConfig ? "مفعل وجاهز" : "يحتاج ضبط"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Extended Select for all 8+ Couriers */}
          <div className="pt-1">
            <Label htmlFor="courier-select" className="text-[11px] text-muted-foreground mb-1 block">
              أو اختر من القائمة الكاملة للشركات:
            </Label>
            <Select value={selectedCourierId} onValueChange={(val) => {
              if (val) {
                setSelectedCourierId(val);
                setShowConfig(false);
              }
            }}>
              <SelectTrigger id="courier-select" className="h-8 text-xs font-arabic w-full">
                <SelectValue placeholder="اختر شركة التوصيل" />
              </SelectTrigger>
              <SelectContent dir="ltr" className="font-arabic text-xs">
                {COURIER_DZ_PROVIDERS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center justify-between w-full gap-3">
                      <span>{c.nameAr}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">({c.family})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Courier Description & Status Bar */}
          <div className="rounded border bg-muted/20 p-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary shrink-0" />
              <div>
                <span className="font-semibold text-foreground">{selectedCourier.nameAr}</span>
                <p className="text-[10px] text-muted-foreground">{selectedCourier.descriptionAr}</p>
              </div>
            </div>

            <Button
              size="xs"
              variant="outline"
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="gap-1 text-[11px] h-7 shrink-0"
            >
              <KeyRound className="size-3 text-muted-foreground" />
              <span>{showConfig ? "إخفاء الضبط" : "إعدادات الربط"}</span>
            </Button>
          </div>

          {/* Inline Credential Setup Accordion */}
          {showConfig && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-primary flex items-center gap-1.5">
                  <KeyRound className="size-3.5" />
                  <span>تهيئة مفاتيح API لشركة {selectedCourier.nameAr}:</span>
                </span>
                <span className="text-[10px] text-muted-foreground">تُشفر وتحفظ بأمان</span>
              </div>

              {selectedCourier.requiredFields.includes("apiId") && (
                <div>
                  <Label className="text-[11px] mb-0.5 block">X-API-ID:</Label>
                  <Input
                    className="h-8 font-mono text-xs text-left"
                    placeholder="مثال: yal_api_12345"
                    value={configApiId}
                    onChange={(e) => setConfigApiId(e.target.value)}
                  />
                </div>
              )}

              {selectedCourier.requiredFields.includes("key") && (
                <div>
                  <Label className="text-[11px] mb-0.5 block">API Key:</Label>
                  <Input
                    className="h-8 font-mono text-xs text-left"
                    placeholder="مثال: procolis_key_..."
                    value={configKey}
                    onChange={(e) => setConfigKey(e.target.value)}
                  />
                </div>
              )}

              {selectedCourier.requiredFields.includes("token") && (
                <div>
                  <Label className="text-[11px] mb-0.5 block">API Token / Bearer:</Label>
                  <Input
                    type="password"
                    className="h-8 font-mono text-xs text-left"
                    placeholder="أدخل رمز الوصول السري للشركة"
                    value={configToken}
                    onChange={(e) => setConfigToken(e.target.value)}
                  />
                </div>
              )}

              <div className="flex justify-end pt-1">
                <Button size="xs" onClick={handleSaveCredentials} className="gap-1 text-xs h-7">
                  <Save className="size-3" />
                  <span>حفظ وتفعيل</span>
                </Button>
              </div>
            </div>
          )}

          {/* 4. Delivery Options (Home vs Stop Desk) */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <Label className="text-[11px] mb-1 block">طريقة التسليم:</Label>
              <Select value={deliveryType} onValueChange={(val) => setDeliveryType(val as "home" | "desk")}>
                <SelectTrigger className="h-8 text-xs font-arabic w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="ltr" className="font-arabic text-xs">
                  <SelectItem value="home">توصيل لباب المنزل (Home Delivery)</SelectItem>
                  {selectedCourier.supportsStopDesk && (
                    <SelectItem value="desk">استلام من المكتب (Stop Desk)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[11px] mb-1 block">تعليمات وملاحظات للشاحن:</Label>
              <Input
                className="h-8 text-xs font-arabic"
                placeholder="مثال: يرجى الاتصال قبل التسليم"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Pre-Template Save Option */}
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="save-default-template"
              checked={saveAsDefault}
              onCheckedChange={(c) => setSaveAsDefault(Boolean(c))}
            />
            <Label htmlFor="save-default-template" className="text-xs cursor-pointer text-muted-foreground">
              حفظ هذا التفضيل كقالب مسبق (Pre-Template) لجميع الطلبات القادمة
            </Label>
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="gap-2 sm:gap-0 border-t pt-3 font-arabic">
          <div className="flex items-center justify-between w-full">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="text-xs font-arabic"
            >
              إلغاء
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handlePushOrder}
              disabled={isSubmitting || isTerminal}
              className="gap-1.5 text-xs font-bold font-arabic bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>جارٍ إرسال الطلب عبر API...</span>
                </>
              ) : pushedResult ? (
                <>
                  <Truck className="size-3.5" />
                  <span>إعادة إرسال للشركة (Re-Push)</span>
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  <span>تأكيد وإرسال الطرد (Push)</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
