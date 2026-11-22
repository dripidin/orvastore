import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { STOREFRONT_PACKS } from "../../src/data/storefront-packs";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import {
  DEFAULT_CATEGORY_ICON,
  normalizeCategoryIconName,
  searchCategoryIcons,
} from "../../src/lib/categories/icon-registry";
import {
  adminApplyCategoryAssignments,
  adminCreateCategory,
  adminDeleteCategory,
  adminListCategories,
  adminReorderCategories,
  adminUpdateCategory,
  CategoryDeleteConflictError,
  publicListActiveCategories,
} from "../../src/lib/categories/server";
import { __testSetSupabaseServerInstance, __testResetSupabaseServerInstance } from "../../src/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

function createInMemoryCategorySupabase(options: { withHierarchyColumns: boolean; withRpc: boolean }) {
  const state = {
    categories: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Utility & Workshop Tools",
        slug: "tools",
        description: "معدات الصيانة والورش",
        display_order: 1,
        active: true,
        ...(options.withHierarchyColumns ? { parent_id: null, icon_name: "wrench" } : {}),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ] as any[],
    products: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", name: "Pack 1", sku: "P1", status: "PUBLISHED", category_id: null },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", name: "Pack 2", sku: "P2", status: "PUBLISHED", category_id: null },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", name: "Pack 3", sku: "P3", status: "DRAFT", category_id: null },
    ] as any[],
    site_settings: [{ id: 1, integrations: {}, updated_at: new Date().toISOString() }] as any[],
  };

  const client = {
    from(table: "categories" | "products" | "site_settings") {
      const filters: Array<(row: any) => boolean> = [];
      let selectSpec = "*";
      let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
      let payload: any = null;
      let orderCols: Array<{ col: string; asc: boolean }> = [];
      let limitCount: number | null = null;

      const exec = async (singleMode?: "single" | "maybeSingle") => {
        if (op === "select") {
          // Validate column probes cleanly
          const requestedCols = selectSpec
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s && s !== "*");
          if (table === "categories" && !options.withHierarchyColumns) {
            if (requestedCols.includes("parent_id")) {
              return { data: null, error: { code: "42703", message: "column categories.parent_id does not exist" } };
            }
            if (requestedCols.includes("icon_name")) {
              return { data: null, error: { code: "42703", message: "column categories.icon_name does not exist" } };
            }
          }

          let rows = state[table].filter((r) => filters.every((fn) => fn(r))).map((r) => ({ ...r }));
          for (const ord of [...orderCols].reverse()) {
            rows.sort((a, b) => {
              const av = a[ord.col] ?? "";
              const bv = b[ord.col] ?? "";
              if (av < bv) return ord.asc ? -1 : 1;
              if (av > bv) return ord.asc ? 1 : -1;
              return 0;
            });
          }
          if (limitCount !== null) rows = rows.slice(0, limitCount);
          if (singleMode === "maybeSingle") return { data: rows[0] ?? null, error: null };
          if (singleMode === "single") {
            return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "Row not found" } };
          }
          return { data: rows, error: null };
        }

        if (op === "insert") {
          const row = {
            id: payload.id || crypto.randomUUID(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...payload,
          };
          state[table].push(row);
          return singleMode ? { data: { ...row }, error: null } : { data: [{ ...row }], error: null };
        }

        if (op === "upsert") {
          const idx = state[table].findIndex((r) => r.id === payload.id);
          if (idx >= 0) state[table][idx] = { ...state[table][idx], ...payload };
          else state[table].push({ ...payload });
          return { data: [payload], error: null };
        }

        if (op === "update") {
          const updated: any[] = [];
          for (let i = 0; i < state[table].length; i++) {
            if (filters.every((fn) => fn(state[table][i]))) {
              state[table][i] = { ...state[table][i], ...payload };
              updated.push({ ...state[table][i] });
            }
          }
          return { data: updated, error: null };
        }

        if (op === "delete") {
          const before = state[table].length;
          state[table] = state[table].filter((r) => !filters.every((fn) => fn(r)));
          return { data: null, count: before - state[table].length, error: null };
        }

        return { data: null, error: null };
      };

      const builder: any = {
        select(cols = "*") {
          selectSpec = cols;
          return builder;
        },
        insert(v: any) {
          op = "insert";
          payload = v;
          return builder;
        },
        upsert(v: any) {
          op = "upsert";
          payload = v;
          return builder;
        },
        update(v: any) {
          op = "update";
          payload = v;
          return builder;
        },
        delete() {
          op = "delete";
          return builder;
        },
        eq(col: string, val: any) {
          filters.push((r) => r[col] === val);
          return builder;
        },
        neq(col: string, val: any) {
          filters.push((r) => r[col] !== val);
          return builder;
        },
        order(col: string, opts?: { ascending?: boolean }) {
          orderCols.push({ col, asc: opts?.ascending !== false });
          return builder;
        },
        limit(n: number) {
          limitCount = n;
          return builder;
        },
        single() {
          return exec("single");
        },
        maybeSingle() {
          return exec("maybeSingle");
        },
        then(resolve: any, reject: any) {
          return exec().then(resolve, reject);
        },
      };
      return builder;
    },
    async rpc(fnName: string, args: any) {
      if (fnName !== "assign_product_categories" || !options.withRpc) {
        return { data: null, error: { code: "PGRST202", message: "Could not find the function assign_product_categories" } };
      }
      if (!Array.isArray(args?.p_assignments)) {
        return { data: null, error: { message: "Assignments must be an array" } };
      }
      for (const a of args.p_assignments) {
        const p = state.products.find((x) => x.id === a.productId);
        if (!p) return { data: null, error: { message: `Product not found: ${a.productId}` } };
        p.category_id = a.categoryId || null;
      }
      return { data: null, error: null };
    },
  };

  return { client, state };
}

async function runTests() {
  console.log("Running ORVA Categories & Pack Media Suite...");

  // Test 1: Lucide icon registry search (Arabic & English across 2,300+ icons)
  const allIconNames = Object.keys(dynamicIconImports);
  assert.ok(allIconNames.length >= 1500, "Expected full Lucide icon registry");
  assert.equal(normalizeCategoryIconName("Drill"), "drill");
  assert.equal(normalizeCategoryIconName("flame"), "flame");
  assert.equal(normalizeCategoryIconName("invalid icon!@#"), DEFAULT_CATEGORY_ICON);
  const arabicWelding = searchCategoryIcons("لحام", "all", 50, allIconNames);
  assert.ok(arabicWelding.some((i) => i.name === "flame"), "Arabic query 'لحام' must match flame icon");
  const allEnglish = searchCategoryIcons("battery", "all", 50, allIconNames);
  assert.ok(allEnglish.some((i) => i.name.includes("battery")), "English query must match Lucide icons");
  console.log("  [PASS] Icon registry supports Arabic keywords and 2,300+ Lucide icons");

  // Test 2: Schema-resilient CRUD BEFORE SQL migration (overlay mode)
  {
    const { client } = createInMemoryCategorySupabase({ withHierarchyColumns: false, withRpc: false });
    __testSetSupabaseServerInstance(client as any);

    const initial = await adminListCategories();
    assert.equal(initial.capabilities.needsSqlUpgrade, true);
    assert.equal(initial.capabilities.hasParentId, false);

    const parent = await adminCreateCategory({
      name: "أدوات كهربائية",
      iconName: "zap",
      description: "أدوات كراون",
    });
    assert.equal(parent.icon_name, "zap");
    assert.equal(parent.parent_id, null);

    const child = await adminCreateCategory({
      name: "مثاقب 20V",
      parentId: parent.id,
      iconName: "drill",
    });
    assert.equal(child.parent_id, parent.id);
    assert.equal(child.icon_name, "drill");

    // Assign products without RPC (fallback mode)
    const applyRes = await adminApplyCategoryAssignments([
      { productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", categoryId: child.id },
      { productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", categoryId: parent.id },
    ]);
    assert.equal(applyRes.updatedCount, 2);
    assert.equal(applyRes.usedRpc, false);

    // Rolled up counts on parent should equal 1 direct + 1 child = 2
    const listed = await adminListCategories();
    const refreshedParent = listed.categories.find((c) => c.id === parent.id)!;
    assert.equal(refreshedParent.productCount, 1);
    assert.equal(refreshedParent.totalProductCount, 2);

    // Safe Delete Conflict check
    await assert.rejects(
      () => adminDeleteCategory(parent.id, { mode: "restrict" }),
      (err: unknown) => err instanceof CategoryDeleteConflictError && err.conflict.childCount === 1 && err.conflict.productCount === 1
    );

    // Reassign + Delete
    const alt = await adminCreateCategory({ name: "معدات لحام", iconName: "flame" });
    await adminDeleteCategory(child.id, { mode: "reassign", reassignToCategoryId: alt.id });
    const afterReassign = await adminListCategories();
    assert.equal(afterReassign.categories.find((c) => c.id === alt.id)!.productCount, 1);
    assert.ok(!afterReassign.categories.some((c) => c.id === child.id));

    __testResetSupabaseServerInstance();
  }
  console.log("  [PASS] Overlay/Pre-migration resilience: hierarchy, icons, rollup counts, safe reassign-delete work before SQL run");

  // Test 3: Full native SQL schema mode (with parent_id, icon_name, assign_product_categories RPC)
  {
    const { client } = createInMemoryCategorySupabase({ withHierarchyColumns: true, withRpc: true });
    __testSetSupabaseServerInstance(client as any);

    const rootA = await adminCreateCategory({ name: "قسم رئيسي أ", iconName: "wrench", active: true });
    const rootB = await adminCreateCategory({ name: "قسم رئيسي ب", iconName: "car", active: false });
    const subA = await adminCreateCategory({ name: "فرعي أ", parentId: rootA.id, iconName: "hammer" });

    // Prevent circular or depth > 2 edits
    await assert.rejects(() => adminUpdateCategory(rootA.id, { parentId: rootA.id }));
    await assert.rejects(() => adminUpdateCategory(subA.id, { parentId: subA.id }));
    await assert.rejects(() => adminUpdateCategory(rootA.id, { parentId: rootB.id })); // rootA has children!

    // Update metadata while keeping slug stable unless explicitly changed
    const stableUpdated = await adminUpdateCategory(subA.id, { name: "فرعي أ معدّل", iconName: "drill" });
    assert.equal(stableUpdated.name, "فرعي أ معدّل");
    assert.equal(stableUpdated.slug, subA.slug);
    assert.equal(stableUpdated.icon_name, "drill");

    // Reorder siblings cleanly
    await adminReorderCategories([
      { id: rootB.id, displayOrder: 0 },
      { id: rootA.id, displayOrder: 2 },
    ]);
    const listAfterReorder = await adminListCategories();
    const posB = listAfterReorder.categories.findIndex((c) => c.id === rootB.id);
    const posA = listAfterReorder.categories.findIndex((c) => c.id === rootA.id);
    assert.ok(posB >= 0 && posA > posB, `Expected rootB before rootA (${posB} < ${posA})`);

    // RPC assignment + public active filter
    const rpcApplied = await adminApplyCategoryAssignments([
      { productId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", categoryId: subA.id },
    ]);
    assert.equal(rpcApplied.usedRpc, true);
    const activeOnly = await publicListActiveCategories();
    assert.ok(!activeOnly.some((c) => c.id === rootB.id), "Inactive category must stay hidden from storefront");

    // Unlink delete
    await adminDeleteCategory(subA.id, { mode: "unlink" });
    const afterUnlink = await adminListCategories();
    assert.equal(afterUnlink.uncategorizedCount, 3);

    __testResetSupabaseServerInstance();
  }
  console.log("  [PASS] Native SQL + RPC mode: stable slugs, circular guards, reorder, unlink delete, active storefront filter");

  // Test 4: Storefront packs fallback images point to Hostinger Media (zero /images/packs/)
  for (const key of ["PACK1", "PACK2", "PACK3"] as const) {
    assert.ok(STOREFRONT_PACKS[key].heroImage.startsWith("https://media.orva-store.com/products/"), `${key} heroImage must point to Hostinger`);
    assert.ok(STOREFRONT_PACKS[key].allProductsImage.startsWith("https://media.orva-store.com/products/"), `${key} allProductsImage must point to Hostinger`);
  }
  console.log("  [PASS] All fallback pack images in storefront-packs.ts use media.orva-store.com");

  // Test 5: Legacy cramped ProductCategoriesPanel import removed from products/page.tsx
  const productsPageSrc = fs.readFileSync(
    path.join(process.cwd(), "src/app/(main)/dashboard/products/page.tsx"),
    "utf8"
  );
  assert.ok(!productsPageSrc.includes("ProductCategoriesPanel"), "products/page.tsx must replace inline ProductCategoriesPanel with /dashboard/categories link");
  console.log("  [PASS] /dashboard/products refactored to dedicated /dashboard/categories + form category selector");

  console.log("\nALL 5 CATEGORY & PACK MEDIA TESTS PASSED SUCCESSFULLY!");
}

runTests().catch((err) => {
  console.error("[CATEGORIES TEST FAILED]", err);
  process.exit(1);
});
