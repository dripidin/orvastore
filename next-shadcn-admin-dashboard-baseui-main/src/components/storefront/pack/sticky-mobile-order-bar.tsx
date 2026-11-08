"use client";

import { ChevronUp, ShoppingBag } from "lucide-react";

export interface StickyMobileOrderBarProps {
  priceDzd: number;
  originalPriceDzd: number;
  packName: string;
}

export function StickyMobileOrderBar({ priceDzd, originalPriceDzd, packName }: StickyMobileOrderBarProps) {
  const handleScrollToForm = () => {
    const formElement = document.getElementById("order-form-container") || document.getElementById("order-form");
    if (formElement) {
      formElement.scrollIntoView({ behavior: "smooth", block: "start" });
      const firstInput = formElement.querySelector<HTMLInputElement>('input[type="text"]');
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 500);
      }
    }
  };

  return (
    <aside
      aria-label={`شريط الطلب السريع لـ ${packName}`}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 shadow-xl"
      dir="rtl"
    >
      <div className="max-w-md mx-auto flex items-center justify-between gap-3">
        {/* Price Column */}
        <div className="text-right shrink-0">
          <div className="text-[10px] text-amber-700 font-bold">الدفع عند الاستلام 📦</div>
          <div className="text-lg font-black text-slate-900 leading-tight">
            {priceDzd.toLocaleString("fr-DZ")} <span className="text-xs text-amber-600">د.ج</span>
          </div>
          <div className="text-[10px] text-slate-400 line-through">{originalPriceDzd.toLocaleString("fr-DZ")} د.ج</div>
        </div>

        {/* CTA Button */}
        <button
          type="button"
          onClick={handleScrollToForm}
          className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-sm py-3 px-4 rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition cursor-pointer"
        >
          <ShoppingBag className="size-4 shrink-0" />
          <span>اطلب الآن (الدفع عند الاستلام)</span>
          <ChevronUp className="size-4 shrink-0" />
        </button>
      </div>
    </aside>
  );
}
