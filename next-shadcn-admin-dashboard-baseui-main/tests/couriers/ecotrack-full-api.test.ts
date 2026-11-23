import { getRateLimitSnapshot } from "../../src/lib/couriers";
import { decryptSecret, encryptSecret, toPublicCourierDTO } from "../../src/lib/couriers/credentials-store";
import { EcoTrackClient } from "../../src/lib/couriers/ecotrack-client";
import { isSwitchableAtCourier, mapCourierStatusRich } from "../../src/lib/delivery/courier-status-mapper";
import { computeCourierStatusBridgeUpdate } from "../../src/lib/delivery/status-bridge";
import { generateCompactCourierSwitchMaj } from "../../src/lib/types/re-routing";
import assert from "node:assert/strict";

async function runTests() {
  console.log("── Stage 2 & 3 Verification: Full 6-Section EcoTrack API, AES-256-GCM & Status Bridge ──");
  let passed = 0;
  function verify(cond: boolean, label: string) {
    assert.ok(cond, label);
    passed += 1;
    console.log(`  [PASS] ${String(passed).padStart(2, "0")}: ${label}`);
  }

  // 1. AES-256-GCM Encryption & Write-Only Public DTO
  const encrypted = encryptSecret("tok_super_secret_redex_9911");
  verify(Boolean(encrypted && encrypted.startsWith("enc:v1:")), "Encrypts secret token with AES-256-GCM enc:v1 prefix");
  verify(decryptSecret(encrypted) === "tok_super_secret_redex_9911", "Decrypts AES-256-GCM token back accurately");

  const dto = toPublicCourierDTO({
    id: "redex",
    name: "Redex",
    nameAr: "ريديكس",
    family: "ecotrack",
    baseUrl: "https://redex.ecotrack.dz",
    isActive: true,
    isDefault: true,
    supportsStopDesk: true,
    autoValidate: false,
    isExternalExcelOnly: false,
    originHub: "07",
    trackingUrlTemplate: null,
    apiKey: "",
    apiToken: "tok_super_secret_redex_9911",
    apiSecret: "",
    accountId: "",
    webhookSecret: "",
    storeIdentifiers: ["ORVA"],
    rateLimitSnapshot: {},
    lastSyncedAt: null,
    config: {},
  });
  verify(dto.hasApiToken === true && dto.maskedTokenPreview === "tok_••••9911", "Masks token preview in public DTO");
  verify(
    !("apiToken" in dto) && !JSON.stringify(dto).includes("tok_super_secret"),
    "Never leaks raw apiToken to browser DTO",
  );

  // 2. Intercept fetch to verify all 6 EcoTrack sections + 429 retry + fees retour + driver/desk extraction + 240 char MAJ
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const originalFetch = globalThis.fetch;
  let attemptsOnBulk = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method || "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : undefined;
    calls.push({ url, method, body });

    if (url.includes("/api/v1/validate/token")) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "X-RateLimit-Limit": "50",
          "X-RateLimit-Remaining": "49",
          "X-RateLimit-Remaining-Hour": "1499",
          "X-RateLimit-Remaining-Day": "14999",
        },
      });
    }
    if (url.includes("/api/v1/get/fees")) {
      return new Response(
        JSON.stringify({
          livraison: [{ wilaya_id: 16, tarif: 450, tarif_stopdesk: 300, retour: 350, pickup: 200, echange: 500 }],
          retour: [{ wilaya_id: 16, tarif: 350 }],
        }),
        { status: 200 },
      );
    }
    if (url.includes("/api/v1/create/orders")) {
      if (attemptsOnBulk === 0) {
        attemptsOnBulk += 1;
        return new Response(JSON.stringify({ message: "Too Many Requests" }), {
          status: 429,
          headers: { "Retry-After": "0" },
        });
      }
      return new Response(
        JSON.stringify({ success: true, results: { "1": { success: true, tracking: "RDX-BULK-1" } } }),
        { status: 200 },
      );
    }
    if (url.includes("/api/v1/add/maj")) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.includes("/api/v1/get/tracking/info")) {
      return new Response(
        JSON.stringify({
          status: "en_livraison",
          driver_name: "Karim",
          driver_phone: "0551223344",
          desk_info: { phone: "023445566", address: "Alger Centre Desk" },
          activity: [
            { date: "2026-11-23", time: "10:00", status: "en_livraison", station: "HUB ALGER", driver: "Karim" },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes("/api/v1/get/products/list")) {
      return new Response(
        JSON.stringify({
          data: [{ reference: "ORVA-P1-4950", title: "Pack 1", stock_dispo: 12, stock_reserve: 2, stock_phisique: 14 }],
          last_page: 1,
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
  }) as typeof fetch;

  try {
    const client = new EcoTrackClient({
      courierId: "redex-test",
      baseUrl: "https://redex.ecotrack.dz",
      token: "tok_test",
    });

    const auth = await client.validateToken();
    verify(auth.success === true, "Section 1 Authorisation validate/token works");
    const rl = getRateLimitSnapshot("redex-test");
    verify(
      rl.remainingHour === 1499 && rl.remainingDay === 14999,
      "Section 2 Taux limite parses hour & day quota headers",
    );

    const fees = await client.getFees(true);
    verify(
      fees.success && fees.returnFeesByWilaya?.[16] === 350,
      "Section 5 Configuration parses tarif_retour per wilaya",
    );

    const bulk = await client.createOrdersBulk([
      {
        reference: "ORV-1",
        nom_client: "Amine",
        telephone: "0550112233",
        adresse: "Rue 1",
        commune: "Alger Centre",
        code_wilaya: 16,
        montant: 4950,
      },
    ]);
    verify(bulk.success && attemptsOnBulk === 1, "Section 3 Commandes bulk handles HTTP 429 retry automatically");
    verify(
      !calls.some((c) => c.url.includes("valid/order")),
      "Requirement B invariant: bulk creation never calls valid/order",
    );

    const longContent = "A".repeat(300);
    await client.addRemark("RDX-1", longContent);
    const majCall = calls.find((c) => c.url.includes("/api/v1/add/maj"));
    const sentRem = new URL(majCall!.url).searchParams.get("content") || "";
    verify(sentRem.length <= 240, "Section 3 add/maj enforces 240 char ceiling");

    const track = await client.getTrackingInfo("RDX-1", true);
    verify(
      track.success && track.driverPhone === "0551223344" && track.deskInfo?.deskPhone === "023445566",
      "Section 4 tracking enriches driver_phone & desk_info",
    );

    const prod = await client.getProducts(1);
    verify(prod.success && prod.products?.[0]?.reference === "ORVA-P1-4950", "Section 6 Produits lists courier stock");
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 3. Dual-Track Status Bridge + Switchability on suspended orders
  verify(isSwitchableAtCourier("suspendu") === true, "Suspended parcel is switchable");
  verify(isSwitchableAtCourier("return_asked") === false, "Parcel with return requested cannot be switched");
  verify(isSwitchableAtCourier("livred") === false, "Delivered parcel cannot be switched");

  const compactMaj = generateCompactCourierSwitchMaj({
    originalOrderNumber: "ORV-1001",
    newCustomerName: "Yacine Brahimi",
    newCustomerPhone: "0661223344",
    newWilayaCode: 31,
    newCommuneName: "Oran",
    newDeliveryType: "DOMICILE",
    updatedCodAmount: 5500,
  });
  verify(compactMaj.length <= 240 && compactMaj.includes("SWITCH -> Yacine"), "Compact MAJ fits 240 chars");

  const bridgeManual = computeCourierStatusBridgeUpdate({
    currentStoreStatus: "confirmed",
    manualStatusOverride: true,
    courierStatusRaw: "en_livraison",
  });
  verify(
    bridgeManual.storeStatusChanged === false && bridgeManual.normalized_courier_status === "OUT_FOR_DELIVERY",
    "Manual override prevents non-terminal regression while updating carrier track",
  );

  const bridgeTerminal = computeCourierStatusBridgeUpdate({
    currentStoreStatus: "shipped",
    manualStatusOverride: true,
    courierStatusRaw: "retour_recu",
    returnFeeDzd: 350,
  });
  verify(
    bridgeTerminal.storeStatusChanged === true &&
      bridgeTerminal.nextStoreStatus === "returned" &&
      bridgeTerminal.return_fee_dzd === 350,
    "Terminal courier status bridges store status & preserves return fee",
  );
  verify(
    mapCourierStatusRich("livre_non_encaisse").financialStage === "uncollected",
    "Maps COD financial lifecycle stage",
  );

  console.log(`\nALL ${passed} TESTS PASSED!`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
