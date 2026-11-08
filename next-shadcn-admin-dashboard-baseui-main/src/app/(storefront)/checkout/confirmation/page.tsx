"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Copy,
  Check,
  PhoneCall,
  MessageCircle,
  Home,
  Clock,
  ShieldCheck,
  Truck,
  Package,
} from "lucide-react";

function ConfirmationContent() {
  const searchParams = useSearchParams();

  const orderNumber = searchParams.get("orderNumber") || "ORV-CONFIRM";
  const packId = searchParams.get("pack") || "PACK1";
  const total = Number(searchParams.get("total")) || 4950;
  const subtotal = Number(searchParams.get("subtotal")) || 4450;
  const shipping = Number(searchParams.get("shipping")) || 500;
  const customerName = searchParams.get("name") || "زبون ORVA الكريم";
  const customerPhone = searchParams.get("phone") || "";
  const wilayaName = searchParams.get("wilaya") || "الجزائر";
  const communeName = searchParams.get("commune") || "المركز";
  const isStopDesk = searchParams.get("deliveryType") === "STOP_DESK";

  const [copied, setCopied] = useState(false);

  const packLabels: Record<string, { ar: string; items: string }> = {
    PACK1: {
      ar: "باك كومبريسار و المفاتيح 4 في 1",
      items: "منفاخ TOYOTA + طقم مفاتيح 46 ق + مفك مرن 11 ق + طقم مفكات 6 ق",
    },
    PACK2: {
      ar: "باك الفيسوز كراون Elite 5 في 1",
      items: "ماكينة ثقب CROWN 20V + بطاريتين + حقيبة 29 ق + قفازات GILAN",
    },
    PACK3: {
      ar: "باك سودير كراون MMA-200 Mini",
      items: "ماكينة لحام CROWN CT33102 + نظام VRD + قفازات + طقم مفكات",
    },
  };

  const currentPack = packLabels[packId] || packLabels.PACK1;

  // Mask phone for privacy in UI
  const maskedPhone =
    customerPhone.length === 10
      ? `${customerPhone.slice(0, 4)} •• •• ${customerPhone.slice(-2)}`
      : customerPhone;

  // 1-Click Clipboard Copy
  const copyOrderNumber = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(orderNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Client-Side Meta Pixel Purchase Tracking
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).fbq) {
      (window as any).fbq(
        "track",
        "Purchase",
        {
          currency: "DZD",
          value: total,
          content_name: currentPack.ar,
          content_ids: [packId],
        },
        {
          eventID: orderNumber, // Exact match with server CAPI for deduplication
        }
      );
    }
  }, [orderNumber, total, currentPack.ar, packId]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ── Celebratory Header ────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden text-white">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-4 animate-bounce">
          <CheckCircle2 className="w-12 h-12" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          تهانينا! تم تسجيل طلبيتك بنجاح
        </h1>
        <p className="mt-2 text-slate-300 text-sm sm:text-base leading-relaxed">
          شكراً لثقتكم في متجر <span className="text-amber-400 font-bold">ORVA STORE</span>. سنبدأ فوراً في تجهيز طردك لتسليمه في أقرب وقت.
        </p>

        {/* Tracking Number Badge */}
        <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-3 bg-slate-950/80 border border-slate-700/80 rounded-2xl px-5 py-3">
          <span className="text-xs text-slate-400 font-medium">رقم الطلبية الرسمي:</span>
          <span className="font-mono font-black text-amber-400 text-base sm:text-lg tracking-wider" dir="ltr">
            {orderNumber}
          </span>
          <button
            type="button"
            onClick={copyOrderNumber}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">تم النسخ</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الرقم</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Order Pack & Financial Summary ────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 text-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Package className="w-5 h-5 text-amber-600" />
          <h2 className="font-bold text-lg text-slate-900">تفاصيل المنتج والمبلغ</h2>
        </div>

        <div className="flex justify-between items-start gap-4">
          <div>
            <p className="font-bold text-slate-900">{currentPack.ar}</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{currentPack.items}</p>
          </div>
          <span className="font-mono font-bold text-amber-600 whitespace-nowrap">
            {subtotal.toLocaleString()} د.ج
          </span>
        </div>

        <div className="border-t border-slate-100 pt-3 space-y-2 text-sm text-slate-600">
          <div className="flex justify-between items-center">
            <span>مصاريف الشحن والتوصيل:</span>
            <span className="font-mono font-medium text-slate-800">{shipping.toLocaleString()} د.ج</span>
          </div>
          <div className="flex justify-between items-center text-base font-extrabold text-slate-900 border-t border-slate-100 pt-2">
            <span>المبلغ الإجمالي عند الاستلام (COD):</span>
            <span className="text-amber-600 text-lg font-mono">{total.toLocaleString()} د.ج</span>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600" />
          <span>لا تدفع أي دينار الآن! الدفع نقداً عند استلام الطرد ومعاينته.</span>
        </div>
      </div>

      {/* ── Delivery Destination & Dispatch Time ──────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3 text-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Truck className="w-5 h-5 text-amber-600" />
          <h2 className="font-bold text-lg text-slate-900">معلومات التوصيل</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-slate-400 text-xs block">اسم المستلم:</span>
            <span className="font-medium text-slate-800">{customerName}</span>
          </div>
          <div>
            <span className="text-slate-400 text-xs block">الهاتف:</span>
            <span className="font-mono text-slate-800" dir="ltr">
              {maskedPhone}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-xs block">الوجهة:</span>
            <span className="font-medium text-slate-800">
              ولاية {wilayaName} — بلدية {communeName}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-xs block">طريقة الاستلام:</span>
            <span className="font-medium text-slate-800">
              {isStopDesk
                ? "استلام من مكتب شركة التوصيل (Stop-Desk Bureau)"
                : "توصيل مباشر لباب المنزل (À Domicile)"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 mt-3 text-xs text-slate-700">
          <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            مدة التوصيل التقديرية: <strong>24 إلى 48 ساعة</strong> لجميع ولايات الوطن.
          </span>
        </div>
      </div>

      {/* ── Urgent Instruction Notice ─────────────────────────────────── */}
      <div className="bg-slate-900 text-white border border-slate-800 rounded-3xl p-6 shadow-lg space-y-3">
        <h3 className="font-bold text-amber-400 text-sm flex items-center gap-2">
          <PhoneCall className="w-4 h-4" />
          <span>تعليمات هامة لضمان استلام سريع:</span>
        </h3>
        <ul className="text-xs text-slate-300 space-y-2.5 leading-relaxed">
          <li className="flex items-start gap-2">
            <span className="text-amber-400 font-bold">•</span>
            <span>
              <strong>يرجى إبقاء هاتفك مفتوحاً:</strong> سيتصل بك فريق خدمة العملاء خلال ساعات لتأكيد الطلب وعنوان التسليم.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-400 font-bold">•</span>
            <span>
              <strong>المعاينة قبل الدفع:</strong> يحق لك فحص الطرد والتأكد من مطابقة الأدوات قبل تسليم المبلغ للموزع.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-400 font-bold">•</span>
            <span>
              <strong>اتصال موزع الشحن:</strong> عند وصول الطرد إلى منطقتك، سيتصل بك الموزع لتحديد توقيت التسليم المناسب لك.
            </span>
          </li>
        </ul>
      </div>

      {/* ── Customer Care & Quick Navigation Actions ──────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <a
          href="tel:0798282495"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3.5 px-6 rounded-2xl shadow-sm transition active:scale-95 text-sm"
        >
          <PhoneCall className="w-4 h-4" />
          <span>اتصال بخدمة العملاء (0798282495)</span>
        </a>

        <a
          href={`https://wa.me/213798282495?text=${encodeURIComponent(
            `السلام عليكم، بخصوص طلبيتي رقم ${orderNumber}`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 px-6 rounded-2xl shadow-sm transition active:scale-95 text-sm"
        >
          <MessageCircle className="w-4 h-4" />
          <span>مراسلة واتساب</span>
        </a>

        <Link
          href="/"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-800 font-bold py-3.5 px-6 rounded-2xl border border-slate-300 shadow-2xs transition text-sm"
        >
          <Home className="w-4 h-4" />
          <span>العودة للمتجر</span>
        </Link>
      </div>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <div className="min-h-[80vh] py-10 px-4 sm:px-6 lg:px-8">
      <Suspense
        fallback={
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="size-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <ConfirmationContent />
      </Suspense>
    </div>
  );
}
