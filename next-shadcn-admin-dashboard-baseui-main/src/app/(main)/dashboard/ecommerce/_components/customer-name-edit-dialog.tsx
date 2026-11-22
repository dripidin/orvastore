"use client";

import * as React from "react";
import { Check, Loader2, Pencil, UserCheck } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { orvaFetch } from "@/lib/orva-api";

import type { OrderRow } from "./recent-orders-table/schema";

interface CustomerNameEditDialogProps {
  order: OrderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCustomerNameUpdated: (orderId: string, newCustomerName: string, previousName: string) => void;
}

export function validateClientCustomerName(raw: string): string | null {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (clean.length < 2 || clean.length > 120) return null;
  if (/[\u0000-\u001F\u007F<>]/.test(clean)) return null;
  if (!/[\p{L}]/u.test(clean)) return null;
  return clean;
}

export function CustomerNameEditDialog({
  order,
  open,
  onOpenChange,
  onCustomerNameUpdated,
}: CustomerNameEditDialogProps) {
  const [nameInput, setNameInput] = React.useState("");
  const [reasonInput, setReasonInput] = React.useState("تعديل اسم الزبون بناءً على طلبه");
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (open && order) {
      setNameInput(order.customer && order.customer !== "—" ? order.customer : "");
      setReasonInput("تعديل اسم الزبون بناءً على طلبه");
    }
  }, [open, order]);

  if (!order) return null;

  const currentName = (order.customer || "—").trim();
  const normalizedDraft = validateClientCustomerName(nameInput);
  const isChanged = normalizedDraft !== null && normalizedDraft !== currentName;

  const raw = order.rawOrder as Record<string, unknown> | undefined;
  const metadata =
    raw?.metadata && typeof raw.metadata === "object" ? (raw.metadata as Record<string, unknown>) : {};
  const history = Array.isArray(metadata.customerNameHistory)
    ? (metadata.customerNameHistory as Array<{
        previousName?: string;
        newName?: string;
        timestamp_utc?: string;
      }>)
    : [];

  const handleSave = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!normalizedDraft) {
      toast.add({
        title: "اسم الزبون غير صالح",
        description: "يرجى إدخال اسم صحيح لا يقل عن حرفين ويحتوي على أحرف صالحة.",
        type: "error",
      });
      return;
    }
    if (!isChanged) {
      onOpenChange(false);
      return;
    }

    setIsSaving(true);
    try {
      const response = await orvaFetch("/api/delivery?action=update_customer_name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          customerName: normalizedDraft,
          reason: reasonInput.trim() || "تعديل اسم الزبون بناءً على طلبه",
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "تعذر حفظ اسم الزبون الجديد.");
      }

      const savedName = String(result.customerName || normalizedDraft);
      const prevName = String(result.previousName || currentName);
      onCustomerNameUpdated(order.id, savedName, prevName);
      toast.add({
        title: "تم تغيير اسم الزبون بنجاح",
        description: `الطلبية ${order.id}: "${prevName}" ← "${savedName}"`,
        type: "success",
      });
      onOpenChange(false);
    } catch (error) {
      toast.add({
        title: "تعذر تحديث اسم الزبون",
        description: error instanceof Error ? error.message : "حاول مرة أخرى.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md text-right" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <UserCheck className="size-4" />
            </span>
            <span>تغيير اسم الزبون على الطلبية</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            تحديث اسم الزبون للطلبية{" "}
            <Badge variant="outline" className="font-mono text-[11px]" dir="ltr">
              {order.id}
            </Badge>{" "}
            مع حفظ السجل المرجعي دون التأثير على رقم الطلبية أو المنتجات.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSave(e)} className="space-y-3 py-1">
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">الاسم الحالي المسجل: </span>
            <strong className="font-semibold text-foreground">{currentName}</strong>
            {order.phone && (
              <span className="mr-2 font-mono text-[11px] text-muted-foreground" dir="ltr">
                ({order.phone})
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-customer-name-input" className="text-xs font-semibold">
              الاسم الجديد للزبون *
            </Label>
            <Input
              id="quick-customer-name-input"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="أدخل الاسم الكامل الجديد للزبون..."
              autoFocus
              maxLength={120}
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-customer-reason-input" className="text-xs text-muted-foreground">
              ملاحظة التعديل (اختياري)
            </Label>
            <Input
              id="quick-customer-reason-input"
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="مثال: تصحيح الاسم بطلب من الزبون عند التأكيد الهاتفي"
              maxLength={160}
              className="h-8 text-xs"
            />
          </div>

          {history.length > 0 && (
            <div className="rounded-lg border border-dashed bg-muted/20 p-2.5 text-[11px] space-y-1">
              <div className="font-semibold text-muted-foreground">سجل تغييرات الاسم السابقة:</div>
              {history.slice(-3).map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-muted-foreground">
                  <span>
                    {item.previousName} ← <strong className="text-foreground">{item.newName}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex-row-reverse sm:justify-start gap-2 pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || !normalizedDraft || !isChanged}
              className="gap-1.5"
            >
              {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              <span>{isSaving ? "جارٍ الحفظ..." : "حفظ الاسم الجديد"}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
