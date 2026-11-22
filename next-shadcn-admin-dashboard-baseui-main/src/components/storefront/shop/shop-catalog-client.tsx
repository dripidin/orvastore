"use client";

import * as React from "react";
import { LayoutGrid } from "lucide-react";

import { CategoryIcon } from "@/components/categories/category-icon";
import { ProductGrid } from "@/components/storefront/catalog/product-card";
import type { CategoryRecord } from "@/lib/categories/types";
import type { StoreProduct } from "@/lib/catalog/types";

export function ShopCatalogClient({
  products,
  categories,
}: {
  products: StoreProduct[];
  categories: CategoryRecord[];
}) {
  const [selectedRootId, setSelectedRootId] = React.useState<string>("all");
  const [selectedChildId, setSelectedChildId] = React.useState<string>("all");

  const roots = React.useMemo(() => {
    const usedIds = new Set(products.map((p) => p.categoryId).filter(Boolean));
    return categories.filter((c) => {
      if (c.parent_id) return false;
      const children = categories.filter((ch) => ch.parent_id === c.id);
      return usedIds.has(c.id) || children.some((ch) => usedIds.has(ch.id));
    });
  }, [categories, products]);

  const activeChildren = React.useMemo(() => {
    if (selectedRootId === "all") return [];
    const usedIds = new Set(products.map((p) => p.categoryId).filter(Boolean));
    return categories.filter((c) => c.parent_id === selectedRootId && usedIds.has(c.id));
  }, [categories, products, selectedRootId]);

  const filteredProducts = React.useMemo(() => {
    if (selectedRootId === "all") return products;
    if (selectedChildId !== "all") {
      return products.filter((p) => p.categoryId === selectedChildId);
    }
    const validIds = new Set<string>([selectedRootId]);
    for (const c of categories) {
      if (c.parent_id === selectedRootId) validIds.add(c.id);
    }
    return products.filter((p) => p.categoryId && validIds.has(p.categoryId));
  }, [products, categories, selectedRootId, selectedChildId]);

  return (
    <div className="space-y-6">
      {roots.length > 0 && (
        <div className="space-y-3" dir="rtl">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedRootId("all");
                setSelectedChildId("all");
              }}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition cursor-pointer ${
                selectedRootId === "all"
                  ? "border-slate-900 bg-slate-900 text-white shadow-xs"
                  : "border-slate-200 bg-white text-slate-700 hover:border-amber-400 hover:bg-amber-50/50"
              }`}
            >
              <LayoutGrid className="size-3.5" />
              <span>الكل ({products.length})</span>
            </button>

            {roots.map((cat) => {
              const isSelected = selectedRootId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSelectedRootId(cat.id);
                    setSelectedChildId("all");
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition cursor-pointer ${
                    isSelected
                      ? "border-amber-600 bg-amber-600 text-white shadow-xs"
                      : "border-slate-200 bg-white text-slate-700 hover:border-amber-400 hover:bg-amber-50/50"
                  }`}
                >
                  <CategoryIcon name={cat.icon_name} className="size-3.5" />
                  <span>{cat.name}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {cat.totalProductCount}
                  </span>
                </button>
              );
            })}
          </div>

          {activeChildren.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pr-2">
              <button
                type="button"
                onClick={() => setSelectedChildId("all")}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                  selectedChildId === "all"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                }`}
              >
                كل فروع القسم
              </button>
              {activeChildren.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setSelectedChildId(child.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer ${
                    selectedChildId === child.id
                      ? "border-amber-600 bg-amber-100 text-amber-900"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                  }`}
                >
                  <CategoryIcon name={child.icon_name} className="size-3" />
                  <span>{child.name}</span>
                  <span className="text-[10px] text-slate-500">({child.productCount})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <ProductGrid products={filteredProducts} />
    </div>
  );
}
