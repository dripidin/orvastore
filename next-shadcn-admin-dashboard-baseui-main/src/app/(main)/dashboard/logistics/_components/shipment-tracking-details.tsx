"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  Loader2,
  MapPin,
  Navigation,
  PackageSearch,
  RefreshCw,
  Truck,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ALGERIA_58_WILAYAS } from "@/lib/types/checkout";

interface TrackingActivity {
  date?: string;
  time?: string;
  status?: string;
  statusAr?: string;
  station?: string;
  scanLocation?: string;
  details?: string;
  reason?: string;
  driver?: string;
  postponed_to?: string;
}

interface TrackingInfo {
  success: boolean;
  tracking?: string;
  recipientName?: string;
  shippedBy?: string;
  currentStation?: string;
  status?: string;
  statusAr?: string;
  financialStatus?: string;
  originCity?: number | string;
  destLocationCity?: number | string;
  activity?: TrackingActivity[];
  reasons?: string[];
  error?: string;
}

interface ShipmentTrackingDetailsProps {
  order: {
    id: string;
    customer?: string;
    wilaya?: string;
    commune?: string;
    deliveryType?: string;
    total?: string;
    redex_tracking_code?: string | null;
  } | null;
}

function wilayaLabel(value?: number | string) {
  if (value === undefined || value === null || value === "") return null;
  const code = Number(value);
  const w = ALGERIA_58_WILAYAS.find((x) => x.code === code);
  return w ? `${String(w.code).padStart(2, "0")} — ${w.nameAr}` : String(value);
}

function statusTone(code?: string) {
  const s = (code || "").toLowerCase();
  if (["livred", "livre_non_encaisse", "encaisse_non_paye", "encaissed", "payed", "paye_et_archive"].includes(s)) {
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (s.startsWith("retour") || s.startsWith("return")) {
    return "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  }
  if (s === "annule") return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
  return "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300";
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background/70 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground text-[11px]">
        {icon}
        {label}
      </div>
      <div className="break-words font-semibold text-foreground text-xs">{value || "—"}</div>
    </div>
  );
}

export function ShipmentTrackingDetails({ order }: ShipmentTrackingDetailsProps) {
  const trackingCode = order?.redex_tracking_code?.trim() || null;
  const [data, setData] = React.useState<TrackingInfo | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [loadedAt, setLoadedAt] = React.useState<Date | null>(null);

  const load = React.useCallback(async (code: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/delivery?action=track&tracking=${encodeURIComponent(code)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as TrackingInfo | null;
      setData(json ?? { success: false, error: "استجابة غير صالحة من خدمة التتبع" });
      setLoadedAt(new Date());
    } catch {
      setData({ success: false, error: "تعذر الاتصال بخدمة التتبع" });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    setData(null);
    if (trackingCode) void load(trackingCode);
  }, [trackingCode, load]);

  if (!order) return null;

  const activity = [...(data?.activity ?? [])].reverse();

  return (
    <Card className="text-right" dir="rtl" aria-live="polite">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageSearch className="size-5 text-primary" />
            تفاصيل تتبع الشحنة
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            الطلبية <span className="font-mono">{order.id}</span>
            {order.customer ? ` · ${order.customer}` : ""}
            {trackingCode && (
              <>
                {" "}
                · كود التتبع <span className="font-mono text-primary">{trackingCode}</span>
              </>
            )}
          </CardDescription>
        </div>
        {trackingCode && (
          <div className="flex items-center gap-2">
            {loadedAt && (
              <span className="text-[11px] text-muted-foreground">
                آخر تحديث {loadedAt.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void load(trackingCode)}
              disabled={loading}
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              تحديث التتبع
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4 pt-4 text-xs">
        {!trackingCode ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <Truck className="size-6" />
            <p>لم تُرسل هذه الطلبية لشركة التوصيل بعد، لا توجد معلومات تتبع.</p>
          </div>
        ) : loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> جارٍ جلب معلومات الشحنة من EcoTrack…
          </div>
        ) : data && !data.success ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-700 dark:text-red-300">
            <AlertCircle className="size-4 shrink-0" />
            {data.error || "لا تتوفر معلومات تتبع حالياً."}
          </div>
        ) : data ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`text-xs font-bold ${statusTone(data.status)}`}>
                {data.statusAr || data.status || "—"}
              </Badge>
              {data.financialStatus && (
                <Badge variant="outline" className="text-[11px]">
                  الحالة المالية: {data.financialStatus}
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Fact icon={<MapPin className="size-3.5" />} label="المحطة الحالية" value={data.currentStation} />
              <Fact
                icon={<Navigation className="size-3.5" />}
                label="المسار"
                value={[wilayaLabel(data.originCity) ?? "07 — بسكرة", wilayaLabel(data.destLocationCity) ?? order.wilaya]
                  .filter(Boolean)
                  .join(" ← ")}
              />
              <Fact
                icon={<User className="size-3.5" />}
                label="المستلم"
                value={data.recipientName || order.customer}
              />
              <Fact
                icon={<Building2 className="size-3.5" />}
                label="الوجهة / التوصيل"
                value={[order.commune, order.deliveryType].filter(Boolean).join(" · ")}
              />
            </div>

            {data.reasons && data.reasons.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="mb-1 font-bold text-amber-900 dark:text-amber-200">ملاحظات / أسباب التعثر</p>
                <ul className="list-inside list-disc space-y-0.5">
                  {data.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="mb-2 flex items-center gap-1.5 font-bold text-sm">
                <CalendarClock className="size-4 text-primary" />
                سجل حركة الشحنة ({activity.length})
              </h4>
              {activity.length === 0 ? (
                <p className="text-muted-foreground">لا يوجد سجل حركة بعد.</p>
              ) : (
                <ol className="space-y-3 border-r-2 border-primary/20 pr-4">
                  {activity.map((a, i) => (
                    <li key={`${a.date}-${a.time}-${a.status}-${i}`} className="relative">
                      <span
                        className={`absolute top-1 -right-[21px] size-2.5 rounded-full ${i === 0 ? "bg-primary" : "bg-muted-foreground/40"}`}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={`font-semibold ${i === 0 ? "text-primary" : "text-foreground"}`}>
                          {a.statusAr || a.status}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                          {[a.date, a.time].filter(Boolean).join(" ")}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {(a.station || a.scanLocation) && <span>📍 {a.station || a.scanLocation}</span>}
                        {a.driver && <span>🚚 السائق: {a.driver}</span>}
                        {a.postponed_to && <span>⏱ مؤجلة إلى: {a.postponed_to}</span>}
                      </div>
                      {(a.reason || a.details) && (
                        <p className="mt-0.5 text-[11px] text-foreground">{a.reason || a.details}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
