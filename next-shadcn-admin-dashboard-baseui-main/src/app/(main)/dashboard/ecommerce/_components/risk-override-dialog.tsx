"use client";

import * as React from "react";
import { AlertTriangle, Loader2, ShieldCheck, ShieldOff, ShieldQuestion } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { orvaFetch } from "@/lib/orva-api";
import { toast } from "@/components/ui/toast";

import type { OrderRow } from "./recent-orders-table/schema";

type RiskAction = "trust" | "block" | "unblock";

interface RiskOverrideDialogProps {
  order: OrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: (orderId: string, patch: Partial<OrderRow>) => void;
}

export function RiskOverrideDialog({
  order,
  open,
  onOpenChange,
  onUpdated,
}: RiskOverrideDialogProps) {
  const [busy, setBusy] = React.useState<RiskAction | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) setError(null);
  }, [open, order?.id]);

  if (!order) return null;

  const score = order.riskScore || 0;
  const decision = order.riskDecision || "ALLOW";
  const level = order.riskLevel || "LOW";
  const reasons =
    order.riskReasons && order.riskReasons.length > 0
      ? order.riskReasons
      : ["لا توجد مؤشرات خطر مسجّلة — تقييم أساسي."];

  const runAction = async (action: RiskAction) => {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await orvaFetch("/api/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, action }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        updated?: { riskDecision?: string };
      } | null;

      if (!res.ok || !json?.success) {
        const msg =
          res.status === 401
            ? "انتهت جلسة الإدارة. سجّل الدخول ثم أعد المحاولة."
            : json?.error || "تعذر تطبيق إجراء المخاطر.";
        setError(msg);
        toast.add({ title: "فشل إجراء المخاطر", description: msg, type: "error" });
        return;
      }

      const nextDecision =
        action === "block" ? "BLOCK" : action === "trust" || action === "unblock" ? "ALLOW" : decision;
      const patch: Partial<OrderRow> = {
        riskDecision: nextDecision,
        riskScore: action === "block" ? Math.max(score, 80) : action === "trust" ? 0 : score,
        riskLevel: action === "block" ? "HIGH" : action === "trust" ? "LOW" : level,
      };
      onUpdated?.(order.id, patch);
      toast.add({
        title: "تم تحديث قرار المخاطر",
        description: `${order.id} → ${nextDecision}`,
        type: "success",
      });
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ شبكة";
      setError(msg);
      toast.add({ title: "فشل الاتصال", description: msg, type: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg text-right" dir="ltr">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldQuestion className="size-5 text-primary" />
            تحليل المخاطر — {order.id}
          </DialogTitle>
          <DialogDescription className="text-xs">
            القرار الحالي من محرك المخاطر عبر `/api/risk` (يتطلب جلسة إدارة).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
            <div>
              <span className="text-muted-foreground">الزبون</span>
              <p className="font-semibold">{order.customer}</p>
            </div>
            <div>
              <span className="text-muted-foreground">الهاتف</span>
              <p className="font-mono font-semibold" dir="ltr">
                {order.phone || "—"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">الولاية</span>
              <p>{order.wilaya}</p>
            </div>
            <div>
              <span className="text-muted-foreground">المنتج</span>
              <p className="truncate">{order.items}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              Score {score}/100
            </Badge>
            <Badge variant="secondary">{level}</Badge>
            <Badge
              className={
                decision === "BLOCK"
                  ? "bg-rose-600 text-white"
                  : decision === "REVIEW"
                    ? "bg-amber-500 text-white"
                    : "bg-emerald-600 text-white"
              }
            >
              {decision}
            </Badge>
          </div>

          <div className="rounded-md border p-3 text-xs space-y-1.5">
            <p className="font-bold mb-1">أسباب التقييم</p>
            {reasons.map((r) => (
              <div key={r} className="flex gap-2">
                <AlertTriangle className="size-3.5 shrink-0 text-amber-600 mt-0.5" />
                <code className="text-[11px]">{r}</code>
              </div>
            ))}
          </div>

          {error ? (
            <Alert variant="destructive" className="py-2">
              <AlertTitle className="text-xs">تعذر التنفيذ</AlertTitle>
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="flex-row-reverse gap-2 sm:justify-start">
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!!busy}
            onClick={() => void runAction("trust")}
          >
            {busy === "trust" ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            توثيق (Trust)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="gap-1.5"
            disabled={!!busy}
            onClick={() => void runAction("block")}
          >
            {busy === "block" ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldOff className="size-3.5" />}
            حظر (Block)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!!busy}
            onClick={() => void runAction("unblock")}
          >
            {busy === "unblock" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            إزالة التجاوز
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
