/**
 * Milestone M3 Iteration 2 — Challenger 1 Deep Adversarial Verification Suite
 * Independent empirical test harness by challenger_m3_iter2_1
 */

import {
  ALGERIA_58_WILAYAS,
  isStopDeskAllowed,
  calculateDeliveryTariff,
  normalizeAlgerianPhone,
  isValidAlgerianPhone,
  maskPhoneForPrivacy,
  codOrderSubmissionSchema,
  CodOrderSubmission,
} from '../src/lib/types/checkout';
import { submitCodOrderAction } from '../src/app/actions/checkout';
import { fallbackOrdersStore, generateOrderNumber } from '../src/lib/orders-store';

interface TestResult {
  suite: string;
  testCase: string;
  passed: boolean;
  expected: string;
  actual: string;
  error?: string;
}

const results: TestResult[] = [];

function assert(suite: string, testCase: string, condition: boolean, expected: string, actual: string, error?: string) {
  results.push({
    suite,
    testCase,
    passed: condition,
    expected,
    actual,
    error,
  });
  if (!condition) {
    console.error(`❌ [FAIL] [${suite}] ${testCase}: Expected "${expected}", got "${actual}"`);
    if (error) console.error(`   Error details:`, error);
  } else {
    console.log(`✅ [PASS] [${suite}] ${testCase}`);
  }
}

async function runChallengerDeepStress() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  CHALLENGER 1 — DEEP EMPIRICAL ADVERSARIAL STRESS SUITE (M3 ITERATION 2) ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  // ════════════════════════════════════════════════════════════════════════════
  // 1. PHONE NORMALIZATION & REGEX EXHAUSTIVE STRESS
  // ════════════════════════════════════════════════════════════════════════════
  const S1 = 'Phone Normalization';

  // 1.1: 002130 prefix (double zero + country code 213 + trunk zero 0)
  const prefix002130Cases = [
    { input: '002130550123456', expected: '0550123456', valid: true, op: 'Mobilis/Ooredoo 05' },
    { input: '002130661123456', expected: '0661123456', valid: true, op: 'Mobilis 06' },
    { input: '002130770123456', expected: '0770123456', valid: true, op: 'Djezzy 07' },
    { input: '002130798282495', expected: '0798282495', valid: true, op: 'Djezzy hotline' },
  ];

  for (const c of prefix002130Cases) {
    const norm = normalizeAlgerianPhone(c.input);
    const valid = isValidAlgerianPhone(c.input);
    assert(S1, `002130 prefix for ${c.op} (${c.input})`, norm === c.expected && valid === c.valid, `${c.expected} (valid=${c.valid})`, `${norm} (valid=${valid})`);
  }

  // 1.2: +2130 prefix (plus + country code 213 + trunk zero 0)
  const prefixPlus2130Cases = [
    { input: '+2130550123456', expected: '0550123456', valid: true },
    { input: '+2130661123456', expected: '0661123456', valid: true },
    { input: '+2130770123456', expected: '0770123456', valid: true },
  ];

  for (const c of prefixPlus2130Cases) {
    const norm = normalizeAlgerianPhone(c.input);
    const valid = isValidAlgerianPhone(c.input);
    assert(S1, `+2130 prefix (${c.input})`, norm === c.expected && valid === c.valid, `${c.expected} (valid=${c.valid})`, `${norm} (valid=${valid})`);
  }

  // 1.3: Standard +213 without trunk zero
  const prefixPlus213Cases = [
    { input: '+213550123456', expected: '0550123456', valid: true },
    { input: '+213661123456', expected: '0661123456', valid: true },
    { input: '+213770123456', expected: '0770123456', valid: true },
  ];

  for (const c of prefixPlus213Cases) {
    const norm = normalizeAlgerianPhone(c.input);
    const valid = isValidAlgerianPhone(c.input);
    assert(S1, `+213 prefix (${c.input})`, norm === c.expected && valid === c.valid, `${c.expected} (valid=${c.valid})`, `${norm} (valid=${valid})`);
  }

  // 1.4: 00213 without trunk zero
  const prefix00213Cases = [
    { input: '00213550123456', expected: '0550123456', valid: true },
    { input: '00213661123456', expected: '0661123456', valid: true },
    { input: '00213770123456', expected: '0770123456', valid: true },
  ];

  for (const c of prefix00213Cases) {
    const norm = normalizeAlgerianPhone(c.input);
    const valid = isValidAlgerianPhone(c.input);
    assert(S1, `00213 prefix (${c.input})`, norm === c.expected && valid === c.valid, `${c.expected} (valid=${c.valid})`, `${norm} (valid=${valid})`);
  }

  // 1.5: 213 (12 digits) and 2130 (13 digits) without leading symbols
  assert(S1, '213 prefix 12 digits (213550123456)', normalizeAlgerianPhone('213550123456') === '0550123456' && isValidAlgerianPhone('213550123456'), '0550123456 (valid=true)', `${normalizeAlgerianPhone('213550123456')} (valid=${isValidAlgerianPhone('213550123456')})`);
  assert(S1, '2130 prefix 13 digits (2130550123456)', normalizeAlgerianPhone('2130550123456') === '0550123456' && isValidAlgerianPhone('2130550123456'), '0550123456 (valid=true)', `${normalizeAlgerianPhone('2130550123456')} (valid=${isValidAlgerianPhone('2130550123456')})`);

  // 1.6: Formatting characters (spaces, dots, slashes, hyphens, parentheses)
  const formattedInputs = [
    { input: '05 50 12 34 56', expected: '0550123456' },
    { input: '06-61-12-34-56', expected: '0661123456' },
    { input: '07.70.12.34.56', expected: '0770123456' },
    { input: '+213 (0) 798 28 24 95', expected: '0798282495' },
    { input: '05/50/12/34/56', expected: '0550123456' },
  ];
  for (const f of formattedInputs) {
    const norm = normalizeAlgerianPhone(f.input);
    const valid = isValidAlgerianPhone(f.input);
    assert(S1, `Formatting characters stripped: "${f.input}"`, norm === f.expected && valid, `${f.expected} (valid=true)`, `${norm} (valid=${valid})`);
  }

  // 1.7: Invalid phones, bad prefixes, malformed lengths
  const invalidCases = [
    { input: '021123456', reason: 'Algiers landline (021)' },
    { input: '033123456', reason: 'Biskra landline (033)' },
    { input: '041123456', reason: 'Oran landline (041)' },
    { input: '0150123456', reason: 'Invalid operator prefix 01' },
    { input: '0850123456', reason: 'Invalid operator prefix 08' },
    { input: '0950123456', reason: 'Invalid operator prefix 09' },
    { input: '055012345', reason: '9 digits (too short)' },
    { input: '05501234567', reason: '11 digits (too long)' },
    { input: '00213055012345', reason: '002130 with only 8 subscriber digits (too short)' },
    { input: '0021305501234567', reason: '002130 with 10 subscriber digits (too long)' },
    { input: '+33612345678', reason: 'French mobile number' },
    { input: '', reason: 'Empty string' },
    { input: '           ', reason: 'Whitespace string' },
    { input: '055012345a', reason: 'Alpha char' },
    { input: '0770123456<script>', reason: 'XSS injection' },
    { input: '0770123456; DROP TABLE orders;', reason: 'SQL injection' },
  ];

  for (const inv of invalidCases) {
    const valid = isValidAlgerianPhone(inv.input);
    assert(S1, `Rejection of ${inv.reason} ("${inv.input}")`, valid === false, 'valid=false', `valid=${valid}`);
  }

  // 1.8: Privacy masking
  assert(S1, 'Privacy masking on 0798282495', maskPhoneForPrivacy('0798282495') === '0798 •• •• 95', '0798 •• •• 95', maskPhoneForPrivacy('0798282495'));
  assert(S1, 'Privacy masking on +213798282495', maskPhoneForPrivacy('+213798282495') === '0798 •• •• 95', '0798 •• •• 95', maskPhoneForPrivacy('+213798282495'));
  assert(S1, 'Privacy masking preserves invalid phone unmodified', maskPhoneForPrivacy('invalid') === 'invalid', 'invalid', maskPhoneForPrivacy('invalid'));


  // ════════════════════════════════════════════════════════════════════════════
  // 2. ZONE 5 STOP-DESK BARRIER AND WILAYA 1..58 LOGISTICS INTEGRITY
  // ════════════════════════════════════════════════════════════════════════════
  const S2 = 'Stop-Desk Logistics';

  // 2.1: Zone 5 Wilayas with code <= 48: 1 (Adrar), 11 (Tamanrasset), 33 (Illizi), 37 (Tindouf)
  const zone5HistoricWilayas = [1, 11, 33, 37];
  for (const code of zone5HistoricWilayas) {
    const w = ALGERIA_58_WILAYAS.find((x) => x.code === code);
    assert(S2, `Wilaya ${code} (${w?.nameFr}) belongs to Zone 5`, w?.zone === 5, 'zone=5', `zone=${w?.zone}`);
    assert(S2, `isStopDeskAllowed returns FALSE for Wilaya ${code} (${w?.nameFr})`, isStopDeskAllowed(code) === false, 'false', `${isStopDeskAllowed(code)}`);

    let threwTariff = false;
    let tariffErrMsg = '';
    try {
      calculateDeliveryTariff(code, 'STOP_DESK');
    } catch (err: any) {
      threwTariff = true;
      tariffErrMsg = err.message;
    }
    assert(S2, `calculateDeliveryTariff throws for Stop-Desk in Wilaya ${code} (${w?.nameFr})`, threwTariff, 'throws error', threwTariff ? `threw: ${tariffErrMsg}` : 'did not throw');

    // Domicile tariff for Zone 5 must be exactly 1000 DZD
    const domTariff = calculateDeliveryTariff(code, 'DOMICILE');
    assert(S2, `calculateDeliveryTariff returns 1000 DZD for Domicile in Wilaya ${code} (${w?.nameFr})`, domTariff === 1000, '1000', `${domTariff}`);
  }

  // 2.2: Wilayas 49 to 58 (Southern 10 new Wilayas)
  for (let code = 49; code <= 58; code++) {
    const w = ALGERIA_58_WILAYAS.find((x) => x.code === code);
    assert(S2, `isStopDeskAllowed strictly returns FALSE for Wilaya ${code} (${w?.nameFr})`, isStopDeskAllowed(code) === false, 'false', `${isStopDeskAllowed(code)}`);

    let threwTariff = false;
    try {
      calculateDeliveryTariff(code, 'STOP_DESK');
    } catch {
      threwTariff = true;
    }
    assert(S2, `calculateDeliveryTariff throws for Stop-Desk in Wilaya ${code} (${w?.nameFr})`, threwTariff, 'throws', threwTariff ? 'threw' : 'did not throw');
  }

  // 2.3: Non-Zone-5 Wilayas <= 48 MUST allow Stop-Desk
  const sampleAllowedWilayas = [
    { code: 7, name: 'Biskra', zone: 1, expectedStopDeskTariff: 350 },
    { code: 5, name: 'Batna', zone: 1, expectedStopDeskTariff: 350 },
    { code: 16, name: 'Alger', zone: 2, expectedStopDeskTariff: 400 },
    { code: 31, name: 'Oran', zone: 2, expectedStopDeskTariff: 400 },
    { code: 25, name: 'Constantine', zone: 2, expectedStopDeskTariff: 400 },
    { code: 14, name: 'Tiaret', zone: 3, expectedStopDeskTariff: 450 },
    { code: 17, name: 'Djelfa', zone: 3, expectedStopDeskTariff: 450 },
    { code: 30, name: 'Ouargla', zone: 4, expectedStopDeskTariff: 500 },
    { code: 39, name: 'El Oued', zone: 4, expectedStopDeskTariff: 500 },
  ];

  for (const item of sampleAllowedWilayas) {
    assert(S2, `isStopDeskAllowed returns TRUE for Wilaya ${item.code} (${item.name})`, isStopDeskAllowed(item.code) === true, 'true', `${isStopDeskAllowed(item.code)}`);
    const tariff = calculateDeliveryTariff(item.code, 'STOP_DESK');
    assert(S2, `Stop-Desk tariff for Wilaya ${item.code} (${item.name}) is ${item.expectedStopDeskTariff} DZD`, tariff === item.expectedStopDeskTariff, `${item.expectedStopDeskTariff}`, `${tariff}`);
  }

  // 2.4: Out-of-bounds Wilaya codes
  for (const outCode of [-1, 0, 59, 100]) {
    assert(S2, `isStopDeskAllowed returns FALSE for out-of-bounds code ${outCode}`, isStopDeskAllowed(outCode) === false, 'false', `${isStopDeskAllowed(outCode)}`);
    let threw = false;
    try {
      calculateDeliveryTariff(outCode, 'DOMICILE');
    } catch {
      threw = true;
    }
    assert(S2, `calculateDeliveryTariff throws for out-of-bounds code ${outCode}`, threw, 'throws', threw ? 'threw' : 'did not throw');
  }


  // ════════════════════════════════════════════════════════════════════════════
  // 3. FINANCIAL INTEGRITY & FORGERY ADVERSARIAL STRESS (ZOD SCHEMA)
  // ════════════════════════════════════════════════════════════════════════════
  const S3 = 'Financial Integrity';

  const validBasePayload: CodOrderSubmission = {
    customerName: 'Karim Boukhalfa',
    customerPhone: '0798282495',
    wilayaCode: 16,
    wilayaName: 'الجزائر',
    communeName: 'الجزائر الوسطى',
    deliveryType: 'DOMICILE',
    deliveryAddress: '12 شارع ديدوش مراد',
    packId: 'PACK1',
    productName: 'Orva Pack Solo (1 bouteille)',
    productPrice: 4950,
    shippingFee: 500,
    totalPayable: 5450,
  };

  // 3.1: Valid baseline payload must pass
  const baselineRes = codOrderSubmissionSchema.safeParse(validBasePayload);
  assert(S3, 'Valid baseline order payload parses successfully', baselineRes.success, 'success=true', `success=${baselineRes.success}`);

  // 3.2: Tampered pack prices (canonical: PACK1: 4950, PACK2: 12950, PACK3: 15950)
  const priceTamperCases = [
    { packId: 'PACK1' as const, forgedPrice: 1, expectedMsg: 'Prix invalide pour le PACK1' },
    { packId: 'PACK1' as const, forgedPrice: 4000, expectedMsg: 'Prix invalide pour le PACK1' },
    { packId: 'PACK2' as const, forgedPrice: 4950, expectedMsg: 'Prix invalide pour le PACK2' },
    { packId: 'PACK2' as const, forgedPrice: 9999, expectedMsg: 'Prix invalide pour le PACK2' },
    { packId: 'PACK3' as const, forgedPrice: 12950, expectedMsg: 'Prix invalide pour le PACK3' },
    { packId: 'PACK3' as const, forgedPrice: 100, expectedMsg: 'Prix invalide pour le PACK3' },
  ];

  for (const pt of priceTamperCases) {
    const payload = {
      ...validBasePayload,
      packId: pt.packId,
      productPrice: pt.forgedPrice,
      totalPayable: pt.forgedPrice + validBasePayload.shippingFee,
    };
    const res = codOrderSubmissionSchema.safeParse(payload);
    assert(S3, `Reject forged price ${pt.forgedPrice} for ${pt.packId}`, res.success === false, 'rejected', res.success ? 'ACCEPTED' : 'rejected');
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path.includes('productPrice'));
      assert(S3, `Issue message for ${pt.packId} forged price matches catalog restriction`, issue !== undefined && issue.message.includes(pt.expectedMsg), `contains "${pt.expectedMsg}"`, issue?.message ?? 'none');
    }
  }

  // 3.3: Mismatched totalPayable (arithmetic equality violation)
  const totalMismatchCases = [
    { name: 'Underpayment by 1 DZD', total: 5449 },
    { name: 'Overpayment by 1 DZD', total: 5451 },
    { name: 'Tampered 1 DZD total', total: 1 },
    { name: 'Zero total', total: 0 },
    { name: 'Negative total', total: -5450 },
    { name: 'Total equaling only subtotal (free shipping exploit attempt)', total: 4950 },
  ];

  for (const tm of totalMismatchCases) {
    const payload = {
      ...validBasePayload,
      totalPayable: tm.total,
    };
    const res = codOrderSubmissionSchema.safeParse(payload);
    assert(S3, `Reject totalPayable arithmetic mismatch: ${tm.name} (${tm.total})`, res.success === false, 'rejected', res.success ? 'ACCEPTED' : 'rejected');
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path.includes('totalPayable'));
      assert(S3, `Issue on totalPayable indicates arithmetic requirement for ${tm.name}`, issue !== undefined, 'issue present', issue ? 'present' : 'missing');
    }
  }

  // 3.4: Forged shipping fee against authoritative Biskra tariff matrix
  const shippingTamperCases = [
    {
      desc: 'Free shipping exploit for Alger Domicile (submitted 0 instead of 500)',
      wilayaCode: 16,
      deliveryType: 'DOMICILE' as const,
      address: 'Alger Centre',
      forgedFee: 0,
    },
    {
      desc: 'Underpaid shipping for Alger Domicile (submitted 350 instead of 500)',
      wilayaCode: 16,
      deliveryType: 'DOMICILE' as const,
      address: 'Alger Centre',
      forgedFee: 350,
    },
    {
      desc: 'Overpaid shipping for Alger Domicile (submitted 650 instead of 500)',
      wilayaCode: 16,
      deliveryType: 'DOMICILE' as const,
      address: 'Alger Centre',
      forgedFee: 650,
    },
    {
      desc: 'Forged shipping for Biskra 07 Domicile (submitted 500 instead of 450)',
      wilayaCode: 7,
      deliveryType: 'DOMICILE' as const,
      address: 'Biskra Centre',
      forgedFee: 500,
    },
    {
      desc: 'Forged shipping for Alger Stop-Desk (submitted 500 instead of 400)',
      wilayaCode: 16,
      deliveryType: 'STOP_DESK' as const,
      address: undefined,
      forgedFee: 500,
    },
    {
      desc: 'Forged shipping for Far South Zone 5 Wilaya 54 Domicile (submitted 500 instead of 1000)',
      wilayaCode: 54,
      deliveryType: 'DOMICILE' as const,
      address: 'In Guezzam',
      forgedFee: 500,
    },
  ];

  for (const st of shippingTamperCases) {
    const payload = {
      ...validBasePayload,
      wilayaCode: st.wilayaCode,
      deliveryType: st.deliveryType,
      deliveryAddress: st.address,
      shippingFee: st.forgedFee,
      totalPayable: validBasePayload.productPrice + st.forgedFee, // Mathematically matches, but fee is wrong!
    };
    const res = codOrderSubmissionSchema.safeParse(payload);
    assert(S3, `Reject forged shipping fee: ${st.desc}`, res.success === false, 'rejected', res.success ? 'ACCEPTED' : 'rejected');
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path.includes('shippingFee'));
      assert(S3, `Issue on shippingFee identifies tariff discrepancy for ${st.desc}`, issue !== undefined, 'issue on shippingFee', issue ? issue.message : 'missing');
    }
  }

  // 3.5: Stop-Desk rejection in Zod schema for Southern & Zone 5 Wilayas
  for (const forbiddenCode of [1, 11, 33, 37, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58]) {
    const payload: CodOrderSubmission = {
      ...validBasePayload,
      wilayaCode: forbiddenCode,
      deliveryType: 'STOP_DESK',
      deliveryAddress: undefined,
      shippingFee: 400,
      totalPayable: 4950 + 400,
    };
    const res = codOrderSubmissionSchema.safeParse(payload);
    assert(S3, `Zod schema strictly rejects Stop-Desk for Wilaya ${forbiddenCode}`, res.success === false, 'rejected', res.success ? 'ACCEPTED' : 'rejected');
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path.includes('deliveryType'));
      assert(S3, `Zod schema identifies Stop-Desk unavailability for Wilaya ${forbiddenCode}`, issue !== undefined && issue.message.includes('point relais'), 'issue on deliveryType', issue?.message ?? 'missing');
    }
  }

  // 3.6: Legitimate Orders Across Packs and Zones Must All Pass
  const legitOrders: { packId: 'PACK1' | 'PACK2' | 'PACK3'; wilayaCode: number; deliveryType: 'DOMICILE' | 'STOP_DESK'; address?: string }[] = [
    { packId: 'PACK1', wilayaCode: 7, deliveryType: 'DOMICILE', address: 'Rue Principale Biskra' },
    { packId: 'PACK1', wilayaCode: 7, deliveryType: 'STOP_DESK' },
    { packId: 'PACK2', wilayaCode: 16, deliveryType: 'DOMICILE', address: 'Rue Didouche Mourad' },
    { packId: 'PACK2', wilayaCode: 16, deliveryType: 'STOP_DESK' },
    { packId: 'PACK3', wilayaCode: 14, deliveryType: 'DOMICILE', address: 'Centre Ville Tiaret' },
    { packId: 'PACK3', wilayaCode: 14, deliveryType: 'STOP_DESK' },
    { packId: 'PACK1', wilayaCode: 30, deliveryType: 'DOMICILE', address: 'Ouargla Centre' },
    { packId: 'PACK1', wilayaCode: 30, deliveryType: 'STOP_DESK' },
    { packId: 'PACK2', wilayaCode: 11, deliveryType: 'DOMICILE', address: 'Tamanrasset Ville' }, // Zone 5 Domicile
    { packId: 'PACK3', wilayaCode: 54, deliveryType: 'DOMICILE', address: 'In Guezzam Ville' }, // Zone 5 Domicile
  ];

  const canonicalPrices = { PACK1: 4950, PACK2: 12950, PACK3: 15950 };

  for (const legit of legitOrders) {
    const fee = calculateDeliveryTariff(legit.wilayaCode, legit.deliveryType);
    const price = canonicalPrices[legit.packId];
    const total = price + fee;
    const w = ALGERIA_58_WILAYAS.find((x) => x.code === legit.wilayaCode);
    const payload: CodOrderSubmission = {
      customerName: 'Client Authentique',
      customerPhone: '0550123456',
      wilayaCode: legit.wilayaCode,
      wilayaName: w?.nameAr ?? 'ولاية',
      communeName: 'بلدية',
      deliveryType: legit.deliveryType,
      deliveryAddress: legit.address,
      packId: legit.packId,
      productName: `Pack ${legit.packId}`,
      productPrice: price,
      shippingFee: fee,
      totalPayable: total,
    };
    const res = codOrderSubmissionSchema.safeParse(payload);
    assert(S3, `Legit order passes: ${legit.packId} | Wilaya ${legit.wilayaCode} (${w?.nameFr}) | ${legit.deliveryType}`, res.success === true, 'success=true', `success=${res.success}`);
  }


  // ════════════════════════════════════════════════════════════════════════════
  // 4. SERVER ACTION FULL CYCLE & RESILIENCE
  // ════════════════════════════════════════════════════════════════════════════
  const S4 = 'Server Action Execution';

  // 4.1: End-to-end valid order via submitCodOrderAction
  const validSubmission: CodOrderSubmission = {
    customerName: 'Yacine Belkacem',
    customerPhone: '002130661123456', // Test with the 002130 prefix!
    customerPhone2: '+2130550998877',
    wilayaCode: 31, // Oran (Zone 2)
    wilayaName: 'وهران',
    communeName: 'وهران',
    deliveryType: 'DOMICILE',
    deliveryAddress: '22 Boulevard de la Soummam',
    packId: 'PACK2',
    productName: 'Pack Duo (2 bouteilles)',
    productPrice: 12950,
    shippingFee: 500,
    totalPayable: 13450,
  };

  const actionRes = await submitCodOrderAction(validSubmission);
  assert(S4, 'submitCodOrderAction returns success=true for valid submission', actionRes.success === true, 'success=true', `success=${actionRes.success}`);
  assert(S4, 'submitCodOrderAction returns valid orderNumber', typeof actionRes.orderNumber === 'string' && /^ORV-[0-9]{6}-[A-Z0-9]{4}$/.test(actionRes.orderNumber), 'ORV-YYMMDD-XXXX', actionRes.orderNumber ?? 'undefined');
  assert(S4, 'submitCodOrderAction returns redirectUrl to confirmation', typeof actionRes.redirectUrl === 'string' && actionRes.redirectUrl.startsWith('/checkout/confirmation?'), 'redirectUrl starts with /checkout/confirmation?', actionRes.redirectUrl ?? 'undefined');

  // Verify parameters in redirect URL
  if (actionRes.redirectUrl) {
    const url = new URL(actionRes.redirectUrl, 'http://localhost');
    assert(S4, 'Redirect URL has normalized customer phone (0661123456)', url.searchParams.get('phone') === '0661123456', '0661123456', url.searchParams.get('phone') ?? 'missing');
    assert(S4, 'Redirect URL has total=13450', url.searchParams.get('total') === '13450', '13450', url.searchParams.get('total') ?? 'missing');
    assert(S4, 'Redirect URL has pack=PACK2', url.searchParams.get('pack') === 'PACK2', 'PACK2', url.searchParams.get('pack') ?? 'missing');
  }

  // 4.2: Malicious price tampering in server action
  const tamperedActionSub: CodOrderSubmission = {
    ...validSubmission,
    productPrice: 1, // Attempt to purchase PACK2 for 1 DZD
    totalPayable: 501,
  };
  const tamperedActionRes = await submitCodOrderAction(tamperedActionSub);
  assert(S4, 'submitCodOrderAction blocks price tampering payload', tamperedActionRes.success === false, 'success=false', `success=${tamperedActionRes.success}`);
  assert(S4, 'submitCodOrderAction returns validationErrors on price tampering', tamperedActionRes.validationErrors !== undefined && Object.keys(tamperedActionRes.validationErrors).length > 0, 'validationErrors present', tamperedActionRes.validationErrors ? JSON.stringify(tamperedActionRes.validationErrors) : 'none');

  // 4.3: Order Number Uniqueness (Entropy Check across 200 samples)
  const orderNumbers = new Set<string>();
  for (let i = 0; i < 200; i++) {
    orderNumbers.add(generateOrderNumber());
  }
  assert(S4, 'generateOrderNumber produces 200 unique IDs with 0 collisions', orderNumbers.size === 200, '200 unique IDs', `${orderNumbers.size} unique IDs`);


  // ════════════════════════════════════════════════════════════════════════════
  // SUMMARY OF CHALLENGER EVALUATION
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════════════════════════');
  console.log('   CHALLENGER 1 DEEP ADVERSARIAL STRESS SUITE RESULTS SUMMARY');
  console.log('══════════════════════════════════════════════════════════════════════════');

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`TOTAL ADVERSARIAL PROBES EVALUATED: ${total}`);
  console.log(`PASSED:                            ${passed} ✅`);
  console.log(`FAILED:                            ${failed} ${failed === 0 ? '🎉' : '❌'}`);
  console.log('══════════════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.error('ADVERSARIAL FAILURES FOUND:');
    for (const f of results.filter((r) => !r.passed)) {
      console.error(` - [${f.suite}] ${f.testCase}: Expected ${f.expected}, got ${f.actual}`);
    }
    process.exit(1);
  }
}

runChallengerDeepStress().catch((err) => {
  console.error('Fatal crash in Challenger Deep Stress Suite:', err);
  process.exit(1);
});
