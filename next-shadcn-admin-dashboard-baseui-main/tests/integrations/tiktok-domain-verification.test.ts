/**
 * ORVA Store — TikTok URL-Prefix Signature Verification Suite
 * Run: npx tsx tests/integrations/tiktok-domain-verification.test.ts
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAME,
  __testResetLocalRevocationCache,
  generateSessionToken,
} from "../../src/lib/auth/admin-auth";
import {
  __testResetTikTokVerificationFallback,
  normalizeTikTokVerificationFileName,
  sanitizeTikTokVerificationContent,
} from "../../src/lib/integrations/tiktok/domain-verification";
import {
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from "../../src/lib/supabase/server";
import { middleware } from "../../src/middleware";
import {
  DELETE as verifyDELETE,
  GET as verifyGET,
  HEAD as verifyHEAD,
  POST as verifyPOST,
} from "../../src/app/api/integrations/tiktok/domain-verify/route";

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

function createIsolatedSiteSettingsDb() {
  const store: { row: { id: number; integrations: Record<string, any>; updated_at: string } | null } = {
    row: { id: 1, integrations: {}, updated_at: new Date().toISOString() },
  };

  return {
    from(table: string) {
      if (table === "admin_session_revocations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: store.row ? { ...store.row } : null, error: null }),
          }),
        }),
        update: (payload: Record<string, any>) => ({
          eq: async () => {
            store.row = { ...(store.row ?? { id: 1, integrations: {}, updated_at: "" }), ...payload };
            return { error: null };
          },
        }),
        upsert: async (payload: Record<string, any>) => {
          store.row = { id: 1, integrations: payload.integrations ?? {}, updated_at: payload.updated_at ?? "" };
          return { error: null };
        },
      };
    },
  };
}

function makeAdminReq(
  urlPath: string,
  options: { method?: string; token?: string; origin?: string; body?: unknown } = {},
): NextRequest {
  const method = options.method ?? "GET";
  const headers = new Headers({ host: "orva-store.com" });
  if (options.token) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${options.token}`);
  }
  if (options.origin !== undefined) {
    headers.set("origin", options.origin);
  } else if (method !== "GET" && method !== "HEAD") {
    headers.set("origin", "https://orva-store.com");
  }
  let bodyStr: string | undefined;
  if (options.body !== undefined) {
    bodyStr = JSON.stringify(options.body);
    headers.set("content-type", "application/json");
  }
  return new NextRequest(`https://orva-store.com${urlPath}`, {
    method,
    headers,
    body: bodyStr,
  });
}

async function main() {
  console.log("Running TikTok Domain Signature Verification Suite...");

  __testSetSupabaseServerInstance(createIsolatedSiteSettingsDb());
  __testResetTikTokVerificationFallback();
  __testResetLocalRevocationCache();
  const adminToken = generateSessionToken();

  try {
    await check("Strict filename & content sanitizers block traversal, wrong extensions, and HTML/XSS", () => {
      assert.equal(normalizeTikTokVerificationFileName("tiktokAbCdEf123456.txt"), "tiktokAbCdEf123456.txt");
      assert.equal(
        normalizeTikTokVerificationFileName("https://orva-store.com/tiktokAbCdEf123456.txt"),
        "tiktokAbCdEf123456.txt",
      );
      assert.equal(
        normalizeTikTokVerificationFileName("/.well-known/tiktok-developers-site-verification.txt"),
        ".well-known/tiktok-developers-site-verification.txt",
      );
      assert.equal(
        normalizeTikTokVerificationFileName("/terms/tiktokAbCdEf123456.txt/"),
        "terms/tiktokAbCdEf123456.txt",
      );

      // Reject path traversal, non-tiktok files, and non-.txt extensions
      assert.equal(normalizeTikTokVerificationFileName("../tiktok12345.txt"), null);
      assert.equal(normalizeTikTokVerificationFileName("robots.txt"), null);
      assert.equal(normalizeTikTokVerificationFileName("tiktok12345.html"), null);
      assert.equal(normalizeTikTokVerificationFileName("admin/tiktok12345.txt"), null);

      // Reject XSS/HTML payloads in content
      assert.equal(
        sanitizeTikTokVerificationContent("tiktok-developers-site-verification=AbCdEf1234567890"),
        "tiktok-developers-site-verification=AbCdEf1234567890",
      );
      assert.equal(sanitizeTikTokVerificationContent("<script>alert(1)</script>"), null);
      assert.equal(sanitizeTikTokVerificationContent("ab"), null);
    });

    await check("Enforces admin authentication (401) and CSRF origin validation (403) on list/save/delete", async () => {
      const unauthList = await verifyGET(makeAdminReq("/api/integrations/tiktok/domain-verify/?action=list"));
      assert.equal(unauthList.status, 401);

      const unauthPost = await verifyPOST(
        makeAdminReq("/api/integrations/tiktok/domain-verify/", {
          method: "POST",
          body: { fileName: "tiktokTest1234.txt", content: "tiktok-developers-site-verification=xyz123" },
        }),
      );
      assert.equal(unauthPost.status, 401);

      const csrfPost = await verifyPOST(
        makeAdminReq("/api/integrations/tiktok/domain-verify/", {
          method: "POST",
          token: adminToken,
          origin: "https://evil.example",
          body: { fileName: "tiktokTest1234.txt", content: "tiktok-developers-site-verification=xyz123" },
        }),
      );
      assert.equal(csrfPost.status, 403);
    });

    await check("Saves signature file, serves 200 text/plain with nosniff on GET/HEAD, and deletes cleanly", async () => {
      const sigContent = "tiktok-developers-site-verification=ORVA998877665544332211";
      const saveRes = await verifyPOST(
        makeAdminReq("/api/integrations/tiktok/domain-verify/", {
          method: "POST",
          token: adminToken,
          body: {
            fileName: "tiktokOrvaVerify2026.txt",
            content: sigContent,
          },
        }),
      );
      assert.equal(saveRes.status, 200);
      const saveJson = await saveRes.json();
      assert.equal(saveJson.files.length, 1);
      assert.equal(saveJson.files[0].fileName, "tiktokOrvaVerify2026.txt");

      // Public verification fetch (exact match)
      const pubRes = await verifyGET(
        makeAdminReq("/api/integrations/tiktok/domain-verify/?file=tiktokOrvaVerify2026.txt"),
      );
      assert.equal(pubRes.status, 200);
      assert.equal(pubRes.headers.get("content-type"), "text/plain; charset=utf-8");
      assert.equal(pubRes.headers.get("x-content-type-options"), "nosniff");
      assert.equal(await pubRes.text(), sigContent);

      // Subpath prefix fallback (/terms/tiktokOrvaVerify2026.txt)
      const subRes = await verifyGET(
        makeAdminReq("/api/integrations/tiktok/domain-verify/?file=terms/tiktokOrvaVerify2026.txt"),
      );
      assert.equal(subRes.status, 200);
      assert.equal(await subRes.text(), sigContent);

      // HEAD check
      const headRes = await verifyHEAD(
        makeAdminReq("/api/integrations/tiktok/domain-verify/?file=tiktokOrvaVerify2026.txt", { method: "HEAD" }),
      );
      assert.equal(headRes.status, 200);

      // Delete
      const delRes = await verifyDELETE(
        makeAdminReq("/api/integrations/tiktok/domain-verify/?file=tiktokOrvaVerify2026.txt", {
          method: "DELETE",
          token: adminToken,
        }),
      );
      assert.equal(delRes.status, 200);

      const afterDel = await verifyGET(
        makeAdminReq("/api/integrations/tiktok/domain-verify/?file=tiktokOrvaVerify2026.txt"),
      );
      assert.equal(afterDel.status, 404);
    });

    await check("Middleware rewrites /tiktok*.txt to domain-verify endpoint without breaking storefront routes", () => {
      const mwRes = middleware(new NextRequest("https://orva-store.com/tiktokOrvaVerify2026.txt"));
      const rewriteHeader = mwRes.headers.get("x-middleware-rewrite") || "";
      assert.ok(
        rewriteHeader.includes("/api/integrations/tiktok/domain-verify/?file=tiktokOrvaVerify2026.txt"),
        `Expected rewrite header, got: ${rewriteHeader}`,
      );

      // Storefront route continues normally
      const shopRes = middleware(new NextRequest("https://orva-store.com/shop/"));
      assert.equal(shopRes.headers.get("x-middleware-rewrite"), null);
      assert.ok((shopRes.headers.get("Link") || "").includes("llms-txt"));
    });
  } finally {
    __testResetTikTokVerificationFallback();
    __testResetSupabaseServerInstance();
    __testResetLocalRevocationCache();
  }

  console.log(`\nTikTok Domain Verification Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("TikTok domain verification test crashed:", err);
  process.exit(1);
});
