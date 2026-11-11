"use client";

import * as React from "react";
import { CheckCircle2, ExternalLink, Globe, Loader2, Rocket, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

const STORE_PAGES: { path: string; label: string }[] = [
  { path: "/", label: "الصفحة الرئيسية للمتجر" },
  { path: "/pack1", label: "صفحة الباك 1" },
  { path: "/pack2", label: "صفحة الباك 2" },
  { path: "/pack3", label: "صفحة الباك 3" },
  { path: "/checkout", label: "صفحة الطلب (Checkout)" },
];

/** "Publish to Store": refreshes the storefront cache so the latest products, prices and designs go live. */
export function PublishToStoreButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const [open, setOpen] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishedAt, setPublishedAt] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<"ok" | "error" | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setResult(null);
    fetch("/api/store-publish", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPublishedAt(d?.publishedAt ?? null))
      .catch(() => undefined);
  }, [open]);

  const publish = async () => {
    setPublishing(true);
    setResult(null);
    try {
      const res = await fetch("/api/store-publish", { method: "POST", credentials: "same-origin" });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d?.success) throw new Error(d?.error || "فشل النشر");
      setPublishedAt(d.publishedAt);
      setResult("ok");
      toast.add({ title: "تم النشر على المتجر", description: "التعديلات أصبحت ظاهرة للزبائن.", type: "success" });
    } catch (err) {
      setResult("error");
      toast.add({
        title: "تعذر النشر",
        description: err instanceof Error ? err.message : "حاول مرة أخرى.",
        type: "error",
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <>
      <Button size={size} className="gap-1.5 font-semibold" onClick={() => setOpen(true)}>
        <Rocket className="size-4" />
        Publish to Store
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex w-[95vw] flex-col gap-0 overflow-hidden p-0 text-right sm:max-w-xl" dir="rtl">
          <DialogHeader className="space-y-1 border-b bg-muted/40 px-6 py-4 text-right">
            <div className="flex items-center gap-3 pl-8">
              <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Rocket className="size-4" />
              </span>
              <div>
                <DialogTitle className="font-bold text-base">النشر على المتجر</DialogTitle>
                <DialogDescription className="text-muted-foreground text-xs">
                  تحديث نسخة المتجر حتى تظهر آخر المنتجات والأسعار وتصاميم الصفحات للزبائن فوراً.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5 text-xs">
            <section className="rounded-xl border p-4">
              <h3 className="mb-3 flex items-center gap-2 font-bold text-sm">
                <Globe className="size-4 text-primary" />
                الصفحات التي سيتم تحديثها
              </h3>
              <ul className="divide-y">
                {STORE_PAGES.map((p) => (
                  <li key={p.path} className="flex items-center justify-between py-2">
                    <span className="font-medium">{p.label}</span>
                    <a
                      href={p.path}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 font-mono text-primary hover:underline"
                      dir="ltr"
                    >
                      {p.path}
                      <ExternalLink className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5">
              <span className="text-muted-foreground">آخر نشر</span>
              <span className="font-semibold">
                {publishedAt ? new Date(publishedAt).toLocaleString("ar-DZ") : "لم يتم النشر من هذه الجلسة بعد"}
              </span>
            </div>

            {result === "ok" && (
              <p className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 font-semibold text-emerald-700">
                <CheckCircle2 className="size-4" /> تم النشر بنجاح، المتجر يعرض الآن آخر التعديلات.
              </p>
            )}
            {result === "error" && (
              <p className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 font-semibold text-red-700">
                <XCircle className="size-4" /> فشل النشر، تحقق من الاتصال ثم أعد المحاولة.
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-6 py-3">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={publishing}>
              إغلاق
            </Button>
            <Button size="sm" className="gap-1.5 font-bold" onClick={() => void publish()} disabled={publishing}>
              {publishing ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}
              {publishing ? "جارٍ النشر..." : "نشر الآن"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
