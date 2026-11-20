import assert from "node:assert";
import crypto from "node:crypto";
import { NextRequest } from "next/server";

import {
  ADMIN_AUTH_ENDPOINT,
  classifyAuthFailure,
} from "../../src/app/(main)/dashboard/_components/admin-session-gate";
import { GET as getAuth, POST as postAuth } from "../../src/app/api/auth/route";
import { GET as getAdminSettings, POST as postAdminSettings } from "../../src/app/api/admin-settings/route";
import { GET as getDelivery } from "../../src/app/api/delivery/route";
import {
  SESSION_COOKIE_NAME,
  __testResetLocalRevocationCache,
  validateUrlMatchesHost,
  verifyCsrfOrigin,
} from "../../src/lib/auth/admin-auth";
import { __testSetSupabaseServerInstance } from "../../src/lib/supabase/server";

async function runB5AuthValidation() {
  console.log("================================================================================");
  console.log("   ORVA STORE — WORKSTREAM B5 ADMIN AUTH INCIDENT VALIDATION SUITE");
  console.log("================================================================================\n");

  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const mockRevokedDb = new Set<string>();
  const mockSupabaseClient = {
    from: (table: string) => ({
      select: () => ({
        eq: (_field: string, val: string) => ({
          maybeSingle: async () =>
            table === "admin_session_revocations" && mockRevokedDb.has(val)
              ? { data: { sid: val }, error: null }
              : { data: null, error: null },
        }),
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
        maybeSingle: async () => ({ data: null, error: null }),
      }),
      upsert: async (record: { sid?: string }) => {
        if (table === "admin_session_revocations" && record.sid) {
          mockRevokedDb.add(record.sid);
        }
        return { data: null, error: null };
      },
    }),
  };

  const mockServiceRoleJwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbXNqa2hkZmdoeXlkb2djdnZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYwOTQ1OTIwMCwiZXhwIjoxOTI1MDM1MjAwfQ.mock_sig";

  let passed = 0;
  function check(condition: boolean, label: string) {
    assert.ok(condition, `FAILED: ${label}`);
    passed++;
    console.log(`  [PASS] ${passed.toString().padStart(2, "0")}. ${label}`);
  }

  try {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.ADMIN_PASSWORD = "TestAdminPass!2026#Secure";
    process.env.ADMIN_JWT_SECRET = "test-jwt-secret-key-at-least-32-bytes-long!!";
    process.env.SUPABASE_SERVICE_ROLE_KEY = mockServiceRoleJwt;
    __testSetSupabaseServerInstance(mockSupabaseClient);
    __testResetLocalRevocationCache();

    // 1. Valid admin login
    const loginRes = await postAuth(
      new NextRequest("https://orva-store.com/api/auth/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://orva-store.com",
          Host: "orva-store.com",
        },
        body: JSON.stringify({ action: "login", password: "TestAdminPass!2026#Secure" }),
      })
    );
    const loginJson = await loginRes.json();
    const setCookie = loginRes.headers.get("set-cookie") || "";
    check(loginRes.status === 200 && loginJson.success === true, "Valid admin login returns 200 and success=true");
    check(Boolean(loginJson.token), "Valid login issues signed session token");
    check(
      setCookie.includes(`${SESSION_COOKIE_NAME}=`) &&
        setCookie.toLowerCase().includes("httponly") &&
        setCookie.toLowerCase().includes("secure") &&
        setCookie.toLowerCase().includes("samesite=lax"),
      "Valid login sets hardened HttpOnly Secure SameSite=Lax cookie"
    );
    check(
      (loginRes.headers.get("cache-control") || "").includes("no-store"),
      "Auth login response sets Cache-Control: no-store"
    );

    const token: string = loginJson.token;

    // 2. Invalid password
    const badPwRes = await postAuth(
      new NextRequest("https://orva-store.com/api/auth/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://orva-store.com" },
        body: JSON.stringify({ action: "login", password: "wrong-password" }),
      })
    );
    check(badPwRes.status === 401, "Invalid password returns HTTP 401");

    // 3. Missing / empty credentials
    const emptyPwRes = await postAuth(
      new NextRequest("https://orva-store.com/api/auth/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://orva-store.com" },
        body: JSON.stringify({ action: "login", password: "   " }),
      })
    );
    const missingPwRes = await postAuth(
      new NextRequest("https://orva-store.com/api/auth/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "https://orva-store.com" },
        body: JSON.stringify({ action: "login" }),
      })
    );
    check(emptyPwRes.status === 400 && missingPwRes.status === 400, "Missing or blank credentials return HTTP 400");

    // 4. Expired session
    const expiredPayload = {
      sub: "admin",
      role: "admin",
      sid: "expired-sid-001",
      iat: Date.now() - 200_000_000,
      exp: Date.now() - 60_000,
    };
    const expiredData = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
    const expiredSig = crypto
      .createHmac("sha256", process.env.ADMIN_JWT_SECRET)
      .update(expiredData)
      .digest("base64url");
    const expiredRes = await postAuth(
      new NextRequest("https://orva-store.com/api/auth/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${expiredData}.${expiredSig}`,
        },
        body: JSON.stringify({ action: "session" }),
      })
    );
    check(expiredRes.status === 401, "Expired session token is rejected with HTTP 401");

    // 5. Session persistence after page refresh (cookie & GET & Bearer)
    const refreshCookieRes = await postAuth(
      new NextRequest("https://orva-store.com/api/auth/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ action: "session" }),
      })
    );
    const refreshGetRes = await getAuth(
      new NextRequest("https://orva-store.com/api/auth/", {
        method: "GET",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      })
    );
    check(
      refreshCookieRes.status === 200 && refreshGetRes.status === 200,
      "Session persists across page refresh via POST session and GET /api/auth/"
    );

    // 7. Unauthorized access to protected admin routes
    const unauthSettingsRes = await getAdminSettings(
      new NextRequest("https://orva-store.com/api/admin-settings/", { method: "GET" })
    );
    const unauthDeliveryRes = await getDelivery(
      new NextRequest("https://orva-store.com/api/delivery/?action=get_all_orders", { method: "GET" })
    );
    check(
      unauthSettingsRes.status === 401 && unauthDeliveryRes.status === 401,
      "Unauthorized access to protected admin routes returns HTTP 401"
    );

    // 8. CSRF rejection & reverse-proxy default-port host normalization
    check(
      validateUrlMatchesHost("https://orva-store.com", "orva-store.com:443") === true,
      "Reverse proxy Host with explicit default :443 matches https://orva-store.com"
    );
    check(
      validateUrlMatchesHost("https://orva-store.com", "orva-store.com:8443") === false,
      "Non-default port mismatch (:8443 vs :443) is strictly rejected"
    );
    check(
      validateUrlMatchesHost("http://orva-store.com", "orva-store.com") === false,
      "HTTP origin in production is strictly rejected"
    );
    const crossOriginSettingsRes = await postAdminSettings(
      new NextRequest("https://orva-store.com/api/admin-settings/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
          Host: "orva-store.com",
          Origin: "https://evil-attacker.example",
        },
        body: JSON.stringify({ action: "test" }),
      })
    );
    check(crossOriginSettingsRes.status === 401, "Cross-origin cookie POST to /api/admin-settings/ blocked by CSRF");

    const crossOriginLogoutRes = await postAuth(
      new NextRequest("https://orva-store.com/api/auth/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
          Host: "orva-store.com",
          Origin: "https://evil-attacker.example",
        },
        body: JSON.stringify({ action: "logout" }),
      })
    );
    check(crossOriginLogoutRes.status === 403, "Cross-origin cookie POST logout blocked with HTTP 403");
    check(
      verifyCsrfOrigin(
        new NextRequest("https://orva-store.com/api/admin-settings/", {
          method: "POST",
          headers: {
            Cookie: `${SESSION_COOKIE_NAME}=${token}`,
            Host: "orva-store.com:443",
            Origin: "https://orva-store.com",
          },
        })
      ) === true,
      "Same-origin cookie mutation behind :443 proxy Host passes CSRF"
    );

    // 9. API availability, canonical trailing-slash endpoint & failure classification
    check(ADMIN_AUTH_ENDPOINT === "/api/auth/", "AdminSessionGate uses canonical /api/auth/ (no 308 redirect)");
    const c401 = classifyAuthFailure(401, true);
    const c400 = classifyAuthFailure(400, true);
    const c504 = classifyAuthFailure(504, false);
    const c503 = classifyAuthFailure(503, false);
    const c200Html = classifyAuthFailure(200, false);
    check(!c401.unavailable && c401.loginError.includes("كلمة المرور"), "401 classified as wrong password, not outage");
    check(!c400.unavailable, "400 classified as validation error, not outage");
    check(c504.unavailable && (c504.unavailableDetail || "").includes("504"), "504 classified as transient server outage");
    check(c503.unavailable && (c503.unavailableDetail || "").includes("503"), "503 classified as transient server outage");
    check(c200Html.unavailable, "Non-JSON 200 HTML response classified as service unavailable");

    // 10. Authenticated admin dashboard data retrieval
    const authSettingsRes = await getAdminSettings(
      new NextRequest("https://orva-store.com/api/admin-settings/", {
        method: "GET",
        headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
      })
    );
    const authSettingsJson = await authSettingsRes.json();
    check(
      authSettingsRes.status === 200 && authSettingsJson.success === true,
      "Authenticated GET /api/admin-settings/ retrieves admin config"
    );

    // 6. Logout revokes session durably and clears cookie
    const logoutRes = await postAuth(
      new NextRequest("https://orva-store.com/api/auth/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
          Host: "orva-store.com",
          Origin: "https://orva-store.com",
        },
        body: JSON.stringify({ action: "logout" }),
      })
    );
    const logoutCookie = logoutRes.headers.get("set-cookie") || "";
    check(
      logoutRes.status === 200 && logoutCookie.toLowerCase().includes("max-age=0"),
      "Same-origin logout returns 200 and clears cookie (Max-Age=0)"
    );

    // Verify revoked token fails after cold cache reset (durable Supabase revocation)
    __testResetLocalRevocationCache();
    const afterLogoutRes = await postAuth(
      new NextRequest("https://orva-store.com/api/auth/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        },
        body: JSON.stringify({ action: "session" }),
      })
    );
    check(afterLogoutRes.status === 401, "Revoked session is rejected after logout even after cache reset");

    console.log(`\n================================================================================`);
    console.log(`   WORKSTREAM B5 AUTH VALIDATION: ${passed} / ${passed} CHECKS PASSED (100%)`);
    console.log(`================================================================================`);
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv.NODE_ENV;
    process.env.ADMIN_PASSWORD = originalEnv.ADMIN_PASSWORD;
    process.env.ADMIN_JWT_SECRET = originalEnv.ADMIN_JWT_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.SUPABASE_SERVICE_ROLE_KEY;
    __testSetSupabaseServerInstance(null);
    __testResetLocalRevocationCache();
  }
}

runB5AuthValidation().catch((err) => {
  console.error("B5 Validation failed:", err);
  process.exit(1);
});
