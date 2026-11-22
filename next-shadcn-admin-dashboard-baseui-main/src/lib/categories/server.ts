import { revalidateStore } from "@/lib/catalog/revalidate";
import { getSupabaseServerClient } from "@/lib/supabase/server";

import { DEFAULT_CATEGORY_ICON, normalizeCategoryIconName } from "./icon-registry";
import type {
  CategoryDeleteConflict,
  CategoryDeleteOptions,
  CategoryInput,
  CategoryRecord,
  CategorySchemaCapabilities,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const CATEGORY_HIERARCHY_SQL = `-- ORVA Store: ترقية جدول التصنيفات (التسلسل الهرمي + الأيقونات + الربط الجماعي)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS icon_name TEXT DEFAULT 'folder-tree';

CREATE INDEX IF NOT EXISTS idx_categories_parent_order
  ON public.categories(parent_id, display_order, name);

CREATE INDEX IF NOT EXISTS idx_products_category_id
  ON public.products(category_id);

CREATE OR REPLACE FUNCTION public.assign_product_categories(p_assignments JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assignment JSONB;
  target_cat UUID;
BEGIN
  IF jsonb_typeof(p_assignments) <> 'array' THEN
    RAISE EXCEPTION 'Assignments must be an array';
  END IF;
  FOR assignment IN SELECT value FROM jsonb_array_elements(p_assignments)
  LOOP
    IF NULLIF(BTRIM(COALESCE(assignment->>'categoryId', '')), '') IS NULL THEN
      target_cat := NULL;
    ELSE
      target_cat := (assignment->>'categoryId')::UUID;
    END IF;

    UPDATE public.products
       SET category_id = target_cat,
           updated_at = now()
     WHERE id = (assignment->>'productId')::UUID;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product not found: %', assignment->>'productId';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_product_categories(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_product_categories(JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';`;

interface CategoryMetaOverlayEntry {
  parentId?: string | null;
  iconName?: string | null;
}

type CategoryMetaOverlayMap = Record<string, CategoryMetaOverlayEntry>;

function db(): any {
  return getSupabaseServerClient() as any;
}

export function slugifyCategoryName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || "category";
}

function isMissingColumnError(error: any, col?: string): boolean {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = String(error.message || "").toLowerCase();
  if (code === "42703" || code === "PGRST204") {
    return col ? msg.includes(col.toLowerCase()) : true;
  }
  return msg.includes("does not exist") && (!col || msg.includes(col.toLowerCase()));
}

async function readCategoryOverlay(supabase: any): Promise<CategoryMetaOverlayMap> {
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("id, integrations")
      .eq("id", 1)
      .maybeSingle();
    const raw = data?.integrations?.category_meta;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as CategoryMetaOverlayMap) : {};
  } catch {
    return {};
  }
}

async function patchCategoryOverlay(
  supabase: any,
  mutator: (prev: CategoryMetaOverlayMap) => CategoryMetaOverlayMap
): Promise<void> {
  try {
    const { data: row } = await supabase
      .from("site_settings")
      .select("id, integrations")
      .eq("id", 1)
      .maybeSingle();
    const integrations =
      row?.integrations && typeof row.integrations === "object" ? { ...row.integrations } : {};
    const prev =
      integrations.category_meta && typeof integrations.category_meta === "object"
        ? { ...(integrations.category_meta as CategoryMetaOverlayMap) }
        : {};
    const next = mutator(prev);
    integrations.category_meta = next;
    await supabase
      .from("site_settings")
      .upsert(
        { id: 1, integrations, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
  } catch (err) {
    console.warn("[categories] overlay sync warning:", err);
  }
}

export async function probeCategorySchema(supabase = db()): Promise<CategorySchemaCapabilities> {
  const [parentCheck, iconCheck, rpcCheck] = await Promise.all([
    supabase.from("categories").select("id, parent_id").limit(1),
    supabase.from("categories").select("id, icon_name").limit(1),
    supabase.rpc("assign_product_categories", { p_assignments: "probe_only" }),
  ]);

  const hasParentId = !parentCheck.error;
  const hasIconName = !iconCheck.error;
  // Note: passing "probe_only" triggers exception from the function body ('Assignments must be an array'), NOT PGRST202
  const rpcCode = String(rpcCheck.error?.code || "");
  const hasAssignRpc = rpcCode !== "PGRST202" && !String(rpcCheck.error?.message || "").includes("Could not find the function");

  return {
    hasParentId,
    hasIconName,
    hasAssignRpc,
    needsSqlUpgrade: !hasParentId || !hasIconName || !hasAssignRpc,
    migrationSql: CATEGORY_HIERARCHY_SQL,
  };
}

function buildCategoryColumnsSelect(caps: CategorySchemaCapabilities): string {
  const cols = ["id", "name", "slug", "description", "display_order", "active", "created_at", "updated_at"];
  if (caps.hasParentId) cols.push("parent_id");
  if (caps.hasIconName) cols.push("icon_name");
  return cols.join(",");
}

async function fetchRawCategoriesAndCounts(supabase = db(), onlyPublishedProducts = false): Promise<{
  categories: CategoryRecord[];
  capabilities: CategorySchemaCapabilities;
  totalProducts: number;
  uncategorizedCount: number;
}> {
  const capabilities = await probeCategorySchema(supabase);
  const selectCols = buildCategoryColumnsSelect(capabilities);

  const productQuery = onlyPublishedProducts
    ? supabase.from("products").select("id, category_id, status").eq("status", "PUBLISHED")
    : supabase.from("products").select("id, category_id, status");

  const [{ data: rows, error }, { data: products, error: prodError }, overlay] = await Promise.all([
    supabase.from("categories").select(selectCols).order("display_order", { ascending: true }).order("name", { ascending: true }),
    productQuery,
    !capabilities.hasParentId || !capabilities.hasIconName ? readCategoryOverlay(supabase) : Promise.resolve({} as CategoryMetaOverlayMap),
  ]);

  if (error) throw new Error(error.message);
  if (prodError) throw new Error(prodError.message);

  const directCounts = new Map<string, number>();
  let uncategorizedCount = 0;
  for (const p of products ?? []) {
    if (p.category_id) {
      directCounts.set(p.category_id, (directCounts.get(p.category_id) ?? 0) + 1);
    } else {
      uncategorizedCount += 1;
    }
  }

  const hydrated: CategoryRecord[] = (rows ?? []).map((row: any) => {
    const ov = overlay[row.id];
    const parentId = capabilities.hasParentId ? (row.parent_id ?? null) : (ov?.parentId ?? null);
    const iconName = normalizeCategoryIconName(
      capabilities.hasIconName ? row.icon_name : (ov?.iconName ?? DEFAULT_CATEGORY_ICON)
    );
    return {
      id: String(row.id),
      name: String(row.name),
      slug: String(row.slug),
      description: row.description ? String(row.description) : null,
      parent_id: parentId,
      icon_name: iconName,
      display_order: Number(row.display_order ?? 0),
      active: row.active !== false,
      productCount: directCounts.get(row.id) ?? 0,
      totalProductCount: directCounts.get(row.id) ?? 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  // Roll up child product counts onto parents cleanly
  const childSumByParent = new Map<string, number>();
  for (const c of hydrated) {
    if (c.parent_id) {
      childSumByParent.set(c.parent_id, (childSumByParent.get(c.parent_id) ?? 0) + c.productCount);
    }
  }
  for (const c of hydrated) {
    if (!c.parent_id) {
      c.totalProductCount = c.productCount + (childSumByParent.get(c.id) ?? 0);
    }
  }

  return {
    categories: hydrated,
    capabilities,
    totalProducts: (products ?? []).length,
    uncategorizedCount,
  };
}

export async function adminListCategories() {
  return fetchRawCategoriesAndCounts(db(), false);
}

export async function publicListActiveCategories() {
  const data = await fetchRawCategoriesAndCounts(db(), true);
  return data.categories.filter((c) => c.active);
}

async function ensureUniqueCategorySlug(supabase: any, baseSlug: string, excludeId?: string): Promise<string> {
  const normalized = slugifyCategoryName(baseSlug);
  let candidate = normalized;
  for (let i = 0; i < 20; i++) {
    const q = supabase.from("categories").select("id").eq("slug", candidate);
    const { data } = excludeId ? await q.neq("id", excludeId).maybeSingle() : await q.maybeSingle();
    if (!data) return candidate;
    candidate = `${normalized}-${i + 2}`;
  }
  return `${normalized}-${Date.now().toString(36)}`;
}

export async function adminCreateCategory(input: CategoryInput): Promise<CategoryRecord> {
  const supabase = db();
  const name = input.name?.trim();
  if (!name || name.length > 80) {
    throw new Error("اسم التصنيف مطلوب (بحد أقصى 80 حرفاً).");
  }

  const { categories, capabilities } = await fetchRawCategoriesAndCounts(supabase, false);

  const parentId = input.parentId ? String(input.parentId).trim() : null;
  if (parentId) {
    const parent = categories.find((c) => c.id === parentId);
    if (!parent || parent.parent_id) {
      throw new Error("اختر تصنيفاً رئيسياً صالحاً لإنشاء تصنيف فرعي تحته.");
    }
  }

  const slug = await ensureUniqueCategorySlug(supabase, input.slug?.trim() || name);
  const iconName = normalizeCategoryIconName(input.iconName);
  const nextOrder =
    typeof input.displayOrder === "number" && Number.isFinite(input.displayOrder)
      ? Math.max(0, Math.round(input.displayOrder))
      : categories.length + 1;

  const insertPayload: Record<string, unknown> = {
    name,
    slug,
    description: input.description?.trim() || null,
    display_order: nextOrder,
    active: input.active !== false,
  };
  if (capabilities.hasParentId) insertPayload.parent_id = parentId;
  if (capabilities.hasIconName) insertPayload.icon_name = iconName;

  const { data, error } = await supabase
    .from("categories")
    .insert(insertPayload)
    .select(buildCategoryColumnsSelect(capabilities))
    .single();

  if (error) {
    if (String(error.message || "").toLowerCase().includes("duplicate") || error.code === "23505") {
      throw new Error(`يوجد تصنيف آخر بنفس الاسم أو الرابط (${name}).`);
    }
    throw new Error(error.message);
  }

  if (!capabilities.hasParentId || !capabilities.hasIconName) {
    await patchCategoryOverlay(supabase, (prev) => ({
      ...prev,
      [data.id]: {
        parentId: capabilities.hasParentId ? (data.parent_id ?? null) : parentId,
        iconName: capabilities.hasIconName ? normalizeCategoryIconName(data.icon_name) : iconName,
      },
    }));
  }

  revalidateStore(["/shop/", "/"]);

  return {
    id: String(data.id),
    name: String(data.name),
    slug: String(data.slug),
    description: data.description ? String(data.description) : null,
    parent_id: capabilities.hasParentId ? (data.parent_id ?? null) : parentId,
    icon_name: iconName,
    display_order: Number(data.display_order ?? nextOrder),
    active: data.active !== false,
    productCount: 0,
    totalProductCount: 0,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export async function adminUpdateCategory(id: string, input: Partial<CategoryInput>): Promise<CategoryRecord> {
  const supabase = db();
  const { categories, capabilities } = await fetchRawCategoriesAndCounts(supabase, false);
  const existing = categories.find((c) => c.id === id);
  if (!existing) {
    throw new Error("التصنيف غير موجود.");
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let nextParentId = existing.parent_id;
  let nextIconName = existing.icon_name;

  if (input.name !== undefined) {
    const cleanName = input.name.trim();
    if (!cleanName || cleanName.length > 80) {
      throw new Error("اسم التصنيف مطلوب (بحد أقصى 80 حرفاً).");
    }
    patch.name = cleanName;
  }

  if (input.slug !== undefined) {
    const desiredSlug = input.slug.trim();
    if (!desiredSlug) throw new Error("الرابط الدائم (Slug) مطلوب.");
    patch.slug = await ensureUniqueCategorySlug(supabase, desiredSlug, id);
  }

  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }

  if (input.displayOrder !== undefined && Number.isFinite(Number(input.displayOrder))) {
    patch.display_order = Math.max(0, Math.round(Number(input.displayOrder)));
  }

  if (input.active !== undefined) {
    patch.active = Boolean(input.active);
  }

  if (input.iconName !== undefined) {
    nextIconName = normalizeCategoryIconName(input.iconName);
    if (capabilities.hasIconName) patch.icon_name = nextIconName;
  }

  if (input.parentId !== undefined) {
    const candidateParent = input.parentId ? String(input.parentId).trim() : null;
    if (candidateParent === id) {
      throw new Error("لا يمكن جعل التصنيف أباً لنفسه.");
    }
    if (candidateParent) {
      const parentCat = categories.find((c) => c.id === candidateParent);
      if (!parentCat || parentCat.parent_id) {
        throw new Error("التصنيف الفرعي يجب أن ينتمي إلى تصنيف رئيسي فقط.");
      }
      const hasChildren = categories.some((c) => c.parent_id === id);
      if (hasChildren) {
        throw new Error("لا يمكن تحويل تصنيف رئيسي يضم فروعاً إلى تصنيف فرعي; انقل فروعه أولاً.");
      }
    }
    nextParentId = candidateParent;
    if (capabilities.hasParentId) patch.parent_id = nextParentId;
  }

  const { error } = await supabase.from("categories").update(patch).eq("id", id);
  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error("يرجى تحديث بنية الجدول أولاً.");
    }
    throw new Error(error.message);
  }

  if (!capabilities.hasParentId || !capabilities.hasIconName) {
    await patchCategoryOverlay(supabase, (prev) => ({
      ...prev,
      [id]: {
        parentId: nextParentId,
        iconName: nextIconName,
      },
    }));
  }

  revalidateStore(["/shop/", "/"]);

  const { categories: updatedList } = await fetchRawCategoriesAndCounts(supabase, false);
  const refreshed = updatedList.find((c) => c.id === id);
  if (!refreshed) throw new Error("تعذر استرجاع التصنيف بعد التحديث.");
  return refreshed;
}

export async function adminReorderCategories(
  items: Array<{ id: string; displayOrder: number; parentId?: string | null }>
): Promise<void> {
  const supabase = db();
  const { capabilities } = await fetchRawCategoriesAndCounts(supabase, false);

  for (const item of items) {
    const patch: Record<string, unknown> = {
      display_order: Math.max(0, Math.round(item.displayOrder)),
      updated_at: new Date().toISOString(),
    };
    if (capabilities.hasParentId && item.parentId !== undefined) {
      patch.parent_id = item.parentId || null;
    }
    const { error } = await supabase.from("categories").update(patch).eq("id", item.id);
    if (error) throw new Error(error.message);
  }

  if (!capabilities.hasParentId && items.some((i) => i.parentId !== undefined)) {
    await patchCategoryOverlay(supabase, (prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (item.parentId !== undefined) {
          next[item.id] = { ...(next[item.id] || {}), parentId: item.parentId || null };
        }
      }
      return next;
    });
  }

  revalidateStore(["/shop/", "/"]);
}

export class CategoryDeleteConflictError extends Error {
  conflict: CategoryDeleteConflict;
  constructor(conflict: CategoryDeleteConflict) {
    super(conflict.error);
    this.conflict = conflict;
  }
}

export async function adminDeleteCategory(id: string, options: CategoryDeleteOptions = {}): Promise<void> {
  const supabase = db();
  const mode = options.mode ?? "restrict";
  const { categories, capabilities } = await fetchRawCategoriesAndCounts(supabase, false);
  const target = categories.find((c) => c.id === id);
  if (!target) {
    throw new Error("التصنيف غير موجود.");
  }

  const children = categories.filter((c) => c.parent_id === id);
  const { data: assignedProducts, error: prodErr } = await supabase
    .from("products")
    .select("id, name, sku")
    .eq("category_id", id);
  if (prodErr) throw new Error(prodErr.message);

  const childCount = children.length;
  const productCount = (assignedProducts ?? []).length;

  if (mode === "restrict" && (childCount > 0 || productCount > 0)) {
    throw new CategoryDeleteConflictError({
      code: "CATEGORY_IN_USE",
      error: `هذا التصنيف مرتبط بـ ${productCount} منتج و${childCount} تصنيف فرعي. اختر نقلها لتصنيف آخر أو فك ارتباطها قبل الحذف.`,
      childCount,
      productCount,
      children: children.map((c) => ({ id: c.id, name: c.name })),
      products: (assignedProducts ?? []).map((p: any) => ({
        id: String(p.id),
        title: String(p.name),
        sku: String(p.sku || ""),
      })),
    });
  }

  if (mode === "reassign") {
    const altId = options.reassignToCategoryId ? String(options.reassignToCategoryId).trim() : "";
    if (!altId || altId === id) {
      throw new Error("يرجى اختيار تصنيف بديل صالح لنقل المنتجات إليه.");
    }
    const alt = categories.find((c) => c.id === altId);
    if (!alt || alt.parent_id === id) {
      throw new Error("التصنيف البديل غير صالح.");
    }

    if (productCount > 0) {
      const { error: mvProdErr } = await supabase
        .from("products")
        .update({ category_id: altId, updated_at: new Date().toISOString() })
        .eq("category_id", id);
      if (mvProdErr) throw new Error(mvProdErr.message);
    }

    if (childCount > 0) {
      const newChildParent = alt.parent_id ? null : alt.id;
      if (capabilities.hasParentId) {
        const { error: mvChildErr } = await supabase
          .from("categories")
          .update({ parent_id: newChildParent, updated_at: new Date().toISOString() })
          .eq("parent_id", id);
        if (mvChildErr) throw new Error(mvChildErr.message);
      } else {
        await patchCategoryOverlay(supabase, (prev) => {
          const next = { ...prev };
          for (const child of children) {
            next[child.id] = { ...(next[child.id] || {}), parentId: newChildParent };
          }
          return next;
        });
      }
    }
  } else if (mode === "unlink") {
    if (productCount > 0) {
      const { error: unlinkProdErr } = await supabase
        .from("products")
        .update({ category_id: null, updated_at: new Date().toISOString() })
        .eq("category_id", id);
      if (unlinkProdErr) throw new Error(unlinkProdErr.message);
    }
    if (childCount > 0) {
      if (capabilities.hasParentId) {
        const { error: unlinkChildErr } = await supabase
          .from("categories")
          .update({ parent_id: null, updated_at: new Date().toISOString() })
          .eq("parent_id", id);
        if (unlinkChildErr) throw new Error(unlinkChildErr.message);
      } else {
        await patchCategoryOverlay(supabase, (prev) => {
          const next = { ...prev };
          for (const child of children) {
            next[child.id] = { ...(next[child.id] || {}), parentId: null };
          }
          return next;
        });
      }
    }
  }

  const { error: delErr } = await supabase.from("categories").delete().eq("id", id);
  if (delErr) throw new Error(delErr.message);

  if (!capabilities.hasParentId || !capabilities.hasIconName) {
    await patchCategoryOverlay(supabase, (prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  revalidateStore(["/shop/", "/"]);
}

export async function adminApplyCategoryAssignments(
  assignments: Array<{ productId: string; categoryId: string | null }>
): Promise<{ updatedCount: number; usedRpc: boolean }> {
  const supabase = db();
  if (assignments.length === 0) return { updatedCount: 0, usedRpc: false };

  const capabilities = await probeCategorySchema(supabase);
  const allNonNull = assignments.every((a) => Boolean(a.categoryId));

  if (capabilities.hasAssignRpc && allNonNull) {
    const { error } = await supabase.rpc("assign_product_categories", {
      p_assignments: assignments,
    });
    if (!error) {
      revalidateStore(["/shop/", "/"]);
      return { updatedCount: assignments.length, usedRpc: true };
    }
    // Fall through cleanly if RPC body rejected null or stale schema
  }

  const now = new Date().toISOString();
  for (const item of assignments) {
    const { data, error } = await supabase
      .from("products")
      .update({ category_id: item.categoryId || null, updated_at: now })
      .eq("id", item.productId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error(`المنتج غير موجود: ${item.productId}`);
    }
  }

  revalidateStore(["/shop/", "/"]);
  return { updatedCount: assignments.length, usedRpc: false };
}
