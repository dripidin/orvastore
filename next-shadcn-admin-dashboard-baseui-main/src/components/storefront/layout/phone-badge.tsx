import { PhoneCall } from "lucide-react";

interface PhoneBadgeProps {
  phone?: string;
  className?: string;
}

export function PhoneBadge({ phone = "0798282495", className = "" }: PhoneBadgeProps) {
  // Uses explicit LTR isolation (\u202A ... \u202C) and <bdi> to ensure correct RTL rendering
  return (
    <a
      href={`tel:${phone}`}
      className={`group inline-flex items-center gap-2 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-950 border border-amber-300/60 px-3.5 py-1.5 text-xs sm:text-sm font-bold transition-all shadow-2xs hover:shadow-sm active:scale-95 ${className}`}
      title="اتصل بخدمة الزبائن مباشرة"
    >
      <span className="relative flex size-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full size-2 bg-emerald-500" />
      </span>
      <PhoneCall className="size-3.5 sm:size-4 text-amber-700 group-hover:scale-110 transition-transform" />
      <span>{`خدمة الزبائن: \u202A${phone}\u202C`}</span>
    </a>
  );
}
