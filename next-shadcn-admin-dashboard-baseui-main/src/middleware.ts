import { type NextRequest, NextResponse } from "next/server";

import {
  isMarkdownNegotiablePath,
  renderStorefrontMarkdown,
  STOREFRONT_LINK_HEADER,
} from "@/lib/seo/storefront-markdown";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
