import { NextRequest } from "next/server";
import crypto from "node:crypto";
import {
  isValidPassword,
  generateSessionToken,
  verifySessionToken,
  invalidateSession,
  verifyAdminSession,
  verifyCsrfOrigin,
  validateUrlMatchesHost,
  isSessionRevokedDurable,
  SESSION_DURATION_MS,
  SESSION_COOKIE_NAME,
  REVOCATION_TABLE,
  __testResetLocalRevocationCache,
  __testInjectLocalRevocation,
} from "../../src/lib/auth/admin-auth";
import { GET as getAdminSettings, POST as postAdminSettings } from "../../src/app/api/admin-settings/route";
import { GET as getDelivery, POST as postDelivery, DELETE as deleteDelivery } from "../../src/app/api/delivery/route";
import { POST as postAuth } from "../../src/app/api/auth/route";
import { __testSetSupabaseServerInstance } from "../../src/lib/supabase/server";

async function runSecurityTests() {
  console.log("================================================================================");
  console.log("   ORVA STORE — STEP 1 FINAL APPROVAL GATE SECURITY & CSRF SUITE");
  console.log("   Timestamp: " + new Date().toISOString());
  console.log("================================================================================\n");

  // Configure valid mock service-role JWT and in-memory Supabase client for isolated unit testing
  const mockServiceRoleJwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbXNqa2hkZmdoeXlkb2djdnZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYwOTQ1OTIwMCwiZXhwIjoxOTI1MDM1MjAwfQ.mock_signature_for_test_runner";
  process.env.SUPABASE_SERVICE_ROLE_KEY = mockServiceRoleJwt;

  const mockRevokedDb = new Set<string>();
  const mockSupabaseClient = {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_field: string, val: string) => ({
          maybeSingle: async () => {
            if (mockRevokedDb.has(val)) {
              return { data: { sid: val }, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
      upsert: async (record: { sid: string }) => {
        mockRevokedDb.add(record.sid);
        return { data: null, error: null };
      },
    }),
  };
  __testSetSupabaseServerInstance(mockSupabaseClient);

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] Test ${totalTests.toString().padStart(2, "0")}: ${testName}`);
    } else {
      console.error(`  [FAIL] Test ${totalTests.toString().padStart(2, "0")}: ${testName}`);
      throw new Error(`Security Assertion Failed: ${testName}`);
    }
  }

  // ── GROUP 1: PASSWORD VALIDATION & TIMING ATTACK RESISTANCE ───────────────
  console.log("── GROUP 1: Administrative Password Verification");

  assert(!isValidPassword(""), "Empty password string must be strictly rejected");
  assert(!isValidPassword("   "), "Whitespace-only password must be strictly rejected");
  assert(!isValidPassword("wrong_password_xyz"), "Incorrect password must be strictly rejected");
  assert(!isValidPassword("' OR '1'='1"), "SQL injection string must be strictly rejected");

  const originalAdminPass = process.env.ADMIN_PASSWORD;
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    process.env.ADMIN_PASSWORD = "SuperSecureAdminPassword2026!";
    assert(isValidPassword("SuperSecureAdminPassword2026!"), "Configured ADMIN_PASSWORD is accepted");
    assert(!isValidPassword("SuperSecureAdminPassword2026!_extra"), "Near-match password is rejected");

    // In production, fallback passwords like "admin123" must be rejected
    (process.env as any).NODE_ENV = "production";
    assert(!isValidPassword("admin123"), "Production mode strictly rejects fallback default passwords (admin123)");
    assert(!isValidPassword("orva2026"), "Production mode strictly rejects fallback default passwords (orva2026)");
    assert(isValidPassword("SuperSecureAdminPassword2026!"), "Production mode accepts exact configured password");
  } finally {
    process.env.ADMIN_PASSWORD = originalAdminPass;
    (process.env as any).NODE_ENV = originalNodeEnv;
  }

  // ── GROUP 2: HMAC TOKEN GENERATION, EXPIRATION & TAMPERING ───────────────
  console.log("\n── GROUP 2: HMAC Session Token Cryptographic Integrity");

  const validToken = generateSessionToken();
  assert(typeof validToken === "string" && validToken.includes("."), "Session token generated in <data>.<signature> format");
  assert(await verifySessionToken(validToken), "Freshly generated session token verifies successfully");

  // Verify 24h expiration
  const [dataPart, sigPart] = validToken.split(".");
  const decodedPayload = JSON.parse(Buffer.from(dataPart, "base64url").toString("utf8"));
  assert(decodedPayload.role === "admin", "Payload has role 'admin'");
  assert(decodedPayload.sub === "admin", "Payload has sub 'admin'");
  assert(Boolean(decodedPayload.sid), "Payload has random cryptographic session ID (sid)");
  assert(decodedPayload.exp - decodedPayload.iat === SESSION_DURATION_MS, "Token lifetime is exactly 24 hours (86,400,000 ms)");

  // Negative tests: Tampered token data
  const tamperedDataPayload = { ...decodedPayload, role: "superadmin" };
  const tamperedData = Buffer.from(JSON.stringify(tamperedDataPayload)).toString("base64url");
  const tamperedDataToken = `${tamperedData}.${sigPart}`;
  assert(!(await verifySessionToken(tamperedDataToken)), "Token with tampered payload is strictly rejected");

  // Negative tests: Tampered signature
  const tamperedSigToken = `${dataPart}.${sigPart.slice(0, -4)}XXXX`;
  assert(!(await verifySessionToken(tamperedSigToken)), "Token with tampered HMAC signature is strictly rejected");

  // Negative tests: Expired token
  const expiredPayload = { ...decodedPayload, iat: Date.now() - 100000000, exp: Date.now() - 1000 };
  const expiredData = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
  const secret = process.env.ADMIN_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_PASSWORD || "orva-store-dev-jwt-secret-key-32chars-min!!";
  const expiredSig = crypto.createHmac("sha256", secret).update(expiredData).digest("base64url");
  const expiredToken = `${expiredData}.${expiredSig}`;
  assert(!(await verifySessionToken(expiredToken)), "Expired session token is strictly rejected");

  // Negative tests: Malformed tokens
  assert(!(await verifySessionToken(null)), "Null token is rejected");
  assert(!(await verifySessionToken(undefined)), "Undefined token is rejected");
  assert(!(await verifySessionToken("")), "Empty token is rejected");
  assert(!(await verifySessionToken("random_string_without_dot")), "Token without signature delimiter is rejected");
  assert(!(await verifySessionToken("a.b.c.d")), "Token with too many delimiters is rejected");

  // ── GROUP 3: CSRF & ORIGIN SECURITY (NEGATIVE & BOUNDARY CHECKS) ──────────
  console.log("\n── GROUP 3: CSRF Negative, Scheme & Port Boundary Checks");

  // 3.1 Missing Origin and Referer on cookie mutation
  const missingOriginCookieReq = new NextRequest("http://localhost:3000/api/admin-settings", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      host: "localhost:3000",
    },
  });
  assert(verifyCsrfOrigin(missingOriginCookieReq) === false, "Missing Origin & Referer on cookie mutation is strictly rejected");

  // 3.2 Malformed Origin headers
  const malformedOrigin1 = new NextRequest("http://localhost:3000/api/admin-settings", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      host: "localhost:3000",
      origin: "malformed-url-string",
    },
  });
  assert(verifyCsrfOrigin(malformedOrigin1) === false, "Malformed Origin string (non-URL) is strictly rejected");

  const malformedOrigin2 = new NextRequest("http://localhost:3000/api/admin-settings", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      host: "localhost:3000",
      origin: "file:///etc/passwd",
    },
  });
  assert(verifyCsrfOrigin(malformedOrigin2) === false, "File scheme Origin is strictly rejected");

  // 3.3 Wrong Port Check
  const wrongPortReq = new NextRequest("http://localhost:3000/api/admin-settings", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      host: "localhost:3000",
      origin: "http://localhost:3001",
    },
  });
  assert(verifyCsrfOrigin(wrongPortReq) === false, "Origin with wrong port (3001 vs 3000) is strictly rejected");

  // 3.4 HTTP vs HTTPS Mismatch in Production
  try {
    (process.env as any).NODE_ENV = "production";
    const httpMismatchReq = new NextRequest("https://orva-store.com/api/admin-settings", {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
        host: "orva-store.com",
        origin: "http://orva-store.com",
      },
    });
    assert(verifyCsrfOrigin(httpMismatchReq) === false, "HTTP scheme origin on production HTTPS host is strictly rejected");
  } finally {
    (process.env as any).NODE_ENV = originalNodeEnv;
  }

  // 3.5 Cross-origin request with cookies
  const crossOriginCookieReq = new NextRequest("http://localhost:3000/api/admin-settings", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      host: "localhost:3000",
      origin: "https://evil-attacker-site.com",
    },
  });
  assert(verifyCsrfOrigin(crossOriginCookieReq) === false, "Cross-Origin POST carrying cookie is strictly blocked");

  // 3.6 Request containing BOTH a cookie and Bearer token: Must NOT bypass CSRF!
  const cookieAndBearerReq = new NextRequest("http://localhost:3000/api/admin-settings", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      authorization: `Bearer ${validToken}`,
      host: "localhost:3000",
      origin: "https://evil-attacker-site.com",
    },
  });
  assert(verifyCsrfOrigin(cookieAndBearerReq) === false, "Request with both cookie and Bearer token MUST NOT bypass CSRF Origin check");

  // 3.7 Request containing BOTH a cookie and x-admin-token: Must NOT bypass CSRF!
  const cookieAndCustomTokenReq = new NextRequest("http://localhost:3000/api/admin-settings", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      "x-admin-token": validToken,
      host: "localhost:3000",
      origin: "https://evil-attacker-site.com",
    },
  });
  assert(verifyCsrfOrigin(cookieAndCustomTokenReq) === false, "Request with both cookie and x-admin-token MUST NOT bypass CSRF Origin check");

  // 3.8 Legitimate Same-Origin cookie mutation
  const legitimateSameOriginReq = new NextRequest("http://localhost:3000/api/admin-settings", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      host: "localhost:3000",
      origin: "http://localhost:3000",
    },
  });
  assert(verifyCsrfOrigin(legitimateSameOriginReq) === true, "Legitimate same-origin cookie mutation is accepted");

  // ── GROUP 4: SESSION REVOCATION FAILURE-HANDLING & FAIL-CLOSED CHECKS ────
  console.log("\n── GROUP 4: Revocation Failure-Handling & Fail-Closed Semantics");

  // 4.1 Invalidation in isolate
  const tokenToRevoke = generateSessionToken();
  assert(await verifySessionToken(tokenToRevoke), "Token is valid prior to revocation");
  const didRevoke = await invalidateSession(tokenToRevoke);
  assert(didRevoke === true, "Session invalidation recorded successfully");
  assert(!(await verifySessionToken(tokenToRevoke)), "Token immediately rejected after revocation");

  // 4.2 Cache entries cannot allow a revoked token after revocation
  const [dataR] = tokenToRevoke.split(".");
  const payloadR = JSON.parse(Buffer.from(dataR, "base64url").toString("utf8"));
  __testInjectLocalRevocation(payloadR.sid, payloadR.exp);
  assert(!(await verifySessionToken(tokenToRevoke)), "Local cache persistently recognizes revoked SID");

  // 4.3 Cache entries cannot outlive token expiration
  __testResetLocalRevocationCache();
  const pastExp = Date.now() - 1000;
  __testInjectLocalRevocation("expired-sid-123", pastExp);
  // Trigger prune
  await isSessionRevokedDurable("any-sid", Date.now() + 1000);
  assert(!(await isSessionRevokedDurable("expired-sid-123")), "Expired revocation cache entry is pruned");

  // ── GROUP 5: REQUEST AUTHENTICATION ACROSS PERMITTED TRANSPORTS ───────────
  console.log("\n── GROUP 5: Request Verification Across Valid Transports");

  const independentToken = generateSessionToken();

  // 5.1 No credentials
  const unauthReq = new NextRequest("http://localhost:3000/api/admin-settings");
  assert(!(await verifyAdminSession(unauthReq)), "Request with no credentials is unauthorized");

  // 5.2 Cookie transport
  const cookieReq = new NextRequest("http://localhost:3000/api/admin-settings", {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${independentToken}`,
      host: "localhost:3000",
      origin: "http://localhost:3000",
    },
  });
  assert(await verifyAdminSession(cookieReq), "Request with valid session cookie and matching Origin is authorized");

  // 5.3 Bearer token transport (server-to-server)
  const bearerReq = new NextRequest("http://localhost:3000/api/admin-settings", {
    headers: {
      authorization: `Bearer ${independentToken}`,
    },
  });
  assert(await verifyAdminSession(bearerReq), "Request with valid Bearer token (no cookie) is authorized");

  // 5.4 Custom header transport (server-to-server)
  const customHeaderReq = new NextRequest("http://localhost:3000/api/admin-settings", {
    headers: {
      "x-admin-token": independentToken,
    },
  });
  assert(await verifyAdminSession(customHeaderReq), "Request with valid x-admin-token header is authorized");

  // 5.5 Query parameter transport forbidden
  const queryParamReq = new NextRequest(`http://localhost:3000/api/admin-settings?token=${independentToken}`);
  assert(!(await verifyAdminSession(queryParamReq)), "Tokens supplied via URL query parameters are rejected");

  // ── GROUP 6: ENDPOINT-LEVEL NEGATIVE AUTHORIZATION CHECKS (401 VERIFICATION) ─
  console.log("\n── GROUP 6: Protected Endpoint Access Enforcement (401 Verification)");

  // 6.1 GET /api/admin-settings without auth
  const resSettingsGet = await getAdminSettings(unauthReq);
  assert(resSettingsGet.status === 401, "GET /api/admin-settings returns 401 when unauthorized");

  // 6.2 POST /api/admin-settings without auth
  const resSettingsPost = await postAdminSettings(new NextRequest("http://localhost:3000/api/admin-settings", {
    method: "POST",
    body: JSON.stringify({ action: "save", store: { brandName: "Hacked" } }),
  }));
  assert(resSettingsPost.status === 401, "POST /api/admin-settings returns 401 when unauthorized");

  // 6.3 GET /api/delivery?action=label_pdf without auth
  const resPdfGet = await getDelivery(new NextRequest("http://localhost:3000/api/delivery?action=label_pdf&tracking=EC-12345"));
  assert(resPdfGet.status === 401, "GET /api/delivery?action=label_pdf returns 401 when unauthorized");

  // 6.4 GET /api/delivery?action=get_all_orders without auth
  const resOrdersGet = await getDelivery(new NextRequest("http://localhost:3000/api/delivery?action=get_all_orders"));
  assert(resOrdersGet.status === 401, "GET /api/delivery?action=get_all_orders returns 401 when unauthorized");

  // 6.5 GET /api/delivery?action=sync_all_active without auth
  const resSyncGet = await getDelivery(new NextRequest("http://localhost:3000/api/delivery?action=sync_all_active"));
  assert(resSyncGet.status === 401, "GET /api/delivery?action=sync_all_active returns 401 when unauthorized");

  // 6.6 POST /api/delivery without auth
  const resDeliveryPost = await postDelivery(new NextRequest("http://localhost:3000/api/delivery", {
    method: "POST",
    body: JSON.stringify({ action: "push_order", orderId: "TEST-01" }),
  }));
  assert(resDeliveryPost.status === 401, "POST /api/delivery returns 401 when unauthorized");

  // 6.7 DELETE /api/delivery without auth
  const resDeliveryDelete = await deleteDelivery(new NextRequest("http://localhost:3000/api/delivery?tracking=EC-12345", {
    method: "DELETE",
  }));
  assert(resDeliveryDelete.status === 401, "DELETE /api/delivery returns 401 when unauthorized");

  console.log("\n================================================================================");
  console.log(`   SECURITY AUDIT COMPLETED: ${passedTests} / ${totalTests} CHECKS PASSED (100%)`);
  console.log("================================================================================\n");
}

runSecurityTests().catch((err) => {
  console.error("Security Test Suite Error:", err);
  process.exit(1);
});
