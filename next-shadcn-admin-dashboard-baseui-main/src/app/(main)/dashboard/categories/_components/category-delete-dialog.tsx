"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { CategoryDeleteConflict, CategoryDeleteMode, CategoryRecord } from "@/lib/categories/types";

export function CategoryDeleteDialog({
  open,
  onOpenChange,
  targetCategory,
  conflict,
  allCategories,
  deleting,
  onConfirmDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetCategory: CategoryRecord | null;
  conflict: CategoryDeleteConflict | null;
  allCategories: CategoryRecord[];
  deleting: boolean;
  onConfirmDelete: (mode: CategoryDeleteMode, reassignToCategoryId?: string | null) => Promise<void>;
}) {
  const [resolution, setResolution] = React.useState<"unlink" | "reassign">("reassign");
  const [reassignTargetId, setReassignTargetId] = React.useState<string>("");

  const alternativeCategories = React.useMemo(() => {
    if (!targetCategory) return [];
    return allCategories.filter(
      (c) => c.id !== targetCategory.id && c.parent_id !== targetCategory.id
    );
  }, [allCategories, targetCategory]);

  React.useEffect(() => {
    if (!open) return;
    if (alternativeCategories.length > 0) {
      setResolution("reassign");
      setReassignTargetId(alternativeCategories[0].id);
    } else {
      setResolution("unlink");
      setReassignTargetId("");
    }
  }, [open, alternativeCategories]);

  if (!targetCategory) return null;

  const hasConflict = Boolean(conflict && (conflict.productCount > 0 || conflict.childCount > 0));

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent dir="rtl" className="sm:max-w-lg text-right">
        <AlertDialogHeader className="text-right sm:text-right">
          <AlertDialogTitle className="flex items-center gap-2 font-bold text-base">
            <AlertTriangle className={`size-5 ${hasConflict ? "text-amber-600" : "text-destructive"}`} />
            {hasConflict
              ? `التصنيف «${targetCategory.name}» مرتبط ببيانات نشطة`
              : `تأكيد حذف التصنيف «${targetCategory.name}»`}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed text-right">
            {hasConflict && conflict
              ? conflict.error
              : "لا توجد أي منتجات أو فروع مرتبطة بهذا التصنيف. هل تريد حذفه نهائياً؟"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasConflict && conflict && (
          <div className="space-y-3 rounded-lg border bg-muted/25 p-3 text-xs">
            {conflict.children.length > 0 && (
              <div>
                <div className="mb-1 font-semibold">التصنيفات الفرعية المتأثرة ({conflict.childCount}):</div>
                <div className="flex flex-wrap gap-1.5">
                  {conflict.children.map((ch) => (
                    <Badge key={ch.id} variant="outline">
                      {ch.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {conflict.products.length > 0 && (
              <div>
                <div className="mb-1 font-semibold">المنتجات المرتبطة ({conflict.productCount}):</div>
                <ul className="max-h-28 space-y-1 overflow-auto rounded border bg-background p-2 text-[11px]">
                  {conflict.products.slice(0, 8).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{p.title}</span>
                      <span className="font-mono text-muted-foreground">{p.sku}</span>
                    </li>
                  ))}
                  {conflict.products.length > 8 && (
                    <li className="text-muted-foreground">و {conflict.products.length - 8} منتجات أخرى...</li>
                  )}
                </ul>
              </div>
            )}

            <div className="space-y-2 border-t pt-2.5">
              <Label className="block font-bold">كيف تعالج البيانات قبل الحذف؟</Label>
              {alternativeCategories.length > 0 && (
                <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-background p-2">
                  <input
                    type="radio"
                    name="del-res"
                    checked={resolution === "reassign"}
                    onChange={() => setResolution("reassign")}
                    className="mt-1 accent-primary"
                  />
                  <div className="flex-1 space-y-1.5">
                    <span className="block font-semibold">نقل المنتجات (والفروع) إلى تصنيف بديل ثم الحذف</span>
                    {resolution === "reassign" && (
                      <select
                        value={reassignTargetId}
                        onChange={(e) => setReassignTargetId(e.target.value)}
                        className="h-8 w-full rounded border bg-background px-2 text-xs"
                      >
                        {alternativeCategories.map((c) => {
                          const parent = c.parent_id
                            ? allCategories.find((p) => p.id === c.parent_id)?.name
                            : null;
                          return (
                            <option key={c.id} value={c.id}>
                              {parent ? `${parent} / ` : ""}
                              {c.name}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </div>
                </label>
              )}

              <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-background p-2">
                <input
                  type="radio"
                  name="del-res"
                  checked={resolution === "unlink"}
                  onChange={() => setResolution("unlink")}
                  className="mt-1 accent-primary"
                />
                <div>
                  <span className="block font-semibold">فك الارتباط فقط (تصبح المنتجات «بدون تصنيف») ثم الحذف</span>
                  <span className="text-[11px] text-muted-foreground">
                    تُفصل التصنيفات الفرعية لتصبح رئيسية، وتبقى كل المنتجات محفوظة بدون حذف أي منتج.
                  </span>
                </div>
              </label>
            </div>
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:justify-end">
          <AlertDialogCancel disabled={deleting}>تراجع</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={
              deleting ||
              (hasConflict && resolution === "reassign" && !reassignTargetId)
            }
            onClick={() =>
              void onConfirmDelete(
                hasConflict ? resolution : "restrict",
                hasConflict && resolution === "reassign" ? reassignTargetId : null
              )
            }
            className="gap-1.5"
          >
            {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            {hasConflict ? "تنفيذ الإجراء وحذف التصنيف" : "تأكيد الحذف النهائي"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
