"use client";

import { Suspense, useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    _gtmContainerId?: string;
  }
}

export interface GoogleTagManagerProps {
  containerId?: string;
  measurementId?: string;
  enabled?: boolean;
}

const DEFAULT_FALLBACK_CONTAINER_ID = "GTM-KQNN3P49";

function GoogleTagManagerInner({
  containerId,
  measurementId,
  enabled = true,
}: GoogleTagManagerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasMounted = useRef(false);

  const activeContainerId = (
    containerId?.trim() ||
    process.env.NEXT_PUBLIC_GTM_ID ||
    DEFAULT_FALLBACK_CONTAINER_ID
  ).trim();

  const activeMeasurementId = (
    measurementId?.trim() ||
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
    ""
  ).trim();

  // Expose active IDs for inspection & debugging tools
  useEffect(() => {
    if (typeof window !== "undefined") {
      window._gtmContainerId = activeContainerId;
    }
  }, [activeContainerId]);

  // Track pageview on client-side route transitions
  useEffect(() => {
    if (!enabled || !activeContainerId) return;

    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    if (typeof window !== "undefined" && window.dataLayer) {
      const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
      window.dataLayer.push({
        event: "page_view",
        page_path: pathname,
        page_location: window.location.origin + url,
        page_title: typeof document !== "undefined" ? document.title : "",
      });
    }
  }, [pathname, searchParams, enabled, activeContainerId]);

  if (!enabled || (!activeContainerId && !activeMeasurementId)) {
    return null;
  }

  return (
    <>
      {/* 1. Global dataLayer & gtag Initialization */}
      <Script
        id="google-tag-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            ${activeMeasurementId ? `gtag('config', '${activeMeasurementId}');` : ""}
          `,
        }}
      />

      {/* 2. Google Tag Manager Container Loader */}
      {activeContainerId && (
        <>
          <Script
            id="google-tag-manager"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${activeContainerId}');
              `,
            }}
          />
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${activeContainerId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        </>
      )}

      {/* 3. Optional Direct GA4 Script (if measurementId is configured and no GTM container) */}
      {!activeContainerId && activeMeasurementId && (
        <Script
          id="google-analytics-direct"
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=${activeMeasurementId}`}
        />
      )}
    </>
  );
}

export function GoogleTagManager(props: GoogleTagManagerProps) {
  return (
    <Suspense fallback={null}>
      <GoogleTagManagerInner {...props} />
    </Suspense>
  );
}
