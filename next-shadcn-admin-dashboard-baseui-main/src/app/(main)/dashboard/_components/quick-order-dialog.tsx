"use client";

import * as React from "react";
import { CheckCircle2, Loader2, ShoppingBag } from "lucide-react";

import { submitCodOrderAction } from "@/app/actions/checkout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import communesRawData from "@/data/geoalgeria/communes.json";
import type { Product } from "@/lib/repository/product-types";
import {
  ALGERIA_58_WILAYAS,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  isValidAlgerianPhone,
  setLiveTariffs,
} from "@/lib/types/checkout";

interface RawCommune {
  id: number;
  commune_name_ar: string;
  commune_name_fr: string;
  wilaya_code: number;
}
const communes = communesRawData as RawCommune[];

const selectCls =
  "h-9 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

function newIdempotencyKey() {
  return `admin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Dashboard quick order: same validation, pricing and notifications as a storefront order. */
export function QuickOrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [productId, setProductId] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [wilayaCode, setWilayaCode] = React.useState(16);
  const [commune, setCommune] = React.useState("");
  const [deliveryType, setDeliveryType] = React.useState<"DOMICILE" | "STOP_DESK">("DOMICILE");
  const [address, setAddress] = React.useState("");
  const [tariffVersion, setTariffVersion] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    fetch("/api/store-products", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = ((d?.data ?? []) as Product[]).filter((p) => p.status === "active");
        setProducts(list);
        setProductId((cur) => cur || list[0]?.id || "");
      })
      .catch(() => setError("تعذر تحميل المنتجات."));
    fetch("/api/delivery-fees", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && d.fees) {
          setLiveTariffs(d.fees);
          setTariffVersion((v) => v + 1);
        }
      })
      .catch(() => undefined);
  }, [open]);

  const wilayaCommunes = React.useMemo(() => communes.filter((c) => c.wilaya_code === wilayaCode), [wilayaCode]);
  React.useEffect(() => {
    setCommune(wilayaCommunes[0]?.commune_name_ar ?? "");
  }, [wilayaCommunes]);

  const stopDesk = isStopDeskAllowed(wilayaCode);
  React.useEffect(() => {
    if (!stopDesk) setDeliveryType("DOMICILE");
  }, [stopDesk]);

  const product = products.find((p) => p.id === productId);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tariffVersion re-reads live tariffs
  const shipping = React.useMemo(() => {
    try {
      return calculateDeliveryTariff(wilayaCode, deliveryType);
    } catch {
      return 0;
    }
  }, [wilayaCode, deliveryType, tariffVersion]);
  const price = product?.sellingPrice ?? 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!product?.slug) return setError("اختر منتجاً.");
    if (name.trim().length < 2) return setError("اكتب اسم الزبون.");
    if (!isValidAlgerianPhone(phone)) return setError("رقم الهاتف غير صحيح.");
    if (deliveryType === "DOMICILE" && address.trim().length < 3) return setError("اكتب عنوان التوصيل.");

    setSubmitting(true);
    try {
      const wilaya = ALGERIA_58_WILAYAS.find((w) => w.code === wilayaCode);
      const result = await submitCodOrderAction({
        customerName: name.trim(),
        customerPhone: phone.trim(),
        wilayaCode,
        wilayaName: wilaya?.nameAr ?? String(wilayaCode),
        communeName: commune,
        deliveryType,
        deliveryAddress: deliveryType === "DOMICILE" ? address.trim() : "Bureau Stop-Desk",
        packId: product.slug.toUpperCase(),
        productName: product.title,
        productPrice: price,
        shippingFee: shipping,
        totalPayable: price + shipping,
        idempotencyKey: newIdempotencyKey(),
      });
      if (!result.success) throw new Error(result.error || "تعذر إنشاء الطلبية.");
      toast.add({ title: "تم إنشاء الطلبية", description: result.orderNumber ?? "", type: "success" });
      window.dispatchEvent(new CustomEvent("orva:orders-updated"));
      setName("");
      setPhone("");
      setAddress("");
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء الطلبية.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 text-right sm:max-w-2xl" dir="rtl">
        <DialogHeader className="space-y-1 border-b bg-muted/40 px-6 py-4 text-right">
          <div className="flex items-center gap-3 pl-8">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <ShoppingBag className="size-4" />
            </span>
            <div>
              <DialogTitle className="font-bold text-base">طلبية سريعة</DialogTitle>
              <DialogDescription className="text-xs">
                لطلبات الهاتف أو الرسائل: تُسجَّل كطلبية عادية بنفس الأسعار ومصاريف التوصيل.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid flex-1 gap-4 overflow-y-auto px-6 py-5 text-sm sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="qo-product">المنتج *</Label>
              <select id="qo-product" className={selectCls} value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.length === 0 && <option value="">لا توجد منتجات نشطة</option>}
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} — {new Intl.NumberFormat("fr-DZ").format(p.sellingPrice)} د.ج
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qo-name">اسم الزبون *</Label>
              <Input id="qo-name" value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qo-phone">الهاتف *</Label>
              <Input
                id="qo-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                className="h-9 text-right font-mono"
                placeholder="0770123456"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qo-wilaya">الولاية *</Label>
              <select
                id="qo-wilaya"
                className={selectCls}
                value={wilayaCode}
                onChange={(e) => setWilayaCode(Number(e.target.value))}
              >
                {ALGERIA_58_WILAYAS.map((w) => (
                  <option key={w.code} value={w.code}>
                    {String(w.code).padStart(2, "0")} — {w.nameAr}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qo-commune">البلدية *</Label>
              <select id="qo-commune" className={selectCls} value={commune} onChange={(e) => setCommune(e.target.value)}>
                {wilayaCommunes.map((c) => (
                  <option key={c.id} value={c.commune_name_ar}>
                    {c.commune_name_ar} ({c.commune_name_fr})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qo-type">طريقة التوصيل</Label>
              <select
                id="qo-type"
                className={selectCls}
                value={deliveryType}
                onChange={(e) => setDeliveryType(e.target.value as "DOMICILE" | "STOP_DESK")}
              >
                <option value="DOMICILE">توصيل للمنزل</option>
                <option value="STOP_DESK" disabled={!stopDesk}>
                  استلام من المكتب
                </option>
              </select>
            </div>
            {deliveryType === "DOMICILE" && (
              <div className="space-y-1.5">
                <Label htmlFor="qo-address">العنوان *</Label>
                <Input id="qo-address" value={address} onChange={(e) => setAddress(e.target.value)} className="h-9" />
              </div>
            )}
            {error && <p className="font-medium text-destructive text-sm sm:col-span-2">{error}</p>}
          </div>

          <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-6 py-3">
            <span className="text-muted-foreground text-xs">
              {new Intl.NumberFormat("fr-DZ").format(price)} + {new Intl.NumberFormat("fr-DZ").format(shipping)} توصيل ={" "}
              <strong className="text-foreground">{new Intl.NumberFormat("fr-DZ").format(price + shipping)} د.ج</strong>
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
                إلغاء
              </Button>
              <Button type="submit" size="sm" className="gap-1.5" disabled={submitting || !product}>
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                إنشاء الطلبية
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
