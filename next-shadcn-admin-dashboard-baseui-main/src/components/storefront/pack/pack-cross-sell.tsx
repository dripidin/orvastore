import Image from "next/image";
import Link from "next/link";

import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react";

import type { StorefrontPack } from "@/data/storefront-packs";

export interface PackCrossSellProps {
  /** Landing data of the page being viewed (supplies heading / CTA copy). */
  currentPack: StorefrontPack;
  /** Product to recommend, taken from the live catalog. */
  targetPack: StorefrontPack | null;
  className?: string;
}

export function PackCrossSell({ currentPack, targetPack, className = "" }: PackCrossSellProps) {
  if (!targetPack) return null;

  return (
    <section className={`py-12 bg-slate-100/70 border-t border-slate-200 ${className}`} dir="rtl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-3xl border-2 border-amber-500/80 p-6 sm:p-10 shadow-xl overflow-hidden relative">
          <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Target Pack Image */}
            <div className="lg:col-span-5 relative aspect-4/3 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center p-4">
              <Image
                src={targetPack.heroImage}
                alt={targetPack.nameAr}
                fill
                sizes="(max-width: 768px) 100vw, 400px"
                className="object-contain p-2 hover:scale-105 transition-transform duration-300"
              />
              <span className="absolute top-3 right-3 bg-amber-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                {targetPack.badgeAr}
              </span>
            </div>

            {/* Target Pack Details & CTA */}
            <div className="lg:col-span-7 space-y-5 text-right">
              <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-900 border border-amber-300 rounded-full px-3 py-1 text-xs font-bold">
                <Sparkles className="size-3.5 text-amber-700" />
                <span>ننصحك أيضاً بالاطلاع على هذا العرض</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-black text-slate-900">{currentPack.crossSellHeading}</h2>

              <p className="text-sm text-slate-600 leading-relaxed">{currentPack.crossSellSubtitle}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                {targetPack.highlightsAr.slice(0, 4).map((highlight, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                    <span className="truncate">{highlight}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400 line-through">
                    {targetPack.originalPriceDzd.toLocaleString("fr-DZ")} د.ج
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900">
                    {targetPack.priceDzd.toLocaleString("fr-DZ")} د.ج
                  </div>
                  <div className="text-xs font-bold text-red-600">
                    توفير {targetPack.savingsDzd.toLocaleString("fr-DZ")} د.ج
                  </div>
                </div>

                <Link
                  href={targetPack.route}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm sm:text-base py-3.5 px-6 rounded-2xl shadow-md transition active:scale-95"
                >
                  <span>{currentPack.crossSellCtaText}</span>
                  <ArrowLeft className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
