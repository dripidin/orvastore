import { type NextRequest, NextResponse } from "next/server";

import {
  isMarkdownNegotiablePath,
  renderStorefrontMarkdown,
  STOREFRONT_LINK_HEADER,
} from "@/lib/seo/storefront-markdown";

const TIKTOK_SIGNATURE_FILE_PATH_REGEX =
  /^\/(?:(?:\.well-known|terms|privacy)\/)?tiktok[A-Za-z0-9_.-]{4,100}\.txt$/i;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const trimmedPath = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");

  if (
    (request.method === "GET" || request.method === "HEAD") &&
    TIKTOK_SIGNATURE_FILE_PATH_REGEX.test(trimmedPath)
  ) {
    const verifyUrl = new URL(
      `/api/integrations/tiktok/domain-verify/?file=${encodeURIComponent(trimmedPath.slice(1))}`,
      request.url,
    );
    return NextResponse.rewrite(verifyUrl);
  }

  if (
    (request.method === "GET" || request.method === "HEAD") &&
    isMarkdownNegotiablePath(pathname)
  ) {
    const accept = (request.headers.get("accept") || "").toLowerCase();
    if (accept.includes("text/markdown")) {
      const markdown = renderStorefrontMarkdown(pathname);
      return new NextResponse(request.method === "HEAD" ? null : markdown, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          Vary: "Accept",
          Link: STOREFRONT_LINK_HEADER,
          "Content-Signal": "search=yes, ai-input=yes, ai-train=no",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    const response = NextResponse.next();
    response.headers.set("Link", STOREFRONT_LINK_HEADER);
    response.headers.append("Vary", "Accept");
    response.headers.set("Content-Signal", "search=yes, ai-input=yes, ai-train=no");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|apple-touch-icon.png|images/|api/|dashboard/|auth/|checkout/).*)",
  ],
};
