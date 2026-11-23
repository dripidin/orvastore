import {
  ALGERIA_69_WILAYAS,
  extractWilayaCode69,
  getMotherWilayaCode,
  MOTHER_WILAYA_MAP,
  resolveCarrierWilayaCode,
} from "../../src/lib/geo/algeria-69";
import { getStorefrontDeliveryCoverage } from "../../src/lib/geo/coverage";
import { calculateDeliveryTariff, isStopDeskAllowed } from "../../src/lib/types/checkout";
import assert from "node:assert/strict";

async function runTests() {
  console.log("── Stage 1 Verification: 69 Wilayas Coverage, Law 26-06 Mother Routing & Storefront Notice ──");
  let passed = 0;
  function verify(cond: boolean, label: string) {
    assert.ok(cond, label);
    passed += 1;
    console.log(`  [PASS] ${String(passed).padStart(2, "0")}: ${label}`);
  }

  verify(ALGERIA_69_WILAYAS.length === 69, "Exports all 69 Algerian wilayas");
  verify(ALGERIA_69_WILAYAS[0].code === 1 && ALGERIA_69_WILAYAS[68].code === 69, "Wilaya codes span 01 to 69");

  // Law 26-06 new wilayas 59..69
  verify(getMotherWilayaCode(59) === 3, "Wilaya 59 (Aflou) maps to mother wilaya 3 (Laghouat)");
  for (let code = 59; code <= 69; code++) {
    const mother = MOTHER_WILAYA_MAP[code];
    verify(Boolean(mother && mother >= 1 && mother <= 58), `Wilaya ${code} has valid mother wilaya (${mother})`);
    const route58 = resolveCarrierWilayaCode(code);
    verify(
      route58.carrierWilayaCode === mother && route58.routedViaMotherWilaya === true,
      `Legacy 58-wilaya carrier routes Wilaya ${code} via mother ${mother}`,
    );
    verify(isStopDeskAllowed(code) === false, `Wilaya ${code} disables Stop-Desk by default`);
    const homeFee = calculateDeliveryTariff(code, "DOMICILE");
    verify(homeFee > 0, `Wilaya ${code} keeps Home Delivery active with valid tariff (${homeFee} DZD)`);
  }

  verify(extractWilayaCode69("69 - الأبيض سيدي الشيخ") === 69, "Extracts wilaya code 69 from Arabic label");

  const coverage = await getStorefrontDeliveryCoverage();
  verify(coverage.totalWilayas === 69 && coverage.wilayas.length === 69, "Storefront coverage returns all 69 wilayas");
  const w64 = coverage.wilayas.find((w) => w.wilayaCode === 64);
  verify(
    Boolean(w64 && w64.homeEnabled === true && w64.stopDeskEnabled === false),
    "Wilaya 64 has Home Delivery enabled & Stop-Desk unavailable",
  );
  verify(
    Boolean(w64?.stopDeskStatusMessage?.includes("مكتب التوصيل غير متوفر حالياً")),
    "Displays Arabic Stop-Desk unavailable notice while keeping courier home delivery",
  );
  verify(Boolean(w64?.primaryCourier?.nameAr), "Exposes active shipping company branding to storefront");

  console.log(`\nALL ${passed} TESTS PASSED!`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
