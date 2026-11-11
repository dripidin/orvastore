"use client";

import * as React from "react";
import { Loader2, MapPin, RefreshCw, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Activity {
  date?: string;
  time?: string;
  status?: string;
  statusAr?: string;
  station?: string;
  details?: string;
  reason?: string;
}

interface TrackingResult {
  success: boolean;
  status?: string;
  statusAr?: string;
  currentStation?: string;
  activity?: Activity[];
  error?: string;
}

export function ShipmentTrackingPanel({ trackingCode }: { trackingCode: string }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<TrackingResult | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/delivery?action=track&tracking=${encodeURIComponent(trackingCode)}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      setData((await res.json().catch(() => null)) ?? { success: false, error: "استجابة غير صالحة" });
    } catch {
      setData({ success: false, error: "تعذر الاتصال بخدمة التتبع" });
    } finally {
      setLoading(false);
    }
  }, [trackingCode]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data) void load();
  };

  const activity = [...(data?.activity ?? [])].reverse();

  return (
    <div className="rounded-lg border border-purple-500/30 p-2.5" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="xs" variant="outline" className="h-6 gap-1 text-[11px]" onClick={toggle}>
          <Truck className="size-3" />
          <span>تتبع الشحنة</span>
        </Button>
        {open && (
          <Button type="button" size="icon-xs" variant="ghost" className="h-6 w-6" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2 text-xs">
          {loading && !data && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> جارٍ جلب حالة الشحنة…
            </div>
          )}
          {data && !data.success && <p className="text-red-600">{data.error ?? "لا تتوفر معلومات تتبع حالياً."}</p>}
          {data?.success && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-purple-700 dark:text-purple-300">{data.statusAr || data.status}</span>
                {data.currentStation && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="size-3" /> {data.currentStation}
                  </span>
                )}
              </div>
              {activity.length === 0 ? (
                <p className="text-muted-foreground">لا يوجد سجل نشاط بعد.</p>
              ) : (
                <ol className="space-y-2 border-r-2 border-purple-500/30 pr-3">
                  {activity.map((a, i) => (
                    <li key={`${a.date}-${a.time}-${i}`} className="relative">
                      <span className="-right-[17px] absolute top-1 size-2 rounded-full bg-purple-500" />
                      <div className="font-semibold">{a.statusAr || a.status}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {[a.date, a.time].filter(Boolean).join(" ")}
                        {a.station ? ` • ${a.station}` : ""}
                      </div>
                      {(a.details || a.reason) && <div className="text-[11px]">{a.reason || a.details}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

