import Link from "next/link";
import { Wrench, PhoneCall, Truck, ShieldCheck, MapPin } from "lucide-react";
import { PhoneBadge } from "./phone-badge";

export function StorefrontFooter() {
  return (
    <footer className="bg-slate-950 text-slate-300 border-t border-slate-800 pt-12 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Col 1: Brand & Slogan */}
          <div className="space-y-4 md:col-span-2">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white shadow-md">
                <Wrench className="size-5" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-black text-2xl text-amber-500 tracking-tight">ORVA</span>
                <span className="font-black text-2xl text-white tracking-tight">STORE</span>
              </div>
            </div>

            <p className="text-amber-400 font-bold text-lg">
              &ldquo;الباك ما يتعاودش فيه كل لي تحتاجو&rdquo;
            </p>

            <p className="text-slate-400 text-sm leading-relaxed max-w-md">
              متجر أورفا DZ هو وجهتك الموثوقة للحصول على باقات أدوات وعتاد الصيانة الأصلية من كراون
              (CROWN) وستاركل برو (STARCLE PRO) بأفضل الأسعار وضمان المعاينة قبل الدفع.
            </p>

            <div className="pt-2">
              <PhoneBadge phone="0798282495" />
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div className="space-y-3">
            <h4 className="text-white font-bold text-sm tracking-wide">باقات العتاد المتوفرة</h4>
            <ul className="space-y-2 text-xs text-slate-400">
              <li>
                <Link href="/pack1" className="hover:text-amber-400 transition">
                  باك كومبريسار و المفاتيح 4 في 1 (4,950 د.ج)
                </Link>
              </li>
              <li>
                <Link href="/pack2" className="hover:text-amber-400 transition">
                  باك الفيسوز كراون Elite 5 في 1 (12,950 د.ج)
                </Link>
              </li>
              <li>
                <Link href="/pack3" className="hover:text-amber-400 transition">
                  باك سودير كراون MMA-200 Mini (15,950 د.ج)
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:text-amber-400 transition">
                  الكتالوج الكامل للمتجر
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Delivery & Reassurance */}
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
        <div className="pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
          جميع الحقوق محفوظة © 2026 ORVA Store DZ
        </div>
      </div>
    </footer>
  );
}
