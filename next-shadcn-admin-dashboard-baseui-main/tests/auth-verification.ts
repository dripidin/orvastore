import assert from "node:assert";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/auth/route";

async function runAuthVerification() {
  console.log("════════════════════════════════════════════════════════════════════");
  console.log("  ORVA STORE — ADMIN AUTHENTICATION API VERIFICATION SUITE");
  console.log("════════════════════════════════════════════════════════════════════\n");

  // 1. Initial session check without cookie or token should be 401
  console.log("Test 1: Unauthenticated session check...");
  const req1 = new NextRequest("http://localhost:3000/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "session" }),
  });
  const res1 = await POST(req1);
  const data1 = await res1.json();
  assert.strictEqual(res1.status, 401, "Should return 401 for unauthenticated session");
  assert.strictEqual(data1.authenticated, false);
  console.log("✅ Test 1 Passed: Unauthenticated session returns 401");

  // 2. Login with wrong password should fail with 401
  console.log("Test 2: Login with incorrect password...");
  const req2 = new NextRequest("http://localhost:3000/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", password: "invalid-password-xyz" }),
  });
  const res2 = await POST(req2);
  const data2 = await res2.json();
  assert.strictEqual(res2.status, 401, "Should return 401 for invalid password");
  assert.strictEqual(data2.success, false);
  console.log("✅ Test 2 Passed: Invalid password rejected with 401");

  // 3. Login with default password 'admin123' should succeed and return cookie & token
  console.log("Test 3: Login with default password 'admin123'...");
  const req3 = new NextRequest("http://localhost:3000/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", password: "admin123" }),
  });
  const res3 = await POST(req3);
  const data3 = await res3.json();
  assert.strictEqual(res3.status, 200, "Should return 200 for valid password");
  assert.strictEqual(data3.success, true);
  assert.ok(data3.token, "Should return a session token");
  const cookieHeader = res3.headers.get("set-cookie");
  assert.ok(cookieHeader && cookieHeader.includes("orva_admin_session="), "Should set orva_admin_session cookie");
  console.log("✅ Test 3 Passed: Login succeeds with token and session cookie");

  const token = data3.token;

  // 4. Session check with cookie should succeed
  console.log("Test 4: Verify session with cookie...");
  const req4 = new NextRequest("http://localhost:3000/api/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `orva_admin_session=${token}`,
    },
    body: JSON.stringify({ action: "session" }),
  });
  const res4 = await POST(req4);
  const data4 = await res4.json();
  assert.strictEqual(res4.status, 200, "Should return 200 for authenticated session");
  assert.strictEqual(data4.authenticated, true);
  console.log("✅ Test 4 Passed: Session verified via cookie");

  // 5. Session check with Authorization Bearer header should succeed
  console.log("Test 5: Verify session with Bearer token header...");
  const req5 = new NextRequest("http://localhost:3000/api/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action: "session" }),
  });
  const res5 = await POST(req5);
  const data5 = await res5.json();
  assert.strictEqual(res5.status, 200, "Should return 200 for authenticated session via Bearer");
  assert.strictEqual(data5.authenticated, true);
  console.log("✅ Test 5 Passed: Session verified via Authorization header");

  // 6. Test custom ADMIN_PASSWORD from env
  console.log("Test 6: Verify custom ADMIN_PASSWORD from process.env...");
  process.env.ADMIN_PASSWORD = "MyCustomSecretVercelPassword2026!";
  const req6 = new NextRequest("http://localhost:3000/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", password: "MyCustomSecretVercelPassword2026!" }),
  });
  const res6 = await POST(req6);
  const data6 = await res6.json();
  assert.strictEqual(res6.status, 200, "Custom env ADMIN_PASSWORD must succeed");
  assert.strictEqual(data6.success, true);
  console.log("✅ Test 6 Passed: Custom environment ADMIN_PASSWORD verified");

  // 7. Logout action
  console.log("Test 7: Logout...");
  const req7 = new NextRequest("http://localhost:3000/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logout" }),
  });
  const res7 = await POST(req7);
  const data7 = await res7.json();
  assert.strictEqual(res7.status, 200);
  assert.strictEqual(data7.success, true);
  console.log("✅ Test 7 Passed: Logout action succeeded");

  console.log("\n🎉 ALL 7 AUTHENTICATION VERIFICATION CHECKS PASSED!");
}

runAuthVerification().catch((err) => {
  console.error("❌ Auth verification failed:", err);
  process.exit(1);
});

