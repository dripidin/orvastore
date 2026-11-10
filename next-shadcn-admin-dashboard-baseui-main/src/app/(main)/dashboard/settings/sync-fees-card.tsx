"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SyncFeesCard() {
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(true);
  const [syncedAt, setSyncedAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/delivery-fees", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSyncedAt(d?.syncedAt ?? null))
      .catch(() => undefined);
  }, []);

  const sync = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/delivery-fees", { method: "POST", credentials: "same-origin" });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.success) {
        setOk(true);
        setSyncedAt(d.syncedAt);
        setMessage(`تمت مزامنة تعريفات ${Object.keys(d.fees ?? {}).length} ولاية بنجاح.`);
      } else {
        setOk(false);
        setMessage(d?.error || "فشلت المزامنة مع EcoTrack.");
      }
    } catch {
      setOk(false);
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4" dir="rtl">
      <div className="space-y-1">
        <h2 className="font-bold text-sm">مزامنة تعريفات التوصيل (EcoTrack)</h2>
        <p className="text-muted-foreground text-xs">
          تُستخدم التعريفات الحية لحساب مصاريف الشحن عند الطلب حسب الولاية ونوع التوصيل.
          {syncedAt ? ` آخر مزامنة: ${new Date(syncedAt).toLocaleString("ar-DZ")}` : " لم تتم المزامنة بعد."}
        </p>
        {message && <p className={`text-xs ${ok ? "text-emerald-600" : "text-red-600"}`}>{message}</p>}
      </div>
      <Button type="button" size="sm" variant="outline" onClick={sync} disabled={loading} className="gap-1.5">
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        مزامنة الآن
      </Button>
    </section>
  );
}
