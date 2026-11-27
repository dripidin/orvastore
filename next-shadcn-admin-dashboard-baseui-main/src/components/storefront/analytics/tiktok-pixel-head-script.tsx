import {
  buildTikTokPixelHeadScript,
  DEFAULT_TIKTOK_PIXEL_ID,
  sanitizeTikTokPixelId,
  type TikTokPixelScope,
} from "@/lib/analytics/tiktok-pixel";

export interface TikTokPixelHeadScriptProps {
  pixelId?: string;
  enabled?: boolean;
  scope?: TikTokPixelScope;
  pages?: string[];
}

/**
 * Renders the official TikTok Pixel snippet inside `<head>` on every storefront page
 * while excluding `/dashboard` and `/auth` routes immediately at boot.
 */
export function TikTokPixelHeadScript({
  pixelId,
  enabled = true,
  scope = "all",
  pages = [],
}: TikTokPixelHeadScriptProps) {
  const resolvedId =
    sanitizeTikTokPixelId(pixelId) ||
    sanitizeTikTokPixelId(process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || process.env.TIKTOK_PIXEL_ID) ||
    (pixelId === "" ? "" : DEFAULT_TIKTOK_PIXEL_ID);

  if (!enabled || !resolvedId) {
    return null;
  }

  const code = buildTikTokPixelHeadScript({
    pixelId: resolvedId,
    enabled,
    scope,
    pages,
  });

  if (!code) return null;

  return (
    <script
      id="tiktok-pixel-base"
      suppressHydrationWarning
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Verified TikTok Pixel head bootstrap
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
