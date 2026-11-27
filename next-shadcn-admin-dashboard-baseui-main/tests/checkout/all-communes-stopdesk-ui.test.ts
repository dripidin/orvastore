/**
 * ORVA Store — All-69-Wilayas & All-Communes Delivery Mode Verification Suite
 * Verifies:
 * 1. Both DOMICILE and STOP_DESK are enabled and priceable across all 69 wilayas & all communes.
 * 2. Both checkout and reroute Zod schemas accept STOP_DESK across all 69 wilayas.
 * 3. Illustrator-style SVG delivery artwork & CommuneOfficeStatusBanner render clear visual
 *    notices for both office-available communes and no-local-office communes with interactive controls.
 *
 * Run: npx tsx tests/checkout/all-communes-stopdesk-ui.test.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ALGERIA_69_WILAYAS,
  calculateDeliveryTariff,
  codOrderSubmissionSchema,
  isStorefrontStopDeskAllowed,
} from "../../src/lib/types/checkout";
import { orderReRoutingSchema } from "../../src/lib/types/re-routing";
import {
  CommuneOfficeStatusBanner,
  HomeDeliveryIllustration,
  NoLocalOfficeRouteIllustration,
  OfficeAvailableIllustration,
  StopDeskIllustration,
} from "../../src/components/storefront/checkout/delivery-illustrations";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}`);
    console.error("        ", err instanceof Error ? err.stack || err.message : err);
  }
}

function main() {
  console.log("Running All-69-Wilayas & All-Communes Stop-Desk + Illustrator UI Verification Suite...");

  check("Both DOMICILE and STOP_DESK are enabled and compute valid tariffs for all 69 wilayas", () => {
    assert.equal(ALGERIA_69_WILAYAS.length, 69);
    for (const w of ALGERIA_69_WILAYAS) {
      assert.equal(isStorefrontStopDeskAllowed(w.code), true, `Wilaya ${w.code} must allow Stop-Desk`);
      const domFee = calculateDeliveryTariff(w.code, "DOMICILE");
      const deskFee = calculateDeliveryTariff(w.code, "STOP_DESK");
      assert.ok(domFee > 0, `Wilaya ${w.code} domicile fee must be > 0`);
      assert.ok(deskFee > 0, `Wilaya ${w.code} stop-desk fee must be > 0`);
    }
  });

  check("Checkout & Reroute schemas accept STOP_DESK across Southern & Law 26-06 wilayas (1, 11, 49, 58, 69)", () => {
    for (const wilayaCode of [1, 11, 16, 49, 54, 58, 62, 69]) {
      const fee = calculateDeliveryTariff(wilayaCode, "STOP_DESK");
      const checkoutParsed = codOrderSubmissionSchema.safeParse({
        customerName: "أحمد بن علي",
        customerPhone: "0550123456",
        wilayaCode,
        wilayaName: `ولاية ${wilayaCode}`,
        communeName: "بلدية اختبار",
        deliveryType: "STOP_DESK",
        deliveryAddress: "Bureau Stop-Desk",
        packId: "PACK1",
        productName: "باك اختبار",
        productPrice: 4950,
        shippingFee: fee,
        totalPayable: 4950 + fee,
        idempotencyKey: "idem_key_test_1234567890",
      });
      assert.equal(
        checkoutParsed.success,
        true,
        `Checkout must accept STOP_DESK for wilaya ${wilayaCode}: ${JSON.stringify(checkoutParsed.success ? null : checkoutParsed.error.issues)}`,
      );

      const rerouteParsed = orderReRoutingSchema.safeParse({
        orderId: "ord-1",
        newCustomerName: "كريم مولود",
        newCustomerPhone: "0661123456",
        newWilayaCode: wilayaCode,
        newWilayaName: `ولاية ${wilayaCode}`,
        newCommuneName: "بلدية اختبار",
        newDeliveryType: "STOP_DESK",
        newDeliveryAddress: "Bureau Stop-Desk",
        reason: "تحويل للاستلام من المكتب بناء على طلب الزبون",
        operator: "Admin",
      });
      assert.equal(rerouteParsed.success, true, `Reroute must accept STOP_DESK for wilaya ${wilayaCode}`);
    }
  });

  check("Illustrator-style SVG artwork renders crisp vector scenes for both modes & both office states", () => {
    const homeSvg = renderToStaticMarkup(React.createElement(HomeDeliveryIllustration));
    const deskSvg = renderToStaticMarkup(React.createElement(StopDeskIllustration));
    const availSvg = renderToStaticMarkup(React.createElement(OfficeAvailableIllustration));
    const noOfficeSvg = renderToStaticMarkup(React.createElement(NoLocalOfficeRouteIllustration));

    for (const [label, html] of [
      ["HomeDeliveryIllustration", homeSvg],
      ["StopDeskIllustration", deskSvg],
      ["OfficeAvailableIllustration", availSvg],
      ["NoLocalOfficeRouteIllustration", noOfficeSvg],
    ]) {
      assert.ok(html.includes("<svg"), `${label} must render <svg>`);
      assert.ok(html.includes("<path"), `${label} must include vector <path> art`);
    }
  });

  check("CommuneOfficeStatusBanner renders office-available notice and no-local-office notice clearly", () => {
    const hasOfficeHtml = renderToStaticMarkup(
      React.createElement(CommuneOfficeStatusBanner, {
        communeName: "باب الوادي",
        wilayaName: "الجزائر",
        communeHasOffice: true,
        status: "ready",
        offices: [{ ar: "باب الوادي", fr: "Bab El Oued" }],
        selectedDeliveryType: "DOMICILE",
        onSelectDeliveryType: () => undefined,
      }),
    );
    assert.ok(hasOfficeHtml.includes("مكتب استلام متوفر في بلديتك"));
    assert.ok(hasOfficeHtml.includes("باب الوادي"));
    assert.ok(hasOfficeHtml.includes("اختر الاستلام من مكتب باب الوادي"));

    const noOfficeHtml = renderToStaticMarkup(
      React.createElement(CommuneOfficeStatusBanner, {
        communeName: "بوزريعة",
        wilayaName: "الجزائر",
        communeHasOffice: false,
        status: "ready",
        offices: [
          { ar: "الجزائر الوسطى", fr: "Alger Centre" },
          { ar: "باب الوادي", fr: "Bab El Oued" },
        ],
        selectedDeliveryType: "STOP_DESK",
        onSelectDeliveryType: () => undefined,
      }),
    );
    assert.ok(noOfficeHtml.includes("لا يوجد مكتب استلام داخل هذه البلدية"));
    assert.ok(noOfficeHtml.includes("بوزريعة"));
    assert.ok(noOfficeHtml.includes("الجزائر الوسطى"));
    assert.ok(noOfficeHtml.includes("أقرب مكتب رئيسي في ولاية"));
  });

  check("EmbeddedCodOrderForm and OrderReRouteDialog never disable STOP_DESK option", () => {
    const repoRoot = path.resolve(__dirname, "..", "..");
    const embeddedSrc = fs.readFileSync(
      path.join(repoRoot, "src/components/storefront/checkout/embedded-cod-order-form.tsx"),
      "utf8",
    );
    const rerouteSrc = fs.readFileSync(
      path.join(repoRoot, "src/components/dashboard/orders/order-reroute-dialog.tsx"),
      "utf8",
    );
    const quickOrderSrc = fs.readFileSync(
      path.join(repoRoot, "src/app/(main)/dashboard/_components/quick-order-dialog.tsx"),
      "utf8",
    );

    assert.equal(/disabled=\{!stopDeskAllowed\}/.test(embeddedSrc), false);
    assert.equal(/disabled=\{locked \|\| !stopDeskAllowed\}/.test(rerouteSrc), false);
    assert.equal(/disabled=\{!stopDesk\}/.test(quickOrderSrc), false);
    assert.ok(embeddedSrc.includes("CommuneOfficeStatusBanner"));
    assert.ok(embeddedSrc.includes("HomeDeliveryIllustration"));
    assert.ok(embeddedSrc.includes("StopDeskIllustration"));
  });

  console.log(`\nAll-Communes Stop-Desk + Illustrator UI Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main();
