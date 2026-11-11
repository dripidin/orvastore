import type { Metadata } from "next";

import { ShieldCheck, Truck, Wallet } from "lucide-react";

import { ProductGrid } from "@/components/storefront/catalog/product-card";
import { listPublishedProducts } from "@/lib/catalog/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "كل المنتجات | متجر أورفا ORVA STORE DZ",
  description: "جميع باقات وأدوات متجر أورفا الأصلية — الدفع عند الاستلام والتوصيل إلى 58 ولاية.",
};

const PROMISES = [
  { icon: Wallet, title: "الدفع عند الاستلام", text: "لا تدفع أي شيء قبل وصول الطرد" },
  { icon: ShieldCheck, title: "المعاينة قبل الدفع", text: "افحص السلعة يداً بيد" },
  { icon: Truck, title: "توصيل لـ 58 ولاية", text: "للمنزل أو لمكتب التوصيل" },
];

export default async function ShopPage() {
  const products = await listPublishedProducts();

  return (
    <div className="space-y-10 pb-20">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 text-right sm:px-6 sm:py-14">
          <p className="mb-2 font-bold text-amber-600 text-sm">متجر أورفا</p>
          <h1 className="font-black text-3xl text-slate-900 sm:text-4xl">كل المنتجات</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            {products.length} منتج أصلي متوفر الآن. اختر ما يناسبك واطلب في أقل من دقيقة.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {PROMISES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                  <Icon className="size-5" />
                </span>
                <div>
                  <div className="font-bold text-slate-900 text-sm">{title}</div>
                  <div className="text-slate-500 text-xs">{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6">
        <ProductGrid products={products} />
      </section>
    </div>
  );
}
