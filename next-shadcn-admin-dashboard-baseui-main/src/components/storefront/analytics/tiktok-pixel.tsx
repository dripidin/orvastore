"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  DEFAULT_TIKTOK_PIXEL_ID,
  ensureTikTokPixelLoadedClient,
  isTikTokPixelAllowedForPath,
  sanitizeTikTokPixelId,
  trackTikTokPageView,
  type TikTokPixelScope,
} from "@/lib/analytics/tiktok-pixel";

export interface TikTokPixelProps {
  pixelId?: string;
  enabled?: boolean;
  scope?: TikTokPixelScope;
  pages?: string[];
}

/**
 * Client-side TikTok Pixel navigation tracker paired with the `<head>` boot script.
 * Skips the initial pathname render (already fired synchronously inside `<head>`) and
 * triggers `ttq.page()` cleanly on subsequent Next.js App Router transitions.
 */
export function TikTokPixel({
  pixelId,
  enabled = true,
  scope = "all",
  pages = [],
}: TikTokPixelProps) {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);

  const activePixelId =
    sanitizeTikTokPixelId(pixelId) ||
    sanitizeTikTokPixelId(process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID) ||
    (pixelId === "" ? "" : DEFAULT_TIKTOK_PIXEL_ID);

  useEffect(() => {
    if (!enabled || !activePixelId) return;

    const allowed = isTikTokPixelAllowedForPath(pathname, { enabled, scope, pages });
    if (!allowed) {
      previousPathRef.current = pathname;
      return;
    }

    const wasAlreadyLoaded = Boolean(window.__orvaTikTokLoadedIds?.[activePixelId]);
    ensureTikTokPixelLoadedClient(activePixelId);

    if (previousPathRef.current === null) {
      previousPathRef.current = pathname;
      // Only fire PageView if `<head>` skipped initial load (e.g. client navigated into scoped route)
      if (!wasAlreadyLoaded) {
        trackTikTokPageView();
      }
      return;
    }

    if (previousPathRef.current !== pathname) {
      previousPathRef.current = pathname;
      trackTikTokPageView();
    }
  }, [pathname, activePixelId, enabled, scope, pages]);

  return null;
}

export default TikTokPixel;
