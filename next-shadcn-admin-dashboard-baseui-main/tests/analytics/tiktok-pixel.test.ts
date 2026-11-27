/**
 * ORVA Store — TikTok Pixel & Auth Shared-Domain Verification Suite
 * Run: npx tsx tests/analytics/tiktok-pixel.test.ts
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  DEFAULT_TIKTOK_PIXEL_ID,
  buildTikTokPixelHeadScript,
  isExcludedAdminPixelPath,
  isTikTokPixelAllowedForPath,
  sanitizeTikTokPixelId,
} from "../../src/lib/analytics/tiktok-pixel";
import { resolveAdminCookieDomain } from "../../src/lib/auth/admin-auth";
import { parseTikTokOAuthCallbackNotice } from "../../src/app/(main)/dashboard/settings/tiktok-leads-types";
import { saveSettingsAction, getAdminSettingsAction } from "../../src/app/actions/settings";
import {
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from "../../src/lib/supabase/server";

function createInMemorySiteSettingsSupabase() {
  const row: { id: number; integrations: Record<string, any>; updated_at: string } = {
    id: 1,
    integrations: {},
    updated_at: new Date().toISOString(),
  };

  return {
    from(table: string) {
      if (table !== "site_settings") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          upsert: async () => ({ error: null }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { ...row }, error: null }),
          }),
        }),
        update: (payload: Record<string, any>) => ({
          eq: async () => {
            Object.assign(row, payload);
            return { error: null };
          },
        }),
        upsert: async (payload: Record<string, any>) => {
          Object.assign(row, payload);
          return { error: null };
        },
      };
    },
  };
}

let passed = 0;
let failed = 0;

async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}`);
    console.error("        ", err instanceof Error ? err.stack || err.message : err);
  }
}

async function main() {
  console.log("Running TikTok Pixel & Shared Cookie Domain Verification Suite...");

  await check("Validates strict alphanumeric TikTok Pixel ID and blocks XSS injection", () => {
    assert.equal(sanitizeTikTokPixelId("DC4QJAJC77U6QF2N05JG"), DEFAULT_TIKTOK_PIXEL_ID);
    assert.equal(sanitizeTikTokPixelId("  DC4QJAJC77U6QF2N05JG  "), DEFAULT_TIKTOK_PIXEL_ID);
    assert.equal(sanitizeTikTokPixelId("');alert(1);//"), "");
    assert.equal(sanitizeTikTokPixelId("<script>alert(1)</script>"), "");
    assert.equal(sanitizeTikTokPixelId("abc"), "");
  });

  await check("Generates valid TikTok <head> snippet with restored || guards and /dashboard exclusion", () => {
    const script = buildTikTokPixelHeadScript({
      pixelId: DEFAULT_TIKTOK_PIXEL_ID,
      enabled: true,
      scope: "all",
      pages: ["/"],
    });
    assert.ok(script.includes("var ttq=w[t]=w[t]||[]"));
    assert.ok(script.includes("var e=ttq._i[t]||[],n=0"));
    assert.ok(script.includes("https://analytics.tiktok.com/i18n/pixel/events.js"));
    assert.ok(script.includes('"DC4QJAJC77U6QF2N05JG"'));
    assert.ok(script.includes("(dashboard|auth)"));
    assert.equal(
      buildTikTokPixelHeadScript({ pixelId: "bad<script>", enabled: true, scope: "all", pages: [] }),
      "",
    );
    assert.equal(
      buildTikTokPixelHeadScript({ pixelId: DEFAULT_TIKTOK_PIXEL_ID, enabled: false, scope: "all", pages: [] }),
      "",
    );
  });

  await check("Excludes /dashboard and /auth while matching storefront all/selected scopes", () => {
    assert.equal(isExcludedAdminPixelPath("/dashboard/settings/"), true);
    assert.equal(isExcludedAdminPixelPath("/auth/v1/login"), true);
    assert.equal(isExcludedAdminPixelPath("/pack1/"), false);

    assert.equal(isTikTokPixelAllowedForPath("/dashboard/orders", { enabled: true, scope: "all", pages: [] }), false);
    assert.equal(isTikTokPixelAllowedForPath("/pack1/", { enabled: true, scope: "all", pages: [] }), true);

    assert.equal(
      isTikTokPixelAllowedForPath("/pack1/", {
        enabled: true,
        scope: "selected",
        pages: ["/pack1", "/checkout/confirmation"],
      }),
      true,
    );
    assert.equal(
      isTikTokPixelAllowedForPath("/shop/", {
        enabled: true,
        scope: "selected",
        pages: ["/pack1", "/checkout/confirmation"],
      }),
      false,
    );
  });

  await check("Resolves shared .orva-store.com cookie domain for apex and www while ignoring localhost", () => {
    assert.equal(
      resolveAdminCookieDomain(new NextRequest("https://www.orva-store.com/api/auth/", { headers: { host: "www.orva-store.com" } })),
      ".orva-store.com",
    );
    assert.equal(
      resolveAdminCookieDomain(new NextRequest("https://orva-store.com/api/auth/", { headers: { host: "orva-store.com" } })),
      ".orva-store.com",
    );
    assert.equal(
      resolveAdminCookieDomain(new NextRequest("http://localhost:3000/api/auth/", { headers: { host: "localhost:3000" } })),
      undefined,
    );
  });

  await check("Maps admin_session_required OAuth callback error code to friendly Arabic guidance", () => {
    const notice = parseTikTokOAuthCallbackNotice(
      new URLSearchParams("tab=tiktok&tiktok_status=error&tiktok_error=admin_session_required"),
    );
    assert.ok(notice);
    assert.equal(notice?.type, "error");
    assert.equal(notice?.code, "admin_session_required");
    assert.ok(notice?.messageAr.includes("orva-store.com"));
  });

  await check("Saves and reads tiktokPixel settings cleanly in isolated settings action", async () => {
    __testSetSupabaseServerInstance(createInMemorySiteSettingsSupabase());
    const original = await getAdminSettingsAction();
    try {
      await saveSettingsAction({
        tiktokPixel: {
          pixelId: DEFAULT_TIKTOK_PIXEL_ID,
          enabled: true,
          scope: "selected",
          pages: ["/pack1", "/checkout/confirmation"],
        },
      });
      const updated = await getAdminSettingsAction();
      assert.equal(updated.tiktokPixel.pixelId, DEFAULT_TIKTOK_PIXEL_ID);
      assert.equal(updated.tiktokPixel.enabled, true);
      assert.equal(updated.tiktokPixel.scope, "selected");
      assert.deepEqual(updated.tiktokPixel.pages, ["/pack1", "/checkout/confirmation"]);
    } finally {
      await saveSettingsAction({ tiktokPixel: original.tiktokPixel });
      __testResetSupabaseServerInstance();
    }
  });

  console.log(`\nTikTok Pixel Verification Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("TikTok Pixel test crashed:", err);
  process.exit(1);
});
