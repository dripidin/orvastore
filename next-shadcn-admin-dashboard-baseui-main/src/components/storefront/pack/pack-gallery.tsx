"use client";

import { useState } from "react";

import Image from "next/image";

import { ImageIcon, Layers, ZoomIn } from "lucide-react";

export interface PackGalleryProps {
  heroImage: string;
  allProductsImage: string;
  packName: string;
  badgeText?: string;
  className?: string;
}

export function PackGallery({
  heroImage,
  allProductsImage,
  packName,
  badgeText: _badgeText,
  className = "",
}: PackGalleryProps) {
  const [activeImage, setActiveImage] = useState<string>(heroImage);

  return (
    <div className={`space-y-4 ${className}`} dir="rtl">
      {/* Main Image Stage */}
      <div className="relative aspect-4/3 rounded-2xl sm:rounded-3xl bg-white border border-slate-200 overflow-hidden shadow-sm flex items-center justify-center p-4 group">
        <Image
          src={activeImage}
          alt={packName}
          fill
          priority
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 600px"
          className="object-contain p-2 group-hover:scale-105 transition-transform duration-300"
        />

        {/* View Details Hint */}
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-xs text-slate-700 border border-slate-200 text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 pointer-events-none shadow-2xs">
          <ZoomIn className="size-3 text-amber-600" />
          <span>معاينة تفاصيل الأدوات</span>
        </div>
      </div>

      {/* Thumbnails Switcher */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setActiveImage(heroImage)}
          className={`flex items-center gap-3 p-2.5 rounded-xl border text-right transition cursor-pointer ${
            activeImage === heroImage
              ? "border-amber-500 bg-amber-50/60 shadow-xs ring-1 ring-amber-500/30"
              : "border-slate-200 hover:border-slate-300 bg-white"
          }`}
          aria-label="عرض الغلاف الرئيسي للباقة"
        >
          <div className="relative size-14 shrink-0 rounded-lg overflow-hidden bg-slate-50 border border-slate-200">
            <Image src={heroImage} alt="غلاف الباقة" fill sizes="56px" className="object-contain p-1" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 flex items-center gap-1">
              <ImageIcon className="size-3 text-amber-600 shrink-0" />
              <span className="truncate">الغلاف الرسمي للباقة</span>
            </div>
            <div className="text-[11px] text-slate-500 truncate">صورة العلبة والمظهر العام</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveImage(allProductsImage)}
          className={`flex items-center gap-3 p-2.5 rounded-xl border text-right transition cursor-pointer ${
            activeImage === allProductsImage
              ? "border-amber-500 bg-amber-50/60 shadow-xs ring-1 ring-amber-500/30"
              : "border-slate-200 hover:border-slate-300 bg-white"
          }`}
          aria-label="عرض جميع القطع والأدوات مفرودة"
        >
          <div className="relative size-14 shrink-0 rounded-lg overflow-hidden bg-slate-50 border border-slate-200">
            <Image src={allProductsImage} alt="جميع القطع مفرودة" fill sizes="56px" className="object-contain p-1" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 flex items-center gap-1">
              <Layers className="size-3 text-amber-600 shrink-0" />
              <span className="truncate">جميع القطع مفرودة</span>
            </div>
            <div className="text-[11px] text-slate-500 truncate">فحص كل أداة وملحقاتها</div>
          </div>
        </button>
      </div>
    </div>
  );
}
