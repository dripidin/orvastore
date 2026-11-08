"use client";

import { useEffect } from "react";

/**
 * Storefront Direction & Locale Syncer
 * Syncs html attributes (dir="rtl", lang="ar", data-font="tajawal")
 * for Arabic storefront while cleaning up gracefully on navigation to LTR admin.
 */
export function StorefrontDirectionSync() {
  useEffect(() => {
    const prevDir = document.documentElement.getAttribute("dir");
    const prevLang = document.documentElement.getAttribute("lang");
    const prevFont = document.documentElement.getAttribute("data-font");

    document.documentElement.setAttribute("dir", "rtl");
    document.documentElement.setAttribute("lang", "ar");
    document.documentElement.setAttribute("data-font", "tajawal");

    return () => {
      if (prevDir) {
        document.documentElement.setAttribute("dir", prevDir);
      } else {
        document.documentElement.removeAttribute("dir");
      }

      if (prevLang) {
        document.documentElement.setAttribute("lang", prevLang);
      } else {
        document.documentElement.removeAttribute("lang");
      }

      if (prevFont) {
        document.documentElement.setAttribute("data-font", prevFont);
      } else {
        document.documentElement.removeAttribute("data-font");
      }
    };
  }, []);

  return null;
}
