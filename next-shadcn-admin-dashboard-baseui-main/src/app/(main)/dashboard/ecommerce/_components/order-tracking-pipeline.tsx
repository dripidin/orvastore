"use client";

import * as React from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  MapPin,
  Package,
  RotateCcw,
  Truck,
  Warehouse,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface TrackingPipelineProps {
  status?: string | null;
  statusAr?: string | null;
  currentStation?: string | null;
  activity?: Array<{
    date: string;
    time: string;
    status: string;
    statusAr?: string;
    station?: string;
    details?: string;
  }>;
  financialStatus?: string | null;
}

interface StepDefinition {
  id: string;
  keys: string[];
  labelFr: string;
  labelAr: string;
  icon: React.ComponentType<{ className?: string }>;
  rank: number;
}

const PIPELINE_STEPS: StepDefinition[] = [
  {
    id: "step_prete",
    keys: ["prete_a_expedier", "order_information_received_by_carrier", "notification_on_order"],
    labelFr: "Prêt à expédier",
    labelAr: "جاهز للإرسال",
    icon: Package,
    rank: 1,
  },
  {
    id: "step_ramassage",
    keys: ["en_ramassage", "picked"],
    labelFr: "En ramassage",
    labelAr: "قيد الاستلام من المتجر",
    icon: Truck,
    rank: 2,
  },
  {
    id: "step_vers_station",
    keys: ["vers_hub", "accepted_by_carrier"],
    labelFr: "Vers Station",
    labelAr: "في الطريق إلى المحطة",
    icon: Warehouse,
    rank: 3,
  },
  {
    id: "step_en_station",
    keys: ["en_hub", "hub"],
    labelFr: "En Station",
    labelAr: "في محطة التوزيع",
    icon: Building2,
    rank: 4,
  },
  {
    id: "step_vers_wilaya",
    keys: ["vers_wilaya"],
    labelFr: "Vers Wilaya",
    labelAr: "في الطريق إلى الولاية",
    icon: MapPin,
    rank: 5,
  },
  {
    id: "step_preparation",
    keys: ["en_preparation", "en_preparation_stock"],
    labelFr: "En préparation",
    labelAr: "قيد التحضير للتوزيع",
    icon: Clock,
    rank: 6,
  },
  {
    id: "step_livraison",
    keys: ["en_livraison", "dispatched_to_driver"],
    labelFr: "En livraison",
    labelAr: "قيد التوصيل للزبون",
    icon: Truck,
    rank: 7,
  },
  {
    id: "step_livree",
    keys: [
      "livred",
      "livre",
      "livre_non_encaisse",
      "encaisse_non_paye",
      "encaissed",
      "paiements_prets",
      "paye_et_archive",
      "payed",
    ],
    labelFr: "Livrée",
    labelAr: "تم التسليم بنجاح",
    icon: CheckCircle2,
    rank: 8,
  },
];

// Financial sub-statuses for delivered parcels
function resolveFinancialMeta(statusCode: string) {
  const code = statusCode.toLowerCase();
  if (code === "livre_non_encaisse") {
    return {
      stage: "non_encaisse",
      title: "Non encaissé (غير محصل بعد)",
      description: "تم تسليم الطرد للزبون بنجاح وفي انتظار تسجيل المبالغ في خزينة الموزع.",
      badgeColor: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
    };
  }
  if (code === "encaisse_non_paye" || code === "encaissed") {
    return {
      stage: "encaisse_non_paye",
      title: "Livrés - Encaissés non payés (محصل غير مدفوع)",
      description: "تم تحصيل المبلغ المالي من الزبون، في انتظار تسويته مع التاجر في دورة الدفع القادمة.",
      badgeColor: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    };
  }
  if (code === "paiements_prets") {
    return {
      stage: "paiements_prets",
      title: "Paiements prêts (المستحقات جاهزة للدفع)",
      description: "تم تجهيز كشف الحساب ومستحقات الشحنة جاهزة للتحويل المالي فوراً.",
      badgeColor: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    };
  }
  if (code === "paye_et_archive" || code === "payed") {
    return {
      stage: "paye_et_archive",
      title: "Historique paiements reçus (تم تحويل المستحقات)",
      description: "تم استلام المستحقات المالية وتحويلها وأرشفة الشحنة رسمياً في الحساب.",
      badgeColor: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
    };
  }
  return null;
}

export function OrderTrackingPipeline({
  status,
  statusAr,
  currentStation,
  activity = [],
}: TrackingPipelineProps) {
  const normalizedStatus = (status || "").toLowerCase();

  // Determine current active rank
  let currentRank = 1;
  const isSuspended =
    normalizedStatus === "suspendu" ||
    normalizedStatus === "attempt_delivery" ||
    normalizedStatus.includes("suspend");

  const isReturned =
    normalizedStatus.includes("retour") ||
    normalizedStatus === "return_asked" ||
    normalizedStatus === "return_in_transit" ||
    normalizedStatus === "return_received";

  for (const step of PIPELINE_STEPS) {
    if (step.keys.includes(normalizedStatus)) {
      currentRank = step.rank;
      break;
    }
  }

  // If in activity history, find highest attained rank
  for (const act of activity) {
    const actCode = (act.status || "").toLowerCase();
    for (const step of PIPELINE_STEPS) {
      if (step.keys.includes(actCode) && step.rank > currentRank && !isReturned) {
        currentRank = step.rank;
      }
    }
  }

  const financialMeta = resolveFinancialMeta(normalizedStatus);

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 shadow-2xs text-right" dir="rtl">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-2">
          <Truck className="size-4 text-primary" />
          <span className="text-xs font-bold text-foreground">
            خط تتبع الشحنة مع Redex (EcoTrack Tracking Pipeline)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {currentStation && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <MapPin className="size-3 text-purple-600" />
              <span>المحطة: <strong>{currentStation}</strong></span>
            </span>
          )}
          <Badge
            variant="outline"
            className={`text-xs font-semibold ${
              isSuspended
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                : isReturned
                ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30"
                : currentRank >= 8
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                : "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30"
            }`}
          >
            {statusAr || status || "قيد المعالجة لدى الناقل"}
          </Badge>
        </div>
      </div>

      {/* Suspended Alert Banner */}
      {isSuspended && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <div className="space-y-0.5">
            <span className="font-bold">الشحنة معلقة (Suspendus):</span>
            <p className="text-[11px] opacity-90">
              تم تسجيل محاولة تسليم أو تعليق الشحنة لدى الموزع. يرجى الاتصال بالزبون للتنسيق والمتابعة.
            </p>
          </div>
        </div>
      )}

      {/* Returned Alert Banner */}
      {isReturned && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-800 dark:text-red-300">
          <RotateCcw className="size-4 shrink-0 text-red-600" />
          <div className="space-y-0.5">
            <span className="font-bold">شحنة مرتجعة (Retours en cours / Reçus):</span>
            <p className="text-[11px] opacity-90">
              الشحنة في مسار الإرجاع إلى المستودع الرئيسي أو تم استلامها كطرد مرتجع.
            </p>
          </div>
        </div>
      )}

      {/* Horizontal Visual Pipeline Stepper (Desktop / Tablet) */}
      <div className="relative py-2 hidden sm:block">
        <div className="grid grid-cols-8 gap-1 relative z-10">
          {PIPELINE_STEPS.map((step) => {
            const isCompleted = currentRank > step.rank;
            const isCurrent = currentRank === step.rank;
            const StepIcon = step.icon;

            return (
              <div key={step.id} className="flex flex-col items-center text-center group">
                <div
                  className={`size-7 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? "bg-primary text-primary-foreground shadow-xs ring-2 ring-primary/20"
                      : isCurrent
                      ? "bg-purple-600 text-white shadow-md ring-4 ring-purple-500/30 animate-pulse"
                      : "bg-muted text-muted-foreground/60 border"
                  }`}
                  title={`${step.labelFr} — ${step.labelAr}`}
                >
                  {isCompleted ? <Check className="size-3.5 stroke-[3]" /> : <StepIcon className="size-3.5" />}
                </div>

                <div className="mt-1.5 space-y-0.5">
                  <span
                    className={`block text-[10px] font-bold leading-tight ${
                      isCurrent
                        ? "text-purple-700 dark:text-purple-300"
                        : isCompleted
                        ? "text-foreground"
                        : "text-muted-foreground/60"
                    }`}
                  >
                    {step.labelFr}
                  </span>
                  <span className="block text-[9px] text-muted-foreground line-clamp-1">
                    {step.labelAr}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Progress Background Connector Bar */}
        <div className="absolute top-5.5 left-4 right-4 h-0.5 bg-muted z-0">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.max(0, ((currentRank - 1) / (PIPELINE_STEPS.length - 1)) * 100))}%`,
            }}
          />
        </div>
      </div>

      {/* Mobile Stepper Badges */}
      <div className="flex flex-wrap items-center gap-1 sm:hidden pt-1">
        {PIPELINE_STEPS.map((step) => {
          const isCompleted = currentRank > step.rank;
          const isCurrent = currentRank === step.rank;
          return (
            <Badge
              key={step.id}
              variant="outline"
              className={`text-[10px] px-2 py-0.5 ${
                isCurrent
                  ? "bg-purple-600 text-white font-bold border-purple-600 shadow-xs"
                  : isCompleted
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted/40 text-muted-foreground/60 opacity-60"
              }`}
            >
              {isCompleted && <Check className="size-2.5 ml-1 inline" />}
              {step.labelFr}
            </Badge>
          );
        })}
      </div>

      {/* Financial Settlement Card (Livrée: Non encaissés / Encaissés non payés / Paiements prêts / Historique) */}
      {financialMeta && (
        <div className={`mt-2 rounded-lg border p-2.5 text-xs ${financialMeta.badgeColor}`}>
          <div className="flex items-center gap-2 font-bold mb-1">
            <Coins className="size-4" />
            <span>حالة التحصيل المالي (Règlement Financier):</span>
            <span className="mr-auto font-mono text-[11px] underline underline-offset-2">
              {financialMeta.title}
            </span>
          </div>
          <p className="text-[11px] opacity-90">{financialMeta.description}</p>
        </div>
      )}
    </div>
  );
}
