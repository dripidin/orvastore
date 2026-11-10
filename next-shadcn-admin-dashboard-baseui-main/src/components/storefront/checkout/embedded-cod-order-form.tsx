"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Home,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Truck,
  User,
} from "lucide-react";

import { submitCodOrderAction } from "@/app/actions/checkout";
import communesRawData from "@/data/geoalgeria/communes.json";
import {
  ALGERIA_58_WILAYAS,
  type CodOrderSubmission,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  isValidAlgerianPhone,
} from "@/lib/types/checkout";

interface RawCommune {
  id: number;
  commune_name_fr: string;
  commune_name_ar: string;
  daira_name_fr?: string;
  wilaya_code: number;
  wilaya_name_fr: string;
  wilaya_name_ar: string;
  postal_code?: string;
}

import { CheckoutKeyLifecycle } from "@/lib/idempotency-lifecycle";

const communesData = communesRawData as RawCommune[];

export interface EmbeddedCodOrderFormProps {
  packId?: "PACK1" | "PACK2" | "PACK3";
  lockedPackId?: "PACK1" | "PACK2" | "PACK3";
  productName?: string;
  defaultProductName?: string;
  productPrice?: number;
  defaultPrice?: number;
  originalPrice?: number;
  savings?: number;
  onOrderSuccess?: (result: { orderNumber: string }) => void;
  className?: string;
}

export function EmbeddedCodOrderForm({
  packId,
  lockedPackId,
  productName,
  defaultProductName,
  productPrice,
  defaultPrice,
  originalPrice,
  savings,
  onOrderSuccess,
  className = "",
}: EmbeddedCodOrderFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const effectivePackId = (lockedPackId || packId || "PACK1") as "PACK1" | "PACK2" | "PACK3";
  const effectivePrice = defaultPrice ?? productPrice ?? 4950;
  const effectiveProductName = defaultProductName || productName || "باك الأدوات والصيانة";

  // Form State
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerPhone2, setCustomerPhone2] = useState("");
  const [wilayaCode, setWilayaCode] = useState<number>(16); // Default to Wilaya 16 (Alger)
  const [communeName, setCommuneName] = useState<string>("الجزائر الوسطى");
  const [deliveryType, setDeliveryType] = useState<"DOMICILE" | "STOP_DESK">("DOMICILE");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const keyLifecycleRef = useRef<CheckoutKeyLifecycle | null>(null);
  const getKeyLifecycle = () => {
    if (!keyLifecycleRef.current) {
      keyLifecycleRef.current = new CheckoutKeyLifecycle();
    }
    return keyLifecycleRef.current;
  };
  const [formIdempotencyKey, setFormIdempotencyKey] = useState<string>(() => getKeyLifecycle().getOrCreateKey());

  useEffect(() => {
    setFormIdempotencyKey(getKeyLifecycle().getOrCreateKey());
  }, []);

  // Validation & Server feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Filtered Communes based on selected Wilaya
  const availableCommunes = useMemo(() => {
    return communesData.filter((c) => c.wilaya_code === wilayaCode);
  }, [wilayaCode]);

  // Selected Wilaya Record
  const currentWilaya = useMemo(() => {
    return ALGERIA_58_WILAYAS.find((w) => w.code === wilayaCode) || ALGERIA_58_WILAYAS[15];
  }, [wilayaCode]);

  // Stop-Desk capability for selected Wilaya
  const stopDeskAllowed = useMemo(() => {
    return isStopDeskAllowed(wilayaCode);
  }, [wilayaCode]);

  // Dynamic Shipping Fee
  const shippingFee = useMemo(() => {
    try {
      return calculateDeliveryTariff(wilayaCode, deliveryType);
    } catch {
      return 500;
    }
  }, [wilayaCode, deliveryType]);

  // Total Net Payable
  const totalPayable = effectivePrice + shippingFee;

  // Handle Wilaya change
  const handleWilayaChange = (codeStr: string) => {
    const code = parseInt(codeStr, 10);
    setWilayaCode(code);
    setFieldErrors((prev) => ({ ...prev, wilayaCode: "" }));

    // Find communes for new wilaya
    const newCommunes = communesData.filter((c) => c.wilaya_code === code);
    if (newCommunes.length > 0) {
      setCommuneName(newCommunes[0].commune_name_ar || newCommunes[0].commune_name_fr);
    } else {
      setCommuneName("");
    }

    // Barrier check: Wilayas 49 to 58 prohibit Stop-Desk
    if (!isStopDeskAllowed(code) && deliveryType === "STOP_DESK") {
      setDeliveryType("DOMICILE");
    }
  };

  // Handle Delivery Type toggle
  const handleDeliveryTypeToggle = (type: "DOMICILE" | "STOP_DESK") => {
    if (type === "STOP_DESK" && !stopDeskAllowed) {
      return; // Barrier prevents selection
    }
    setDeliveryType(type);
    setFieldErrors((prev) => ({ ...prev, deliveryType: "", deliveryAddress: "" }));
  };

  // Form Submit Handler
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    // Client-side pre-validations
    const errors: Record<string, string> = {};

    if (honeypot.trim().length > 0) {
      setErrorMessage("تم رفض الطلب كإجراء أمني.");
      return;
    }

    if (customerName.trim().length < 2) {
      errors.customerName = "يرجى كتابة الاسم واللقب بشكل صحيح (حرفين على الأقل).";
    }

    if (!isValidAlgerianPhone(customerPhone)) {
      errors.customerPhone = "يرجى إدخال رقم هاتف محمول جزائري صحيح (يبدأ بـ 05، 06 أو 07 ويتكون من 10 أرقام).";
    }

    if (customerPhone2.trim() && !isValidAlgerianPhone(customerPhone2)) {
      errors.customerPhone2 = "رقم الهاتف الاحتياطي غير صحيح.";
    }

    if (!communeName.trim()) {
      errors.communeName = "يرجى اختيار البلدية.";
    }

    if (deliveryType === "DOMICILE" && deliveryAddress.trim().length < 3) {
      errors.deliveryAddress = "يرجى كتابة عنوان التوصيل (الحي أو الشارع).";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const activeIdempotencyKey = getKeyLifecycle().getOrCreateKey();
    if (activeIdempotencyKey !== formIdempotencyKey) {
      setFormIdempotencyKey(activeIdempotencyKey);
    }

    const submission: CodOrderSubmission = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerPhone2: customerPhone2.trim() || undefined,
      wilayaCode,
      wilayaName: currentWilaya.nameAr,
      communeName: communeName.trim(),
      deliveryType,
      deliveryAddress: deliveryType === "DOMICILE" ? deliveryAddress.trim() : "Bureau Stop-Desk",
      packId: effectivePackId,
      productName: effectiveProductName,
      productPrice: effectivePrice,
      shippingFee,
      totalPayable,
      honeypot: honeypot.trim() || undefined,
      idempotencyKey: activeIdempotencyKey,
    };

    startTransition(async () => {
      try {
        const result = await submitCodOrderAction(submission);
        if (result.success && result.redirectUrl) {
          // Key lifecycle: clear used session key and rotate to a fresh key upon successful completion
          const nextKey = getKeyLifecycle().rotateKeyOnSuccess();
          setFormIdempotencyKey(nextKey);

          if (typeof window !== "undefined") {
            try {
              const bc = new BroadcastChannel("orva_orders_channel");
              bc.postMessage({ type: "ORDER_CREATED", orderNumber: result.orderNumber });
              bc.close();
            } catch (_) {
              // ignore cross-tab sync failure in environments without BroadcastChannel
            }
            window.dispatchEvent(new CustomEvent("orva:orders-updated"));
          }
          if (onOrderSuccess && result.orderNumber) {
            onOrderSuccess({ orderNumber: result.orderNumber });
          }
          router.push(result.redirectUrl);
        } else {
          setErrorMessage(result.error || "حدث خطأ أثناء معالجة الطلب، يرجى المحاولة مرة أخرى.");
          if (result.validationErrors) {
            setFieldErrors(result.validationErrors);
          }
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "تعذر الاتصال بالخادم، يرجى التأكد من اتصالك بالإنترنت.");
      }
    });
  };

  return (
    <div
      id="order-form-container"
      className={`bg-white border-2 border-amber-500 rounded-3xl p-5 sm:p-8 text-slate-900 shadow-xl relative overflow-hidden ${className}`}
      dir="rtl"
    >
      {/* Anchor for legacy template links */}
      <div id="order-form" className="sr-only" tabIndex={-1} />
      {/* Top Header Glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Form Header */}
      <div className="text-center space-y-2 mb-6 border-b border-slate-200 pb-5">
        <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-full px-3 py-1 text-xs font-bold shadow-2xs">
          <Truck className="size-3.5 text-amber-600" />
          <span>توصيل سريع والدفع عند الاستلام (COD)</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">إستمارة تأكيد الطلب السريع</h2>
        <p className="text-xs sm:text-sm text-slate-600">
          املأ بياناتك أدناه واضغط على زر التأكيد، سيتصل بك فريقنا لتأكيد شحن الطرد فوراً.
        </p>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 mb-5 text-xs sm:text-sm flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-red-500" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Anti-spam Honeypot */}
        <input
          type="text"
          id="website_url"
          name="website_url"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          style={{ display: "none" }}
          tabIndex={-1}
          autoComplete="off"
        />

        {/* 1. Customer Name */}
        <div className="space-y-1.5">
          <label className="text-xs sm:text-sm font-bold flex items-center gap-1.5 text-slate-800">
            <User className="size-4 text-amber-500" />
            <span>الاسم واللقب الكريم</span>
            <span className="text-amber-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="اكتب اسمك ولقبك هنا"
            value={customerName}
            onChange={(e) => {
              setCustomerName(e.target.value);
              setFieldErrors((prev) => ({ ...prev, customerName: "" }));
            }}
            className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-hidden transition"
          />
          {fieldErrors.customerName && <p className="text-xs text-red-600 font-medium">{fieldErrors.customerName}</p>}
        </div>

        {/* 2. Customer Phone (Algerian Mobile) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs sm:text-sm font-bold flex items-center gap-1.5 text-slate-800">
              <Phone className="size-4 text-amber-500" />
              <span>رقم الهاتف للتواصل</span>
              <span className="text-amber-500">*</span>
            </label>
            <input
              type="tel"
              required
              dir="ltr"
              placeholder="05 / 06 / 07 XX XX XX XX"
              value={customerPhone}
              onChange={(e) => {
                setCustomerPhone(e.target.value);
                setFieldErrors((prev) => ({ ...prev, customerPhone: "" }));
              }}
              className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-hidden transition text-right font-mono"
            />
            {fieldErrors.customerPhone && (
              <p className="text-xs text-red-600 font-medium">{fieldErrors.customerPhone}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs sm:text-sm font-bold flex items-center gap-1.5 text-slate-600">
              <Phone className="size-4 text-slate-400" />
              <span>رقم هاتف ثانٍ (اختياري)</span>
            </label>
            <input
              type="tel"
              dir="ltr"
              placeholder="05 / 06 / 07 XX XX XX XX (احتياطي)"
              value={customerPhone2}
              onChange={(e) => {
                setCustomerPhone2(e.target.value);
                setFieldErrors((prev) => ({ ...prev, customerPhone2: "" }));
              }}
              className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-hidden transition text-right font-mono"
            />
            {fieldErrors.customerPhone2 && (
              <p className="text-xs text-red-600 font-medium">{fieldErrors.customerPhone2}</p>
            )}
          </div>
        </div>

        {/* 3. Cascading Geographic Selectors: 58 Wilayas & Communes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs sm:text-sm font-bold flex items-center gap-1.5 text-slate-800">
              <MapPin className="size-4 text-amber-500" />
              <span>الولاية (58 ولاية)</span>
              <span className="text-amber-500">*</span>
            </label>
            <select
              value={wilayaCode}
              onChange={(e) => handleWilayaChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white rounded-xl px-4 py-3 text-sm text-slate-900 outline-hidden transition appearance-none cursor-pointer"
            >
              {ALGERIA_58_WILAYAS.map((w) => (
                <option key={w.code} value={w.code}>
                  {w.code.toString().padStart(2, "0")} - {w.nameAr} ({w.nameFr})
                </option>
              ))}
            </select>
            {fieldErrors.wilayaCode && <p className="text-xs text-red-600 font-medium">{fieldErrors.wilayaCode}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs sm:text-sm font-bold flex items-center gap-1.5 text-slate-800">
              <Building2 className="size-4 text-amber-500" />
              <span>البلدية أو المدينة</span>
              <span className="text-amber-500">*</span>
            </label>
            <select
              value={communeName}
              onChange={(e) => {
                setCommuneName(e.target.value);
                setFieldErrors((prev) => ({ ...prev, communeName: "" }));
              }}
              className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white rounded-xl px-4 py-3 text-sm text-slate-900 outline-hidden transition appearance-none cursor-pointer"
            >
              {availableCommunes.map((c) => (
                <option key={c.id} value={c.commune_name_ar || c.commune_name_fr}>
                  {c.commune_name_ar} {c.commune_name_fr ? `(${c.commune_name_fr})` : ""}
                </option>
              ))}
            </select>
            {fieldErrors.communeName && <p className="text-xs text-red-600 font-medium">{fieldErrors.communeName}</p>}
          </div>
        </div>

        {/* 4. Delivery Mode Toggle: Domicile vs Stop-Desk */}
        <div className="space-y-2 pt-2">
          <label className="text-xs sm:text-sm font-bold block text-slate-800">
            أين تفضل استلام طلبيتك؟ <span className="text-amber-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Domicile Card */}
            <button
              type="button"
              onClick={() => handleDeliveryTypeToggle("DOMICILE")}
              className={`p-4 rounded-2xl border text-right transition flex items-start gap-3 ${
                deliveryType === "DOMICILE"
                  ? "bg-amber-50/80 border-2 border-amber-500 text-slate-900 shadow-xs"
                  : "bg-slate-50 border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-100/50"
              }`}
            >
              <div
                className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                  deliveryType === "DOMICILE" ? "border-amber-500 bg-amber-500 text-slate-950" : "border-slate-400"
                }`}
              >
                {deliveryType === "DOMICILE" && <div className="size-2 rounded-full bg-slate-950" />}
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <Home className="size-4 text-amber-500" />
                  <span>توصيل لباب المنزل</span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  يسلمك موزع البريد السلعة مباشرة في عنوانك الشخصي
                </p>
              </div>
            </button>

            {/* Stop-Desk Card */}
            <button
              type="button"
              disabled={!stopDeskAllowed}
              onClick={() => handleDeliveryTypeToggle("STOP_DESK")}
              className={`p-4 rounded-2xl border text-right transition flex items-start gap-3 ${
                !stopDeskAllowed
                  ? "bg-slate-100 border-slate-200 opacity-50 cursor-not-allowed text-slate-400"
                  : deliveryType === "STOP_DESK"
                    ? "bg-amber-50/80 border-2 border-amber-500 text-slate-900 shadow-xs"
                    : "bg-slate-50 border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-100/50"
              }`}
            >
              <div
                className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                  deliveryType === "STOP_DESK" ? "border-amber-500 bg-amber-500 text-slate-950" : "border-slate-400"
                }`}
              >
                {deliveryType === "STOP_DESK" && <div className="size-2 rounded-full bg-slate-950" />}
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <Building2 className="size-4 text-amber-500" />
                  <span>استلام من المكتب (Stop-Desk)</span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {stopDeskAllowed
                    ? "تستلم بنفسك من أقرب مكتب شحن في ولايتك بتكلفة أقل"
                    : "غير متوفر في الولايات الجنوبية (49 إلى 58)"}
                </p>
              </div>
            </button>
          </div>
          {!stopDeskAllowed && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
              ⚠️ التوصيل للمكتب غير متوفر حالياً في ولاية {currentWilaya.nameAr}، التوصيل متاح لباب المنزل فقط.
            </p>
          )}
        </div>

        {/* 5. Street Address (Only required for Domicile) */}
        {deliveryType === "DOMICILE" && (
          <div className="space-y-1.5 pt-1">
            <label className="text-xs sm:text-sm font-bold flex items-center gap-1.5 text-slate-800">
              <MapPin className="size-4 text-amber-500" />
              <span>عنوان التوصيل أو الحي</span>
              <span className="text-amber-500">*</span>
            </label>
            <input
              type="text"
              required={deliveryType === "DOMICILE"}
              placeholder="مثال: حي النور، عمارة 4، بالقرب من المسجد الكبير"
              value={deliveryAddress}
              onChange={(e) => {
                setDeliveryAddress(e.target.value);
                setFieldErrors((prev) => ({ ...prev, deliveryAddress: "" }));
              }}
              className="w-full bg-slate-50 border border-slate-300 focus:border-amber-500 focus:bg-white rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-hidden transition"
            />
            {fieldErrors.deliveryAddress && (
              <p className="text-xs text-red-600 font-medium">{fieldErrors.deliveryAddress}</p>
            )}
          </div>
        )}

        {/* 6. Dynamic Transparent Price Breakdown */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3 mt-4">
          <div className="flex justify-between items-center text-xs sm:text-sm text-slate-600">
            <span>سعر الباقة ({effectiveProductName}):</span>
            <span className="font-mono font-bold text-slate-900">{effectivePrice.toLocaleString()} د.ج</span>
          </div>

          <div className="flex justify-between items-center text-xs sm:text-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              <span>
                مصاريف التوصيل ({currentWilaya.nameAr} - {deliveryType === "DOMICILE" ? "منزل" : "مكتب"}):
              </span>
            </span>
            <span className="font-mono font-bold text-amber-600">{shippingFee.toLocaleString()} د.ج</span>
          </div>

          <div className="h-px bg-slate-200 my-1" />

          <div className="flex justify-between items-center">
            <span className="font-black text-sm sm:text-base text-slate-900">
              المبلغ الإجمالي الصافي المطلوب عند الاستلام:
            </span>
            <div className="text-left">
              <span className="font-mono font-black text-xl sm:text-2xl text-amber-600">
                {totalPayable.toLocaleString()} د.ج
              </span>
            </div>
          </div>
        </div>

        {/* 7. Primary Submission CTA */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-800 text-slate-950 font-black py-4 px-6 rounded-2xl shadow-xl shadow-amber-600/30 transition-all text-base sm:text-lg flex items-center justify-center gap-3 active:scale-[0.99] disabled:opacity-75 disabled:cursor-wait cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="size-5 animate-spin text-slate-950" />
              <span>جاري تسجيل وتأكيد طلبيتك...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="size-5 text-slate-950 fill-amber-300" />
              <span>اضغط هنا لتأكيد طلبك الآن</span>
            </>
          )}
        </button>

        {/* Reassurance Footer under Button */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-600 pt-1 text-center font-medium">
          <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
          <span>الدفع نقداً عند الاستلام بعد معاينة وفحص السلعة يداً بيد</span>
        </div>
      </form>
    </div>
  );
}
