import type { Metadata } from "next";
import Link from "next/link";

import { Clock, Mail, MapPin, MessageCircle, PhoneCall } from "lucide-react";

import {
  ORVA_CANONICAL_ORIGIN,
  ORVA_CONTACT_EMAIL,
  ORVA_CONTACT_PHONE,
  ORVA_CONTACT_PHONE_DISPLAY,
  ORVA_WHATSAPP_URL,
} from "@/lib/seo/storefront-schema";

export const metadata: Metadata = {
  title: "اتصل بنا (Contact Us) | متجر أورفا ORVA Store Algeria",
  description:
    "تواصل مع خدمة زبائن متجر أورفا عبر الهاتف، البريد الإلكتروني، أو واتساب لتأكيد الطلبيات والاستفسار عن التوصيل لـ 58 ولاية.",
  alternates: {
    canonical: `${ORVA_CANONICAL_ORIGIN}/contact/`,
  },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-12 text-right sm:px-6 sm:py-16">
      <header className="space-y-3 rounded-3xl border border-slate-200 bg-white p-7 shadow-2xs sm:p-10">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
          <PhoneCall className="size-3.5" />
          خدمة الزبائن — دعم مباشر لجميع الولايات
        </span>
        <h1 className="font-black text-3xl text-slate-900 sm:text-4xl">اتصل بنا — Contact ORVA Store</h1>
        <p className="text-base leading-relaxed text-slate-600">
          فريقنا جاهز للإجابة على استفساراتكم حول المواصفات الفنية لعتاد CROWN و STARCLE PRO، تسعيرة التوصيل حسب
          الولاية، ومتابعة الطلبيات المشحونة.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <a
          href={`tel:${ORVA_CONTACT_PHONE}`}
          className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-amber-400 hover:shadow-sm"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
            <PhoneCall className="size-5" />
          </div>
          <div className="font-bold text-slate-900 text-sm">الهاتف المباشر</div>
          <div className="font-mono font-bold text-amber-700 text-sm" dir="ltr">
            {ORVA_CONTACT_PHONE_DISPLAY}
          </div>
        </a>

        <a
          href={`mailto:${ORVA_CONTACT_EMAIL}`}
          className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-amber-400 hover:shadow-sm"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <Mail className="size-5" />
          </div>
          <div className="font-bold text-slate-900 text-sm">البريد الإلكتروني</div>
          <div className="break-all font-mono font-bold text-blue-700 text-xs" dir="ltr">
            {ORVA_CONTACT_EMAIL}
          </div>
        </a>

        <a
          href={ORVA_WHATSAPP_URL}
          target="_blank"
          rel="me noopener noreferrer"
          className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-emerald-400 hover:shadow-sm"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <MessageCircle className="size-5" />
          </div>
          <div className="font-bold text-slate-900 text-sm">واتساب خدمة الزبائن</div>
          <div className="font-mono font-bold text-emerald-700 text-xs" dir="ltr">
            wa.me/213798282495
          </div>
        </a>

        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
            <Clock className="size-5" />
          </div>
          <div className="font-bold text-slate-900 text-sm">ساعات العمل والمنطقة</div>
          <div className="text-slate-600 text-xs leading-relaxed">
            السبت – الخميس: 08:30 – 20:00 (UTC+1)
            <br />
            <span className="inline-flex items-center gap-1 text-slate-500">
              <MapPin className="size-3" /> بسكرة، الجزائر (تغطية 58 ولاية)
            </span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
        <span className="text-slate-600">للاطلاع على شروط البيع وسياسة المعاينة قبل الدفع:</span>
        <div className="flex gap-3">
          <Link href="/terms/" className="font-bold text-amber-700 hover:underline">
            الشروط والأحكام (Terms)
          </Link>
          <Link href="/about/" className="font-bold text-slate-800 hover:underline">
            من نحن (About)
          </Link>
        </div>
      </div>
    </div>
  );
}
