import {
  CheckCircle2,
  Flame,
  Gauge,
  Hammer,
  HardHat,
  PackageCheck,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Wrench,
  Zap,
} from "lucide-react";

import type { PackBoxItem } from "@/data/storefront-packs";

const ICON_MAP = {
  Gauge,
  Wrench,
  RotateCcw,
  Hammer,
  Zap,
  ShieldCheck,
  Flame,
  Sliders,
  ShieldAlert,
  HardHat,
};

export interface WhatsInTheBoxProps {
  items: PackBoxItem[];
  packName: string;
  className?: string;
}

export function WhatsInTheBox({ items, packName, className = "" }: WhatsInTheBoxProps) {
  return (
    <section className={`py-12 border-t border-slate-200 ${className}`} dir="rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
          <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full px-3 py-1 text-xs font-bold">
            <PackageCheck className="size-3.5 text-amber-700" />
            <span>محتويات الطرد بالكامل — {items.length} قطع وأدوات</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900">ماذا ستجد داخل علبة {packName} عند الاستلام؟</h2>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            جميع الأدوات والمعدات الموضحة أدناه ستجدها مطابقة 100% داخل طردك، مع حق فتح الطرد وفحصها قطعة قطعة قبل تسليم
            المستحقات.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, index) => {
            const IconComponent = ICON_MAP[item.iconName] || Wrench;
            return (
              <div
                key={item.id}
                className="bg-white rounded-3xl p-6 border-2 border-slate-200 hover:border-amber-500 shadow-xs hover:shadow-lg transition-all flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  {/* Top Bar: Index & Tag */}
                  <div className="flex items-center justify-between">
                    <span className="size-8 rounded-xl bg-slate-900 text-amber-400 font-mono font-black text-xs flex items-center justify-center shadow-xs">
                      0{index + 1}
                    </span>
                    <span className="bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                      {item.tag}
                    </span>
                  </div>

                  {/* Icon & Title */}
                  <div className="flex items-start gap-3">
                    <div className="size-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                      <IconComponent className="size-6 text-slate-950" />
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-base leading-snug">{item.name}</h3>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-600 leading-relaxed">{item.desc}</p>
                </div>

                {/* Features List */}
                {item.features && item.features.length > 0 && (
                  <ul className="mt-4 pt-4 border-t border-slate-100 space-y-1.5 text-xs text-slate-700">
                    {item.features.map((feat, fIndex) => (
                      <li key={fIndex} className="flex items-center gap-2">
                        <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
