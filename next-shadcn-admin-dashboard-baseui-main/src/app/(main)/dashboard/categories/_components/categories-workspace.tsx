"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  ChevronsDownUp,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FolderPlus,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

import { CategoryIcon } from "@/components/categories/category-icon";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type {
  AiCategoryPlan,
  CategoryDeleteConflict,
  CategoryDeleteMode,
  CategoryRecord,
  CategorySchemaCapabilities,
} from "@/lib/categories/types";
import { orvaFetch } from "@/lib/orva-api";
import type { Product } from "@/lib/repository/product-types";

import { AiCategoryPlannerStudio } from "./ai-category-planner";
import { CategoryDeleteDialog } from "./category-delete-dialog";
import { CategoryEditorSheet, type CategoryEditorValues } from "./category-editor-sheet";

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await orvaFetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as
    | ({ success?: boolean; error?: string; data?: T } & Partial<CategoryDeleteConflict>)
    | null;

  if (res.status === 409 && body?.code === "CATEGORY_IN_USE") {
    const err = new Error(body.error || "التصنيف مستخدم حالياً.") as Error & {
      conflict?: CategoryDeleteConflict;
    };
    err.conflict = body as CategoryDeleteConflict;
    throw err;
  }

  if (!res.ok || !body?.success) {
    throw new Error(body?.error || `تعذر تنفيذ العملية (HTTP ${res.status})`);
  }
  return (body.data ?? body) as T;
}

export function CategoriesWorkspace() {
  const [categories, setCategories] = React.useState<CategoryRecord[]>([]);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [capabilities, setCapabilities] = React.useState<CategorySchemaCapabilities | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // Filters & Selection
  const [treeSearch, setTreeSearch] = React.useState("");
  const [expandedParents, setExpandedParents] = React.useState<Record<string, boolean>>({});
  const [productSearch, setProductSearch] = React.useState("");
  const [productFilter, setProductFilter] = React.useState<"all" | "unassigned" | "active" | "draft">("all");
  const [selectedProductIds, setSelectedProductIds] = React.useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = React.useState<string>("");

  // Modals / Sheets
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<CategoryRecord | null>(null);
  const [initialParentId, setInitialParentId] = React.useState<string | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<CategoryRecord | null>(null);
  const [deleteConflict, setDeleteConflict] = React.useState<CategoryDeleteConflict | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [sqlModalOpen, setSqlModalOpen] = React.useState(false);
  const aiStudioRef = React.useRef<HTMLDivElement>(null);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, prodRes] = await Promise.all([
        orvaFetch("/api/product-categories", { credentials: "same-origin", cache: "no-store" }),
        orvaFetch("/api/store-products", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const catJson = (await catRes.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        data?: CategoryRecord[];
        capabilities?: CategorySchemaCapabilities;
      } | null;
      const prodJson = (await prodRes.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        data?: Product[];
      } | null;

      if (!catRes.ok || !catJson?.success) {
        throw new Error(catJson?.error || "تعذر جلب التصنيفات.");
      }
      if (!prodRes.ok || !prodJson?.success) {
        throw new Error(prodJson?.error || "تعذر جلب المنتجات.");
      }

      const nextCats = catJson.data ?? [];
      setCategories(nextCats);
      setCapabilities(catJson.capabilities ?? null);
      setProducts(prodJson.data ?? []);

      setExpandedParents((prev) => {
        const next = { ...prev };
        for (const c of nextCats) {
          if (!c.parent_id && next[c.id] === undefined) next[c.id] = true;
        }
        return next;
      });
    } catch (err) {
      toast.add({
        title: "تعذر تحميل التصنيفات",
        description: err instanceof Error ? err.message : "حاول مجدداً.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const parents = React.useMemo(
    () =>
      categories
        .filter((c) => !c.parent_id)
        .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),
    [categories]
  );

  const childrenByParent = React.useMemo(() => {
    const map = new Map<string, CategoryRecord[]>();
    for (const c of categories) {
      if (!c.parent_id) continue;
      const list = map.get(c.parent_id) ?? [];
      list.push(c);
      map.set(c.parent_id, list);
    }
    for (const [k, list] of map.entries()) {
      map.set(
        k,
        list.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
      );
    }
    return map;
  }, [categories]);

  const flatCategoryLabel = React.useCallback(
    (c: CategoryRecord) => {
      if (!c.parent_id) return c.name;
      const p = categories.find((x) => x.id === c.parent_id);
      return p ? `${p.name} / ${c.name}` : c.name;
    },
    [categories]
  );

  const kpis = React.useMemo(() => {
    const rootCount = parents.length;
    const subCount = categories.length - rootCount;
    const categorizedCount = products.filter((p) => Boolean(p.categoryId)).length;
    const uncategorizedCount = products.length - categorizedCount;
    const coveragePct = products.length > 0 ? Math.round((categorizedCount / products.length) * 100) : 100;
    return { rootCount, subCount, categorizedCount, uncategorizedCount, coveragePct };
  }, [parents.length, categories.length, products]);

  const filteredParents = React.useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter((p) => {
      if (p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)) return true;
      const subs = childrenByParent.get(p.id) ?? [];
      return subs.some((s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q));
    });
  }, [parents, childrenByParent, treeSearch]);

  const filteredProducts = React.useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (productFilter === "unassigned" && p.categoryId) return false;
      if (productFilter === "active" && p.status !== "active") return false;
      if (productFilter === "draft" && p.status !== "draft") return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.categoryPath ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, productSearch, productFilter]);

  const allExpanded = React.useMemo(
    () => parents.length > 0 && parents.every((p) => expandedParents[p.id] !== false),
    [parents, expandedParents]
  );

  const toggleExpandAll = () => {
    const target = !allExpanded;
    const next: Record<string, boolean> = {};
    for (const p of parents) next[p.id] = target;
    setExpandedParents(next);
  };

  // ── CRUD Actions ────────────────────────────────────────────────────────────
  const openCreateModal = (parentId: string | null = null) => {
    setEditingCategory(null);
    setInitialParentId(parentId);
    setEditorOpen(true);
  };

  const openEditModal = (cat: CategoryRecord) => {
    setEditingCategory(cat);
    setInitialParentId(cat.parent_id);
    setEditorOpen(true);
  };

  const handleSaveCategory = async (values: CategoryEditorValues, categoryId?: string) => {
    setSaving(true);
    try {
      if (categoryId) {
        await apiJson(`/api/product-categories/${encodeURIComponent(categoryId)}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
        toast.add({
          title: "تم تحديث التصنيف",
          description: `حُفظت تعديلات «${values.name}» بنجاح.`,
          type: "success",
        });
      } else {
        await apiJson("/api/product-categories", {
          method: "POST",
          body: JSON.stringify(values),
        });
        toast.add({
          title: "تم إنشاء التصنيف",
          description: `أُضيف «${values.name}» إلى شجرة التصنيفات.`,
          type: "success",
        });
      }
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cat: CategoryRecord, nextActive: boolean) => {
    setSaving(true);
    try {
      await apiJson(`/api/product-categories/${encodeURIComponent(cat.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ active: nextActive }),
      });
      toast.add({
        title: nextActive ? "تم تفعيل التصنيف" : "تم إخفاء التصنيف",
        description: cat.name,
        type: "success",
      });
      await loadAll();
    } catch (err) {
      toast.add({
        title: "تعذر تغيير الحالة",
        description: err instanceof Error ? err.message : "حاول مجدداً.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMoveSibling = async (list: CategoryRecord[], idx: number, dir: -1 | 1) => {
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const reordered = [...list];
    const tmp = reordered[idx];
    reordered[idx] = reordered[swapIdx];
    reordered[swapIdx] = tmp;

    setSaving(true);
    try {
      await apiJson("/api/product-categories/reorder", {
        method: "POST",
        body: JSON.stringify({
          items: reordered.map((item, i) => ({
            id: item.id,
            displayOrder: i + 1,
          })),
        }),
      });
      await loadAll();
    } catch (err) {
      toast.add({
        title: "تعذر إعادة الترتيب",
        description: err instanceof Error ? err.message : "حاول مجدداً.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRequestDelete = async (cat: CategoryRecord) => {
    setDeleteTarget(cat);
    setDeleteConflict(null);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async (
    mode: CategoryDeleteMode,
    reassignToCategoryId?: string | null
  ) => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiJson(`/api/product-categories/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ mode, reassignToCategoryId }),
      });
      toast.add({
        title: "تم حذف التصنيف",
        description:
          mode === "reassign"
            ? `تم نقل البيانات المرتبطة ثم حذف «${deleteTarget.name}».`
            : mode === "unlink"
              ? `تم فك ارتباط المنتجات وحذف «${deleteTarget.name}».`
              : `تم حذف «${deleteTarget.name}» بنجاح.`,
        type: "success",
      });
      setDeleteDialogOpen(false);
      setDeleteConflict(null);
      await loadAll();
    } catch (err: unknown) {
      const withConflict = err as Error & { conflict?: CategoryDeleteConflict };
      if (withConflict.conflict) {
        setDeleteConflict(withConflict.conflict);
      } else {
        toast.add({
          title: "تعذر حذف التصنيف",
          description: err instanceof Error ? err.message : "حاول مجدداً.",
          type: "error",
        });
      }
    } finally {
      setDeleting(false);
    }
  };

  // ── Product Assignment & Bulk Operations ────────────────────────────────────
  const assignSingleProduct = async (productId: string, categoryId: string) => {
    setSaving(true);
    try {
      await apiJson("/api/product-categories/apply", {
        method: "POST",
        body: JSON.stringify({
          assignments: [{ productId, categoryId: categoryId || null }],
        }),
      });
      toast.add({
        title: "تم تحديث تصنيف المنتج",
        type: "success",
      });
      await loadAll();
    } catch (err) {
      toast.add({
        title: "تعذر ربط المنتج",
        description: err instanceof Error ? err.message : "حاول مجدداً.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const applyBulkAssignment = async (unlinkOnly = false) => {
    if (selectedProductIds.size === 0) return;
    if (!unlinkOnly && !bulkCategoryId) {
      toast.add({ title: "اختر تصنيفاً أولاً", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const assignments = Array.from(selectedProductIds).map((productId) => ({
        productId,
        categoryId: unlinkOnly ? null : bulkCategoryId,
      }));
      await apiJson("/api/product-categories/apply", {
        method: "POST",
        body: JSON.stringify({ assignments }),
      });
      toast.add({
        title: unlinkOnly ? "تم فك ارتباط المنتجات المحددة" : "تم تعيين التصنيف الجماعي",
        description: `تم تحديث ${assignments.length} منتج دفعة واحدة.`,
        type: "success",
      });
      setSelectedProductIds(new Set());
      setBulkCategoryId("");
      await loadAll();
    } catch (err) {
      toast.add({
        title: "تعذر التنفيذ الجماعي",
        description: err instanceof Error ? err.message : "حاول مجدداً.",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header = ["SKU", "Title", "Status", "Price_DZD", "Category_Path"].join(",");
    const rows = filteredProducts.map((p) =>
      [
        `"${(p.sku || "").replace(/"/g, '""')}"`,
        `"${(p.title || "").replace(/"/g, '""')}"`,
        `"${p.status}"`,
        p.sellingPrice,
        `"${(p.categoryPath || "بدون تصنيف").replace(/"/g, '""')}"`,
      ].join(",")
    );
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orva-categories-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── AI Planner Integration ──────────────────────────────────────────────────
  const handleAiGenerate = async (params: {
    mode: "all" | "uncategorized_only" | "reorganize";
    instructions: string;
  }) => {
    return apiJson<AiCategoryPlan>("/api/product-categories/suggest", {
      method: "POST",
      body: JSON.stringify(params),
    });
  };

  const handleAiApply = async ({
    plan,
    categoryNames,
    subNames,
    selection,
  }: {
    plan: AiCategoryPlan;
    categoryNames: Record<string, string>;
    subNames: Record<string, string>;
    selection: Record<string, string>;
  }) => {
    const existingRes = await apiJson<CategoryRecord[]>("/api/product-categories");
    const idByKey = new Map<string, string>();
    for (const c of existingRes) {
      idByKey.set(`${c.parent_id ?? "root"}::${c.name.trim().toLowerCase()}`, c.id);
    }

    const rootIdByProposal = new Map<string, string>();
    const childIdByProposal = new Map<string, string>();

    for (const proposed of plan.categories) {
      const parentName = (categoryNames[proposed.name] ?? proposed.name).trim();
      if (!parentName) continue;

      let parentId = idByKey.get(`root::${parentName.toLowerCase()}`);
      if (!parentId) {
        const created = await apiJson<CategoryRecord>("/api/product-categories", {
          method: "POST",
          body: JSON.stringify({
            name: parentName,
            description: proposed.description || null,
            iconName: proposed.iconName || "folder-tree",
          }),
        });
        parentId = created.id;
        idByKey.set(`root::${parentName.toLowerCase()}`, parentId);
      } else if (proposed.iconName) {
        // Enrich icon if category existed without custom icon
        await apiJson(`/api/product-categories/${encodeURIComponent(parentId)}`, {
          method: "PATCH",
          body: JSON.stringify({
            iconName: proposed.iconName,
            ...(proposed.description ? { description: proposed.description } : {}),
          }),
        }).catch(() => undefined);
      }
      rootIdByProposal.set(proposed.name, parentId);

      for (const sub of proposed.subcategories ?? []) {
        const subName = (subNames[`${proposed.name}::${sub.name}`] ?? sub.name).trim();
        if (!subName) continue;
        let subId = idByKey.get(`${parentId}::${subName.toLowerCase()}`);
        if (!subId) {
          const createdSub = await apiJson<CategoryRecord>("/api/product-categories", {
            method: "POST",
            body: JSON.stringify({
              name: subName,
              parentId,
              description: sub.description || null,
              iconName: sub.iconName || proposed.iconName || "folder-tree",
            }),
          });
          subId = createdSub.id;
          idByKey.set(`${parentId}::${subName.toLowerCase()}`, subId);
        }
        childIdByProposal.set(`${proposed.name}::${sub.name}`, subId);
      }
    }

    const finalAssignments: Array<{ productId: string; categoryId: string }> = [];
    for (const item of plan.assignments) {
      const prod =
        products.find((p) => p.id === item.productId) ||
        products.find((p) => p.sku && p.sku === item.sku);
      if (!prod) continue;
      const picked = selection[prod.id] ?? `${item.category}::${item.subcategory ?? ""}`;
      const [catName, subName] = picked.split("::");
      const targetId = subName
        ? childIdByProposal.get(`${catName}::${subName}`) ?? rootIdByProposal.get(catName)
        : rootIdByProposal.get(catName);
      if (targetId) {
        finalAssignments.push({ productId: prod.id, categoryId: targetId });
      }
    }

    if (finalAssignments.length > 0) {
      await apiJson("/api/product-categories/apply", {
        method: "POST",
        body: JSON.stringify({ assignments: finalAssignments }),
      });
    }

    toast.add({
      title: "تم اعتماد مخطط الذكاء الاصطناعي بنجاح",
      description: `تم تنظيم الشجرة وربط ${finalAssignments.length} منتج وتحديث المتجر.`,
      type: "success",
    });
    await loadAll();
  };

  return (
    <main className="space-y-6" dir="rtl">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            <FolderTree className="size-7 text-primary" />
            إدارة التصنيفات ومخطط الذكاء الاصطناعي
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تحكم إداري متكامل (CRUD) بالتصنيفات الرئيسية والفرعية، اختيار الأيقونات من مكتبة shadcn/Lucide، والربط الجماعي مع المتجر `/shop`.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadAll()}
            disabled={loading || saving}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => aiStudioRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="gap-1.5 border-primary/40"
          >
            <Bot className="size-4 text-primary" />
            استوديو الذكاء الاصطناعي
          </Button>
          <Button type="button" onClick={() => openCreateModal(null)} className="gap-1.5">
            <Plus className="size-4" />
            تصنيف رئيسي جديد
          </Button>
        </div>
      </header>

      {/* Non-blocking Schema Upgrade Notice */}
      {capabilities?.needsSqlUpgrade && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100">
          <AlertTriangle className="size-4 text-amber-600" />
          <AlertTitle className="flex flex-wrap items-center justify-between gap-2 font-bold">
            <span>التصنيفات تعمل الآن بوضع التوافق المؤقت (ترقية SQL الموصى بها متاحة)</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSqlModalOpen(true)}
              className="border-amber-600/40 bg-background text-xs"
            >
              عرض ونسخ كود SQL لـ Supabase
            </Button>
          </AlertTitle>
          <AlertDescription className="mt-1 text-xs">
            يعمل النظام حالياً بشكل طبيعي، ولإضافة أعمدة <code className="font-mono">parent_id</code> و<code className="font-mono">icon_name</code> ودالة <code className="font-mono">assign_product_categories</code> مباشرة إلى جدول Supabase يرجى تشغيل الكود مرة واحدة في Supabase SQL Editor.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Strip */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">التصنيفات الرئيسية</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tabular-nums">{kpis.rootCount}</span>
            <span className="text-xs text-muted-foreground">قسم نشط</span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">التصنيفات الفرعية</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tabular-nums">{kpis.subCount}</span>
            <span className="text-xs text-muted-foreground">مجموعة متفرعة</span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">المنتجات المصنّفة</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-600 tabular-nums">
              {kpis.categorizedCount}
            </span>
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px]">
              تغطية {kpis.coveragePct}%
            </Badge>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">منتجات بدون تصنيف</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className={`text-2xl font-extrabold tabular-nums ${
                kpis.uncategorizedCount > 0 ? "text-amber-600" : "text-emerald-600"
              }`}
            >
              {kpis.uncategorizedCount}
            </span>
            <span className="text-xs text-muted-foreground">
              {kpis.uncategorizedCount > 0 ? "تحتاج للربط" : "مكتملة 100%"}
            </span>
          </div>
        </Card>
      </section>

      {/* Main Split Grid: Category Tree (5 cols) + Product Assignment Table (7 cols) */}
      <section className="grid gap-6 lg:grid-cols-12">
        {/* Right: Hierarchical Tree CRUD */}
        <Card className="lg:col-span-5">
          <CardHeader className="border-b pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold">الهيكل الشجري للتصنيفات</CardTitle>
                <CardDescription className="text-xs">
                  تعديل الأيقونات، الترتيب، الظهور في المتجر، والحذف الآمن.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleExpandAll}
                className="gap-1 text-xs"
              >
                <ChevronsDownUp className="size-3.5" />
                {allExpanded ? "طي الكل" : "توسيع الكل"}
              </Button>
            </div>

            <div className="relative pt-2">
              <Search className="pointer-events-none absolute top-4.5 right-3 size-3.5 text-muted-foreground" />
              <Input
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
                placeholder="بحث في أسماء التصنيفات أو الـ slug..."
                className="h-8 pr-8 text-xs"
              />
            </div>
          </CardHeader>

          <CardContent className="space-y-3 pt-4">
            {loading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> جارٍ التحميل...
              </div>
            ) : filteredParents.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground space-y-2">
                <p>لا توجد تصنيفات مطابقة حالياً.</p>
                <Button type="button" size="sm" onClick={() => openCreateModal(null)} className="gap-1">
                  <Plus className="size-3.5" /> إضافة أول تصنيف
                </Button>
              </div>
            ) : (
              filteredParents.map((parent, pIdx) => {
                const subs = childrenByParent.get(parent.id) ?? [];
                const isExpanded = expandedParents[parent.id] !== false;
                return (
                  <div
                    key={parent.id}
                    className={`rounded-xl border p-3 transition ${
                      parent.active ? "bg-card" : "bg-muted/40 opacity-80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedParents((prev) => ({
                            ...prev,
                            [parent.id]: !isExpanded,
                          }))
                        }
                        className="flex min-w-0 flex-1 items-start gap-2.5 text-right cursor-pointer"
                      >
                        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40 text-primary">
                          <CategoryIcon name={parent.icon_name} className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-bold text-sm">{parent.name}</span>
                            <Badge variant="secondary" className="text-[11px] tabular-nums">
                              {parent.totalProductCount} منتج
                            </Badge>
                            {!parent.active && (
                              <Badge variant="outline" className="text-[10px] text-amber-600">
                                مخفي
                              </Badge>
                            )}
                          </div>
                          <div className="truncate font-mono text-[11px] text-muted-foreground" dir="ltr">
                            /{parent.slug}
                          </div>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <Switch
                          checked={parent.active}
                          onCheckedChange={(v) => void handleToggleActive(parent, v)}
                          disabled={saving}
                          aria-label={`تفعيل ${parent.name}`}
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={saving || pIdx === 0}
                          onClick={() => void handleMoveSibling(filteredParents, pIdx, -1)}
                          title="تحريك للأعلى"
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={saving || pIdx === filteredParents.length - 1}
                          onClick={() => void handleMoveSibling(filteredParents, pIdx, 1)}
                          title="تحريك للأسفل"
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => openCreateModal(parent.id)}
                          title="إضافة تصنيف فرعي"
                        >
                          <FolderPlus className="size-3.5 text-primary" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => openEditModal(parent)}
                          title="تعديل كامل"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => void handleRequestDelete(parent)}
                          title="حذف"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Subcategories */}
                    {isExpanded && subs.length > 0 && (
                      <div className="mt-2.5 space-y-1.5 border-s-2 border-primary/25 ps-3">
                        {subs.map((child, sIdx) => (
                          <div
                            key={child.id}
                            className="flex items-center justify-between gap-2 rounded-lg border bg-muted/20 px-2.5 py-2 text-xs"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-background text-primary">
                                <CategoryIcon name={child.icon_name} className="size-3.5" />
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-semibold">{child.name}</span>
                                  <Badge variant="outline" className="text-[10px] tabular-nums">
                                    {child.productCount}
                                  </Badge>
                                  {!child.active && (
                                    <span className="text-[10px] text-amber-600">(مخفي)</span>
                                  )}
                                </div>
                                <div className="truncate font-mono text-[10px] text-muted-foreground" dir="ltr">
                                  /{child.slug}
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-0.5">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => void handleToggleActive(child, !child.active)}
                                title={child.active ? "إخفاء من المتجر" : "إظهار في المتجر"}
                              >
                                {child.active ? (
                                  <Eye className="size-3.5 text-emerald-600" />
                                ) : (
                                  <EyeOff className="size-3.5 text-muted-foreground" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                disabled={saving || sIdx === 0}
                                onClick={() => void handleMoveSibling(subs, sIdx, -1)}
                                title="تحريك للأعلى"
                              >
                                <ArrowUp className="size-3" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                disabled={saving || sIdx === subs.length - 1}
                                onClick={() => void handleMoveSibling(subs, sIdx, 1)}
                                title="تحريك للأسفل"
                              >
                                <ArrowDown className="size-3" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                onClick={() => openEditModal(child)}
                                title="تعديل"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-7 text-destructive hover:text-destructive"
                                onClick={() => void handleRequestDelete(child)}
                                title="حذف"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Left: Product Assignment & Bulk Operations */}
        <Card className="lg:col-span-7">
          <CardHeader className="border-b pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold">ربط المنتجات والعمليات الجماعية</CardTitle>
                <CardDescription className="text-xs">
                  عيّن تصنيفاً لكل منتج أو حدّد عدة منتجات لتصنيفها دفعة واحدة.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={exportCsv} className="gap-1.5 text-xs">
                <Download className="size-3.5" />
                تصدير CSV
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute top-2.5 right-3 size-3.5 text-muted-foreground" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="بحث باسم المنتج أو SKU..."
                  className="h-8 pr-8 text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { id: "all", label: `الكل (${products.length})` },
                    { id: "unassigned", label: `غير مصنف (${kpis.uncategorizedCount})` },
                    { id: "active", label: "منشور" },
                    { id: "draft", label: "مسودة" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setProductFilter(tab.id)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                      productFilter === tab.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 pt-4">
            {/* Floating Bulk Bar */}
            {selectedProductIds.size > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                <span className="text-xs font-bold">
                  تم تحديد {selectedProductIds.size} منتج
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={bulkCategoryId}
                    onChange={(e) => setBulkCategoryId(e.target.value)}
                    disabled={saving}
                    className="h-8 rounded-md border bg-background px-2.5 text-xs"
                  >
                    <option value="">اختر تصنيفاً للتعيين الجماعي...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {flatCategoryLabel(c)}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving || !bulkCategoryId}
                    onClick={() => void applyBulkAssignment(false)}
                    className="h-8 gap-1 text-xs"
                  >
                    <Check className="size-3.5" /> تعيين
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void applyBulkAssignment(true)}
                    className="h-8 text-xs"
                  >
                    فك التصنيف
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedProductIds(new Set())}
                    className="h-8 text-xs"
                  >
                    إلغاء التحديد
                  </Button>
                </div>
              </div>
            )}

            {/* Products Table */}
            <div className="divide-y rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      filteredProducts.length > 0 &&
                      filteredProducts.every((p) => selectedProductIds.has(p.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProductIds(new Set(filteredProducts.map((p) => p.id)));
                      } else {
                        setSelectedProductIds(new Set());
                      }
                    }}
                    className="size-3.5 accent-primary"
                  />
                  <span>المنتج</span>
                </label>
                <span>التصنيف المرتبط</span>
              </div>

              {filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  لا توجد منتجات مطابقة لخيار البحث الحالي.
                </div>
              ) : (
                filteredProducts.map((prod) => {
                  const thumb = prod.images?.[0] && prod.images[0] !== "/placeholder.svg" ? prod.images[0] : null;
                  const selected = selectedProductIds.has(prod.id);
                  return (
                    <div
                      key={prod.id}
                      className={`flex flex-col gap-3 p-3 transition sm:flex-row sm:items-center sm:justify-between ${
                        selected ? "bg-primary/[0.04]" : "hover:bg-muted/20"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setSelectedProductIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(prod.id)) next.delete(prod.id);
                              else next.add(prod.id);
                              return next;
                            });
                          }}
                          className="size-4 shrink-0 accent-primary"
                          aria-label={`تحديد ${prod.title}`}
                        />

                        <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border bg-muted/40">
                          {thumb ? (
                            <Image
                              src={thumb}
                              alt={prod.title}
                              fill
                              sizes="44px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                              بلا صورة
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/dashboard/products?edit=${encodeURIComponent(prod.id)}`}
                              className="truncate text-xs font-bold hover:text-primary hover:underline"
                            >
                              {prod.title}
                            </Link>
                            <Badge variant="outline" className="text-[10px]">
                              {prod.status === "active" ? "نشط" : prod.status === "draft" ? "مسودة" : "مؤرشف"}
                            </Badge>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
                            <span>{prod.sku || prod.slug}</span>
                            <span>·</span>
                            <span>{new Intl.NumberFormat("fr-DZ").format(prod.sellingPrice)} د.ج</span>
                            {prod.publicUrl && (
                              <Link
                                href={prod.publicUrl}
                                target="_blank"
                                className="inline-flex items-center gap-0.5 text-primary hover:underline"
                              >
                                <ExternalLink className="size-2.5" /> معاينة
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {prod.categoryId ? (
                          <span className="hidden items-center gap-1 rounded-full border bg-muted/30 px-2 py-0.5 text-[11px] md:inline-flex">
                            <CategoryIcon name={prod.categoryIcon} className="size-3 text-primary" />
                            <span className="max-w-28 truncate">{prod.categoryPath || prod.categoryName}</span>
                          </span>
                        ) : (
                          <Badge
                            variant="outline"
                            className="hidden border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] md:inline-flex"
                          >
                            بدون تصنيف
                          </Badge>
                        )}
                        <select
                          aria-label={`تصنيف ${prod.title}`}
                          value={prod.categoryId ?? ""}
                          onChange={(e) => void assignSingleProduct(prod.id, e.target.value)}
                          disabled={saving}
                          className="h-8 w-full rounded-md border bg-background px-2 text-xs sm:w-52"
                        >
                          <option value="">بدون تصنيف</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {flatCategoryLabel(c)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* AI Categorization Studio */}
      <div ref={aiStudioRef}>
        <AiCategoryPlannerStudio
          products={products}
          existingCategories={categories}
          onGenerate={handleAiGenerate}
          onApplyPlan={handleAiApply}
        />
      </div>

      {/* Category Create / Edit Drawer */}
      <CategoryEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editingCategory={editingCategory}
        initialParentId={initialParentId}
        categories={categories}
        saving={saving}
        onSubmit={handleSaveCategory}
      />

      {/* Safe Delete / Reassign Dialog */}
      <CategoryDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        targetCategory={deleteTarget}
        conflict={deleteConflict}
        allCategories={categories}
        deleting={deleting}
        onConfirmDelete={handleConfirmDelete}
      />

      {/* SQL Migration Viewer Modal */}
      <Dialog open={sqlModalOpen} onOpenChange={setSqlModalOpen}>
        <DialogContent className="sm:max-w-2xl" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle className="text-base font-bold">ترقية جدول التصنيفات في Supabase SQL Editor</DialogTitle>
            <DialogDescription className="text-xs">
              انسخ الكود التالي وشغّله مرة واحدة داخل Supabase → SQL Editor ثم اضغط «إعادة فحص الجاهزية».
            </DialogDescription>
          </DialogHeader>
          <pre
            dir="ltr"
            className="max-h-80 overflow-auto rounded-lg border bg-muted p-3 text-left font-mono text-[11px]"
          >
            {capabilities?.migrationSql || ""}
          </pre>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (capabilities?.migrationSql) {
                  await navigator.clipboard.writeText(capabilities.migrationSql);
                  toast.add({ title: "تم نسخ كود SQL بنجاح", type: "success" });
                }
              }}
              className="gap-1.5"
            >
              <Copy className="size-3.5" />
              نسخ SQL
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setSqlModalOpen(false);
                await loadAll();
              }}
            >
              إعادة فحص الجاهزية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
