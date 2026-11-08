"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

import Link from "next/link";

import { CheckCircle2, Home, ShieldCheck, Star, Truck } from "lucide-react";

import { EmbeddedCodOrderForm } from "@/components/storefront/checkout/embedded-cod-order-form";
import { PackCrossSell } from "@/components/storefront/pack/pack-cross-sell";
import { PackFaq } from "@/components/storefront/pack/pack-faq";
import { PackGallery } from "@/components/storefront/pack/pack-gallery";
import { StickyMobileOrderBar } from "@/components/storefront/pack/sticky-mobile-order-bar";
import { WhatsInTheBox } from "@/components/storefront/pack/whats-in-the-box";
import { ReassuranceGrid } from "@/components/storefront/shared/reassurance-grid";
import type { StorefrontPack } from "@/data/storefront-packs";
import {
  createDefaultLayoutConfig,
  type ProductPageLayoutConfig,
  type ProductPageSectionId,
} from "@/lib/repository/layout-types";
import { getMockLayoutRepository } from "@/lib/repository/mock-layout-repository";

const LAYOUT_STORAGE_KEY = "orva_product_layout_configs_v1";
const BROADCAST_CHANNEL_NAME = "orva_layout_sync_v1";

export const PACK_PRODUCT_ID_MAP: Record<"PACK1" | "PACK2" | "PACK3", string> = {
  PACK1: "prod_pack_1_pro",
  PACK2: "prod_pack_2_elite",
  PACK3: "prod_pack_3_ultra",
};

export interface DynamicPackLayoutProps {
  packId: "PACK1" | "PACK2" | "PACK3";
  pack: StorefrontPack;
}

function getStoredLayoutConfig(productId: string): ProductPageLayoutConfig {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, ProductPageLayoutConfig>;
        if (parsed[productId]) {
          return parsed[productId];
        }
        if (parsed.global_default) {
          return { ...parsed.global_default, productId };
        }
      }
    } catch {
      // Fallback to default
    }
  }
  return createDefaultLayoutConfig(productId);
}

export function DynamicPackLayout({ packId, pack }: DynamicPackLayoutProps) {
  const targetProductId = useMemo(() => {
    return PACK_PRODUCT_ID_MAP[packId] || "prod_pack_1_pro";
  }, [packId]);

  // Initial state reads localStorage synchronously if in browser to prevent layout flicker on reload
  const [layoutConfig, setLayoutConfig] = useState<ProductPageLayoutConfig>(() =>
    getStoredLayoutConfig(targetProductId),
  );

  // Synchronize layout configuration from MockLayoutRepository or localStorage
  const refreshLayout = useCallback(async () => {
    try {
      const layoutRepo = getMockLayoutRepository();
      const config = await layoutRepo.getLayoutConfig(targetProductId);

      if (config) {
        setLayoutConfig(config);
      }
    } catch {
      setLayoutConfig(getStoredLayoutConfig(targetProductId));
    }
  }, [targetProductId]);

  useEffect(() => {
    // Initial fetch on mount
    void refreshLayout();

    // 1. Subscribe to BroadcastChannel for real-time cross-tab synchronization
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        bc.onmessage = (event) => {
          if (event.data?.type === "LAYOUT_UPDATED") {
            void refreshLayout();
          }
        };
      }
    } catch (e) {
      console.warn("[DynamicPackLayout] BroadcastChannel not supported or error:", e);
    }

    // 2. Subscribe to local window CustomEvent
    const handleLocalUpdate = () => {
      void refreshLayout();
    };
    window.addEventListener("orva:layout-updated", handleLocalUpdate);

    // 3. Subscribe to window storage event (for cross-tab storage changes)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === LAYOUT_STORAGE_KEY) {
        void refreshLayout();
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      if (bc) {
        bc.close();
      }
      window.removeEventListener("orva:layout-updated", handleLocalUpdate);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [refreshLayout]);

  // Section visibility predicate
  const isSectionVisible = (sectionId: ProductPageSectionId): boolean => {
    switch (sectionId) {
      case "relatedProducts":
        return layoutConfig.showRelatedProducts;
      case "description":
        return layoutConfig.showDescription;
      case "features":
        return layoutConfig.showFeatures;
      case "benefits":
        return layoutConfig.showBenefits;
      case "orderForm":
        return true; // Essential checkout form can never be disabled
      default:
        return true;
    }
  };

  // Section Component Renderers
  const renderBreadcrumbs = () => (
    <nav aria-label="مسار التنقل" className="mb-6 flex items-center gap-2 text-xs text-slate-500">
      <Link href="/" className="hover:text-amber-600 flex items-center gap-1 transition">
        <Home className="size-3.5" />
        <span>الرئيسية</span>
      </Link>
      <span>/</span>
      <span className="text-slate-900 font-bold">{pack.nameAr}</span>
    </nav>
  );

  const renderGallery = () => (
    <PackGallery heroImage={pack.heroImage} allProductsImage={pack.allProductsImage} packName={pack.nameAr} />
  );

  const renderTitleCard = () => (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5 text-right">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-full px-3 py-1 text-xs font-bold shadow-2xs">
          باقة متكاملة
        </span>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <div className="flex text-amber-500">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="size-4 fill-amber-500 text-amber-500" />
            ))}
          </div>
          <span className="font-bold text-slate-900 font-mono">4.9 / 5</span>
          <span>({pack.reviewsCount} تقييم زبون حقيقي)</span>
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 leading-tight">{pack.nameAr}</h1>

      <p className="text-sm sm:text-base text-slate-600 leading-relaxed">{pack.subtitleAr}</p>

      {/* Sleek Pricing Section */}
      <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl sm:text-3xl font-black text-amber-600 font-mono">
            {new Intl.NumberFormat("fr-DZ").format(pack.priceDzd)} د.ج
          </span>
          <span className="text-sm line-through text-slate-400 font-mono">
            {new Intl.NumberFormat("fr-DZ").format(pack.originalPriceDzd)} د.ج
          </span>
          <span className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded font-bold">
            توفير {new Intl.NumberFormat("fr-DZ").format(pack.savingsDzd)} د.ج
          </span>
        </div>
        <div className="text-xs text-amber-800 font-medium bg-amber-100 border border-amber-300 px-3 py-1 rounded-lg">
          الدفع عند الاستلام
        </div>
      </div>

      {/* Highlights Bullet List (controlled by showDescription) */}
      {layoutConfig.showDescription && (
        <div className="space-y-2.5 pt-2">
          <h3 className="font-bold text-sm text-slate-900">أهم ما يميز هذه الباقة:</h3>
          <ul className="space-y-2 text-xs sm:text-sm text-slate-700">
            {pack.highlightsAr.map((highlight, index) => (
              <li key={index} className="flex items-start gap-2.5">
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* High-Contrast Reassurance Mini Grid */}
      <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-200 text-xs">
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
          <div>
            <div className="font-bold text-slate-900">المعاينة قبل الدفع</div>
            <div className="text-slate-500 text-[10px]">افحص محتوى الطرد يداً بيد</div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
          <Truck className="size-4 text-amber-600 shrink-0" />
          <div>
            <div className="font-bold text-slate-900">توصيل سريع لجميع الولايات</div>
            <div className="text-slate-500 text-[10px]">خلال 24 إلى 48 ساعة</div>
          </div>
        </div>
      </div>

      {/* Mobile CTA Button */}
      <div className="pt-2 lg:hidden">
        <a
          href="#order-form-container"
          className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-xl py-3.5 shadow-md transition active:scale-[0.99]"
        >
          <span>اطلب الآن — الدفع عند الاستلام</span>
        </a>
      </div>
    </div>
  );

  const renderSubtitleBanner = () => (
    <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 text-slate-700 text-sm leading-relaxed text-right">
      <span className="inline-block bg-amber-500 text-slate-950 text-xs px-2.5 py-0.5 rounded-full font-bold ml-2">
        باقة متكاملة
      </span>
      {pack.subtitleAr}
    </div>
  );

  const renderDescriptionCard = () => (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4 text-right">
      <h2 className="text-lg sm:text-xl font-bold text-slate-900">تفاصيل ومواصفات الباقة الكاملة</h2>
      <p className="text-sm sm:text-base text-slate-600 leading-relaxed">{pack.seo.description}</p>
      <div className="space-y-2 pt-2">
        <ul className="space-y-2 text-xs sm:text-sm text-slate-700">
          {pack.highlightsAr.map((highlight, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{highlight}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const renderOrderForm = () => (
    <EmbeddedCodOrderForm
      lockedPackId={packId}
      defaultPrice={pack.priceDzd}
      defaultProductName={pack.nameAr}
      originalPrice={pack.originalPriceDzd}
      savings={pack.savingsDzd}
    />
  );

  const renderFeatures = () => <WhatsInTheBox items={pack.boxItems} packName={pack.nameAr} />;

  const renderBenefits = () => <ReassuranceGrid />;

  const renderRelatedProducts = () => <PackCrossSell currentPackId={packId} />;

  const renderFaq = () => <PackFaq />;

  // Render a specific section by its layout ID
  const renderSectionById = (sectionId: ProductPageSectionId) => {
    if (!isSectionVisible(sectionId)) return null;

    switch (sectionId) {
      case "gallery":
        return <React.Fragment key="gallery">{renderGallery()}</React.Fragment>;
      case "title":
        return <React.Fragment key="title">{renderTitleCard()}</React.Fragment>;
      case "subtitle":
        return <React.Fragment key="subtitle">{renderSubtitleBanner()}</React.Fragment>;
      case "orderForm":
        return <React.Fragment key="orderForm">{renderOrderForm()}</React.Fragment>;
      case "description":
        return <React.Fragment key="description">{renderDescriptionCard()}</React.Fragment>;
      case "features":
        return <React.Fragment key="features">{renderFeatures()}</React.Fragment>;
      case "benefits":
        return <React.Fragment key="benefits">{renderBenefits()}</React.Fragment>;
      case "relatedProducts":
        return <React.Fragment key="relatedProducts">{renderRelatedProducts()}</React.Fragment>;
      default:
        return null;
    }
  };

  const isSplitMode = layoutConfig.desktopLayoutMode === "split";
  const sectionOrder = layoutConfig.desktopSectionOrder || [];

  return (
    <div className="space-y-12 sm:space-y-16 pb-24 bg-slate-50/60 text-slate-900 min-h-screen" dir="rtl">
      {isSplitMode ? (
        /* ── Desktop Split View ── */
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8">
          {renderBreadcrumbs()}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Visual Stage & Details Column */}
            <div className="lg:col-span-7 space-y-6">
              {renderGallery()}
              {renderTitleCard()}
            </div>

            {/* Sticky Order Form Column */}
            <div className="lg:col-span-5 lg:sticky lg:top-6">{renderOrderForm()}</div>
          </div>
        </section>
      ) : (
        /* ── Desktop / Mobile Stacked View ── */
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-8">
          {renderBreadcrumbs()}
          {sectionOrder.map((secId) => {
            if (!isSectionVisible(secId)) return null;
            return (
              <div key={secId} className="w-full">
                {renderSectionById(secId)}
              </div>
            );
          })}
        </section>
      )}

      {/* Sequential sections below the hero split (in split mode) */}
      {isSplitMode && (
        <div className="space-y-12 sm:space-y-16">
          {/* Render remaining sections ordered by desktopSectionOrder */}
          {sectionOrder
            .filter(
              (secId) =>
                secId !== "gallery" &&
                secId !== "title" &&
                secId !== "subtitle" &&
                secId !== "orderForm" &&
                secId !== "description",
            )
            .map((secId) => {
              if (!isSectionVisible(secId)) return null;
              return (
                <div key={secId} className="w-full">
                  {renderSectionById(secId)}
                </div>
              );
            })}

          {/* Customer FAQ Accordion */}
          <div>{renderFaq()}</div>
        </div>
      )}

      {/* In stacked mode, render FAQ if not part of section order */}
      {!isSplitMode && <div>{renderFaq()}</div>}

      {/* Sticky Floating Bottom Action Bar for Mobile */}
      <StickyMobileOrderBar priceDzd={pack.priceDzd} originalPriceDzd={pack.originalPriceDzd} packName={pack.nameAr} />
    </div>
  );
}
