"use client";

import * as React from "react";

import { Loader2, Save } from "lucide-react";

import { CategoryIconPicker } from "@/components/categories/category-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_CATEGORY_ICON } from "@/lib/categories/icon-registry";
import type { CategoryRecord } from "@/lib/categories/types";

export interface CategoryEditorValues {
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  iconName: string;
  displayOrder: number;
  active: boolean;
}

export function CategoryEditorSheet({
  open,
  onOpenChange,
  editingCategory,
  initialParentId,
  categories,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCategory: CategoryRecord | null;
  initialParentId?: string | null;
  categories: CategoryRecord[];
  saving: boolean;
  onSubmit: (values: CategoryEditorValues, categoryId?: string) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [parentId, setParentId] = React.useState<string>("");
  const [iconName, setIconName] = React.useState<string>(DEFAULT_CATEGORY_ICON);
  const [displayOrder, setDisplayOrder] = React.useState<number>(1);
  const [active, setActive] = React.useState<boolean>(true);
  const [localError, setLocalError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLocalError(null);
    if (editingCategory) {
      setName(editingCategory.name);
      setSlug(editingCategory.slug);
      setDescription(editingCategory.description ?? "");
      setParentId(editingCategory.parent_id ?? "");
      setIconName(editingCategory.icon_name || DEFAULT_CATEGORY_ICON);
      setDisplayOrder(editingCategory.display_order ?? 1);
      setActive(editingCategory.active !== false);
    } else {
      setName("");
      setSlug("");
      setDescription("");
      setParentId(initialParentId ?? "");
      setIconName(DEFAULT_CATEGORY_ICON);
      setDisplayOrder(categories.length + 1);
      setActive(true);
    }
  }, [open, editingCategory, initialParentId, categories.length]);

  const editingHasChildren = Boolean(editingCategory && categories.some((c) => c.parent_id === editingCategory.id));

  const rootOptions = React.useMemo(
    () => categories.filter((c) => !c.parent_id && c.id !== editingCategory?.id),
    [categories, editingCategory?.id],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setLocalError("يرجى كتابة اسم التصنيف.");
      return;
    }
    setLocalError(null);
    try {
      await onSubmit(
        {
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim(),
          parentId: parentId || null,
          iconName,
          displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
          active,
        },
        editingCategory?.id,
      );
      onOpenChange(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "تعذر حفظ التصنيف.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
        <SheetHeader className="border-b pb-3 text-right">
          <SheetTitle className="text-lg font-bold">
            {editingCategory
              ? `تعديل التصنيف: ${editingCategory.name}`
              : initialParentId
                ? "إضافة تصنيف فرعي جديد"
                : "إضافة تصنيف رئيسي جديد"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            إعدادات كاملة للتصنيف تشمل الأيقونة من مكتبة shadcn/Lucide، التسلسل الهرمي، الرابط الدائم SEO، وحالة الظهور
            في المتجر.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-4 py-3">
          {localError && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {localError}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cat-name" className="text-xs font-semibold">
              اسم التصنيف *
            </Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: أدوات CROWN اللاسلكية"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">أيقونة التصنيف (shadcn / Lucide)</Label>
            <CategoryIconPicker value={iconName} onChange={setIconName} disabled={saving} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cat-parent" className="text-xs font-semibold">
                المستوى والتصنيف الأب
              </Label>
              <select
                id="cat-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={saving || editingHasChildren}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs shadow-2xs disabled:opacity-60"
              >
                <option value="">تصنيف رئيسي (مستوى أول)</option>
                {rootOptions.map((root) => (
                  <option key={root.id} value={root.id}>
                    فرعي من: {root.name}
                  </option>
                ))}
              </select>
              {editingHasChildren && (
                <p className="text-[11px] text-amber-600">
                  هذا التصنيف يضم فروعاً تحته، لذا يبقى رئيسياً حتى نقل الفروع.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cat-order" className="text-xs font-semibold">
                الترتيب (Display Order)
              </Label>
              <Input
                id="cat-order"
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Number(e.target.value) || 0)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-slug" className="text-xs font-semibold">
              الرابط الدائم (Slug) {editingCategory ? "" : "— اختياري"}
            </Label>
            <Input
              id="cat-slug"
              dir="ltr"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="crown-cordless-tools"
              className="font-mono text-xs"
              disabled={saving}
            />
            <p className="text-[11px] text-muted-foreground">
              {editingCategory
                ? "يحافظ التعديل على الرابط مستقراً ما لم تغيّره صراحةً."
                : "يُنشأ تلقائياً من الاسم إذا تُرك فارغاً."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-desc" className="text-xs font-semibold">
              الوصف المختصر (SEO والمتجر)
            </Label>
            <Textarea
              id="cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مثال: مثاقب ومناشير كراون الأصلية ببطاريات 20V مع التوصيل لـ 69 ولاية..."
              rows={3}
              disabled={saving}
            />
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
            <div>
              <div className="text-xs font-semibold">تفعيل وإظهار التصنيف في المتجر</div>
              <div className="text-[11px] text-muted-foreground">
                عند الإخفاء لا يظهر كزر فلترة للزبائن في صفحة /shop مع بقاء منتجاته محفوظة.
              </div>
            </div>
            <Switch checked={active} onCheckedChange={setActive} disabled={saving} />
          </label>

          <SheetFooter className="border-t pt-3 flex-row justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button type="submit" disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              {editingCategory ? "حفظ التعديلات" : "إنشاء التصنيف"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
