import type { ReactNode } from "react";

import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";

import { getAdminSettingsAction } from "@/app/actions/settings";
import { AttributionCapture } from "@/components/analytics/attribution-capture";
import { TikTokPixelHeadScript } from "@/components/storefront/analytics/tiktok-pixel-head-script";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { fontVars } from "@/lib/fonts/registry";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { fallbackSettingsStore } from "@/lib/settings/settings-store";
import { ThemeBootScript } from "@/scripts/theme-boot";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://orva-store.com"),
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { theme_mode, theme_preset, content_layout, navbar_style, sidebar_variant, sidebar_collapsible, font } =
    PREFERENCE_DEFAULTS;

  let tiktokPixel = fallbackSettingsStore.tiktokPixel;
  try {
    const settings = await getAdminSettingsAction();
    if (settings.tiktokPixel) {
      tiktokPixel = settings.tiktokPixel;
    }
  } catch {
    // Graceful fallback to configured env / default DC4QJAJC77U6QF2N05JG
  }

  return (
    <html
      lang="en"
      data-theme-mode={theme_mode}
      data-theme-preset={theme_preset}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      data-font={font}
      suppressHydrationWarning
    >
      <head>
        <meta name="facebook-domain-verification" content="ty4xvsmlzlaqjkfj9vy9z2z32pqmun" />
        {/* Applies theme and layout preferences on load to avoid flicker and unnecessary server rerenders. */}
        <ThemeBootScript />
        {/* Injects TikTok Pixel inside <head> across storefront pages while excluding /dashboard and /auth. */}
        <TikTokPixelHeadScript
          pixelId={tiktokPixel.pixelId}
          enabled={tiktokPixel.enabled}
          scope={tiktokPixel.scope}
          pages={tiktokPixel.pages}
        />
      </head>
      <body className={`${fontVars} min-h-screen antialiased`}>
        <TooltipProvider>
          <PreferencesStoreProvider initialValues={PREFERENCE_DEFAULTS}>
            {children}
            <Toaster />
          </PreferencesStoreProvider>
        </TooltipProvider>
        <Analytics />
        <AttributionCapture />
      </body>
    </html>
  );
}
