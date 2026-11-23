import Link from "next/link";

import { ArrowLeft, BadgeCheck, Headphones, MapPin, ShieldCheck, Truck } from "lucide-react";
import type { Metadata } from "next";

import {
  ORVA_CANONICAL_ORIGIN,
  ORVA_CONTACT_EMAIL,
  ORVA_CONTACT_PHONE,
  ORVA_CONTACT_PHONE_DISPLAY,
  ORVA_WHATSAPP_URL,
} from "@/lib/seo/storefront-schema";

export const metadata: Metadata = {
  title: "من نحن (About Us) | متجر أورفا ORVA Store Algeria",
  description:
    "تعرّف على متجر أورفا ORVA Store DZ المتخصص في توفير باقات وعتاد الصيانة الأصلي من CROWN و STARCLE PRO مع الدفع عند الاستلام عبر 69 ولاية جزائرية.",
  alternates: {
    canonical: `${ORVA_CANONICAL_ORIGIN}/about/`,
  },
};

const PILLARS = [
  {
    icon: BadgeCheck,
    title: "عتاد أصلي مباشر من المصدر",
    desc: "نوفّر معدات CROWN و STARCLE PRO الأصلية مباشرة للورشات والحرفيين دون هوامش الوسطاء.",
  },
  {
    icon: ShieldCheck,
    title: "حق المعاينة قبل الدفع",
    desc: "يمكن للزبون فتح الطرد والتحقق من جميع القطع والمواصفات يداً بيد قبل تسليم أي مبلغ.",
  },
  {
    icon: Truck,
    title: "توصيل سريع عبر 69 ولاية",
    desc: "شحن موثوق إلى باب المنزل أو مكتب التوصيل (Stop Desk) خلال 24–48 ساعة للشمال والهضاب و48–72 ساعة للجنوب.",
  },
  {
    icon: Headphones,
    title: "تأكيد ومتابعة هاتفية مستمرة",
    desc: "يتواصل فريقنا هاتفياً مع كل زبون لتأكيد الطلب وضمان وصول الشحنة بأعلى جودة.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 px-4 py-12 text-right sm:px-6 sm:py-16">
      <header className="space-y-4 rounded-3xl border border-slate-200 bg-white p-7 shadow-2xs sm:p-10">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
          <MapPin className="size-3.5" />
          متجر أورفا الجزائر — ORVA Store DZ
        </span>
        <h1 className="font-black text-3xl text-slate-900 sm:text-4xl">من نحن — ORVA Store Algeria</h1>
        <p className="text-base leading-relaxed text-slate-600">
          متجر <strong>ORVA Store Algeria</strong> هو متجر إلكتروني جزائري متخصص في تجهيزات الورشة، معدات التلحيم،
          والأدوات الكهربائية واليدوية الأصلية من علامتي <strong>CROWN</strong> و <strong>STARCLE PRO</strong>. نعمل على
          تسهيل حصول الحرفيين وأصحاب الورشات في كل ولايات الوطن الـ 58 على عتاد عملي وموثوق بسعر شفاف ودفع عند الاستلام
          مع حق المعاينة.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {PILLARS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <Icon className="size-5" />
            </div>
            <h2 className="font-black text-lg text-slate-900">{title}</h2>
            <p className="text-sm leading-relaxed text-slate-600">{desc}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-7 text-white sm:flex-row sm:items-center sm:p-9">
        <div className="space-y-2">
          <h2 className="font-black text-xl">تصفح العروض أو تواصل مع فريقنا</h2>
          <p className="text-sm text-slate-300">
            الهاتف:{" "}
            <a
              href={`tel:${ORVA_CONTACT_PHONE}`}
              className="font-mono font-bold text-amber-400 hover:underline"
              dir="ltr"
            >
              {ORVA_CONTACT_PHONE_DISPLAY}
            </a>{" "}
            • البريد:{" "}
            <a
              href={`mailto:${ORVA_CONTACT_EMAIL}`}
              className="font-mono font-bold text-amber-400 hover:underline"
              dir="ltr"
            >
              {ORVA_CONTACT_EMAIL}
            </a>
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/shop/"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-black text-sm text-slate-950 transition hover:bg-amber-400"
          >
            <span>كل المنتجات</span>
            <ArrowLeft className="size-4" />
          </Link>
          <a
            href={ORVA_WHATSAPP_URL}
            target="_blank"
            rel="me noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 font-bold text-sm text-white transition hover:bg-white/10"
          >
            واتساب
          </a>
        </div>
      </section>
    </div>
  );
}
