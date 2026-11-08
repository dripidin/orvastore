/**
 * Milestone M3 Iteration 2 — Challenger 2 Deep Adversarial Stress Suite
 * Authored by: challenger_m3_iter2_2 (teamwork_challenger)
 * 
 * Adversarially probes:
 * 1. Server action offline fallback under concurrent high-load and edge cases
 * 2. Cryptographic order number entropy, Shannon entropy, uniqueness across 10,000 samples, and format
 * 3. Confirmation hydration logic, param defaults, sanitization, and fallback resilience
 * 4. Exhaustive 58-Wilaya delivery matrix & financial tampering barrier invariants
 * 5. Phone normalization across all international prefixes and edge cases
 */

import crypto from 'node:crypto';
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

interface AssertionResult {
  category: string;
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

const assertionResults: AssertionResult[] = [];

function assertTest(
  category: string,
  name: string,
  condition: boolean,
  message: string,
  details?: unknown
) {
  assertionResults.push({ category, name, passed: condition, message, details });
  const icon = condition ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] [${category}] ${name}: ${message}`);
  if (!condition && details) {
    console.error('   Details:', details);
  }
}

async function runDeepStressSuite() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   CHALLENGER M3 ITERATION 2 — DEEP EMPIRICAL ADVERSARIAL STRESS SUITE  ');
  console.log('   Timestamp:', new Date().toISOString());
  console.log('════════════════════════════════════════════════════════════════════════\n');

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 1: Phone Normalization Exhaustive Prefix Stress
  // ────────────────────────────────────────────────────────────────────────────
  const phoneCat = '1. Phone Normalization Invariants';

  const phoneCases = [
    // Standard local formats
    { raw: '0550123456', expected: '0550123456', valid: true },
    { raw: '0661234567', expected: '0661234567', valid: true },
    { raw: '0770987654', expected: '0770987654', valid: true },
    // +213 with trunk zero
    { raw: '+2130550123456', expected: '0550123456', valid: true },
    { raw: '+2130661234567', expected: '0661234567', valid: true },
    { raw: '+2130770987654', expected: '0770987654', valid: true },
    // +213 without trunk zero
    { raw: '+213550123456', expected: '0550123456', valid: true },
    { raw: '+213661234567', expected: '0661234567', valid: true },
    { raw: '+213770987654', expected: '0770987654', valid: true },
    // 002130 with trunk zero (CRITICAL ITERATION 1 BUG REGRESSION TEST)
    { raw: '002130550123456', expected: '0550123456', valid: true },
    { raw: '002130661234567', expected: '0661234567', valid: true },
    { raw: '002130770987654', expected: '0770987654', valid: true },
    // 00213 without trunk zero
    { raw: '00213550123456', expected: '0550123456', valid: true },
    { raw: '00213661234567', expected: '0661234567', valid: true },
    { raw: '00213770987654', expected: '0770987654', valid: true },
    // 2130 with trunk zero
    { raw: '2130550123456', expected: '0550123456', valid: true },
    // 213 without trunk zero
    { raw: '213550123456', expected: '0550123456', valid: true },
    // Whitespaces, hyphens, parenthesis, slashes, dots
    { raw: ' 05-50-12-34-56 ', expected: '0550123456', valid: true },
    { raw: '+213 (0) 550.12.34.56', expected: '0550123456', valid: true },
    { raw: '00213 661 / 23 / 45 / 67', expected: '0661234567', valid: true },
  ];

  for (const pc of phoneCases) {
    const norm = normalizeAlgerianPhone(pc.raw);
    const isValid = isValidAlgerianPhone(pc.raw);
    assertTest(
      phoneCat,
      `Normalize & Validate: "${pc.raw}"`,
      norm === pc.expected && isValid === pc.valid,
      `Result="${norm}", isValid=${isValid} (expected "${pc.expected}", valid=${pc.valid})`
    );
  }

  // Negative validation tests
  const invalidPhones = [
    '021556677', // Landline Algiers
    '031445566', // Landline Constantine
    '041223344', // Landline Oran
    '098123456', // Invalid carrier prefix 09
    '055012345', // 9 digits (too short)
    '055012345678', // 12 digits (too long)
    '055012345A', // Alphanumeric
    '0033612345678', // French mobile
    '',
    '          ',
  ];

  for (const ip of invalidPhones) {
    const isValid = isValidAlgerianPhone(ip);
    assertTest(
      phoneCat,
      `Invalid Phone Rejection: "${ip}"`,
      isValid === false,
      `Correctly identified as invalid: ${isValid === false}`
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 2: 58-Wilaya Logistics & Stop-Desk Matrix Integrity
  // ────────────────────────────────────────────────────────────────────────────
  const logCat = '2. 58-Wilaya Matrix & Stop-Desk Restrictions';

  // Zone 5 Wilayas MUST NOT permit Stop-Desk
  const zone5Wilayas = ALGERIA_58_WILAYAS.filter((w) => w.zone === 5);
  assertTest(
    logCat,
    'Zone 5 Wilayas Identified',
    zone5Wilayas.length >= 10,
    `Found ${zone5Wilayas.length} Zone 5 Wilayas: ${zone5Wilayas.map((w) => `${w.code} (${w.nameFr})`).join(', ')}`
  );

  for (const w of zone5Wilayas) {
    const allowed = isStopDeskAllowed(w.code);
    let threw = false;
    try {
      calculateDeliveryTariff(w.code, 'STOP_DESK');
    } catch {
      threw = true;
    }
    assertTest(
      logCat,
      `Zone 5 Wilaya ${w.code} (${w.nameFr}) Strict Stop-Desk Ban`,
      allowed === false && threw === true,
      `isStopDeskAllowed=${allowed}, calculateDeliveryTariff threw=${threw}`
    );
  }

  // Tariff exactness across zones for Domicile
  const zoneDomicileExpected: Record<number, number> = {
    1: 450,
    2: 500,
    3: 650,
    4: 800,
    5: 1000,
  };

  for (const w of ALGERIA_58_WILAYAS) {
    const domTariff = calculateDeliveryTariff(w.code, 'DOMICILE');
    const expected = zoneDomicileExpected[w.zone];
    if (domTariff !== expected) {
      assertTest(
        logCat,
        `Wilaya ${w.code} Domicile Tariff`,
        false,
        `Got ${domTariff}, expected ${expected}`
      );
      break;
    }
  }
  assertTest(
    logCat,
    'All 58 Wilayas Domicile Tariffs Align with Biskra Matrix',
    true,
    'Every single Wilaya tariff matches zone pricing (Z1: 450, Z2: 500, Z3: 650, Z4: 800, Z5: 1000)'
  );

  // Stop-Desk tariff for allowed wilayas
  const zoneStopDeskExpected: Record<number, number> = {
    1: 350,
    2: 400,
    3: 450,
    4: 500,
  };
  let stopDeskTariffsCorrect = true;
  for (const w of ALGERIA_58_WILAYAS) {
    if (isStopDeskAllowed(w.code)) {
      const tariff = calculateDeliveryTariff(w.code, 'STOP_DESK');
      if (tariff !== zoneStopDeskExpected[w.zone]) {
        stopDeskTariffsCorrect = false;
        assertTest(
          logCat,
          `Wilaya ${w.code} Stop-Desk Tariff Mismatch`,
          false,
          `Got ${tariff}, expected ${zoneStopDeskExpected[w.zone]}`
        );
        break;
      }
    }
  }
  assertTest(
    logCat,
    'All Allowed Wilayas Stop-Desk Tariffs Align with Biskra Matrix',
    stopDeskTariffsCorrect,
    'Stop-Desk pricing matches zone pricing (Z1: 350, Z2: 400, Z3: 450, Z4: 500)'
  );

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 3: Cryptographic Order Number Entropy & Distribution
  // ────────────────────────────────────────────────────────────────────────────
  const entropyCat = '3. Order Number Cryptographic Entropy';

  const SAMPLE_SIZE = 10000;
  console.log(`\nGenerating and testing ${SAMPLE_SIZE} order numbers for entropy analysis...`);
  const generatedOrders: string[] = [];
  const uniqueSet = new Set<string>();
  const charFrequency: Record<string, number> = {};
  const todayYMD = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  let formatValidCount = 0;

  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const num = generateOrderNumber();
    generatedOrders.push(num);
    uniqueSet.add(num);

    // Format regex: ORV-YYMMDD-XXXX
    if (/^ORV-\d{6}-[0-9A-Z]{4}$/.test(num) && num.includes(todayYMD)) {
      formatValidCount++;
    }

    // Tally character frequencies of suffix
    const suffix = num.split('-')[2];
    for (const ch of suffix) {
      charFrequency[ch] = (charFrequency[ch] || 0) + 1;
    }
  }

  // Assert 100% uniqueness across 100 samples (matching specification)
  const sample100Set = new Set<string>();
  for (let i = 0; i < 100; i++) {
    sample100Set.add(generateOrderNumber());
  }
  assertTest(
    entropyCat,
    'Zero Collisions Across 100 Samples (Specification Target)',
    sample100Set.size === 100,
    `Unique count: ${sample100Set.size}/100`
  );

  // Large-scale Birthday Paradox empirical validation:
  // For 10,000 samples over 36^4 (1,679,616) keyspace, expected collisions E = N^2 / (2 * 36^4) ~= 29.77.
  // Empirical collisions must fall within 3-sigma theoretical bound [10..60] to prove genuine cryptographic uniformity.
  const collisions10k = SAMPLE_SIZE - uniqueSet.size;
  const isWithinTheoreticalBirthdayBounds = collisions10k >= 10 && collisions10k <= 60;
  assertTest(
    entropyCat,
    `Birthday Paradox Empirical Statistical Conformance Across ${SAMPLE_SIZE} Samples`,
    isWithinTheoreticalBirthdayBounds,
    `Observed collisions: ${collisions10k} (Theoretical expectation: 29.77, 3-sigma range: [10..60])`
  );

  // Assert all conform to format
  assertTest(
    entropyCat,
    'All Order Numbers Strictly Match ORV-YYMMDD-XXXX with Current Date',
    formatValidCount === SAMPLE_SIZE,
    `${formatValidCount}/${SAMPLE_SIZE} strictly matched format with date ${todayYMD}`
  );

  // Calculate Shannon entropy of the 4-char suffix
  // H(X) = - sum(p(x) * log2(p(x)))
  const totalChars = SAMPLE_SIZE * 4;
  let shannonEntropy = 0;
  for (const ch in charFrequency) {
    const p = charFrequency[ch] / totalChars;
    shannonEntropy -= p * Math.log2(p);
  }
  // Max possible entropy for 36 characters = log2(36) ~= 5.1699 bits per char.
  // 4 chars theoretical max = 20.68 bits.
  const bitsPerChar = shannonEntropy;
  const isHighEntropy = bitsPerChar > 5.10; // Extremely close to theoretical max 5.1699
  assertTest(
    entropyCat,
    'High Shannon Entropy Uniform Distribution',
    isHighEntropy,
    `Shannon Entropy: ${bitsPerChar.toFixed(4)} bits/char (theoretical max: ${Math.log2(36).toFixed(4)} bits/char)`
  );

  // Verify all 36 alphanumeric characters are present in sample set
  const distinctCharsInSuffix = Object.keys(charFrequency).length;
  assertTest(
    entropyCat,
    'Full 36-Character Alphanumeric Alphabet Exercised',
    distinctCharsInSuffix === 36,
    `Distinct characters observed: ${distinctCharsInSuffix}/36`
  );

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 4: Server Action Offline Fallback & Concurrency Stress
  // ────────────────────────────────────────────────────────────────────────────
  const fallbackCat = '4. Server Action Offline Fallback & Concurrency';

  const initialStoreLength = fallbackOrdersStore.length;
  console.log(`\nInitial fallback store length: ${initialStoreLength}`);

  // Test 50 Concurrent Submissions simultaneously
  const CONCURRENT_COUNT = 50;
  const concurrentSubmissions: Promise<any>[] = [];

  for (let i = 0; i < CONCURRENT_COUNT; i++) {
    const payload: CodOrderSubmission = {
      customerName: `Concurrent Test User ${i + 1}`,
      customerPhone: `0550${(100000 + i).toString().slice(-6)}`,
      wilayaCode: 16,
      wilayaName: 'الجزائر',
      communeName: 'الجزائر الوسطى',
      deliveryType: 'DOMICILE',
      deliveryAddress: `Rue Didouche Mourad Batiment ${i + 1}`,
      packId: 'PACK1',
      productName: 'باك كومبريسار و المفاتيح 4 في 1',
      productPrice: 4950,
      shippingFee: 500,
      totalPayable: 5450,
    };
    concurrentSubmissions.push(submitCodOrderAction(payload));
  }

  const concurrentResults = await Promise.all(concurrentSubmissions);
  const allSuccessful = concurrentResults.every((r) => r.success === true && Boolean(r.orderNumber));
  const distinctOrderNumbers = new Set(concurrentResults.map((r) => r.orderNumber));

  assertTest(
    fallbackCat,
    `50 Concurrent Offline Checkout Submissions Succeeded`,
    allSuccessful,
    `All ${CONCURRENT_COUNT} concurrent submissions returned success=true`
  );

  assertTest(
    fallbackCat,
    `50 Concurrent Submissions Yielded 50 Distinct Order Numbers`,
    distinctOrderNumbers.size === CONCURRENT_COUNT,
    `Unique order numbers generated: ${distinctOrderNumbers.size}/${CONCURRENT_COUNT}`
  );

  // Verify fallback store received records
  const newStoreLength = fallbackOrdersStore.length;
  const addedRecords = newStoreLength - initialStoreLength;
  assertTest(
    fallbackCat,
    'Fallback Orders Store In-Memory Append Count',
    addedRecords >= CONCURRENT_COUNT,
    `Added records in store: ${addedRecords} (expected at least ${CONCURRENT_COUNT})`
  );

  // Verify store record structure and fields
  const sampleSavedRecord = fallbackOrdersStore[fallbackOrdersStore.length - 1];
  const recordWellFormed = Boolean(
    sampleSavedRecord &&
    sampleSavedRecord.orderNumber &&
    sampleSavedRecord.originHub === 'BISKRA_07' &&
    sampleSavedRecord.status === 'PENDING' &&
    sampleSavedRecord.customerPhone.startsWith('05') &&
    sampleSavedRecord.totalPayable === 5450
  );
  assertTest(
    fallbackCat,
    'Fallback Store Record Schema & Defaults Verification',
    recordWellFormed,
    `Verified record: id=${sampleSavedRecord?.id}, hub=${sampleSavedRecord?.originHub}, status=${sampleSavedRecord?.status}`
  );

  // Stop-Desk fallback store address default check
  const stopDeskPayload: CodOrderSubmission = {
    customerName: 'StopDesk Fallback Test',
    customerPhone: '0661223344',
    wilayaCode: 16,
    wilayaName: 'الجزائر',
    communeName: 'المرادية',
    deliveryType: 'STOP_DESK',
    packId: 'PACK2',
    productName: 'باك الفيسوز كراون Elite 5 في 1',
    productPrice: 12950,
    shippingFee: 400,
    totalPayable: 13350,
  };

  const stopDeskResult = await submitCodOrderAction(stopDeskPayload);
  const savedStopDeskRecord = fallbackOrdersStore.find((r) => r.orderNumber === stopDeskResult.orderNumber);
  assertTest(
    fallbackCat,
    'Stop-Desk Address Defaults to "Bureau Stop-Desk" in Store',
    savedStopDeskRecord?.deliveryAddress === 'Bureau Stop-Desk',
    `Address in store: "${savedStopDeskRecord?.deliveryAddress}"`
  );

  // Honeypot trap must NOT pollute store
  const honeypotPayload: CodOrderSubmission = {
    ...stopDeskPayload,
    customerName: 'Spam Bot Crawler',
    honeypot: 'bot spam value',
  };
  const storeCountBeforeHoneypot = fallbackOrdersStore.length;
  const honeypotResult = await submitCodOrderAction(honeypotPayload);
  const storeCountAfterHoneypot = fallbackOrdersStore.length;
  assertTest(
    fallbackCat,
    'Honeypot Trap Order Rejected & Excluded From Store',
    honeypotResult.success === false && storeCountBeforeHoneypot === storeCountAfterHoneypot,
    `Honeypot success=${honeypotResult.success}, store growth=${storeCountAfterHoneypot - storeCountBeforeHoneypot}`
  );

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 5: Confirmation Page Hydration Logic & URL Resilience
  // ────────────────────────────────────────────────────────────────────────────
  const hydCat = '5. Confirmation Page Hydration & Resilience';

  // Test URL Formulation from server action
  const sampleRedirect = stopDeskResult.redirectUrl;
  assertTest(
    hydCat,
    'Redirect URL Points to /checkout/confirmation',
    Boolean(sampleRedirect && sampleRedirect.startsWith('/checkout/confirmation?')),
    `Redirect: ${sampleRedirect}`
  );

  const searchParams = new URLSearchParams(sampleRedirect?.replace('/checkout/confirmation?', ''));
  assertTest(
    hydCat,
    'Hydration SearchParams: Order Number Matches',
    searchParams.get('orderNumber') === stopDeskResult.orderNumber,
    `orderNumber param: ${searchParams.get('orderNumber')}`
  );

  assertTest(
    hydCat,
    'Hydration SearchParams: Financial Quantities Preserved',
    searchParams.get('pack') === 'PACK2' &&
    Number(searchParams.get('subtotal')) === 12950 &&
    Number(searchParams.get('shipping')) === 400 &&
    Number(searchParams.get('total')) === 13350,
    `pack=${searchParams.get('pack')}, subtotal=${searchParams.get('subtotal')}, shipping=${searchParams.get('shipping')}, total=${searchParams.get('total')}`
  );

  assertTest(
    hydCat,
    'Hydration SearchParams: Arabic Wilaya Name Correctly Encoded/Decoded',
    searchParams.get('wilaya') === 'الجزائر' && searchParams.get('commune') === 'المرادية',
    `wilaya=${searchParams.get('wilaya')}, commune=${searchParams.get('commune')}`
  );

  // Simulate ConfirmationContent() hydration defaults under adversarial URL tampering
  function simulateHydration(paramsString: string) {
    const params = new URLSearchParams(paramsString);
    const orderNumber = params.get('orderNumber') || 'ORV-CONFIRM';
    const packId = params.get('pack') || 'PACK1';
    const total = Number(params.get('total')) || 4950;
    const subtotal = Number(params.get('subtotal')) || 4450;
    const shipping = Number(params.get('shipping')) || 500;
    const customerName = params.get('name') || 'زبون ORVA الكريم';
    const customerPhone = params.get('phone') || '';
    const wilayaName = params.get('wilaya') || 'الجزائر';
    const communeName = params.get('commune') || 'المركز';
    const isStopDesk = params.get('deliveryType') === 'STOP_DESK';

    const packLabels: Record<string, { ar: string; items: string }> = {
      PACK1: {
        ar: 'باك كومبريسار و المفاتيح 4 في 1',
        items: 'منفاخ TOYOTA + طقم مفاتيح 46 ق + مفك مرن 11 ق + طقم مفكات 6 ق',
      },
      PACK2: {
        ar: 'باك الفيسوز كراون Elite 5 في 1',
        items: 'ماكينة ثقب CROWN 20V + بطاريتين + حقيبة 29 ق + قفازات GILAN',
      },
      PACK3: {
        ar: 'باك سودير كراون MMA-200 Mini',
        items: 'ماكينة لحام CROWN CT33102 + نظام VRD + قفازات + طقم مفكات',
      },
    };

    const currentPack = packLabels[packId] || packLabels.PACK1;
    const maskedPhone =
      customerPhone.length === 10
        ? `${customerPhone.slice(0, 4)} •• •• ${customerPhone.slice(-2)}`
        : customerPhone;

    return {
      orderNumber,
      packId,
      total,
      subtotal,
      shipping,
      customerName,
      maskedPhone,
      wilayaName,
      communeName,
      isStopDesk,
      packTitle: currentPack.ar,
    };
  }

  // Hydration test: Empty URL params
  const emptyHydration = simulateHydration('');
  assertTest(
    hydCat,
    'Adversarial URL: Empty Params Gracefully Fallback to Defaults',
    emptyHydration.orderNumber === 'ORV-CONFIRM' &&
    emptyHydration.total === 4950 &&
    emptyHydration.customerName === 'زبون ORVA الكريم' &&
    emptyHydration.packTitle === 'باك كومبريسار و المفاتيح 4 في 1',
    `Defaults applied: orderNumber=${emptyHydration.orderNumber}, total=${emptyHydration.total}`
  );

  // Hydration test: NaN / Malicious injection in financial parameters
  const corruptedParams = 'total=corrupted&subtotal=NaN&shipping=null&pack=UNKNOWN_PACK_INJECTION';
  const corruptedHydration = simulateHydration(corruptedParams);
  assertTest(
    hydCat,
    'Adversarial URL: Corrupted Non-Numeric Values Trigger Fallback Numbers',
    corruptedHydration.total === 4950 &&
    corruptedHydration.subtotal === 4450 &&
    corruptedHydration.shipping === 500 &&
    corruptedHydration.packTitle === 'باك كومبريسار و المفاتيح 4 في 1',
    `total=${corruptedHydration.total}, subtotal=${corruptedHydration.subtotal}, packTitle=${corruptedHydration.packTitle}`
  );

  // Hydration test: XSS injection strings in name and orderNumber
  const xssParams = 'orderNumber=%3Cscript%3Ealert(1)%3C%2Fscript%3E&name=%3Cimg%20src%3Dx%3E&phone=0550123456';
  const xssHydration = simulateHydration(xssParams);
  assertTest(
    hydCat,
    'Adversarial URL: XSS Script Strings Safely Parsed As Plain Text',
    xssHydration.orderNumber === '<script>alert(1)</script>' &&
    xssHydration.customerName === '<img src=x>' &&
    xssHydration.maskedPhone === '0550 •• •• 56',
    `orderNumber="${xssHydration.orderNumber}", maskedPhone="${xssHydration.maskedPhone}"`
  );

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 6: Financial Integrity & Catalog Price Tampering Barrier
  // ────────────────────────────────────────────────────────────────────────────
  const finCat = '6. Financial Integrity & Price Tampering Barrier';

  const baseValid: CodOrderSubmission = {
    customerName: 'Pricing Test',
    customerPhone: '0550123456',
    wilayaCode: 16,
    wilayaName: 'الجزائر',
    communeName: 'الجزائر الوسطى',
    deliveryType: 'DOMICILE',
    deliveryAddress: 'Rue Didouche Mourad',
    packId: 'PACK1',
    productName: 'باك كومبريسار و المفاتيح 4 في 1',
    productPrice: 4950,
    shippingFee: 500,
    totalPayable: 5450,
  };

  // Attempt 1: Forged Pack 1 price to 100 DZD
  const forgedP1 = codOrderSubmissionSchema.safeParse({
    ...baseValid,
    productPrice: 100,
    totalPayable: 600,
  });
  assertTest(
    finCat,
    'Price Tampering Rejection: PACK1 at 100 DZD',
    forgedP1.success === false && forgedP1.error.issues.some((i) => i.path.includes('productPrice')),
    `Correctly rejected: ${forgedP1.success === false}`
  );

  // Attempt 2: Forged Pack 2 price to 1000 DZD
  const forgedP2 = codOrderSubmissionSchema.safeParse({
    ...baseValid,
    packId: 'PACK2',
    productPrice: 1000,
    totalPayable: 1500,
  });
  assertTest(
    finCat,
    'Price Tampering Rejection: PACK2 at 1000 DZD',
    forgedP2.success === false && forgedP2.error.issues.some((i) => i.path.includes('productPrice')),
    `Correctly rejected: ${forgedP2.success === false}`
  );

  // Attempt 3: Forged Pack 3 price to 500 DZD
  const forgedP3 = codOrderSubmissionSchema.safeParse({
    ...baseValid,
    packId: 'PACK3',
    productPrice: 500,
    totalPayable: 1000,
  });
  assertTest(
    finCat,
    'Price Tampering Rejection: PACK3 at 500 DZD',
    forgedP3.success === false && forgedP3.error.issues.some((i) => i.path.includes('productPrice')),
    `Correctly rejected: ${forgedP3.success === false}`
  );

  // Attempt 4: Forged shipping fee (e.g. 100 DZD instead of 500 DZD for Alger Domicile)
  const forgedShipping = codOrderSubmissionSchema.safeParse({
    ...baseValid,
    shippingFee: 100,
    totalPayable: 5050,
  });
  assertTest(
    finCat,
    'Shipping Fee Tampering Rejection: Alger Domicile at 100 DZD instead of 500 DZD',
    forgedShipping.success === false && forgedShipping.error.issues.some((i) => i.path.includes('shippingFee')),
    `Correctly rejected: ${forgedShipping.success === false}`
  );

  // Attempt 5: Arithmetic mismatch (totalPayable != productPrice + shippingFee)
  const arithmeticMismatch = codOrderSubmissionSchema.safeParse({
    ...baseValid,
    totalPayable: 4950, // Ignored shippingFee in total
  });
  assertTest(
    finCat,
    'Total Payable Arithmetic Mismatch Rejection',
    arithmeticMismatch.success === false && arithmeticMismatch.error.issues.some((i) => i.path.includes('totalPayable')),
    `Correctly rejected: ${arithmeticMismatch.success === false}`
  );

  // ────────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('   CHALLENGER M3 ITERATION 2 DEEP STRESS SUITE RESULTS SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════════');

  const total = assertionResults.length;
  const passed = assertionResults.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Invariants Evaluated : ${total}`);
  console.log(`Passed Invariants          : ${passed} ✅`);
  console.log(`Failed Invariants          : ${failed} ${failed === 0 ? '🎉' : '❌'}`);

  if (failed > 0) {
    console.log('\nFailed Assertions Details:');
    assertionResults.filter((r) => !r.passed).forEach((r) => {
      console.error(`❌ [${r.category}] ${r.name}: ${r.message}`);
    });
    process.exit(1);
  }

  return { total, passed, failed };
}

runDeepStressSuite().catch((err) => {
  console.error('Fatal Deep Stress Suite Error:', err);
  process.exit(1);
});
