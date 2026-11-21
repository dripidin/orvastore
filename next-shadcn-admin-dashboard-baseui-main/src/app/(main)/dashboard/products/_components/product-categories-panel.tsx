"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, FolderTree, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { orvaFetch } from "@/lib/orva-api";
import type { Product } from "@/lib/repository/product-types";

type Category = { id: string; name: string; slug: string; description: string | null; parent_id: string | null; display_order: number; active: boolean; productCount?: number };
type Plan = { categories: Array<{ name: string; subcategories?: string[] }>; assignments: Array<{ sku: string; category: string; subcategory?: string | null }> };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await orvaFetch(url, { credentials: "same-origin", cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json() as { success?: boolean; error?: string; data?: T };
  if (!response.ok || !body.success) throw new Error(body.error || "تعذر إكمال العملية.");
  return body.data as T;
}

export function ProductCategoriesPanel({ products, onChanged }: { products: Product[]; onChanged: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planSelection, setPlanSelection] = useState<Record<string, string>>({});
  const [planCategoryNames, setPlanCategoryNames] = useState<Record<string, string>>({});
  const [planSubNames, setPlanSubNames] = useState<Record<string, string>>({});
  const parents = useMemo(() => categories.filter((category) => !category.parent_id), [categories]);
  const leaves = useMemo(() => categories, [categories]);
  const reload = async () => setCategories(await request<Category[]>("/api/product-categories"));

  useEffect(() => { void reload().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "تعذر جلب التصنيفات.")); }, []);

  const createCategory = async () => {
    if (!name.trim()) return;
    setBusy(true); setMessage("");
    try {
      await request<Category>("/api/product-categories", { method: "POST", body: JSON.stringify({ name, parentId: parentId || null }) });
      setName(""); setParentId(""); await reload(); setMessage("تم حفظ التصنيف في قاعدة البيانات.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر حفظ التصنيف."); }
    finally { setBusy(false); }
  };

  const assign = async (productId: string, categoryId: string) => {
    setBusy(true); setMessage("");
    try {
      await request(`/api/store-products/${encodeURIComponent(productId)}`, { method: "PATCH", body: JSON.stringify({ categoryId: categoryId || null }) });
      await reload(); onChanged(); setMessage("تم تحديث ربط المنتج بالتصنيف.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر ربط المنتج."); }
    finally { setBusy(false); }
  };

  const suggest = async () => {
    setBusy(true); setMessage("");
    try {
      const nextPlan = await request<Plan>("/api/product-categories/suggest", { method: "POST", body: "{}" });
      setPlan(nextPlan);
      setPlanCategoryNames(Object.fromEntries(nextPlan.categories.map((category) => [category.name, category.name])));
      setPlanSubNames(Object.fromEntries(nextPlan.categories.flatMap((category) => (category.subcategories ?? []).map((sub) => [`${category.name}::${sub}`, sub]))));
      const initial: Record<string, string> = {};
      for (const item of nextPlan.assignments) {
        const product = products.find((candidate) => candidate.sku === item.sku);
        if (product) initial[product.id] = `${item.category}::${item.subcategory ?? ""}`;
      }
      setPlanSelection(initial); setMessage(`راجع المقترح: ${nextPlan.assignments.length} منتج و${nextPlan.categories.length} تصنيف رئيسي. لم يُحفظ أي تغيير بعد.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر إعداد المقترح."); }
    finally { setBusy(false); }
  };

  const confirmPlan = async () => {
    if (!plan) return;
    setBusy(true); setMessage("");
    try {
      const idByName = new Map<string, string>();
      const rootIdByProposal = new Map<string, string>();
      const childIdByProposal = new Map<string, string>();
      const refreshed = await request<Category[]>("/api/product-categories");
      for (const category of refreshed) idByName.set(`${category.parent_id ?? "root"}::${category.name}`, category.id);
      for (const proposed of plan.categories) {
        const parentName = (planCategoryNames[proposed.name] ?? proposed.name).trim();
        if (!parentName) continue;
        let parent = idByName.get(`root::${parentName}`);
        if (!parent) {
          const created = await request<Category>("/api/product-categories", { method: "POST", body: JSON.stringify({ name: parentName }) });
          parent = created.id; idByName.set(`root::${parentName}`, parent);
        }
        rootIdByProposal.set(proposed.name, parent);
        for (const proposedSub of proposed.subcategories ?? []) {
          const subName = (planSubNames[`${proposed.name}::${proposedSub}`] ?? proposedSub).trim();
          if (!subName) continue;
          if (!idByName.has(`${parent}::${subName}`)) {
            const created = await request<Category>("/api/product-categories", { method: "POST", body: JSON.stringify({ name: subName, parentId: parent }) });
            idByName.set(`${parent}::${subName}`, created.id);
          }
          childIdByProposal.set(`${proposed.name}::${proposedSub}`, idByName.get(`${parent}::${subName}`)!);
        }
      }
      const productAssignments: Array<{ productId: string; categoryId: string }> = [];
      for (const assignment of plan.assignments) {
        const product = products.find((candidate) => candidate.sku === assignment.sku);
        if (!product) continue;
        const selected = planSelection[product.id] ?? `${assignment.category}::${assignment.subcategory ?? ""}`;
        const [categoryName, subcategoryName] = selected.split("::");
        const categoryId = subcategoryName
          ? childIdByProposal.get(`${categoryName}::${subcategoryName}`)
          : rootIdByProposal.get(categoryName);
        if (!categoryId) throw new Error(`تعذر تحديد تصنيف المنتج: ${product.title}`);
        productAssignments.push({ productId: product.id, categoryId });
      }
      await request("/api/product-categories/apply", { method: "POST", body: JSON.stringify({ assignments: productAssignments }) });
      setPlan(null); await reload(); onChanged(); setMessage("تم اعتماد المخطط وربط المنتجات.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر اعتماد المخطط."); }
    finally { setBusy(false); }
  };

  const removeCategory = async (category: Category) => {
    if (!window.confirm(`حذف التصنيف «${category.name}»؟`)) return;
    setBusy(true); setMessage("");
    try { await request(`/api/product-categories/${category.id}`, { method: "DELETE" }); await reload(); setMessage("تم حذف التصنيف."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر حذف التصنيف."); }
    finally { setBusy(false); }
  };

  const renameCategory = async (category: Category) => {
    const nextName = window.prompt("اسم التصنيف", category.name)?.trim();
    if (!nextName || nextName === category.name) return;
    setBusy(true); setMessage("");
    try { await request(`/api/product-categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ name: nextName }) }); await reload(); setMessage("تم تحديث اسم التصنيف."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تحديث التصنيف."); }
    finally { setBusy(false); }
  };

  return <Card className="border shadow-sm">
    <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><CardTitle className="flex items-center gap-2"><FolderTree className="size-5 text-primary" /> Categories</CardTitle><CardDescription>تصنيفات رئيسية وفرعية مرتبطة مباشرة بمنتجات المتجر.</CardDescription></div>
      <Button variant="outline" onClick={suggest} disabled={busy} className="gap-2"><Bot className="size-4" />اقترح مخططاً بالوكيل</Button>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="اسم التصنيف أو المجموعة الفرعية" />
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">تصنيف رئيسي</option>{parents.map((category) => <option key={category.id} value={category.id}>فرعي من: {category.name}</option>)}</select>
        <Button onClick={createCategory} disabled={busy || !name.trim()} className="gap-2"><Plus className="size-4" />إضافة</Button>
      </div>
      {message && <p role="status" className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{message}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">شجرة التصنيفات</h3>
          {parents.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">أضف تصنيفاً أو اطلب من الوكيل تجهيز مقترح.</p> : parents.map((parent) => <div className="rounded-lg border p-3" key={parent.id}>
            <div className="flex items-center justify-between gap-2"><div className="font-semibold">{parent.name}<span className="ms-2 text-xs font-normal text-muted-foreground">{parent.productCount ?? 0} منتج</span></div><div className="flex"><Button size="icon" variant="ghost" aria-label={`تعديل ${parent.name}`} onClick={() => renameCategory(parent)} disabled={busy}><Pencil className="size-3.5" /></Button><Button size="icon" variant="ghost" aria-label={`حذف ${parent.name}`} onClick={() => removeCategory(parent)} disabled={busy}><Trash2 className="size-4" /></Button></div></div>
            {categories.filter((category) => category.parent_id === parent.id).map((child) => <div key={child.id} className="mt-2 flex items-center justify-between border-s-2 ps-3 text-sm text-muted-foreground"><span>{child.name} · {child.productCount ?? 0} منتج</span><div className="flex"><Button size="icon" variant="ghost" aria-label={`تعديل ${child.name}`} onClick={() => renameCategory(child)} disabled={busy}><Pencil className="size-3.5" /></Button><Button size="icon" variant="ghost" aria-label={`حذف ${child.name}`} onClick={() => removeCategory(child)} disabled={busy}><Trash2 className="size-3.5" /></Button></div></div>)}
          </div>)}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">ربط المنتجات</h3>
          <div className="max-h-80 space-y-2 overflow-auto rounded-lg border p-2">{products.map((product) => <label key={product.id} className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-muted/40 p-2 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{product.title}</span><span className="block truncate text-xs text-muted-foreground">{product.sku} · {product.status === "active" ? "نشط" : product.status === "draft" ? "مسودة" : "مؤرشف"}</span></span><select aria-label={`تصنيف ${product.title}`} className="max-w-[50%] rounded-md border bg-background px-2 py-1.5 text-xs" value={product.categoryId ?? ""} onChange={(event) => void assign(product.id, event.target.value)} disabled={busy}><option value="">بدون تصنيف</option>{leaves.map((category) => <option key={category.id} value={category.id}>{category.parent_id ? `${categories.find((parent) => parent.id === category.parent_id)?.name} / ` : ""}{category.name}</option>)}</select></label>)}</div>
        </div>
      </div>
      {plan && <section className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4">
        <div><h3 className="font-bold">مخطط الوكيل — مراجعة قبل الاعتماد</h3><p className="text-xs text-muted-foreground">يمكن تغيير أسماء التصنيفات وتبديل تصنيف كل منتج قبل الحفظ.</p></div>
        <div className="grid gap-2 sm:grid-cols-2">{plan.categories.map((category) => <div className="space-y-2 rounded-lg border bg-background p-3" key={category.name}><Input aria-label="اسم تصنيف مقترح" value={planCategoryNames[category.name] ?? category.name} onChange={(event) => setPlanCategoryNames((current) => ({ ...current, [category.name]: event.target.value }))} />{(category.subcategories ?? []).map((subcategory) => <Input key={subcategory} aria-label="اسم تصنيف فرعي مقترح" value={planSubNames[`${category.name}::${subcategory}`] ?? subcategory} onChange={(event) => setPlanSubNames((current) => ({ ...current, [`${category.name}::${subcategory}`]: event.target.value }))} />)}</div>)}</div>
        <div className="max-h-64 space-y-2 overflow-auto">{plan.assignments.map((assignment) => { const product = products.find((item) => item.sku === assignment.sku); if (!product) return null; return <label key={product.id} className="flex items-center justify-between gap-2 rounded-md border bg-background p-2 text-xs"><span className="min-w-0 truncate">{product.title}</span><select className="max-w-[58%] rounded-md border bg-background px-2 py-1.5" value={planSelection[product.id] ?? `${assignment.category}::${assignment.subcategory ?? ""}`} onChange={(event) => setPlanSelection((current) => ({ ...current, [product.id]: event.target.value }))}>{plan.categories.flatMap((category) => [<option key={`${category.name}::root`} value={`${category.name}::`}>{planCategoryNames[category.name] ?? category.name}</option>, ...(category.subcategories ?? []).map((subcategory) => <option key={`${category.name}::${subcategory}`} value={`${category.name}::${subcategory}`}>{planCategoryNames[category.name] ?? category.name} / {planSubNames[`${category.name}::${subcategory}`] ?? subcategory}</option>)])}</select></label>; })}</div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setPlan(null)} disabled={busy}>إلغاء المقترح</Button><Button onClick={confirmPlan} disabled={busy} className="gap-2"><Save className="size-4" />اعتماد وربط المنتجات</Button></div>
      </section>}
    </CardContent>
  </Card>;
}
