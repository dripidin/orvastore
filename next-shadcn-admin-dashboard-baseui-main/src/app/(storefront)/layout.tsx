import type { Metadata } from "next";
import { StorefrontDirectionSync } from "@/components/storefront/layout/storefront-direction-sync";
import { TopNoticeBar } from "@/components/storefront/layout/top-notice-bar";
import { StorefrontHeader } from "@/components/storefront/layout/storefront-header";
import { StorefrontFooter } from "@/components/storefront/layout/storefront-footer";
import { MetaPixel } from "@/components/storefront/analytics/meta-pixel";
import { getAdminSettingsAction } from "@/app/actions/settings";

export const metadata: Metadata = {
  title: "متجر أورفا | ORVA STORE DZ — عتاد ومعدات الصيانة والورشة الأصلية",
  description:
    "المتجر الجزائري الأول المتخصص في باقات العتاد وأدوات الصيانة الأصلية من كراون (CROWN) وستاركل برو (STARCLE PRO). الدفع عند الاستلام مع حق المعاينة والتوصيل لـ 58 ولاية.",
};

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  let pixelId = "";
  let enabled = true;

  try {
    const settings = await getAdminSettingsAction();
    if (settings.metaPixel.pixelId) {
      pixelId = settings.metaPixel.pixelId;
    }
    enabled = settings.metaPixel.enabled;
  } catch {
    pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID || process.env.META_PIXEL_ID || "";
  }

  return (
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans antialiased flex flex-col selection:bg-amber-200 selection:text-amber-950"
      style={{
        fontFamily: "var(--font-thmanyah), var(--font-geist), var(--font-tajawal), system-ui, -apple-system, 'Segoe UI', sans-serif",
      }}
    >
      <MetaPixel pixelId={pixelId} enabled={enabled} />
      <StorefrontDirectionSync />
      <TopNoticeBar />
      <StorefrontHeader />
      <main className="flex-1 w-full">{children}</main>
      <StorefrontFooter />
    </div>
  );
}
