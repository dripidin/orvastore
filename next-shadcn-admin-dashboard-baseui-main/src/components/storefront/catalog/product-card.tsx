import Image from "next/image";
import Link from "next/link";

import { ArrowLeft, CheckCircle2, PackageX, Star } from "lucide-react";

import { formatDzd, type StoreProduct } from "@/lib/catalog/types";

export function ProductCard({ product, priority = false }: { product: StoreProduct; priority?: boolean }) {
  const { landing } = product;
  const outOfStock = product.stockQuantity <= 0;
  const hasDiscount = landing.originalPriceDzd > landing.priceDzd;
  const discountPct = hasDiscount ? Math.round((landing.savingsDzd / landing.originalPriceDzd) * 100) : 0;

  return (
    <Link
      href={product.route}
      className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-amber-400 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-amber-500"
    >
      <div className="relative aspect-4/3 overflow-hidden bg-slate-50">
        <Image
          src={landing.heroImage}
          alt={product.title}
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
          className="object-contain p-4 transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute top-3 right-3 rounded-full bg-amber-600 px-3 py-1 text-[11px] font-bold text-white shadow-xs">
          {landing.badgeAr}
        </span>
        {hasDiscount && (
          <span className="absolute top-3 left-3 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-black text-white shadow-xs">
            -{discountPct}%
          </span>
        )}
        {outOfStock && (
          <span className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-1.5 rounded-xl bg-slate-900/85 py-1.5 text-xs font-bold text-white">
            <PackageX className="size-3.5" /> نفدت الكمية مؤقتاً
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5 text-right">
        {landing.reviewsCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Star className="size-3.5 fill-amber-500 text-amber-500" />
            <span className="font-bold text-slate-900">{landing.rating}</span>
            <span>({landing.reviewsCount} تقييم)</span>
          </div>
        )}
        <h3 className="font-black text-lg leading-snug text-slate-900 group-hover:text-amber-700">{product.title}</h3>
        {landing.subtitleAr && <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">{landing.subtitleAr}</p>}

        {landing.highlightsAr.length > 0 && (
          <ul className="space-y-1.5 text-xs text-slate-700">
            {landing.highlightsAr.slice(0, 3).map((h) => (
              <li key={h} className="flex items-start gap-1.5">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <span className="line-clamp-1">{h}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-4">
          <div>
            <div className="font-mono font-black text-2xl text-amber-600">{formatDzd(landing.priceDzd)}</div>
            {hasDiscount && (
              <div className="font-mono text-xs text-slate-400 line-through">{formatDzd(landing.originalPriceDzd)}</div>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white transition group-hover:bg-amber-500 group-hover:text-slate-950">
            اطلب الآن
            <ArrowLeft className="size-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: StoreProduct[] }) {
  if (products.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
        لا توجد منتجات متاحة حالياً، عد قريباً.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} priority={i < 3} />
      ))}
    </div>
  );
}
