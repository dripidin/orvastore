/**
 * Milestone M3 Empirical Stress Test & Adversarial Challenge Harness
 * Conducted by Empirical Challenger (teamwork_challenger_m3_2)
 */

import {
  submitCodOrderAction,
} from '../src/app/actions/checkout';
import {
  generateOrderNumber,
  fallbackOrdersStore,
} from '../src/lib/orders-store';
import {
  CodOrderSubmission,
  codOrderSubmissionSchema,
  normalizeAlgerianPhone,
  isValidAlgerianPhone,
  maskPhoneForPrivacy,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  ALGERIA_58_WILAYAS,
} from '../src/lib/types/checkout';

interface TestResult {
  suite: string;
  testName: string;
  passed: boolean;
  message: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  details?: unknown;
}

const allResults: TestResult[] = [];

function record(
  suite: string,
  testName: string,
  passed: boolean,
  message: string,
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' = 'INFO',
  details?: unknown
) {
  allResults.push({ suite, testName, passed, message, severity, details });
  const status = passed ? '✅ PASS' : `❌ FAIL [${severity}]`;
  console.log(`[${status}] [${suite}] ${testName}: ${message}`);
  if (!passed && details) {
    console.error('   Details:', details);
  }
}

async function runAllTests() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   ORVA COD STOREFRONT & CHECKOUT — EMPIRICAL ADVERSARIAL STRESS SUITE  ');
  console.log('   Timestamp:', new Date().toISOString());
  console.log('════════════════════════════════════════════════════════════════════════\n');

  // ────────────────────────────────────────────────────────────────────────────
  // SUITE 1: Algerian Mobile Phone Normalization & Validation Edge Cases
  // ────────────────────────────────────────────────────────────────────────────
  const phoneSuite = '1. Phone Normalization & Validation';

  const validPhones = [
    { raw: '0550123456', expectedNorm: '0550123456' },
    { raw: '0661123456', expectedNorm: '0661123456' },
    { raw: '0770123456', expectedNorm: '0770123456' },
    { raw: '+213550123456', expectedNorm: '0550123456' },
    { raw: '00213661123456', expectedNorm: '0661123456' },
    { raw: '213770123456', expectedNorm: '0770123456' },
    { raw: '+2130770123456', expectedNorm: '0770123456' },
    { raw: '05 50 12 34 56', expectedNorm: '0550123456' },
    { raw: '06-61-12-34-56', expectedNorm: '0661123456' },
    { raw: '(0770) 12.34.56', expectedNorm: '0770123456' },
  ];

  for (const item of validPhones) {
    const norm = normalizeAlgerianPhone(item.raw);
    const valid = isValidAlgerianPhone(item.raw);
    const passed = norm === item.expectedNorm && valid;
    record(
      phoneSuite,
      `Valid Phone: ${item.raw}`,
      passed,
      `Normalized to "${norm}", valid=${valid}`,
      passed ? 'INFO' : 'HIGH'
    );
  }

  // Stress test: '002130550123456' prefix normalization bug verification
  const bugPrefixRaw = '002130550123456';
  const bugNorm = normalizeAlgerianPhone(bugPrefixRaw);
  const bugValid = isValidAlgerianPhone(bugPrefixRaw);
  const isBugPresent = bugNorm === '00550123456' && !bugValid;
  record(
    phoneSuite,
    'Vulnerability Check: 002130 Prefix Off-By-One Corruption',
    !isBugPresent,
    isBugPresent
      ? `CONFIRMED BUG: normalizeAlgerianPhone("002130550123456") produced "${bugNorm}" (11 digits, invalid) due to '0' + slice(5)`
      : `Normalized to "${bugNorm}" correctly`,
    'HIGH',
    { raw: bugPrefixRaw, output: bugNorm, valid: bugValid }
  );

  const invalidPhones = [
    { raw: '021123456', reason: 'Fixed landline (Algiers 021)' },
    { raw: '041123456', reason: 'Fixed landline (Oran 041)' },
    { raw: '091123456', reason: 'Non-existent prefix 09' },
    { raw: '081123456', reason: 'Non-existent prefix 08' },
    { raw: '055012345', reason: '9 digits (too short)' },
    { raw: '05501234567', reason: '11 digits (too long)' },
    { raw: '0550ABC456', reason: 'Contains alphanumeric characters' },
    { raw: '+33612345678', reason: 'French mobile number' },
    { raw: '', reason: 'Empty string' },
    { raw: '           ', reason: 'Whitespace string' },
    { raw: "0550123456'; DROP TABLE orders; --", reason: 'SQL injection string in phone' },
  ];

  for (const item of invalidPhones) {
    const valid = isValidAlgerianPhone(item.raw);
    const passed = !valid;
    record(
      phoneSuite,
      `Invalid Phone: "${item.raw}"`,
      passed,
      `Rejected correctly (${item.reason}), valid=${valid}`,
      passed ? 'INFO' : 'HIGH'
    );
  }

  // Test maskPhoneForPrivacy
  const maskedValid = maskPhoneForPrivacy('0798282495');
  record(
    phoneSuite,
    'Phone Privacy Masking',
    maskedValid === '0798 •• •• 95',
    `Masked output: "${maskedValid}"`,
    maskedValid === '0798 •• •• 95' ? 'INFO' : 'MEDIUM'
  );

  const maskedInvalidLength = maskPhoneForPrivacy('12345');
  record(
    phoneSuite,
    'Phone Privacy Masking on Invalid Length',
    maskedInvalidLength === '12345',
    `Preserved as fallback: "${maskedInvalidLength}"`,
    maskedInvalidLength === '12345' ? 'INFO' : 'LOW'
  );

  // ────────────────────────────────────────────────────────────────────────────
  // SUITE 2: Wilaya & Delivery Tariff Logistics Matrix
  // ────────────────────────────────────────────────────────────────────────────
  const logisticsSuite = '2. Logistics Matrix & Stop-Desk Barrier';

  record(
    logisticsSuite,
    '58 Wilayas Coverage',
    ALGERIA_58_WILAYAS.length === 58,
    `Total Wilayas registered: ${ALGERIA_58_WILAYAS.length}`,
    ALGERIA_58_WILAYAS.length === 58 ? 'INFO' : 'HIGH'
  );

  // Stop-Desk allowed for 1..48 (excluding Zone 5), barred for 49..58 and Zone 5
  let stopDeskCorrect = true;
  for (let c = 1; c <= 58; c++) {
    const allowed = isStopDeskAllowed(c);
    const wilaya = ALGERIA_58_WILAYAS.find((w) => w.code === c);
    const expected = c <= 48 && wilaya?.zone !== 5;
    if (allowed !== expected) {
      stopDeskCorrect = false;
      record(logisticsSuite, `Stop-Desk Barrier Wilaya ${c}`, false, `Got ${allowed}, expected ${expected}`, 'HIGH');
    }
  }
  if (stopDeskCorrect) {
    record(
      logisticsSuite,
      'Stop-Desk Wilayas 1-48 vs 49-58 Barrier',
      true,
      'All 58 Wilayas strictly conform to Stop-Desk availability barrier',
      'INFO'
    );
  }

  // Tariff calculation
  const biskraDomicile = calculateDeliveryTariff(7, 'DOMICILE');
  const biskraStopDesk = calculateDeliveryTariff(7, 'STOP_DESK');
  const algerDomicile = calculateDeliveryTariff(16, 'DOMICILE');
  const algerStopDesk = calculateDeliveryTariff(16, 'STOP_DESK');
  const tamanrassetDomicile = calculateDeliveryTariff(11, 'DOMICILE');

  record(
    logisticsSuite,
    'Origin Hub Biskra (07) Tariff',
    biskraDomicile === 450 && biskraStopDesk === 350,
    `Domicile: ${biskraDomicile} DZD, Stop-Desk: ${biskraStopDesk} DZD`,
    'INFO'
  );

  record(
    logisticsSuite,
    'Zone 2 Northern Alger (16) Tariff',
    algerDomicile === 500 && algerStopDesk === 400,
    `Domicile: ${algerDomicile} DZD, Stop-Desk: ${algerStopDesk} DZD`,
    'INFO'
  );

  record(
    logisticsSuite,
    'Zone 5 Far South Tamanrasset (11) Tariff',
    tamanrassetDomicile === 1000,
    `Domicile: ${tamanrassetDomicile} DZD`,
    'INFO'
  );

  // Zone 5 Stop-Desk exception check
  let zone5StopDeskThrew = false;
  try {
    calculateDeliveryTariff(11, 'STOP_DESK');
  } catch {
    zone5StopDeskThrew = true;
  }
  record(
    logisticsSuite,
    'Zone 5 Stop-Desk Tariff Exception',
    zone5StopDeskThrew,
    'Stop-desk in Zone 5 threw error as required',
    'INFO'
  );

  // ────────────────────────────────────────────────────────────────────────────
  // SUITE 3: Zod Schema & Malformed Payloads Stress Testing
  // ────────────────────────────────────────────────────────────────────────────
  const schemaSuite = '3. Zod Schema Validation & Boundary Stress';

  const validBaseSubmission: CodOrderSubmission = {
    customerName: 'Kamel Belkacem',
    customerPhone: '0550123456',
    customerPhone2: '0770987654',
    wilayaCode: 16,
    wilayaName: 'الجزائر',
    communeName: 'الجزائر الوسطى',
    deliveryType: 'DOMICILE',
    deliveryAddress: '12 Rue Didouche Mourad',
    packId: 'PACK1',
    productName: 'باك كومبريسار و المفاتيح 4 في 1',
    productPrice: 4950,
    shippingFee: 500,
    totalPayable: 5450,
  };

  const validParse = codOrderSubmissionSchema.safeParse(validBaseSubmission);
  record(
    schemaSuite,
    'Valid Baseline Payload',
    validParse.success,
    validParse.success ? 'Parsed successfully' : JSON.stringify(validParse.error.issues),
    'INFO'
  );

  // 3.1 Honeypot Bot Trap
  const botSubmission = { ...validBaseSubmission, honeypot: 'spam bot crawler' };
  const botParse = codOrderSubmissionSchema.safeParse(botSubmission);
  record(
    schemaSuite,
    'Honeypot Bot Trap Rejection',
    !botParse.success && botParse.error.issues.some((i) => i.path.includes('honeypot')),
    'Rejected bot payload with honeypot field',
    'INFO'
  );

  // 3.2 Southern Wilayas Stop-Desk Barrier (Wilaya 49 Timimoun)
  const southernStopDeskSubmission: CodOrderSubmission = {
    ...validBaseSubmission,
    wilayaCode: 49,
    wilayaName: 'تيميمون',
    deliveryType: 'STOP_DESK',
    deliveryAddress: undefined,
  };
  const southernParse = codOrderSubmissionSchema.safeParse(southernStopDeskSubmission);
  record(
    schemaSuite,
    'Southern Wilaya 49 Stop-Desk Rejection',
    !southernParse.success && southernParse.error.issues.some((i) => i.path.includes('deliveryType')),
    'Rejected Stop-Desk for Wilaya 49',
    'INFO'
  );

  // 3.3 Missing Delivery Address on DOMICILE
  const missingAddressSubmission = {
    ...validBaseSubmission,
    deliveryType: 'DOMICILE' as const,
    deliveryAddress: '   ',
  };
  const missingAddressParse = codOrderSubmissionSchema.safeParse(missingAddressSubmission);
  record(
    schemaSuite,
    'Missing Address on DOMICILE Rejection',
    !missingAddressParse.success &&
      missingAddressParse.error.issues.some((i) => i.path.includes('deliveryAddress')),
    'Rejected DOMICILE with whitespace/empty address',
    'INFO'
  );

  // 3.4 Short Customer Name (< 2 chars)
  const shortNameSubmission = { ...validBaseSubmission, customerName: 'A' };
  const shortNameParse = codOrderSubmissionSchema.safeParse(shortNameSubmission);
  record(
    schemaSuite,
    'Short Customer Name (<2 chars) Rejection',
    !shortNameParse.success &&
      shortNameParse.error.issues.some((i) => i.path.includes('customerName')),
    'Rejected 1-char customer name',
    'INFO'
  );

  // 3.5 Oversized Customer Name (> 100 chars)
  const oversizedNameSubmission = {
    ...validBaseSubmission,
    customerName: 'A'.repeat(101),
  };
  const oversizedNameParse = codOrderSubmissionSchema.safeParse(oversizedNameSubmission);
  record(
    schemaSuite,
    'Oversized Customer Name (>100 chars) Rejection',
    !oversizedNameParse.success &&
      oversizedNameParse.error.issues.some((i) => i.path.includes('customerName')),
    'Rejected 101-char customer name',
    'INFO'
  );

  // 3.6 Invalid Wilaya Code Boundaries
  const outOfRangeWilayas = [0, 59, 100, -5];
  for (const code of outOfRangeWilayas) {
    const p = codOrderSubmissionSchema.safeParse({ ...validBaseSubmission, wilayaCode: code });
    record(
      schemaSuite,
      `Wilaya Code Out of Range (${code})`,
      !p.success,
      `Rejected invalid wilaya code ${code}`,
      'INFO'
    );
  }

  // 3.7 Invalid Pack ID
  const invalidPackSubmission = { ...validBaseSubmission, packId: 'PACK99' as any };
  const invalidPackParse = codOrderSubmissionSchema.safeParse(invalidPackSubmission);
  record(
    schemaSuite,
    'Invalid Pack ID Rejection',
    !invalidPackParse.success,
    'Rejected unknown packId "PACK99"',
    'INFO'
  );

  // 3.8 Negative and Zero Prices
  const negativePriceCases = [
    { field: 'productPrice', value: -4950, label: 'Negative productPrice' },
    { field: 'productPrice', value: 0, label: 'Zero productPrice' },
    { field: 'shippingFee', value: -500, label: 'Negative shippingFee' },
    { field: 'totalPayable', value: -100, label: 'Negative totalPayable' },
    { field: 'totalPayable', value: 0, label: 'Zero totalPayable' },
  ];

  for (const c of negativePriceCases) {
    const payload = { ...validBaseSubmission, [c.field]: c.value };
    const p = codOrderSubmissionSchema.safeParse(payload);
    record(
      schemaSuite,
      `Price Boundary: ${c.label} (${c.value})`,
      !p.success,
      `Rejected ${c.field} = ${c.value}`,
      'INFO'
    );
  }

  // 3.9 Floating-Point Prices in COD Cash Payments
  const floatPriceSubmission = {
    ...validBaseSubmission,
    productPrice: 4950.75,
    shippingFee: 500.25,
    totalPayable: 5451.0,
  };
  const floatPriceParse = codOrderSubmissionSchema.safeParse(floatPriceSubmission);
  // In Algerian DZD Cash on Delivery, fractional currency cannot be collected physically
  record(
    schemaSuite,
    'Observation: Floating-point currency rejected by Zod',
    !floatPriceParse.success,
    `Schema strictly rejects non-canonical floating point dinars (productPrice=${floatPriceSubmission.productPrice})`,
    'INFO'
  );

  // 3.10 Price / Total Arithmetic Consistency & Client Tampering Vulnerability
  const tamperedPriceSubmission: CodOrderSubmission = {
    ...validBaseSubmission,
    packId: 'PACK3', // Pack 3 is 15,950 DZD
    productPrice: 1, // Attacker forged product price to 1 DZD
    shippingFee: 500,
    totalPayable: 501, // Attacker forged total
  };
  const tamperedParse = codOrderSubmissionSchema.safeParse(tamperedPriceSubmission);
  const allowsTampering = tamperedParse.success;
  record(
    schemaSuite,
    'Vulnerability Check: Client-Side Price Tampering Allowed by Schema',
    !allowsTampering,
    allowsTampering
      ? 'POTENTIAL RISK: Server action schema accepts client-submitted productPrice/totalPayable without re-verifying against official pack catalog prices (e.g. PACK3 at 1 DZD was accepted by schema)'
      : 'Schema verified price against catalog',
    'MEDIUM',
    { packId: 'PACK3', submittedPrice: 1, parsed: tamperedParse.success }
  );

  // Arithmetic mismatch: totalPayable != productPrice + shippingFee
  const mismatchTotalSubmission: CodOrderSubmission = {
    ...validBaseSubmission,
    productPrice: 4950,
    shippingFee: 500,
    totalPayable: 100, // Does not equal 4950 + 500 = 5450
  };
  const mismatchParse = codOrderSubmissionSchema.safeParse(mismatchTotalSubmission);
  record(
    schemaSuite,
    'Vulnerability Check: Total Payable Arithmetic Mismatch Allowed by Schema',
    !mismatchParse.success,
    mismatchParse.success
      ? 'POTENTIAL RISK: Schema does not enforce totalPayable === productPrice + shippingFee'
      : 'Schema enforced totalPayable equality',
    'MEDIUM'
  );

  // ────────────────────────────────────────────────────────────────────────────
  // SUITE 4: Backend Server Action submitCodOrderAction & SQL Injection Resilience
  // ────────────────────────────────────────────────────────────────────────────
  const actionSuite = '4. Server Action & Security Adversarial Stress';

  // 4.1 SQL Injection in Customer Name
  const sqlInjectionNames = [
    "Mohamed'; DROP TABLE orders; --",
    "Admin' OR '1'='1",
    "Zack' UNION SELECT * FROM customers --",
    '<script>alert("xss")</script>',
  ];

  for (const name of sqlInjectionNames) {
    const sqlPayload: CodOrderSubmission = {
      ...validBaseSubmission,
      customerName: name,
    };
    const result = await submitCodOrderAction(sqlPayload);
    const isSafe = result.success === true && typeof result.orderNumber === 'string';
    record(
      actionSuite,
      `SQL Injection in Name: "${name}"`,
      isSafe,
      `Action handled safely: success=${result.success}, orderNumber=${result.orderNumber}`,
      isSafe ? 'INFO' : 'CRITICAL'
    );
  }

  // 4.2 SQL Injection in Delivery Address
  const sqlAddress = "Hai En-Nour 1' OR 1=1; DELETE FROM order_items; --";
  const sqlAddressPayload: CodOrderSubmission = {
    ...validBaseSubmission,
    deliveryAddress: sqlAddress,
  };
  const sqlAddressResult = await submitCodOrderAction(sqlAddressPayload);
  record(
    actionSuite,
    'SQL Injection in Address',
    sqlAddressResult.success === true && typeof sqlAddressResult.orderNumber === 'string',
    `Handled safely: orderNumber=${sqlAddressResult.orderNumber}`,
    'INFO'
  );

  // 4.3 Missing mandatory fields payload
  const emptyPayload = {} as any;
  const emptyResult = await submitCodOrderAction(emptyPayload);
  record(
    actionSuite,
    'Empty Object Payload',
    emptyResult.success === false && Boolean(emptyResult.error),
    `Properly rejected empty object: ${emptyResult.error}`,
    'INFO'
  );

  // 4.4 Malformed / Null submission
  const nullPayload = null as any;
  const nullResult = await submitCodOrderAction(nullPayload);
  record(
    actionSuite,
    'Null Payload Handling',
    nullResult.success === false,
    `Handled safely: error=${nullResult.error}`,
    'INFO'
  );

  // ────────────────────────────────────────────────────────────────────────────
  // SUITE 5: Offline Database Fallback & Order Persistence
  // ────────────────────────────────────────────────────────────────────────────
  const fallbackSuite = '5. Offline Database Fallback';

  const offlineSubmission: CodOrderSubmission = {
    customerName: 'Samir Mansouri',
    customerPhone: '0661998877',
    wilayaCode: 25, // Constantine
    wilayaName: 'قسنطينة',
    communeName: 'قسنطينة',
    deliveryType: 'DOMICILE',
    deliveryAddress: 'Zone Industrielle Palma',
    packId: 'PACK2',
    productName: 'باك الفيسوز كراون Elite 5 في 1',
    productPrice: 12950,
    shippingFee: 500,
    totalPayable: 13450,
  };

  const offlineResult = await submitCodOrderAction(offlineSubmission);

  record(
    fallbackSuite,
    'Offline Checkout Order Submission Succeeded',
    offlineResult.success === true && Boolean(offlineResult.orderNumber),
    `Order Number: ${offlineResult.orderNumber}, RedirectUrl: ${offlineResult.redirectUrl}`,
    'INFO'
  );

  // Verify order number format: ORV-YYMMDD-XXXX
  const orderNumRegex = /^ORV-\d{6}-[A-Z0-9]{4}$/;
  record(
    fallbackSuite,
    'Order Number Format Compliant (ORV-YYMMDD-XXXX)',
    orderNumRegex.test(offlineResult.orderNumber || ''),
    `Generated order number: ${offlineResult.orderNumber}`,
    'INFO'
  );

  // Verify redirect URL format and parameters
  const redirectUrl = offlineResult.redirectUrl || '';
  const hasConfirmationRoute = redirectUrl.startsWith('/checkout/confirmation?');
  const redirectParams = new URLSearchParams(redirectUrl.replace('/checkout/confirmation?', ''));

  record(
    fallbackSuite,
    'Redirect URL Points to /checkout/confirmation',
    hasConfirmationRoute,
    `Redirect URL: ${redirectUrl}`,
    'INFO'
  );

  const expectedParams = [
    'orderNumber',
    'pack',
    'total',
    'subtotal',
    'shipping',
    'name',
    'phone',
    'wilaya',
    'commune',
    'deliveryType',
  ];
  const missingParams = expectedParams.filter((p) => !redirectParams.has(p));
  record(
    fallbackSuite,
    'Redirect URL Contains All Hydration SearchParams',
    missingParams.length === 0,
    missingParams.length === 0
      ? 'All parameters present (orderNumber, pack, total, subtotal, shipping, name, phone, wilaya, commune, deliveryType)'
      : `Missing params: ${missingParams.join(', ')}`,
    'INFO'
  );

  // Verify fallback persistence
  const latestStoreOrder = fallbackOrdersStore[fallbackOrdersStore.length - 1];
  record(
    fallbackSuite,
    'Fallback Store Record Integrity',
    Boolean(
      latestStoreOrder &&
        latestStoreOrder.orderNumber === offlineResult.orderNumber &&
        latestStoreOrder.customerName === 'Samir Mansouri' &&
        latestStoreOrder.customerPhone === '0661998877' &&
        latestStoreOrder.originHub === 'BISKRA_07' &&
        latestStoreOrder.status === 'PENDING'
    ),
    `Saved record verified: orderNumber=${latestStoreOrder?.orderNumber}, originHub=${latestStoreOrder?.originHub}`,
    'INFO'
  );

  // ────────────────────────────────────────────────────────────────────────────
  // SUITE 6: Non-Blocking Telemetry Isolation (Telegram & Meta CAPI)
  // ────────────────────────────────────────────────────────────────────────────
  const telemetrySuite = '6. Non-Blocking External Integrations';

  const origTgToken = process.env.TELEGRAM_BOT_TOKEN;
  const origTgChat = process.env.TELEGRAM_CHAT_ID;
  const origPixel = process.env.META_PIXEL_ID;
  const origCapi = process.env.META_CAPI_TOKEN;

  process.env.TELEGRAM_BOT_TOKEN = 'broken_invalid_token_99999';
  process.env.TELEGRAM_CHAT_ID = 'broken_chat_id';
  process.env.META_PIXEL_ID = 'broken_pixel_id';
  process.env.META_CAPI_TOKEN = 'broken_capi_token';

  const startTime = Date.now();
  const failingIntegrationOrder = await submitCodOrderAction({
    ...validBaseSubmission,
    customerName: 'Integrations Stress Test',
    customerPhone: '0799887766',
  });
  const elapsedMs = Date.now() - startTime;

  record(
    telemetrySuite,
    'Broken External APIs Do Not Block Checkout Response',
    failingIntegrationOrder.success === true && typeof failingIntegrationOrder.orderNumber === 'string',
    `Checkout returned success=${failingIntegrationOrder.success} despite invalid external API tokens (Elapsed: ${elapsedMs}ms)`,
    'INFO'
  );

  // Restore env
  process.env.TELEGRAM_BOT_TOKEN = origTgToken;
  process.env.TELEGRAM_CHAT_ID = origTgChat;
  process.env.META_PIXEL_ID = origPixel;
  process.env.META_CAPI_TOKEN = origCapi;

  // ────────────────────────────────────────────────────────────────────────────
  // SUITE 7: Order Number Generator Entropy & Randomness
  // ────────────────────────────────────────────────────────────────────────────
  const entropySuite = '7. Order Number Generator Entropy';

  const testSampleCount = 100;
  const sampleSet = new Set<string>();
  for (let i = 0; i < testSampleCount; i++) {
    sampleSet.add(generateOrderNumber());
  }
  record(
    entropySuite,
    `Order Number Uniqueness across ${testSampleCount} samples`,
    sampleSet.size === testSampleCount,
    `Generated ${sampleSet.size}/${testSampleCount} unique order IDs`,
    'INFO'
  );

  // ────────────────────────────────────────────────────────────────────────────
  // FINAL SUMMARY
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('   EMPIRICAL ADVERSARIAL STRESS SUITE RESULTS SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════════');

  const total = allResults.length;
  const passedCount = allResults.filter((r) => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`Total Invariants Tested : ${total}`);
  console.log(`Passed Invariants       : ${passedCount} ✅`);
  console.log(`Failed Invariants       : ${failedCount} ${failedCount === 0 ? '🎉' : '❌'}`);

  console.log('\nDetailed Findings Breakdown:');
  allResults.forEach((r) => {
    if (!r.passed) {
      console.log(`❌ [${r.severity}] [${r.suite}] ${r.testName}: ${r.message}`);
    }
  });

  return { total, passedCount, failedCount, allResults };
}

runAllTests().catch((err) => {
  console.error('Fatal Test Runner Exception:', err);
  process.exit(1);
});
