import type { Metadata } from "next";

import { getAdminSettingsAction } from "@/app/actions/settings";
import { WebMcpProvider } from "@/components/storefront/agent/webmcp-provider";
import { MetaPixel } from "@/components/storefront/analytics/meta-pixel";
import { TikTokPixel } from "@/components/storefront/analytics/tiktok-pixel";
import { StorefrontDirectionSync } from "@/components/storefront/layout/storefront-direction-sync";
import { StorefrontFooter } from "@/components/storefront/layout/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/layout/storefront-header";
import { TopNoticeBar } from "@/components/storefront/layout/top-notice-bar";
import { listBestSellers, listPublishedProducts } from "@/lib/catalog/server";
import { toNavProduct } from "@/lib/catalog/types";
import { ORVA_CANONICAL_ORIGIN } from "@/lib/seo/storefront-schema";
import {
  fallbackSettingsStore,
  normalizeStoreLogoUrl,
  OFFICIAL_STORE_LOGO_URL,
} from "@/lib/settings/settings-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(ORVA_CANONICAL_ORIGIN),
  title: "متجر أورفا | ORVA STORE DZ — عتاد ومعدات الصيانة والورشة الأصلية",
  description:
    "المتجر الجزائري الأول المتخصص في باقات العتاد وأدوات الصيانة الأصلية من كراون (CROWN) وستاركل برو (STARCLE PRO). الدفع عند الاستلام مع حق المعاينة والتوصيل لـ 69 ولاية.",
};

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const published = await listPublishedProducts();
  const navProducts = published.map(toNavProduct);
  // Navbar: only the 2 most ordered products; the footer keeps the full list.
  const bestSellers = (await listBestSellers(2, published)).map(toNavProduct);
  let pixelId = "";
  let enabled = true;
  let tiktokPixel = fallbackSettingsStore.tiktokPixel;
  let storeLogoUrl = OFFICIAL_STORE_LOGO_URL;

  try {
    const settings = await getAdminSettingsAction();
    if (settings.metaPixel.pixelId) {
      pixelId = settings.metaPixel.pixelId;
    }
    enabled = settings.metaPixel.enabled;
    if (settings.tiktokPixel) {
      tiktokPixel = settings.tiktokPixel;
    }
    storeLogoUrl = normalizeStoreLogoUrl(settings.store.logoUrl);
  } catch {
    pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.META_PIXEL_ID || "";
  }

  return (
    <div
      dir="rtl"
      lang="ar"
      className="flex min-h-screen flex-col bg-[#F8FAFC] font-sans text-slate-900 antialiased selection:bg-amber-200 selection:text-amber-950"
      style={{
        fontFamily:
          "var(--font-thmanyah), var(--font-geist), var(--font-tajawal), system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <MetaPixel pixelId={pixelId} enabled={enabled} />
      <TikTokPixel
        pixelId={tiktokPixel.pixelId}
        enabled={tiktokPixel.enabled}
        scope={tiktokPixel.scope}
        pages={tiktokPixel.pages}
      />
      <WebMcpProvider products={navProducts} />
      <StorefrontDirectionSync />
      <TopNoticeBar />
      <StorefrontHeader products={bestSellers} logoUrl={storeLogoUrl} />
      <main className="w-full flex-1">{children}</main>
      <StorefrontFooter products={navProducts} logoUrl={storeLogoUrl} />
    </div>
  );
}
