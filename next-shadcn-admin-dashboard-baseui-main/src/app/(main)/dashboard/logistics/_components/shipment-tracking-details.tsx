"use client";

import * as React from "react";

import {
  AlertCircle,
  Building2,
  CalendarClock,
  Loader2,
  MapPin,
  MessageSquarePlus,
  Navigation,
  PackageSearch,
  Phone,
  RefreshCw,
  Send,
  Truck,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CourierRemarkItem, ParcelLocationStage } from "@/lib/couriers/types";
import { getLocationStageLabelAr } from "@/lib/delivery/courier-status-mapper";
import { ALGERIA_69_WILAYAS } from "@/lib/geo/algeria-69";
import { orvaFetch } from "@/lib/orva-api";

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
  postponedTo?: string;
  postponed_to?: string;
}

interface TrackingInfo {
  success: boolean;
  courierId?: string;
  tracking?: string;
  recipientName?: string;
  shippedBy?: string;
  currentStation?: string;
  status?: string;
  statusAr?: string;
  locationStage?: ParcelLocationStage;
  isSwitchable?: boolean;
  financialStatus?: string;
  originCity?: number | string;
  destLocationCity?: number | string;
  driverName?: string;
  driverPhone?: string;
  deskInfo?: {
    deskPhone?: string;
    deskCommune?: string;
    deskAddress?: string;
    deskMapLink?: string;
  };
  remarks?: CourierRemarkItem[];
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
    courierId?: string | null;
  } | null;
}

function wilayaLabel(value?: number | string) {
  if (value === undefined || value === null || value === "") return null;
  const code = Number(value);
  const w = ALGERIA_69_WILAYAS.find((x) => x.code === code);
  return w ? `${w.paddedCode} — ${w.nameAr}` : String(value);
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
  const [remarkDraft, setRemarkDraft] = React.useState("");
  const [sendingRemark, setSendingRemark] = React.useState(false);

  const load = React.useCallback(
    async (code: string) => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ action: "track", tracking: code });
        if (order?.courierId) qs.set("courierId", order.courierId);
        const res = await orvaFetch(`/api/delivery?${qs.toString()}`, {
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
    },
    [order?.courierId],
  );

  React.useEffect(() => {
    setData(null);
    if (trackingCode) void load(trackingCode);
  }, [trackingCode, load]);

  const sendRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingCode || !remarkDraft.trim()) return;
    setSendingRemark(true);
    try {
      const res = await orvaFetch("/api/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_remark",
          tracking: trackingCode,
          courierId: order?.courierId || data?.courierId || "redex",
          content: remarkDraft.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setRemarkDraft("");
        await load(trackingCode);
      }
    } finally {
      setSendingRemark(false);
    }
  };

  if (!order) return null;

  const activity = [...(data?.activity ?? [])].reverse();
  const remarks = data?.remarks ?? [];

  return (
    <Card className="text-right" dir="rtl" aria-live="polite">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageSearch className="size-5 text-primary" />
            تفاصيل تتبع الشحنة والاتصال بالسائق
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
            <Loader2 className="size-4 animate-spin" /> جارٍ جلب معلومات الشحنة من شركة التوصيل…
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
              {data.locationStage && (
                <Badge variant="secondary" className="text-[11px]">
                  📍 {getLocationStageLabelAr(data.locationStage)}
                </Badge>
              )}
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
                value={[
                  wilayaLabel(data.originCity) ?? "07 — بسكرة",
                  wilayaLabel(data.destLocationCity) ?? order.wilaya,
                ]
                  .filter(Boolean)
                  .join(" ← ")}
              />
              <Fact icon={<User className="size-3.5" />} label="المستلم" value={data.recipientName || order.customer} />
              <Fact
                icon={<Building2 className="size-3.5" />}
                label="الوجهة / التوصيل"
                value={[order.commune, order.deliveryType].filter(Boolean).join(" · ")}
              />
            </div>

            {/* Driver & Desk Info */}
            {(data.driverName || data.driverPhone || data.deskInfo?.deskAddress || data.deskInfo?.deskPhone) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(data.driverName || data.driverPhone) && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <Truck className="size-3.5" />
                      رجل التوصيل المكلف
                    </div>
                    <div className="font-semibold">{data.driverName || "—"}</div>
                    {data.driverPhone && (
                      <a
                        href={`tel:${data.driverPhone}`}
                        className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                        dir="ltr"
                      >
                        <Phone className="size-3" /> {data.driverPhone}
                      </a>
                    )}
                  </div>
                )}
                {(data.deskInfo?.deskAddress || data.deskInfo?.deskPhone) && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                      <Building2 className="size-3.5" />
                      مكتب التوصيل (Desk)
                    </div>
                    {data.deskInfo.deskAddress && <div>{data.deskInfo.deskAddress}</div>}
                    <div className="flex flex-wrap gap-2">
                      {data.deskInfo.deskPhone && (
                        <a
                          href={`tel:${data.deskInfo.deskPhone}`}
                          className="font-mono text-primary hover:underline"
                          dir="ltr"
                        >
                          {data.deskInfo.deskPhone}
                        </a>
                      )}
                      {data.deskInfo.deskMapLink && (
                        <a
                          href={data.deskInfo.deskMapLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          الموقع على الخريطة ↗
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

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

            {/* Two-Way MAJ Remarks */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <MessageSquarePlus className="size-4 text-primary" />
                ملاحظات وتحديثات التواصل (MAJ) ({remarks.length})
              </div>
              {remarks.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {remarks.map((r, i) => (
                    <div key={i} className="rounded bg-muted/40 p-2">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>
                          {r.authorRole === "driver"
                            ? `السائق ${r.livreur || ""}`
                            : r.authorRole === "seller"
                              ? "المتجر"
                              : `المركز ${r.station || ""}`}
                        </span>
                        <span>{r.createdAt || ""}</span>
                      </div>
                      <div className="mt-0.5 font-medium">{r.remarque}</div>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={sendRemark} className="flex gap-2">
                <Input
                  value={remarkDraft}
                  onChange={(e) => setRemarkDraft(e.target.value)}
                  placeholder="أرسل ملاحظة أو توجيه للناقل / رجل التوصيل..."
                  maxLength={240}
                  className="h-8 text-xs"
                />
                <Button type="submit" size="sm" className="h-8 gap-1" disabled={sendingRemark || !remarkDraft.trim()}>
                  {sendingRemark ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                  إرسال MAJ
                </Button>
              </form>
            </div>

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
                        {(a.postponedTo || a.postponed_to) && (
                          <span>⏱ مؤجلة إلى: {a.postponedTo || a.postponed_to}</span>
                        )}
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
