import * as XLSX from "xlsx";

import { computeCodAccountingReport } from "../../src/lib/analytics/accounting-report";
import { getStoredFallbackOrders, saveAllFallbackOrders } from "../../src/lib/orders-store";
import { parseCourierExcelBuffer } from "../../src/lib/reconciliation/excel-parser";
import {
  compareFileWithStoredHistory,
  runMultiCourierReconciliation,
  storeUploadedAiFile,
} from "../../src/lib/reconciliation/reconciliation-engine";
import assert from "node:assert/strict";

function makeWorkbookBuffer(rows: Record<string, unknown>[]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Orders");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function runTests() {
  console.log("── Stage 4 Verification: Multi-Courier Excel Reconciliation, Return Capture & COD Accounting ──");
  let passed = 0;
  function verify(cond: boolean, label: string) {
    assert.ok(cond, label);
    passed += 1;
    console.log(`  [PASS] ${String(passed).padStart(2, "0")}: ${label}`);
  }

  const prevStored = [...getStoredFallbackOrders()];
  try {
    saveAllFallbackOrders([
      {
        id: "ORV-RECON-1",
        orderNumber: "ORV-RECON-1",
        customerName: "Amine K.",
        customerPhone: "0550111222",
        customerPhone2: null,
        wilayaCode: 16,
        wilayaName: "Alger",
        communeName: "Alger Centre",
        deliveryType: "DOMICILE",
        deliveryAddress: "Rue Didouche",
        packId: "PACK1",
        productName: "Pack 1",
        productPrice: 4500,
        shippingFee: 450,
        totalPayable: 4950,
        status: "DELIVERED",
        originHub: "BISKRA_07",
        createdAt: "2026-11-20T10:00:00Z",
        in_redex: true,
        redex_tracking_code: "TRK-SYNC-1",
      } as any,
      {
        id: "ORV-RECON-2",
        orderNumber: "ORV-RECON-2",
        customerName: "Samir B.",
        customerPhone: "0661222333",
        customerPhone2: null,
        wilayaCode: 31,
        wilayaName: "Oran",
        communeName: "Oran",
        deliveryType: "DOMICILE",
        deliveryAddress: "Oran Centre",
        packId: "PACK1",
        productName: "Pack 1",
        productPrice: 4500,
        shippingFee: 500,
        totalPayable: 5000,
        status: "PENDING",
        originHub: "BISKRA_07",
        createdAt: "2026-11-20T11:00:00Z",
        in_redex: true,
        redex_tracking_code: "TRK-UNSYNC-2",
      } as any,
      {
        id: "ORV-STORE-ONLY-3",
        orderNumber: "ORV-STORE-ONLY-3",
        customerName: "Nabil S.",
        customerPhone: "0770333444",
        customerPhone2: null,
        wilayaCode: 25,
        wilayaName: "Constantine",
        communeName: "Constantine",
        deliveryType: "DOMICILE",
        deliveryAddress: "Centre",
        packId: "PACK1",
        productName: "Pack 1",
        productPrice: 4500,
        shippingFee: 500,
        totalPayable: 5000,
        status: "CONFIRMED",
        originHub: "BISKRA_07",
        createdAt: "2026-11-21T09:00:00Z",
      } as any,
    ]);

    const buf1 = makeWorkbookBuffer([
      {
        Tracking: "TRK-SYNC-1",
        Reference: "ORV-RECON-1",
        Client: "Amine K.",
        Telephone: "0550111222",
        Wilaya: "16 - Alger",
        Montant: 4950,
        Statut: "livred",
        "Date creation": "2026-11-20T10:00:00Z",
      },
      {
        Tracking: "TRK-UNSYNC-2",
        Reference: "ORV-RECON-2",
        Client: "Samir B.",
        Telephone: "0661222333",
        Wilaya: "31 - Oran",
        Montant: 5000,
        Statut: "livred",
        Livreur: "Sofiane",
        "Tel livreur": "0558009900",
        "Date creation": "2026-11-20T12:00:00Z",
      },
      {
        Tracking: "TRK-CROSS-DUP",
        Reference: "ORV-X-1",
        Client: "Karim D.",
        Telephone: "0559887766",
        Wilaya: "09 - Blida",
        Montant: 4950,
        Statut: "en_livraison",
        "Date creation": "2026-11-21T10:00:00Z",
      },
    ]);

    const buf2 = makeWorkbookBuffer([
      {
        Tracking: "TRK-CROSS-DUP", // Duplicate across courier 2!
        Reference: "ORV-X-1",
        Client: "Karim D.",
        Telephone: "0559887766",
        Wilaya: "09 - Blida",
        Montant: 4950,
        Statut: "prete_a_expedier",
        "Date creation": "2026-11-22T10:00:00Z",
      },
      {
        Tracking: "EXT-RET-ORVA-99",
        Reference: "ORV-UNREC-RET",
        Boutique: "ORVA Store",
        Client: "Fares M.",
        Telephone: "0667001122",
        Wilaya: "19 - Sétif",
        Montant: 4950,
        Statut: "retour_recu",
        "Tarif Retour": 350,
        "Date creation": "2026-11-22T14:00:00Z",
      },
    ]);

    const parsed1 = parseCourierExcelBuffer({
      buffer: buf1,
      fileName: "redex-export.xlsx",
      courierId: "redex",
      courierName: "Redex Express",
    });
    const parsed2 = parseCourierExcelBuffer({
      buffer: buf2,
      fileName: "yalidine-export.xlsx",
      courierId: "yalidine_unregistered_test",
      courierName: "Yalidine Test Sheet",
    });

    verify(parsed1.rowCount === 3 && parsed2.rowCount === 2, "Parses real Excel buffers with smart AR/FR headers");
    verify(
      parsed2.rows[1].returnFeeDzd === 350 && parsed2.rows[1].mappedStoreStatus === "returned",
      "Extracts tarif_retour and normalizes return status",
    );

    const recon = await runMultiCourierReconciliation({
      batches: [
        {
          courierId: "redex",
          courierName: "Redex Express",
          sourceType: "excel",
          fileName: parsed1.fileName,
          fileHash: parsed1.fileHash,
          rows: parsed1.rows,
        },
        {
          courierId: "yalidine_unregistered_test",
          courierName: "Yalidine Test Sheet",
          sourceType: "excel",
          fileName: parsed2.fileName,
          fileHash: parsed2.fileHash,
          rows: parsed2.rows,
        },
      ],
      includeStoreOnly: true,
    });

    verify(recon.counts.matched_synced >= 1, "Identifies matched_synced order");
    verify(recon.counts.matched_unsynced >= 1, "Identifies matched_unsynced discrepancy");
    verify(recon.counts.store_only >= 1, "Identifies store_only order");
    verify(recon.counts.duplicate >= 1, "Catches cross-courier duplicate across two separate Excel files");
    verify(recon.counts.courier_only >= 1, "Identifies courier_only orders ready to import");
    verify(
      recon.counts.storeOwnedReturnsCount === 1 && recon.counts.totalReturnLossDzd >= 350,
      "Captures store-owned unregistered returned parcel & deducts real tarif_retour",
    );
    verify(
      recon.couriersProcessed.some((c) => c.courierId === "yalidine_unregistered_test" && c.autoRegistered === true),
      "Auto-registers unregistered courier from Excel",
    );

    // Test AI file freshness memory (duplicate, stale, updated)
    await storeUploadedAiFile({
      parsed: parsed1,
      fileType: "excel",
      courierId: "redex",
      freshness: await compareFileWithStoredHistory(parsed1, "redex"),
    });
    const dupCheck = await compareFileWithStoredHistory(parsed1, "redex");
    verify(dupCheck.freshnessStatus === "duplicate", "Detects duplicate uploaded file via SHA-256");

    const olderBuf = makeWorkbookBuffer([
      {
        Tracking: "TRK-OLD",
        Reference: "ORV-OLD",
        Client: "Old",
        Telephone: "0550000001",
        Wilaya: "16",
        Montant: 4950,
        Statut: "livred",
        "Date creation": "2026-10-01T10:00:00Z",
      },
    ]);
    const parsedOld = parseCourierExcelBuffer({
      buffer: olderBuf,
      fileName: "older.xlsx",
      courierId: "redex",
      courierName: "Redex",
    });
    const staleCheck = await compareFileWithStoredHistory(parsedOld, "redex");
    verify(
      staleCheck.freshnessStatus === "stale_warning",
      "Warns when newly uploaded file is older than stored snapshot",
    );

    // Accounting report verification
    const report = computeCodAccountingReport({
      orders: [],
      capturedReturns: [
        {
          trackingCode: "EXT-RET-ORVA-99",
          courierId: "redex",
          courierName: "Redex",
          wilayaCode: 19,
          returnFeeDzd: 350,
        },
      ],
      metaAdSpendDzd: 2450,
    });
    verify(
      report.capturedExternalReturnsCount === 1 &&
        report.totalReturnLossDzd === 350 &&
        report.netRealizedProfitDzd === -(350 + 2450),
      "COD Accounting includes captured external return losses & Meta spend",
    );
  } finally {
    saveAllFallbackOrders(prevStored);
  }

  console.log(`\nALL ${passed} TESTS PASSED!`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
