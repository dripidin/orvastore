"use client";

import * as React from "react";
import { Inbox, Lightbulb, MapPin, Phone, RefreshCw, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ProductRequest {
  id: string;
  customer_name: string;
  phone: string | null;
  wilaya: string | null;
  product_wanted: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export const REQUESTS_READ_EVENT = "orva:requests-read";

function timeAgo(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("ar-DZ", { dateStyle: "medium", timeStyle: "short" });
}

export function RequestsInbox() {
  const [items, setItems] = React.useState<ProductRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [freshIds, setFreshIds] = React.useState<Set<string>>(new Set());

  const load = React.useCallback(async (markRead: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/product-requests", { credentials: "same-origin", cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) throw new Error(d?.error || "تعذر تحميل الطلبات.");
      const list = d.data as ProductRequest[];
      setItems(list);
      const unread = list.filter((r) => !r.is_read).map((r) => r.id);
      if (markRead && unread.length > 0) {
        // Opening the inbox clears the notification badge; new rows stay highlighted for this visit.
        setFreshIds(new Set(unread));
        await fetch("/api/product-requests", {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
        window.dispatchEvent(new CustomEvent(REQUESTS_READ_EVENT));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل الطلبات.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(true);
  }, [load]);

  const remove = async (id: string) => {
    if (!window.confirm("حذف هذا الطلب؟")) return;
    const res = await fetch(`/api/product-requests?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (res.ok) setItems((prev) => prev.filter((r) => r.id !== id));
  };

  const filtered = items.filter((r) =>
    [r.customer_name, r.product_wanted, r.message, r.wilaya, r.phone]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  // Most requested products (simple word grouping on the requested product text)
  const top = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of items) {
      const key = r.product_wanted.trim().toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [items]);

  return (
    <div className="flex flex-col gap-6 pb-10 text-right" dir="rtl">
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-extrabold text-2xl">
            <Inbox className="size-6 text-primary" /> طلبات المنتجات من الزبائن
          </h1>
          <p className="text-muted-foreground text-sm">
            ما يرسله الزبائن من نموذج "ما لقيتش واش تحوس عليه؟" في الصفحة الرئيسية للمتجر.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث..."
            className="h-8 w-48 text-xs"
          />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>تعذر تحميل الطلبات</AlertTitle>
          <AlertDescription>
            {error} — تأكد من تشغيل ملف 20261111_000004_product_requests.sql في Supabase.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lightbulb className="size-4 text-amber-500" /> الأكثر طلباً
            </CardTitle>
            <CardDescription className="text-xs">{items.length} طلب في المجموع</CardDescription>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <p className="text-muted-foreground text-xs">لا توجد طلبات بعد.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {top.map(([name, n]) => (
                  <li key={name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{name}</span>
                    <Badge variant="secondary">{n}</Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3 lg:col-span-2">
          {loading && items.length === 0 ? (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <RefreshCw className="size-4 animate-spin" /> جارٍ التحميل…
            </p>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground text-sm">لا توجد طلبات.</CardContent>
            </Card>
          ) : (
            filtered.map((r) => (
              <Card key={r.id} className={freshIds.has(r.id) ? "border-primary/50 bg-primary/5" : ""}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base">{r.product_wanted}</span>
                        {freshIds.has(r.id) && <Badge className="text-[10px]">جديد</Badge>}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {r.customer_name} · {timeAgo(r.created_at)}
                      </div>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => void remove(r.id)}
                      aria-label="حذف الطلب"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  {r.message && <p className="whitespace-pre-line text-sm">{r.message}</p>}
                  <div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
                    {r.phone && (
                      <a href={`tel:${r.phone}`} className="flex items-center gap-1 font-mono text-primary" dir="ltr">
                        <Phone className="size-3" /> {r.phone}
                      </a>
                    )}
                    {r.wilaya && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" /> {r.wilaya}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
