"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Wrench, Package, Flame } from "lucide-react";
import { PhoneBadge } from "./phone-badge";

export function StorefrontHeader() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/store-branding")
      .then((response) => response.json())
      .then((data: { logoUrl?: string }) => {
        if (active && data.logoUrl) setLogoUrl(data.logoUrl);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between gap-4">
        {/* Brand Logo & Slogan */}
        <Link href="/" className="flex items-center gap-3 group focus:outline-hidden">
          <div className="size-10 sm:size-11 rounded-xl bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 flex items-center justify-center overflow-hidden text-white shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
            {logoUrl ? (
              // Dashboard logos may be uploaded data URLs or configured image paths.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-full object-contain bg-white p-1" />
            ) : (
              <Wrench className="size-5 sm:size-6 drop-shadow-xs" />
            )}
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
          <Link
            href="/pack1"
            className="px-3.5 py-1.5 rounded-full hover:bg-white hover:text-amber-600 hover:shadow-2xs transition flex items-center gap-1.5"
          >
            <Package className="size-3.5 text-amber-600" />
            <span>باك 1 (4,950 د.ج)</span>
          </Link>
          <Link
            href="/pack2"
            className="px-3.5 py-1.5 rounded-full hover:bg-white hover:text-amber-600 hover:shadow-2xs transition flex items-center gap-1.5"
          >
            <Flame className="size-3.5 text-amber-600" />
            <span>باك 2 فيسوز (12,950 د.ج)</span>
          </Link>
          <Link
            href="/pack3"
            className="px-3.5 py-1.5 rounded-full hover:bg-white hover:text-amber-600 hover:shadow-2xs transition flex items-center gap-1.5"
          >
            <Wrench className="size-3.5 text-amber-600" />
            <span>باك 3 سودير (15,950 د.ج)</span>
          </Link>
        </nav>

        {/* Customer Care Hotline */}
        <div className="flex items-center gap-3">
          <PhoneBadge phone="0798282495" />
        </div>
      </div>
    </header>
  );
}
