import Link from "next/link";
import { PhoneCall, Truck, ShieldCheck, MapPin, Mail } from "lucide-react";
import { formatDzd, type NavProduct } from "@/lib/catalog/types";
import { ORVA_CONTACT_EMAIL, ORVA_CONTACT_PHONE, ORVA_CONTACT_PHONE_DISPLAY, ORVA_WHATSAPP_URL } from "@/lib/seo/storefront-schema";
import { normalizeStoreLogoUrl } from "@/lib/settings/settings-store";
import { PhoneBadge } from "./phone-badge";

export function StorefrontFooter({
  products = [],
  logoUrl,
}: {
  products?: NavProduct[];
  logoUrl?: string;
}) {
  const activeLogoUrl = normalizeStoreLogoUrl(logoUrl);
  return (
    <footer className="bg-slate-950 text-slate-300 border-t border-slate-800 pt-12 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Col 1: Brand & Contact Links */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeLogoUrl}
                alt="ORVA Store Algeria"
                width={48}
                height={48}
                className="size-12 rounded-full object-contain shrink-0 drop-shadow-md"
              />
              <div className="flex items-baseline gap-1">
                <span className="font-black text-2xl text-amber-500 tracking-tight">ORVA</span>
                <span className="font-black text-2xl text-white tracking-tight">STORE</span>
              </div>
            </div>

            <p className="text-amber-400 font-bold text-base">
              &ldquo;الباك ما يتعاودش فيه كل لي تحتاجو&rdquo;
            </p>

            <p className="text-slate-400 text-xs leading-relaxed">
              متجر أورفا DZ هو وجهتك الموثوقة للحصول على باقات أدوات وعتاد الصيانة الأصلية من كراون
              (CROWN) وستاركل برو (STARCLE PRO) بأفضل الأسعار وضمان المعاينة قبل الدفع.
            </p>

            <div className="space-y-2 pt-1 text-xs">
              <PhoneBadge phone="0798282495" />
              <div className="flex flex-col gap-1.5 pt-1 text-slate-300">
                <a
                  href={`tel:${ORVA_CONTACT_PHONE}`}
                  className="inline-flex items-center gap-2 hover:text-amber-400 transition font-mono"
                  dir="ltr"
                >
                  <PhoneCall className="size-3.5 text-amber-400 shrink-0" />
                  <span>{ORVA_CONTACT_PHONE_DISPLAY}</span>
                </a>
                <a
                  href={`mailto:${ORVA_CONTACT_EMAIL}`}
                  className="inline-flex items-center gap-2 hover:text-amber-400 transition font-mono"
                  dir="ltr"
                >
                  <Mail className="size-3.5 text-amber-400 shrink-0" />
                  <span>{ORVA_CONTACT_EMAIL}</span>
                </a>
                <a
                  href={ORVA_WHATSAPP_URL}
                  target="_blank"
                  rel="me noopener noreferrer"
                  className="inline-flex items-center gap-2 text-emerald-400 hover:underline transition"
                >
                  <span>واتساب خدمة الزبائن</span>
                </a>
              </div>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div className="space-y-3">
            <h4 className="text-white font-bold text-sm tracking-wide">باقات العتاد المتوفرة</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              {products.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link href={p.route} className="hover:text-amber-400 transition">
                    {p.title} ({formatDzd(p.priceDzd)})
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/shop/" className="hover:text-amber-400 transition">
                  الكتالوج الكامل للمتجر
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: About, Contact & Legal */}
          <div className="space-y-3">
            <h4 className="text-white font-bold text-sm tracking-wide">معلومات المتجر والسياسات</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link href="/about/" className="hover:text-amber-400 transition">
                  من نحن (About Us)
                </Link>
              </li>
              <li>
                <Link href="/contact/" className="hover:text-amber-400 transition">
                  اتصل بنا (Contact Us)
                </Link>
              </li>
              <li>
                <Link href="/terms/" className="hover:text-amber-400 transition">
                  الشروط والأحكام وسياسة الخصوصية (Terms)
                </Link>
              </li>
              <li>
                <a href="/llms.txt" className="hover:text-amber-400 transition font-mono">
                  llms.txt
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Delivery & Reassurance */}
          <div className="space-y-3">
            <h4 className="text-white font-bold text-sm tracking-wide">التغطية والضمان</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex items-center gap-2">
                <MapPin className="size-3.5 text-amber-400 shrink-0" />
                <span>توصيل سريع لكافة 58 ولاية جزائرية</span>
              </li>
              <li className="flex items-center gap-2">
                <Truck className="size-3.5 text-amber-400 shrink-0" />
                <span>شحن خلال 24 إلى 48 ساعة فقط</span>
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-3.5 text-emerald-400 shrink-0" />
                <span>المعاينة قبل الدفع يداً بيد</span>
              </li>
              <li className="flex items-center gap-2">
                <PhoneCall className="size-3.5 text-amber-400 shrink-0" />
                <span>تأكيد هاتفي مباشر لجميع الطلبيات</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>جميع الحقوق محفوظة © 2026 ORVA Store DZ</span>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/about/" className="hover:text-slate-300 transition">من نحن</Link>
            <Link href="/contact/" className="hover:text-slate-300 transition">اتصل بنا</Link>
            <Link href="/terms/" className="hover:text-slate-300 transition">الشروط والأحكام</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
