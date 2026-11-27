"use client";

import React from "react";
import { Building2, CheckCircle2, Info, MapPin, Sparkles, Truck } from "lucide-react";

/**
 * Adobe Illustrator-style flat/editorial vector artwork for Home Delivery (À Domicile).
 */
export function HomeDeliveryIllustration({ className = "w-20 h-16 shrink-0" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="orvaHomeBg" x1="12" y1="8" x2="108" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FEF3C7" />
          <stop offset="100%" stopColor="#FDE68A" stopOpacity="0.65" />
        </linearGradient>
        <linearGradient id="orvaRoof" x1="38" y1="16" x2="96" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
        <linearGradient id="orvaVan" x1="12" y1="48" x2="62" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
      </defs>

      {/* Organic Illustrator Backdrop Blob */}
      <path
        d="M22 24C34 9 68 6 91 17C112 27 115 58 102 74C88 90 42 91 20 79C3 70 8 41 22 24Z"
        fill="url(#orvaHomeBg)"
      />

      {/* Ground shadow */}
      <ellipse cx="62" cy="80" rx="46" ry="5" fill="#CBD5E1" fillOpacity="0.55" />

      {/* House Body */}
      <rect x="52" y="38" width="46" height="40" rx="5" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.2" />
      {/* House Door */}
      <rect x="69" y="54" width="13" height="24" rx="2.5" fill="#F59E0B" stroke="#1E293B" strokeWidth="1.8" />
      <circle cx="79" cy="66" r="1.4" fill="#0F172A" />
      {/* House Window */}
      <rect x="57" y="47" width="8" height="8" rx="1.8" fill="#BAE6FD" stroke="#1E293B" strokeWidth="1.6" />
      <rect x="86" y="47" width="8" height="8" rx="1.8" fill="#BAE6FD" stroke="#1E293B" strokeWidth="1.6" />
      {/* House Roof */}
      <path
        d="M46 41L75 18L104 41H46Z"
        fill="url(#orvaRoof)"
        stroke="#1E293B"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Chimney */}
      <rect x="85" y="21" width="7" height="11" rx="1.5" fill="#FBBF24" stroke="#1E293B" strokeWidth="1.8" />

      {/* Delivery Van */}
      <path
        d="M14 55C14 51.7 16.7 49 20 49H44C46.2 49 48 50.8 48 53V74H14V55Z"
        fill="url(#orvaVan)"
        stroke="#0F172A"
        strokeWidth="2"
      />
      <path
        d="M48 56H57.5C59.3 56 60.9 57.1 61.5 58.8L64 65.5V74H48V56Z"
        fill="#F59E0B"
        stroke="#0F172A"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Van Windshield */}
      <path d="M51 59H57.2L59.4 64.5H51V59Z" fill="#E0F2FE" stroke="#0F172A" strokeWidth="1.4" />
      {/* ORVA Parcel Accent on Van */}
      <rect x="21" y="55" width="18" height="11" rx="2.5" fill="#FBBF24" />
      <path d="M25 60.5H35" stroke="#0F172A" strokeWidth="1.8" strokeLinecap="round" />

      {/* Wheels */}
      <circle cx="25" cy="75" r="5.5" fill="#1E293B" stroke="#FFFFFF" strokeWidth="1.8" />
      <circle cx="25" cy="75" r="2" fill="#F59E0B" />
      <circle cx="55" cy="75" r="5.5" fill="#1E293B" stroke="#FFFFFF" strokeWidth="1.8" />
      <circle cx="55" cy="75" r="2" fill="#F59E0B" />

      {/* Motion Lines */}
      <path d="M6 56H11" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M4 62H10" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" />

      {/* Floating Sparkle */}
      <circle cx="26" cy="30" r="3" fill="#10B981" />
      <circle cx="102" cy="24" r="2.2" fill="#F59E0B" />
    </svg>
  );
}

/**
 * Adobe Illustrator-style flat/editorial vector artwork for Stop-Desk Office Pickup.
 */
export function StopDeskIllustration({ className = "w-20 h-16 shrink-0" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="orvaDeskBg" x1="10" y1="10" x2="110" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D1FAE5" />
          <stop offset="100%" stopColor="#E0F2FE" />
        </linearGradient>
        <linearGradient id="orvaPin" x1="78" y1="14" x2="104" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>

      {/* Organic Illustrator Backdrop Blob */}
      <path
        d="M19 28C32 10 66 7 92 18C113 28 114 60 99 75C83 91 39 90 19 77C3 67 6 46 19 28Z"
        fill="url(#orvaDeskBg)"
      />

      {/* Ground shadow */}
      <ellipse cx="58" cy="80" rx="44" ry="5" fill="#CBD5E1" fillOpacity="0.55" />

      {/* Pickup Hub Building */}
      <rect x="24" y="35" width="58" height="43" rx="5" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2.2" />

      {/* Striped Awning */}
      <path
        d="M20 35C20 31.7 22.7 29 26 29H80C83.3 29 86 31.7 86 35V41H20V35Z"
        fill="#0F172A"
        stroke="#0F172A"
        strokeWidth="2"
      />
      <rect x="27" y="31" width="9" height="8" rx="1.5" fill="#F59E0B" />
      <rect x="48" y="31" width="9" height="8" rx="1.5" fill="#F59E0B" />
      <rect x="69" y="31" width="9" height="8" rx="1.5" fill="#F59E0B" />

      {/* Desk Counter Window */}
      <rect x="31" y="47" width="28" height="17" rx="3" fill="#F1F5F9" stroke="#0F172A" strokeWidth="1.8" />
      {/* Ready Parcel on Counter */}
      <rect x="37" y="51" width="15" height="12" rx="2" fill="#FBBF24" stroke="#0F172A" strokeWidth="1.6" />
      <path d="M44.5 51V63" stroke="#0F172A" strokeWidth="1.5" />
      <path d="M37 56H52" stroke="#0F172A" strokeWidth="1.5" />

      {/* Glass Door */}
      <rect x="64" y="47" width="12" height="31" rx="2" fill="#BAE6FD" stroke="#0F172A" strokeWidth="1.8" />
      <path d="M67 62V66" stroke="#0F172A" strokeWidth="1.8" strokeLinecap="round" />

      {/* Location Map Pin */}
      <path
        d="M90 15C82.8 15 77 20.8 77 28C77 37.2 90 50 90 50C90 50 103 37.2 103 28C103 20.8 97.2 15 90 15Z"
        fill="url(#orvaPin)"
        stroke="#0F172A"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <circle cx="90" cy="27.5" r="5" fill="#FFFFFF" />
      <path d="M88 27.5L89.6 29.1L92.5 26" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Illustrator-style illustration for when a commune HAS a dedicated pickup office.
 */
export function OfficeAvailableIllustration({ className = "w-16 h-16 shrink-0" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="48" cy="48" r="42" fill="#D1FAE5" fillOpacity="0.85" />
      <ellipse cx="48" cy="77" rx="30" ry="4.5" fill="#6EE7B7" fillOpacity="0.6" />
      {/* Mini Pickup Hub */}
      <rect x="24" y="38" width="48" height="36" rx="6" fill="#FFFFFF" stroke="#065F46" strokeWidth="2.2" />
      <path d="M21 39C21 34.6 24.6 31 29 31H67C71.4 31 75 34.6 75 39V43H21V39Z" fill="#059669" stroke="#065F46" strokeWidth="2" />
      {/* Parcel Box */}
      <rect x="34" y="49" width="28" height="19" rx="3" fill="#FDE68A" stroke="#065F46" strokeWidth="1.8" />
      <path d="M48 49V68" stroke="#065F46" strokeWidth="1.6" />
      {/* Floating Check Badge */}
      <circle cx="69" cy="27" r="12" fill="#10B981" stroke="#FFFFFF" strokeWidth="2.5" />
      <path d="M64 27.5L67.5 31L74.5 23.5" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Illustrator-style route illustration explaining that the selected commune has no local pickup office,
 * showing the smooth path to either Home Delivery or the Wilaya's central pickup hub.
 */
export function NoLocalOfficeRouteIllustration({ className = "w-16 h-16 shrink-0" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="48" cy="48" r="42" fill="#FEF3C7" fillOpacity="0.9" />
      {/* Curved Route Path */}
      <path
        d="M23 64C28 45 48 44 68 35"
        stroke="#D97706"
        strokeWidth="2.4"
        strokeDasharray="4 4"
        strokeLinecap="round"
      />
      {/* Commune Home Dot (Left/Bottom) */}
      <circle cx="23" cy="64" r="10" fill="#FFFFFF" stroke="#D97706" strokeWidth="2.2" />
      <path d="M18 65L23 60L28 65V69H18V65Z" fill="#F59E0B" />
      {/* Wilaya Central Hub (Right/Top) */}
      <rect x="54" y="21" width="26" height="24" rx="4.5" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2" />
      <path d="M52 24C52 21.8 53.8 20 56 20H78C80.2 20 82 21.8 82 24V27H52V24Z" fill="#0F172A" />
      <rect x="61" y="32" width="12" height="13" rx="1.5" fill="#FBBF24" stroke="#0F172A" strokeWidth="1.5" />
      {/* Info Pill Badge */}
      <circle cx="72" cy="66" r="11" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="2.2" />
      <path d="M72 61.5V67" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="72" cy="71" r="1.4" fill="#FFFFFF" />
    </svg>
  );
}

export interface CommuneOfficeStatusBannerProps {
  communeName: string;
  wilayaName: string;
  communeHasOffice: boolean | null;
  status: "loading" | "ready" | "unknown";
  offices: Array<{ ar: string; fr: string }>;
  selectedDeliveryType: "DOMICILE" | "STOP_DESK";
  onSelectDeliveryType?: (mode: "DOMICILE" | "STOP_DESK") => void;
  compact?: boolean;
}

/**
 * Illustrator-styled interactive notice clarifying whether the chosen commune has a local pickup
 * office or routes Stop-Desk via the wilaya's main office, while keeping both modes easy to pick.
 */
export function CommuneOfficeStatusBanner({
  communeName,
  wilayaName,
  communeHasOffice,
  status,
  offices,
  selectedDeliveryType,
  onSelectDeliveryType,
  compact = false,
}: CommuneOfficeStatusBannerProps) {
  if (!communeName) return null;

  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600">
        <span className="size-8 rounded-xl bg-slate-200/80 animate-pulse shrink-0" />
        <div className="space-y-0.5">
          <div className="font-bold text-slate-800">جارٍ التحقق من مكاتب الاستلام في بلدية {communeName}...</div>
          <div className="text-[11px] text-slate-500">كلا خيارَي التوصيل للمنزل والاستلام من المكتب متاحان للاختيار.</div>
        </div>
      </div>
    );
  }

  if (communeHasOffice === true) {
    return (
      <div
        className={`rounded-2xl border border-emerald-200 bg-gradient-to-l from-emerald-50/90 via-teal-50/40 to-white ${
          compact ? "p-3" : "p-3.5 sm:p-4"
        } shadow-2xs transition-all`}
      >
        <div className="flex items-start gap-3">
          <OfficeAvailableIllustration className={compact ? "w-12 h-12 shrink-0" : "w-14 h-14 sm:w-16 sm:h-16 shrink-0"} />
          <div className="min-w-0 flex-1 space-y-1.5 text-right">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs">
                <CheckCircle2 className="size-3" />
                <span>مكتب استلام متوفر في بلديتك</span>
              </span>
              <span className="text-xs font-extrabold text-emerald-950">بلدية {communeName}</span>
            </div>
            <p className="text-xs leading-relaxed text-emerald-900/90">
              تتوفر بلدية <strong>{communeName}</strong> على مكتب استلام مباشر. يمكنك اختيار{" "}
              <strong>الاستلام من المكتب (Stop-Desk)</strong> بسعر أقل أو <strong>التوصيل لباب المنزل</strong> بكل
              سلاسة.
            </p>
            {onSelectDeliveryType && selectedDeliveryType !== "STOP_DESK" && (
              <button
                type="button"
                onClick={() => onSelectDeliveryType("STOP_DESK")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-300 px-2.5 py-1 text-[11px] font-bold text-emerald-800 transition cursor-pointer"
              >
                <Building2 className="size-3.5" />
                <span>اختر الاستلام من مكتب {communeName}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fallback / No local office in selected commune (`communeHasOffice === false` or `unknown`)
  const hasAnyWilayaOffice = offices.length > 0;
  return (
    <div
      className={`rounded-2xl border border-amber-200/90 bg-gradient-to-l from-amber-50/90 via-orange-50/40 to-white ${
        compact ? "p-3" : "p-3.5 sm:p-4"
      } shadow-2xs transition-all`}
    >
      <div className="flex items-start gap-3">
        <NoLocalOfficeRouteIllustration
          className={compact ? "w-12 h-12 shrink-0" : "w-14 h-14 sm:w-16 sm:h-16 shrink-0"}
        />
        <div className="min-w-0 flex-1 space-y-2 text-right">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-300 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
              <Info className="size-3 text-amber-700" />
              <span>
                {communeHasOffice === false
                  ? "لا يوجد مكتب استلام داخل هذه البلدية"
                  : "التوصيل للمنزل والمكتب متاحان"}
              </span>
            </span>
            <span className="text-xs font-extrabold text-slate-900">بلدية {communeName}</span>
          </div>

          <p className="text-xs leading-relaxed text-slate-700">
            {communeHasOffice === false ? (
              <>
                لا يتواجد مكتب استلام داخل بلدية <strong>{communeName}</strong> حالياً. يمكنك اختيار{" "}
                <strong>التوصيل لباب المنزل</strong> مباشرة، أو اختيار <strong>الاستلام من المكتب</strong> لتوجيه
                طردك إلى أقرب مكتب رئيسي في ولاية <strong>{wilayaName}</strong> بكل سهولة.
              </>
            ) : (
              <>
                يمكنك اختيار <strong>التوصيل لباب المنزل</strong> أو <strong>الاستلام من المكتب</strong> في ولاية{" "}
                <strong>{wilayaName}</strong>، وسيؤكد معك فريقنا تفاصيل الاستلام قبل الشحن.
              </>
            )}
          </p>

          {hasAnyWilayaOffice && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900">
                <MapPin className="size-3 text-amber-600" />
                <span>المكاتب المتوفرة في ولاية {wilayaName}:</span>
              </span>
              {offices.slice(0, 6).map((o) => (
                <span
                  key={`${o.ar}-${o.fr}`}
                  className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                >
                  {o.ar}
                </span>
              ))}
              {offices.length > 6 && (
                <span className="text-[10px] font-semibold text-amber-800">+{offices.length - 6} أخرى</span>
              )}
            </div>
          )}

          {onSelectDeliveryType && (
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {selectedDeliveryType !== "DOMICILE" && (
                <button
                  type="button"
                  onClick={() => onSelectDeliveryType("DOMICILE")}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 text-white hover:bg-slate-800 px-2.5 py-1 text-[11px] font-bold transition cursor-pointer"
                >
                  <Truck className="size-3" />
                  <span>تحويل للتوصيل للمنزل</span>
                </button>
              )}
              {selectedDeliveryType !== "STOP_DESK" && (
                <button
                  type="button"
                  onClick={() => onSelectDeliveryType("STOP_DESK")}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-300 px-2.5 py-1 text-[11px] font-bold text-amber-950 transition cursor-pointer"
                >
                  <Sparkles className="size-3 text-amber-700" />
                  <span>اختر الاستلام من المكتب الرئيسي</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
