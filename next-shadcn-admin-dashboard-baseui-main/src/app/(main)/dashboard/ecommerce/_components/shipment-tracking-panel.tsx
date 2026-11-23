"use client";

import * as React from "react";

import {
  Building2,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageSquarePlus,
  Phone,
  RefreshCw,
  RotateCcw,
  Send,
  Truck,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { CourierRemarkItem, ParcelLocationStage } from "@/lib/couriers/types";
import { getLocationStageLabelAr } from "@/lib/delivery/courier-status-mapper";
import { orvaFetch } from "@/lib/orva-api";

interface Activity {
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

interface TrackingResult {
  success: boolean;
  courierId?: string;
  status?: string;
  statusAr?: string;
  normalizedStatus?: string;
  locationStage?: ParcelLocationStage;
  isSwitchable?: boolean;
  financialStatus?: string;
  currentStation?: string;
  driverName?: string;
  driverPhone?: string;
  deskInfo?: {
    deskPhone?: string;
    deskCommune?: string;
    deskAddress?: string;
    deskMapLink?: string;
  };
  remarks?: CourierRemarkItem[];
  reasons?: string[];
  activity?: Activity[];
  error?: string;
}

export function ShipmentTrackingPanel({
  trackingCode,
  courierId,
  onSwitchOrder,
}: {
  trackingCode: string;
  courierId?: string | null;
  onSwitchOrder?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<TrackingResult | null>(null);
  const [remarkDraft, setRemarkDraft] = React.useState("");
  const [sendingRemark, setSendingRemark] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        action: "track",
        tracking: trackingCode,
      });
      if (courierId) qs.set("courierId", courierId);
      const res = await orvaFetch(`/api/delivery?${qs.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
      });
      setData((await res.json().catch(() => null)) ?? { success: false, error: "استجابة غير صالحة" });
    } catch {
      setData({ success: false, error: "تعذر الاتصال بخدمة التتبع" });
    } finally {
      setLoading(false);
    }
  }, [trackingCode, courierId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data) void load();
  };

  const handleSendRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = remarkDraft.trim();
    if (!content) return;
    setSendingRemark(true);
    try {
      const res = await orvaFetch("/api/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_remark",
          tracking: trackingCode,
          courierId: courierId || data?.courierId || "redex",
          content,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "تعذر إرسال الملاحظة لشركة التوصيل");
      }
      setRemarkDraft("");
      toast.add({ title: "تم إرسال التحديث (MAJ) لشركة التوصيل", type: "success" });
      await load();
    } catch (err: any) {
      toast.add({ title: "خطأ", description: err?.message, type: "error" });
    } finally {
      setSendingRemark(false);
    }
  };

  const runCourierAction = async (action: "validate_order" | "ask_return" | "valid_returns") => {
    setActionBusy(action);
    try {
      const payload: Record<string, unknown> = {
        action,
        tracking: trackingCode,
        courierId: courierId || data?.courierId || "redex",
      };
      if (action === "validate_order") payload.askCollection = 0;

      const res = await orvaFetch("/api/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "تعذر تنفيذ الإجراء لدى شركة التوصيل");
      }
      toast.add({ title: json.message || "تم تنفيذ الإجراء بنجاح", type: "success" });
      await load();
    } catch (err: any) {
      toast.add({ title: "فشل الإجراء", description: err?.message, type: "error" });
    } finally {
      setActionBusy(null);
    }
  };

  const activity = [...(data?.activity ?? [])].reverse();
  const remarks = data?.remarks ?? [];

  return (
    <div className="rounded-lg border border-purple-500/30 p-2.5" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" size="xs" variant="outline" className="h-6 gap-1 text-[11px]" onClick={toggle}>
          <Truck className="size-3" />
          <span>تتبع الشحنة الحي والملاحظات</span>
        </Button>
        {open && (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-2.5 space-y-3 text-xs">
          {loading && !data && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> جارٍ جلب حالة الشحنة وسجل التواصل…
            </div>
          )}
          {data && !data.success && <p className="text-red-600">{data.error ?? "لا تتوفر معلومات تتبع حالياً."}</p>}
          {data?.success && (
            <>
              {/* Status + Location Stage Banner */}
              <div className="rounded-lg bg-muted/40 p-2 space-y-1.5 border">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="font-bold text-purple-700 dark:text-purple-300">{data.statusAr || data.status}</span>
                  {data.locationStage && (
                    <Badge variant="outline" className="text-[10px]">
                      📍 {getLocationStageLabelAr(data.locationStage)}
                    </Badge>
                  )}
                </div>
                {data.currentStation && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="size-3" /> المحطة الحالية: {data.currentStation}
                  </div>
                )}
              </div>

              {/* Driver & Desk Cards */}
              {(data.driverName || data.driverPhone || data.deskInfo?.deskAddress || data.deskInfo?.deskPhone) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(data.driverName || data.driverPhone) && (
                    <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-2 space-y-1">
                      <div className="font-semibold text-[11px] flex items-center gap-1">
                        <User className="size-3 text-emerald-600" />
                        رجل التوصيل
                      </div>
                      <div className="font-medium">{data.driverName || "غير محدد بعد"}</div>
                      {data.driverPhone && (
                        <a
                          href={`tel:${data.driverPhone}`}
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                          dir="ltr"
                        >
                          <Phone className="size-3" />
                          {data.driverPhone}
                        </a>
                      )}
                    </div>
                  )}

                  {(data.deskInfo?.deskAddress || data.deskInfo?.deskPhone) && (
                    <div className="rounded-lg border bg-blue-500/5 border-blue-500/20 p-2 space-y-1">
                      <div className="font-semibold text-[11px] flex items-center gap-1">
                        <Building2 className="size-3 text-blue-600" />
                        مكتب التوصيل (Stop-Desk)
                      </div>
                      {data.deskInfo.deskAddress && (
                        <div className="text-[11px] text-muted-foreground">{data.deskInfo.deskAddress}</div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {data.deskInfo.deskPhone && (
                          <a
                            href={`tel:${data.deskInfo.deskPhone}`}
                            className="font-mono text-[11px] text-primary hover:underline"
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
                            className="text-[11px] text-blue-600 hover:underline"
                          >
                            خريطة المكتب ↗
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Communication Failure / Reschedule Reasons */}
              {data.reasons && data.reasons.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                  <div className="font-bold text-[11px] text-amber-800 dark:text-amber-300 mb-1">
                    تنبيهات التواصل مع الزبون:
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {data.reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Courier Actions Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5">
                {data.isSwitchable && onSwitchOrder && (
                  <Button
                    type="button"
                    size="xs"
                    className="h-7 gap-1 bg-amber-600 hover:bg-amber-700 text-white text-[11px]"
                    onClick={onSwitchOrder}
                  >
                    <RefreshCw className="size-3" />
                    تحويل الطرد المعلق + MAJ
                  </Button>
                )}
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  disabled={Boolean(actionBusy)}
                  onClick={() => void runCourierAction("validate_order")}
                >
                  {actionBusy === "validate_order" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-3" />
                  )}
                  تأكيد الشحنة
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="h-7 gap-1 text-[11px] text-orange-700"
                  disabled={Boolean(actionBusy)}
                  onClick={() => void runCourierAction("ask_return")}
                >
                  {actionBusy === "ask_return" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                  طلب إرجاع
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="h-7 gap-1 text-[11px]"
                  disabled={Boolean(actionBusy)}
                  onClick={() => void runCourierAction("valid_returns")}
                >
                  تأكيد استلام المرتجع
                </Button>
              </div>

              {/* Two-Way MAJ Remarks Feed & Composer */}
              <div className="rounded-lg border p-2 space-y-2">
                <div className="font-semibold text-[11px] flex items-center gap-1">
                  <MessageSquarePlus className="size-3.5 text-primary" />
                  ملاحظات التوصيل المتبادلة (رجل التوصيل ⇄ المتجر) ({remarks.length})
                </div>
                {remarks.length > 0 && (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {remarks.map((r, idx) => (
                      <div key={idx} className="rounded bg-muted/40 p-1.5 text-[11px]">
                        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">
                            {r.authorRole === "driver"
                              ? `رجل التوصيل${r.livreur ? `: ${r.livreur}` : ""}`
                              : r.authorRole === "seller"
                                ? "المتجر (MAJ)"
                                : `المركز${r.station ? `: ${r.station}` : ""}`}
                          </Badge>
                          <span>{r.createdAt || ""}</span>
                        </div>
                        <div className="mt-0.5 font-medium">{r.remarque}</div>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSendRemark} className="flex items-center gap-1.5">
                  <Input
                    value={remarkDraft}
                    onChange={(e) => setRemarkDraft(e.target.value)}
                    placeholder="أضف تعليمات أو ملاحظة لشركة التوصيل / السائق (حتى 240 حرف)..."
                    maxLength={240}
                    className="h-7 text-[11px]"
                  />
                  <Button
                    type="submit"
                    size="xs"
                    className="h-7 gap-1 shrink-0"
                    disabled={sendingRemark || !remarkDraft.trim()}
                  >
                    {sendingRemark ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                    إرسال MAJ
                  </Button>
                </form>
              </div>

              {/* Timeline */}
              {activity.length === 0 ? (
                <p className="text-muted-foreground">لا يوجد سجل حركة بعد.</p>
              ) : (
                <ol className="space-y-2 border-r-2 border-purple-500/30 pr-3">
                  {activity.map((a, i) => (
                    <li key={`${a.date}-${a.time}-${i}`} className="relative">
                      <span className="-right-[17px] absolute top-1 size-2 rounded-full bg-purple-500" />
                      <div className="font-semibold">{a.statusAr || a.status}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {[a.date, a.time].filter(Boolean).join(" ")}
                        {a.station || a.scanLocation ? ` • ${a.station || a.scanLocation}` : ""}
                        {a.driver ? ` • 🚚 ${a.driver}` : ""}
                      </div>
                      {(a.postponedTo || a.postponed_to) && (
                        <div className="text-[10px] text-amber-600">⏱ مؤجلة إلى: {a.postponedTo || a.postponed_to}</div>
                      )}
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
