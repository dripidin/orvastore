import { Truck, ShieldCheck, Banknote } from "lucide-react";

export function TopNoticeBar() {
  return (
    <div className="bg-slate-950 text-slate-100 border-b border-slate-800 text-xs sm:text-sm py-2 px-4 select-none">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Main notice */}
        <div className="flex items-center gap-2 mx-auto sm:mx-0 font-medium">
          <Truck className="size-4 text-amber-400 shrink-0 animate-pulse" />
          <span>توصيل سريع 24-48 ساعة لـ 58 ولاية | الدفع عند الاستلام</span>
          <span className="hidden md:inline-block text-slate-400">•</span>
          <span className="hidden md:inline-block text-amber-400 font-semibold">التوصيل لجميع الولايات.</span>
        </div>

        {/* Secondary trust badges (visible on desktop) */}
        <div className="hidden lg:flex items-center gap-4 text-slate-300 text-xs">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-400" />
            <span>المعاينة قبل الدفع</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Banknote className="size-3.5 text-amber-400" />
            <span>0 د.ج تسبيق مالي</span>
          </div>
        </div>
      </div>
    </div>
  );
}
