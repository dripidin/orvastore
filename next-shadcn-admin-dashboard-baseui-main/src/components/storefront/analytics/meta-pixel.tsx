"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      loaded?: boolean;
      version?: string;
    };
    _fbq?: unknown;
    _metaPixelId?: string;
  }
}

export interface MetaPixelProps {
  pixelId?: string;
  enabled?: boolean;
}

const DEFAULT_FALLBACK_PIXEL_ID = "1773144400655201";

export function MetaPixel({ pixelId, enabled = true }: MetaPixelProps) {
  const pathname = usePathname();
  const hasMounted = useRef(false);

  const activePixelId = (
    pixelId?.trim() ||
    process.env.NEXT_PUBLIC_META_PIXEL_ID ||
    process.env.META_PIXEL_ID ||
    DEFAULT_FALLBACK_PIXEL_ID
  ).trim();

  // Track PageView on client-side route transitions
  useEffect(() => {
    if (!enabled || !activePixelId) return;
    void pathname;

    // Expose active Pixel ID on window for inspection & verification tools
    if (typeof window !== "undefined") {
      window._metaPixelId = activePixelId;
    }

    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "PageView");
    }
  }, [pathname, activePixelId, enabled]);

  if (!enabled || !activePixelId) {
    return null;
  }

  return (
    <>
      <Script
        id="meta-pixel-init"
        strategy="afterInteractive"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Official Meta Pixel initialization snippet
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${activePixelId}');
            fbq('track', 'PageView');
          `,
        }}
      />
      <noscript>
        {/* biome-ignore lint/performance/noImgElement: Meta Pixel standard noscript beacon pixel */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${activePixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}

export default MetaPixel;
