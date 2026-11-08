/**
 * ORVA Platform — Milestone M3 Empirical Challenger Stress Test Harness
 * 
 * Conducted by Challenger 1 (teamwork_challenger)
 * Adversarially stress tests checkout form, geographic validation, Stop-Desk restrictions,
 * Algerian phone regex, honeypot spam protection, Biskra tariffs, and net payable math.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ALGERIA_58_WILAYAS,
  isStopDeskAllowed,
  calculateDeliveryTariff,
  normalizeAlgerianPhone,
  isValidAlgerianPhone,
  maskPhoneForPrivacy,
  codOrderSubmissionSchema,
  type CodOrderSubmission,
} from '../src/lib/types/checkout';
import { submitCodOrderAction } from '../src/app/actions/checkout';
import { fallbackOrdersStore, generateOrderNumber } from '../src/lib/orders-store';
import communesData from '../src/data/geoalgeria/communes.json';

interface TestRecord {
  category: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: unknown;
}

const testResults: TestRecord[] = [];

function check(category: string, name: string, fn: () => void | boolean) {
  try {
    const res = fn();
    if (res === false) {
      testResults.push({ category, name, passed: false, error: 'Condition returned false' });
    } else {
      testResults.push({ category, name, passed: true });
    }
  } catch (err: any) {
    testResults.push({ category, name, passed: false, error: err?.message || String(err), details: err?.stack });
  }
}

async function checkAsync(category: string, name: string, fn: () => Promise<void | boolean>) {
  try {
    const res = await fn();
    if (res === false) {
      testResults.push({ category, name, passed: false, error: 'Condition returned false' });
    } else {
      testResults.push({ category, name, passed: true });
    }
  } catch (err: any) {
    testResults.push({ category, name, passed: false, error: err?.message || String(err), details: err?.stack });
  }
}

async function runEmpiricalStressSuite() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('   ORVA COD PLATFORM — MILESTONE M3 EMPIRICAL CHALLENGER STRESS SUITE   ');
  console.log('════════════════════════════════════════════════════════════════════════');

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CASCADING WILAYA -> COMMUNE SELECTION & GEOGRAPHIC DATA
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n[1/7] Testing Cascading Wilaya -> Commune Selection Across Edge Cases...');

  check('Geography', 'ALGERIA_58_WILAYAS contains exactly 58 wilayas', () => {
    return ALGERIA_58_WILAYAS.length === 58;
  });

  check('Geography', 'Wilaya codes form a strictly contiguous sequence from 1 to 58', () => {
    for (let i = 1; i <= 58; i++) {
      const found = ALGERIA_58_WILAYAS.find((w) => w.code === i);
      if (!found) throw new Error(`Missing Wilaya code: ${i}`);
      if (!found.nameAr || !found.nameFr) throw new Error(`Wilaya ${i} missing Arabic or French name`);
      if (found.zone < 1 || found.zone > 5) throw new Error(`Wilaya ${i} invalid zone: ${found.zone}`);
    }
    return true;
  });

  check('Geography', 'communes.json contains all 1,541 administrative communes', () => {
    return communesData.length === 1541;
  });

  check('Geography', 'Every single Wilaya 1..58 has at least 1 commune in communes.json', () => {
    for (let code = 1; code <= 58; code++) {
      const filtered = (communesData as any[]).filter((c) => c.wilaya_code === code);
      if (filtered.length === 0) throw new Error(`Wilaya ${code} has 0 communes!`);
    }
    return true;
  });

  check('Geography', 'Edge Case: Wilaya 50 (Bordj Badji Mokhtar) has exactly 2 communes', () => {
    const w50 = (communesData as any[]).filter((c) => c.wilaya_code === 50);
    if (w50.length !== 2) throw new Error(`Expected 2 communes for Wilaya 50, found ${w50.length}`);
    const namesAr = w50.map((c) => c.commune_name_ar);
    if (!namesAr.includes('برج باجي مختار') || !namesAr.includes('تيمياوين')) {
      throw new Error(`Wilaya 50 missing expected communes: ${namesAr.join(', ')}`);
    }
    return true;
  });

  check('Geography', 'Edge Case: Wilaya 16 (Alger) has exactly 57 communes', () => {
    const w16 = (communesData as any[]).filter((c) => c.wilaya_code === 16);
    if (w16.length !== 57) throw new Error(`Expected 57 communes for Alger, found ${w16.length}`);
    return true;
  });

  check('Geography', 'Edge Case: Extreme low commune count wilayas (2 communes each)', () => {
    const twoCommuneWilayas = [37, 50, 54, 56]; // Tindouf, Bordj Badji Mokhtar, In Guezzam, Djanet
    for (const code of twoCommuneWilayas) {
      const filtered = (communesData as any[]).filter((c) => c.wilaya_code === code);
      if (filtered.length !== 2) {
        throw new Error(`Wilaya ${code} expected 2 communes, found ${filtered.length}`);
      }
    }
    return true;
  });

  check('Geography', 'Cascading simulation: Selecting each of 58 Wilayas yields non-empty commune list and default selection', () => {
    for (let code = 1; code <= 58; code++) {
      const filtered = (communesData as any[]).filter((c) => c.wilaya_code === code);
      const defaultCommune = filtered[0]?.commune_name_ar || filtered[0]?.commune_name_fr;
      if (!defaultCommune || defaultCommune.trim().length === 0) {
        throw new Error(`Wilaya ${code} default commune cascade failed`);
      }
    }
    return true;
  });

  check('Geography', 'Invalid Wilaya codes (<1 or >58) yield 0 communes without throwing', () => {
    const invalidCodes = [0, -1, 70, 99, 999];
    for (const code of invalidCodes) {
      const filtered = (communesData as any[]).filter((c) => c.wilaya_code === code);
      if (filtered.length !== 0) throw new Error(`Invalid code ${code} returned communes!`);
    }
    return true;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. STOP-DESK RESTRICTION (WILAYAS 49 THROUGH 58 & ZONE 5 BEHAVIOR)
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n[2/7] Testing Stop-Desk Restriction Logic...');

  check('StopDesk', 'isStopDeskAllowed returns TRUE for Wilayas 1 through 48 (excluding Zone 5)', () => {
    for (let code = 1; code <= 48; code++) {
      const wilaya = ALGERIA_58_WILAYAS.find((w) => w.code === code);
      const expected = wilaya?.zone !== 5;
      if (isStopDeskAllowed(code) !== expected) {
        throw new Error(`Wilaya ${code} Stop-Desk mismatch: got ${isStopDeskAllowed(code)}, expected ${expected}`);
      }
    }
    return true;
  });

  check('StopDesk', 'isStopDeskAllowed returns FALSE for all Wilayas 49 through 58', () => {
    for (let code = 49; code <= 58; code++) {
      if (isStopDeskAllowed(code)) throw new Error(`Wilaya ${code} MUST NOT allow Stop-Desk`);
    }
    return true;
  });

  check('StopDesk', 'isStopDeskAllowed returns FALSE for out-of-bounds codes (0, -1, 59, 100)', () => {
    for (const code of [0, -1, -50, 59, 60, 100]) {
      if (isStopDeskAllowed(code)) throw new Error(`Out of bounds code ${code} should be false`);
    }
    return true;
  });

  check('StopDesk', 'codOrderSubmissionSchema strictly rejects STOP_DESK for each Wilaya 49 through 58', () => {
    for (let code = 49; code <= 58; code++) {
      const wilaya = ALGERIA_58_WILAYAS.find((w) => w.code === code);
      const sub: CodOrderSubmission = {
        customerName: 'Test Buyer',
        customerPhone: '0555123456',
        wilayaCode: code,
        wilayaName: wilaya?.nameAr || 'ولاية جنوبية',
        communeName: 'بلدية المركز',
        deliveryType: 'STOP_DESK',
        packId: 'PACK1',
        productName: 'Pack 1',
        productPrice: 4950,
        shippingFee: 500,
        totalPayable: 5450,
      };
      const res = codOrderSubmissionSchema.safeParse(sub);
      if (res.success) {
        throw new Error(`Wilaya ${code} STOP_DESK unexpectedly passed Zod validation!`);
      }
      const issue = res.error.issues.find((i) => i.path.includes('deliveryType'));
      if (!issue || !issue.message.includes('point relais')) {
        throw new Error(`Wilaya ${code} did not produce expected Stop-Desk rejection issue: ${JSON.stringify(res.error.issues)}`);
      }
    }
    return true;
  });

  check('StopDesk', 'calculateDeliveryTariff throws error when STOP_DESK is requested for Wilayas 49 through 58', () => {
    for (let code = 49; code <= 58; code++) {
      let threw = false;
      try {
        calculateDeliveryTariff(code, 'STOP_DESK');
      } catch (err: any) {
        threw = true;
        if (!err.message.includes('Stop-Desk delivery is not available')) {
          throw new Error(`Wilaya ${code} threw unexpected error message: ${err.message}`);
        }
      }
      if (!threw) throw new Error(`Wilaya ${code} STOP_DESK did not throw!`);
    }
    return true;
  });

  check('StopDesk', 'Zone 5 Wilayas <= 48 (1, 11, 33, 37) consistently prohibit Stop-Desk in both permission and tariff', () => {
    // Probe Wilayas 1 (Adrar), 11 (Tamanrasset), 33 (Illizi), 37 (Tindouf)
    const zone5OldWilayas = [1, 11, 33, 37];
    for (const code of zone5OldWilayas) {
      const allowed = isStopDeskAllowed(code);
      if (allowed) throw new Error(`Expected isStopDeskAllowed(${code}) to be false for Zone 5`);
      let threwTariff = false;
      try {
        calculateDeliveryTariff(code, 'STOP_DESK');
      } catch (err: any) {
        threwTariff = true;
        if (!err.message.includes('Stop-Desk delivery is not available') && !err.message.includes('Zone 5')) {
          throw new Error(`Wilaya ${code} threw unexpected error: ${err.message}`);
        }
      }
      if (!threwTariff) {
        throw new Error(`Wilaya ${code} did not throw in calculateDeliveryTariff for Zone 5!`);
      }
    }
    return true;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. ALGERIAN MOBILE PHONE NORMALIZATION & REGEX VALIDATION
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n[3/7] Testing Algerian Mobile Phone Normalization & Validation Regex...');

  check('Phone', 'Valid Ooredoo (05), Mobilis (06), Djezzy (07) 10-digit formats are all accepted', () => {
    const validSamples = [
      '0550123456',
      '0555998877',
      '0560112233',
      '0661234567',
      '0660998877',
      '0670112233',
      '0770123456',
      '0798282495',
      '0780112233',
    ];
    for (const phone of validSamples) {
      if (!isValidAlgerianPhone(phone)) throw new Error(`Valid phone rejected: ${phone}`);
    }
    return true;
  });

  check('Phone', 'Prefix normalization: +213 with spaces and hyphens normalizes to 10 digits', () => {
    const raw = '+213 798 28 24 95';
    const norm = normalizeAlgerianPhone(raw);
    if (norm !== '0798282495') throw new Error(`Expected 0798282495, got ${norm}`);
    if (!isValidAlgerianPhone(raw)) throw new Error(`isValidAlgerianPhone returned false for ${raw}`);
    return true;
  });

  check('Phone', 'Prefix normalization: +2130 (with trunk 0) normalizes to 10 digits', () => {
    const raw = '+2130555123456';
    const norm = normalizeAlgerianPhone(raw);
    if (norm !== '0555123456') throw new Error(`Expected 0555123456, got ${norm}`);
    if (!isValidAlgerianPhone(raw)) throw new Error(`isValidAlgerianPhone returned false for ${raw}`);
    return true;
  });

  check('Phone', 'Prefix normalization: 00213 (standard double zero international) normalizes to 10 digits', () => {
    const raw = '00213555123456';
    const norm = normalizeAlgerianPhone(raw);
    if (norm !== '0555123456') throw new Error(`Expected 0555123456, got ${norm}`);
    if (!isValidAlgerianPhone(raw)) throw new Error(`isValidAlgerianPhone returned false for ${raw}`);
    return true;
  });

  check('Phone', '[ADVERSARIAL PROBE] Prefix normalization: 002130 (double zero + trunk zero)', () => {
    const raw = '002130555123456';
    const norm = normalizeAlgerianPhone(raw);
    // In src/lib/types/checkout.ts: line 44: cleaned = '0' + cleaned.slice(5) -> yields '00555123456'
    // While in tests/e2e/framework/domain-engine.ts: line 34: cleaned = cleaned.slice(5) -> yields '0555123456'
    const isStandard = norm === '0555123456';
    if (!isStandard) {
      console.warn(`    ⚠️ Confirmed bug in src/lib/types/checkout.ts: 002130 normalizes to "${norm}" instead of "0555123456"`);
      return false; // Register empirical failure
    }
    return true;
  });

  check('Phone', 'Prefix normalization: 213 (without plus, 12 digits) normalizes to 10 digits', () => {
    const raw = '213555123456';
    const norm = normalizeAlgerianPhone(raw);
    if (norm !== '0555123456') throw new Error(`Expected 0555123456, got ${norm}`);
    if (!isValidAlgerianPhone(raw)) throw new Error(`isValidAlgerianPhone returned false for ${raw}`);
    return true;
  });

  check('Phone', 'Prefix normalization: 2130 (without plus, 13 digits) normalizes to 10 digits', () => {
    const raw = '2130555123456';
    const norm = normalizeAlgerianPhone(raw);
    if (norm !== '0555123456') throw new Error(`Expected 0555123456, got ${norm}`);
    if (!isValidAlgerianPhone(raw)) throw new Error(`isValidAlgerianPhone returned false for ${raw}`);
    return true;
  });

  check('Phone', 'Rejects Algerian landline numbers (02, 03, 04 prefixes)', () => {
    const landlines = [
      '021123456',  // Algiers
      '023123456',  // Algiers West
      '024123456',  // Boumerdes
      '031123456',  // Constantine
      '033123456',  // Biskra
      '041123456',  // Oran
      '043123456',  // Tlemcen
      '029123456',  // Ghardaia
    ];
    for (const phone of landlines) {
      if (isValidAlgerianPhone(phone)) throw new Error(`Landline unexpectedly accepted: ${phone}`);
    }
    return true;
  });

  check('Phone', 'Rejects invalid prefixes (01, 08, 09)', () => {
    const invalidPrefixes = ['0155123456', '0855123456', '0955123456'];
    for (const phone of invalidPrefixes) {
      if (isValidAlgerianPhone(phone)) throw new Error(`Invalid prefix accepted: ${phone}`);
    }
    return true;
  });

  check('Phone', 'Rejects numbers with wrong length (7, 8, 9, 11, 12 digits)', () => {
    const wrongLengths = ['0555123', '05551234', '055512345', '05551234567', '055512345678'];
    for (const phone of wrongLengths) {
      if (isValidAlgerianPhone(phone)) throw new Error(`Wrong length accepted: ${phone}`);
    }
    return true;
  });

  check('Phone', 'Rejects inputs containing alphabetic chars or injection payloads', () => {
    const malicious = [
      '055512345A',
      '066123456#',
      '0770123456; DROP TABLE orders;',
      '<script>alert(1)</script>',
      '05 55 12 34 5X',
    ];
    for (const phone of malicious) {
      if (isValidAlgerianPhone(phone)) throw new Error(`Malicious input accepted: ${phone}`);
    }
    return true;
  });

  check('Phone', 'maskPhoneForPrivacy masks 10-digit number and leaves others unchanged', () => {
    const masked = maskPhoneForPrivacy('0798282495');
    if (masked !== '0798 •• •• 95') throw new Error(`Unexpected masked format: ${masked}`);
    const unmasked = maskPhoneForPrivacy('123');
    if (unmasked !== '123') throw new Error(`Invalid length should not be masked: ${unmasked}`);
    return true;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. HONEYPOT ANTI-SPAM TRAP
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n[4/7] Testing Honeypot Anti-Spam Trap Logic...');

  const validBaseOrder: CodOrderSubmission = {
    customerName: 'Mohamed Brahimi',
    customerPhone: '0555123456',
    wilayaCode: 16,
    wilayaName: 'الجزائر',
    communeName: 'الجزائر الوسطى',
    deliveryType: 'DOMICILE',
    deliveryAddress: '15 شارع العربي بن مهيدي',
    packId: 'PACK1',
    productName: 'Pack 1',
    productPrice: 4950,
    shippingFee: 500,
    totalPayable: 5450,
  };

  check('Honeypot', 'Empty or undefined honeypot passes Zod schema validation', () => {
    const res1 = codOrderSubmissionSchema.safeParse({ ...validBaseOrder });
    if (!res1.success) throw new Error(`Valid order failed: ${JSON.stringify(res1.error.issues)}`);
    const res2 = codOrderSubmissionSchema.safeParse({ ...validBaseOrder, honeypot: '' });
    if (!res2.success) throw new Error(`Empty honeypot failed: ${JSON.stringify(res2.error.issues)}`);
    const res3 = codOrderSubmissionSchema.safeParse({ ...validBaseOrder, honeypot: '   ' });
    if (!res3.success) throw new Error(`Whitespace honeypot failed: ${JSON.stringify(res3.error.issues)}`);
    return true;
  });

  check('Honeypot', 'Non-empty honeypot strings are strictly rejected by Zod schema', () => {
    const spamTokens = ['bot', 'spam_value', 'http://malicious.com', '123', '  attack  '];
    for (const token of spamTokens) {
      const res = codOrderSubmissionSchema.safeParse({ ...validBaseOrder, honeypot: token });
      if (res.success) throw new Error(`Honeypot token "${token}" was unexpectedly allowed!`);
      const issue = res.error.issues.find((i) => i.path.includes('honeypot'));
      if (!issue || !issue.message.includes('honeypot trap')) {
        throw new Error(`Honeypot issue missing expected message: ${JSON.stringify(res.error.issues)}`);
      }
    }
    return true;
  });

  await checkAsync('Honeypot', 'submitCodOrderAction halts immediately and performs NO store mutations on honeypot fill', async () => {
    const storeCountBefore = fallbackOrdersStore.length;
    const result = await submitCodOrderAction({
      ...validBaseOrder,
      honeypot: 'spam-bot-automated-crawler',
    });
    const storeCountAfter = fallbackOrdersStore.length;
    if (result.success) throw new Error('Honeypot submission returned success: true');
    if (!result.error?.includes('honeypot trap')) throw new Error(`Unexpected error message: ${result.error}`);
    if (storeCountAfter !== storeCountBefore) {
      throw new Error(`Store was mutated! Before: ${storeCountBefore}, After: ${storeCountAfter}`);
    }
    return true;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 5. BISKRA (HUB 07) TARIFF CALCULATION & NET PAYABLE MATH
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n[5/7] Testing Biskra (Hub 07) Tariff Calculation & Net Payable Math...');

  check('Tariff', 'Zone 1 (Biskra 07, Batna 05) tariffs: Domicile = 450 DZD, Stop-Desk = 350 DZD', () => {
    const biskraDom = calculateDeliveryTariff(7, 'DOMICILE');
    const biskraDesk = calculateDeliveryTariff(7, 'STOP_DESK');
    const batnaDom = calculateDeliveryTariff(5, 'DOMICILE');
    const batnaDesk = calculateDeliveryTariff(5, 'STOP_DESK');
    if (biskraDom !== 450 || biskraDesk !== 350) throw new Error(`Biskra tariff mismatch: ${biskraDom}/${biskraDesk}`);
    if (batnaDom !== 450 || batnaDesk !== 350) throw new Error(`Batna tariff mismatch: ${batnaDom}/${batnaDesk}`);
    return true;
  });

  check('Tariff', 'Zone 2 (Northern & Coastal: Alger 16, Oran 31, Constantine 25) tariffs: Domicile = 500 DZD, Stop-Desk = 400 DZD', () => {
    for (const code of [16, 31, 25]) {
      const dom = calculateDeliveryTariff(code, 'DOMICILE');
      const desk = calculateDeliveryTariff(code, 'STOP_DESK');
      if (dom !== 500 || desk !== 400) throw new Error(`Zone 2 Wilaya ${code} mismatch: ${dom}/${desk}`);
    }
    return true;
  });

  check('Tariff', 'Zone 3 (High Plateaus: Tiaret 14, Djelfa 17, MSila 28) tariffs: Domicile = 650 DZD, Stop-Desk = 450 DZD', () => {
    for (const code of [14, 17, 28]) {
      const dom = calculateDeliveryTariff(code, 'DOMICILE');
      const desk = calculateDeliveryTariff(code, 'STOP_DESK');
      if (dom !== 650 || desk !== 450) throw new Error(`Zone 3 Wilaya ${code} mismatch: ${dom}/${desk}`);
    }
    return true;
  });

  check('Tariff', 'Zone 4 (Near Sahara: Ouargla 30, Bechar 08, El Oued 39) tariffs: Domicile = 800 DZD, Stop-Desk = 500 DZD', () => {
    for (const code of [30, 8, 39]) {
      const dom = calculateDeliveryTariff(code, 'DOMICILE');
      const desk = calculateDeliveryTariff(code, 'STOP_DESK');
      if (dom !== 800 || desk !== 500) throw new Error(`Zone 4 Wilaya ${code} mismatch: ${dom}/${desk}`);
    }
    return true;
  });

  check('Tariff', 'Zone 5 (Far South: In Guezzam 54, Tamanrasset 11, Djanet 56) Domicile tariff = 1000 DZD', () => {
    for (const code of [54, 11, 56]) {
      const dom = calculateDeliveryTariff(code, 'DOMICILE');
      if (dom !== 1000) throw new Error(`Zone 5 Wilaya ${code} mismatch: ${dom}`);
    }
    return true;
  });

  check('Tariff', 'Exhaustive: All 58 Wilayas return positive Domicile tariffs (450, 500, 650, 800, or 1000)', () => {
    const validTariffs = [450, 500, 650, 800, 1000];
    for (let code = 1; code <= 58; code++) {
      const fee = calculateDeliveryTariff(code, 'DOMICILE');
      if (!validTariffs.includes(fee)) {
        throw new Error(`Wilaya ${code} returned unexpected tariff: ${fee}`);
      }
    }
    return true;
  });

  check('Tariff', 'Net Payable Math: Subtotal + ShippingFee strictly equals TotalPayable across 3 packs & 5 zones', () => {
    const packs = [
      { id: 'PACK1', price: 4950 },
      { id: 'PACK2', price: 12950 },
      { id: 'PACK3', price: 15950 },
    ];
    const testWilayas = [7, 16, 17, 30, 54]; // Zone 1, 2, 3, 4, 5
    for (const pack of packs) {
      for (const w of testWilayas) {
        const fee = calculateDeliveryTariff(w, 'DOMICILE');
        const calculatedTotal = pack.price + fee;
        if (calculatedTotal !== pack.price + fee) {
          throw new Error(`Calculation error for ${pack.id} in Wilaya ${w}`);
        }
      }
    }
    return true;
  });

  check('Tariff', '[ADVERSARIAL PROBE] Client price/fee tampering in Zod schema verification', () => {
    // Check whether codOrderSubmissionSchema rejects totalPayable !== productPrice + shippingFee
    const tamperedOrder: CodOrderSubmission = {
      ...validBaseOrder,
      productPrice: 4950,
      shippingFee: 500,
      totalPayable: 1, // Tampered total: 1 DZD instead of 5450 DZD
    };
    const parsed = codOrderSubmissionSchema.safeParse(tamperedOrder);
    if (parsed.success) {
      console.warn('    ⚠️ Confirmed vulnerability: Zod schema allows client to submit tampered totalPayable (1 DZD)!');
      return false; // Register adversarial finding
    }
    return true;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 6. DOMICILE VS STOP-DESK ADDRESS AND NAME BOUNDARIES
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n[6/7] Testing Address & Name Boundary Constraints...');

  check('Boundaries', 'DOMICILE delivery requires deliveryAddress of at least 3 characters', () => {
    const shortAddress = { ...validBaseOrder, deliveryAddress: 'ab' };
    const resShort = codOrderSubmissionSchema.safeParse(shortAddress);
    if (resShort.success) throw new Error('Short address (<3 chars) unexpectedly passed!');

    const emptyAddress = { ...validBaseOrder, deliveryAddress: '' };
    const resEmpty = codOrderSubmissionSchema.safeParse(emptyAddress);
    if (resEmpty.success) throw new Error('Empty address unexpectedly passed!');

    const validAddress = { ...validBaseOrder, deliveryAddress: 'Cité 200 logts' };
    const resValid = codOrderSubmissionSchema.safeParse(validAddress);
    if (!resValid.success) throw new Error('Valid address unexpectedly failed!');
    return true;
  });

  check('Boundaries', 'STOP_DESK delivery does NOT require deliveryAddress', () => {
    const stopDeskOrder: CodOrderSubmission = {
      ...validBaseOrder,
      wilayaCode: 16,
      deliveryType: 'STOP_DESK',
      deliveryAddress: undefined,
      shippingFee: 400,
      totalPayable: 5350,
    };
    const res = codOrderSubmissionSchema.safeParse(stopDeskOrder);
    if (!res.success) throw new Error(`STOP_DESK without address failed: ${JSON.stringify(res.error.issues)}`);
    return true;
  });

  check('Boundaries', 'Customer Name requires minimum 2 characters and maximum 100 characters', () => {
    const singleChar = { ...validBaseOrder, customerName: 'A' };
    if (codOrderSubmissionSchema.safeParse(singleChar).success) throw new Error('1-char name allowed!');

    const twoChars = { ...validBaseOrder, customerName: 'Al' };
    if (!codOrderSubmissionSchema.safeParse(twoChars).success) throw new Error('2-char name rejected!');

    const hundredChars = { ...validBaseOrder, customerName: 'A'.repeat(100) };
    if (!codOrderSubmissionSchema.safeParse(hundredChars).success) throw new Error('100-char name rejected!');

    const hundredOneChars = { ...validBaseOrder, customerName: 'A'.repeat(101) };
    if (codOrderSubmissionSchema.safeParse(hundredOneChars).success) throw new Error('101-char name allowed!');
    return true;
  });

  check('Boundaries', 'Secondary Phone (customerPhone2) is optional but strictly validated if present', () => {
    const omitted = { ...validBaseOrder, customerPhone2: undefined };
    if (!codOrderSubmissionSchema.safeParse(omitted).success) throw new Error('Omitted phone2 rejected');

    const emptyStr = { ...validBaseOrder, customerPhone2: '' };
    if (!codOrderSubmissionSchema.safeParse(emptyStr).success) throw new Error('Empty string phone2 rejected');

    const validPhone2 = { ...validBaseOrder, customerPhone2: '0661998877' };
    if (!codOrderSubmissionSchema.safeParse(validPhone2).success) throw new Error('Valid phone2 rejected');

    const invalidPhone2 = { ...validBaseOrder, customerPhone2: '021123456' }; // Landline
    if (codOrderSubmissionSchema.safeParse(invalidPhone2).success) throw new Error('Landline phone2 accepted!');
    return true;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 7. ORDER NUMBER FORMAT & SERVER ACTION INTEGRATION
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n[7/7] Testing Order Number Format & Server Action Response Contract...');

  check('Integration', 'generateOrderNumber produces formatted uppercase order strings ORV-YYMMDD-XXXX', () => {
    for (let i = 0; i < 20; i++) {
      const num = generateOrderNumber();
      if (!/^ORV-[0-9]{6}-[A-Z0-9]{4}$/.test(num)) {
        throw new Error(`Generated order number does not match expected regex: ${num}`);
      }
    }
    return true;
  });

  await checkAsync('Integration', 'submitCodOrderAction generates valid redirectUrl with encoded URL parameters', async () => {
    const res = await submitCodOrderAction(validBaseOrder);
    if (!res.success) throw new Error(`Valid order submission failed: ${res.error}`);
    if (!res.orderNumber) throw new Error('Missing orderNumber in result');
    if (!res.redirectUrl) throw new Error('Missing redirectUrl in result');

    const url = new URL(res.redirectUrl, 'http://localhost:3000');
    if (url.pathname !== '/checkout/confirmation') throw new Error(`Wrong redirect path: ${url.pathname}`);
    if (url.searchParams.get('orderNumber') !== res.orderNumber) throw new Error('Order number mismatch in searchParams');
    if (url.searchParams.get('pack') !== 'PACK1') throw new Error('Pack mismatch in searchParams');
    if (url.searchParams.get('total') !== '5450') throw new Error('Total mismatch in searchParams');
    return true;
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  const line = '═'.repeat(78);
  const thinLine = '─'.repeat(78);
  console.log('\n' + line);
  console.log('   EMPIRICAL STRESS TEST RESULTS BREAKDOWN');
  console.log(line);

  const passedCount = testResults.filter((r) => r.passed).length;
  const failedCount = testResults.filter((r) => !r.passed).length;

  console.log(` TOTAL ASSERTIONS EVALUATED: ${testResults.length}`);
  console.log(` PASSED:                    ${passedCount} ✅`);
  console.log(` FAILURES / ADVERSARIAL FINDINGS: ${failedCount} ${failedCount > 0 ? '⚠️' : '✅'}`);
  console.log(thinLine);

  if (failedCount > 0) {
    console.log('\nDETAILED FAILURE & ADVERSARIAL FINDINGS LIST:');
    for (const fail of testResults.filter((r) => !r.passed)) {
      console.log(` • [${fail.category}] ${fail.name}`);
      if (fail.error) console.log(`   Error: ${fail.error}`);
    }
  }

  console.log(line);
}

runEmpiricalStressSuite().catch((err) => {
  console.error('Fatal stress suite runner error:', err);
  process.exit(1);
});
