"use client";

import * as React from "react";
import { Bot, CheckCircle2, Loader2, Save, Sparkles, Wand2, X } from "lucide-react";

import { CategoryIcon } from "@/components/categories/category-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AiCategoryPlan, CategoryRecord } from "@/lib/categories/types";
import type { Product } from "@/lib/repository/product-types";

export function AiCategoryPlannerStudio({
  products,
  existingCategories,
  onGenerate,
  onApplyPlan,
}: {
  products: Product[];
  existingCategories: CategoryRecord[];
  onGenerate: (params: { mode: "all" | "uncategorized_only" | "reorganize"; instructions: string }) => Promise<AiCategoryPlan>;
  onApplyPlan: (input: {
    plan: AiCategoryPlan;
    categoryNames: Record<string, string>;
    subNames: Record<string, string>;
    selection: Record<string, string>;
  }) => Promise<void>;
}) {
  const [mode, setMode] = React.useState<"all" | "uncategorized_only" | "reorganize">("all");
  const [instructions, setInstructions] = React.useState(
    "صنّف المنتجات والباقات حسب عائلة الاستخدام في الورشة والسيارة واللحام مع إبراز باقات CROWN الأصلية بأيقونات مناسبة."
  );
  const [generating, setGenerating] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [plan, setPlan] = React.useState<AiCategoryPlan | null>(null);
  const [categoryNames, setCategoryNames] = React.useState<Record<string, string>>({});
  const [subNames, setSubNames] = React.useState<Record<string, string>>({});
  const [selection, setSelection] = React.useState<Record<string, string>>({});

  const uncategorizedCount = React.useMemo(
    () => products.filter((p) => !p.categoryId).length,
    [products]
  );

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const nextPlan = await onGenerate({ mode, instructions });
      setPlan(nextPlan);
      setCategoryNames(
        Object.fromEntries(nextPlan.categories.map((c) => [c.name, c.name]))
      );
      setSubNames(
        Object.fromEntries(
          nextPlan.categories.flatMap((c) =>
            (c.subcategories ?? []).map((s) => [`${c.name}::${s.name}`, s.name])
          )
        )
      );
      const initialSel: Record<string, string> = {};
      for (const item of nextPlan.assignments) {
        const prod =
          products.find((p) => p.id === item.productId) ||
          products.find((p) => p.sku && p.sku === item.sku);
        if (prod) {
          initialSel[prod.id] = `${item.category}::${item.subcategory ?? ""}`;
        }
      }
      setSelection(initialSel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إعداد مخطط الذكاء الاصطناعي.");
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = async () => {
    if (!plan) return;
    setApplying(true);
    setError(null);
    try {
      await onApplyPlan({ plan, categoryNames, subNames, selection });
      setPlan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر اعتماد المخطط.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-b from-primary/[0.03] to-background shadow-sm">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg font-bold">
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Bot className="size-4" />
              </span>
              استوديو مخطط الذكاء الاصطناعي (Orva AI Planner)
              <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px]">
                <Sparkles className="size-3" /> Gemini AI
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              يحلل الوكيل جميع المنتجات والوصف والشجرة الحالية ({existingCategories.length} تصنيف حالي)، ثم يقترح هيكل تصنيفات وأيقونات وتوزيعاً كاملاً لتراجعه قبل الحفظ.
            </CardDescription>
          </div>
          <Button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating || applying}
            className="gap-2"
          >
            {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {generating ? "الوكيل يحلل الكتالوج..." : "توليد مخطط تصنيف بالذكاء الاصطناعي"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Custom Guidance & Scope */}
        <div className="grid gap-3 md:grid-cols-12">
          <div className="space-y-1.5 md:col-span-4">
            <Label htmlFor="ai-mode" className="text-xs font-semibold">
              نطاق التحليل
            </Label>
            <select
              id="ai-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
              disabled={generating || applying}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs shadow-2xs"
            >
              <option value="all">كل المنتجات ({products.length} منتج)</option>
              <option value="uncategorized_only">
                المنتجات غير المصنفة فقط ({uncategorizedCount} منتج)
              </option>
              <option value="reorganize">إعادة تنظيم وتوحيد كامل الشجرة والمنتجات</option>
            </select>
          </div>

          <div className="space-y-1.5 md:col-span-8">
            <Label htmlFor="ai-instructions" className="text-xs font-semibold">
              توجيهات إضافية لوكيل Orva AI (اختياري)
            </Label>
            <Textarea
              id="ai-instructions"
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="مثال: قسّم الأدوات حسب الاستعمال (الورشة، اللحام، السيارة)، وادمج التصنيفات المتشابهة..."
              disabled={generating || applying}
              className="text-xs"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {plan && (
          <div className="space-y-4 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div>
                <div className="flex items-center gap-2 font-bold text-sm">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  مقترح الوكيل — مراجعة وتعديل قبل الاعتماد
                </div>
                {plan.summary && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{plan.summary}</p>
                )}
              </div>
              <Badge variant="secondary" className="text-xs">
                {plan.categories.length} تصنيف رئيسي · {plan.assignments.length} ربط مقترح
              </Badge>
            </div>

            {/* Proposed Tree */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-muted-foreground">
                1. هيكل التصنيفات المقترح (يمكنك تعديل أي اسم قبل الحفظ):
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {plan.categories.map((cat) => (
                  <div key={cat.name} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-background text-primary">
                        <CategoryIcon name={cat.iconName} className="size-4" />
                      </span>
                      <Input
                        value={categoryNames[cat.name] ?? cat.name}
                        onChange={(e) =>
                          setCategoryNames((prev) => ({ ...prev, [cat.name]: e.target.value }))
                        }
                        className="h-8 text-xs font-semibold"
                        aria-label={`تعديل اسم ${cat.name}`}
                      />
                      {cat.isExisting && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          موجود
                        </Badge>
                      )}
                    </div>
                    {cat.description && (
                      <p className="text-[11px] text-muted-foreground">{cat.description}</p>
                    )}

                    {(cat.subcategories ?? []).length > 0 && (
                      <div className="space-y-1.5 border-s-2 border-primary/30 ps-2.5 pt-1">
                        {(cat.subcategories ?? []).map((sub) => (
                          <div key={sub.name} className="flex items-center gap-1.5">
                            <CategoryIcon name={sub.iconName} className="size-3.5 shrink-0 text-muted-foreground" />
                            <Input
                              value={subNames[`${cat.name}::${sub.name}`] ?? sub.name}
                              onChange={(e) =>
                                setSubNames((prev) => ({
                                  ...prev,
                                  [`${cat.name}::${sub.name}`]: e.target.value,
                                }))
                              }
                              className="h-7 text-[11px]"
                              aria-label={`تعديل فرعي ${sub.name}`}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Proposed Product Assignments */}
            {plan.assignments.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-muted-foreground">
                  2. توزيع المنتجات المقترح ({plan.assignments.length}):
                </div>
                <div className="max-h-72 space-y-2 overflow-auto rounded-lg border p-2">
                  {plan.assignments.map((item, idx) => {
                    const prod =
                      products.find((p) => p.id === item.productId) ||
                      products.find((p) => p.sku && p.sku === item.sku);
                    if (!prod) return null;
                    const currentVal = selection[prod.id] ?? `${item.category}::${item.subcategory ?? ""}`;
                    return (
                      <div
                        key={`${prod.id}-${idx}`}
                        className="flex flex-col gap-2 rounded-md border bg-muted/15 p-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-bold">{prod.title}</span>
                            {typeof item.confidence === "number" && (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px]"
                              >
                                ثقة {Math.round(item.confidence)}%
                              </Badge>
                            )}
                          </div>
                          {item.reason && (
                            <p className="text-[11px] text-muted-foreground">السبب: {item.reason}</p>
                          )}
                          {prod.categoryPath && (
                            <p className="text-[11px] text-amber-600">الحالي: {prod.categoryPath}</p>
                          )}
                        </div>

                        <select
                          aria-label={`تصنيف ${prod.title}`}
                          value={currentVal}
                          onChange={(e) =>
                            setSelection((prev) => ({ ...prev, [prod.id]: e.target.value }))
                          }
                          className="h-8 w-full rounded-md border bg-background px-2.5 text-xs sm:w-64"
                        >
                          {plan.categories.flatMap((c) => [
                            <option key={`${c.name}::`} value={`${c.name}::`}>
                              {categoryNames[c.name] ?? c.name} (رئيسي)
                            </option>,
                            ...(c.subcategories ?? []).map((s) => (
                              <option key={`${c.name}::${s.name}`} value={`${c.name}::${s.name}`}>
                                {categoryNames[c.name] ?? c.name} / {subNames[`${c.name}::${s.name}`] ?? s.name}
                              </option>
                            )),
                          ])}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPlan(null)}
                disabled={applying}
                className="gap-1.5"
              >
                <X className="size-3.5" /> إلغاء المقترح
              </Button>
              <Button
                type="button"
                onClick={() => void handleApply()}
                disabled={applying}
                className="gap-1.5"
              >
                {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {applying ? "جارٍ حفظ الشجرة وربط المنتجات..." : "اعتماد وحفظ المخطط الكامل"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
