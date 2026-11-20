"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Flame, LayoutGrid, Package, Wrench } from "lucide-react";
import { formatDzd, type NavProduct } from "@/lib/catalog/types";
import { OFFICIAL_STORE_LOGO_URL, normalizeStoreLogoUrl } from "@/lib/settings/settings-store";
import { PhoneBadge } from "./phone-badge";

const NAV_ICONS = [Package, Flame, Wrench];

export function StorefrontHeader({
  products = [],
  logoUrl: initialLogoUrl,
}: {
  products?: NavProduct[];
  logoUrl?: string;
}) {
  const [logoUrl, setLogoUrl] = useState<string>(() => normalizeStoreLogoUrl(initialLogoUrl));

  useEffect(() => {
    let active = true;
    fetch("/api/store-branding")
      .then((response) => response.json())
      .then((data: { logoUrl?: string }) => {
        if (active && data.logoUrl) setLogoUrl(normalizeStoreLogoUrl(data.logoUrl));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
        {/* Brand Logo & Slogan */}
        <Link href="/" className="flex items-center gap-3 group focus:outline-hidden">
          <div className="size-11 sm:size-12 rounded-full flex items-center justify-center overflow-hidden shrink-0 drop-shadow-sm group-hover:scale-105 transition-transform">
            {/* Official ORVA DZ emblem (transparent PNG / custom uploaded branding). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl || OFFICIAL_STORE_LOGO_URL}
              alt="ORVA Store Algeria"
              width={48}
              height={48}
              className="size-full object-contain"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1">
              <span className="font-black text-xl sm:text-2xl text-amber-600 tracking-tight">ORVA</span>
              <span className="font-black text-xl sm:text-2xl text-slate-900 tracking-tight">STORE</span>
            </div>
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 -mt-1 tracking-wider uppercase">
              عتاد الورشة والصيانة الأصلي DZ
            </span>
          </div>
        </Link>

        {/* Quick Pack Navigation Links (Desktop) */}
        <nav className="hidden lg:flex items-center gap-1 bg-slate-100/80 p-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-700">
          {products.slice(0, 2).map((p, i) => {
            const Icon = NAV_ICONS[i % NAV_ICONS.length];
            return (
              <Link
                key={p.id}
                href={p.route}
                className="px-3.5 py-1.5 rounded-full hover:bg-white hover:text-amber-600 hover:shadow-2xs transition flex items-center gap-1.5 max-w-56"
              >
                <Icon className="size-3.5 shrink-0 text-amber-600" />
                <span className="truncate">{p.title}</span>
                <span className="shrink-0 font-mono text-slate-500">({formatDzd(p.priceDzd)})</span>
              </Link>
            );
          })}
          <Link
            href="/shop/"
            className="px-3.5 py-1.5 rounded-full bg-slate-900 text-white hover:bg-amber-500 hover:text-slate-950 transition flex items-center gap-1.5"
          >
            <LayoutGrid className="size-3.5" />
            <span>كل المنتجات</span>
          </Link>
        </nav>

        {/* Customer Care Hotline */}
        <div className="flex items-center gap-3">
          <Link
            href="/shop/"
            className="lg:hidden inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-2 text-xs font-bold text-white"
          >
            <LayoutGrid className="size-3.5" />
            المنتجات
          </Link>
          <PhoneBadge phone="0798282495" />
        </div>
      </div>
    </header>
  );
}
