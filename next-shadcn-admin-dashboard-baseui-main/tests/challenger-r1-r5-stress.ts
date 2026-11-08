/**
 * ORVA COD Storefront — Empirical Stress Testing Harness for R1 & R5
 * Author: Teamwork Challenger (EMPIRICAL CHALLENGER archetype)
 *
 * Requirements Tested:
 * - R1: Storefront Order Persistence & Fallback across Server Restarts
 * - R1: COD Order Submission Edge Cases (Arabic quotes, dashes, boundaries, phone variations)
 * - R1: Delivery API Integration (/api/delivery)
 * - R5: Telegram Settings Binding, -100 Normalization, HTML Escaping & Non-Blocking Resilience
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Load domain modules
import {
  codOrderSubmissionSchema,
  normalizeAlgerianPhone,
  isValidAlgerianPhone,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  CodOrderSubmission,
} from '../src/lib/types/checkout';

import {
  getStoredFallbackOrders,
  saveFallbackOrder,
  saveAllFallbackOrders,
  fallbackOrdersStore,
  generateOrderNumber,
  FallbackOrderRecord,
} from '../src/lib/orders-store';

import { submitCodOrderAction } from '../src/app/actions/checkout';
import { getAdminSettingsAction, saveSettingsAction } from '../src/app/actions/settings';
import { GET as deliveryGet, POST as deliveryPost } from '../src/app/api/delivery/route';
import { NextRequest } from 'next/server';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          passedTests++;
          console.log(`  [PASS] ${name}`);
        })
        .catch((err) => {
          failedTests++;
          failures.push(`${name}: ${err.message || err}`);
          console.error(`  [FAIL] ${name} -> ${err.message || err}`);
        });
    } else {
      passedTests++;
      console.log(`  [PASS] ${name}`);
    }
  } catch (err: any) {
    failedTests++;
    failures.push(`${name}: ${err.message || err}`);
    console.error(`  [FAIL] ${name} -> ${err.message || err}`);
  }
}

async function runAllTests() {
  console.log('\n================================================================');
  console.log('   EMPIRICAL CHALLENGER — R1 & R5 ADVERSARIAL STRESS HARNESS    ');
  console.log('================================================================\n');

  // Backup fallback-orders.json to ensure test isolation
  const cwd = process.cwd();
  const fallbackPath = path.join(cwd, 'src', 'data', 'fallback-orders.json');
  let originalFileContent = '[]';
  if (fs.existsSync(fallbackPath)) {
    originalFileContent = fs.readFileSync(fallbackPath, 'utf-8');
  }

  try {
    // ══════════════════════════════════════════════════════════════════════
    // SECTION 1: R1 Order Submission Edge Cases & Zod Pipeline Stress
    // ══════════════════════════════════════════════════════════════════════
    console.log('--- Section 1: Order Submission Edge Cases & Boundary Stress ---');

    await test('R1.1: Standard valid submission (PACK1, Alger, Domicile)', () => {
      const valid: CodOrderSubmission = {
        customerName: 'محمد بن يحيى',
        customerPhone: '0550123456',
        wilayaCode: 16,
        wilayaName: 'الجزائر',
        communeName: 'سيدي امحمد',
        deliveryType: 'DOMICILE',
        deliveryAddress: 'حي 1 ماي عمارة 4',
        packId: 'PACK1',
        productName: 'باك منفاخ تويوتا وطقم المفاتيح',
        productPrice: 4950,
        shippingFee: 500,
        totalPayable: 5450,
      };
      const result = codOrderSubmissionSchema.safeParse(valid);
      assert.equal(result.success, true);
    });

    await test('R1.2: Arabic name with double quotes, single quotes, and dashes', () => {
      const complexNames = [
        'أحمد "أبو علي" بن مصطفى',
        "كريم 'أبو بكر' الشريف",
        'محمد-الأمين بن-عمر الجزائري',
        'د. سيدي عبد الرحمن / بن زيان',
      ];
      for (const name of complexNames) {
        const sub: CodOrderSubmission = {
          customerName: name,
          customerPhone: '0661234567',
          wilayaCode: 16,
          wilayaName: 'الجزائر',
          communeName: 'الجزائر الوسطى',
          deliveryType: 'DOMICILE',
          deliveryAddress: 'شارع ديدوش مراد',
          packId: 'PACK1',
          productName: 'باك منفاخ تويوتا وطقم المفاتيح',
          productPrice: 4950,
          shippingFee: 500,
          totalPayable: 5450,
        };
        const result = codOrderSubmissionSchema.safeParse(sub);
        assert.equal(result.success, true, `Failed on name: ${name}`);
      }
    });

    await test('R1.3: Boundary length on customerName (min=2, max=100)', () => {
      // 2 characters (min boundary)
      const minName: CodOrderSubmission = {
        customerName: 'علي',
        customerPhone: '0770123456',
        wilayaCode: 16,
        wilayaName: 'الجزائر',
        communeName: 'القبة',
        deliveryType: 'DOMICILE',
        deliveryAddress: 'شارع القدس',
        packId: 'PACK1',
        productName: 'باك منفاخ تويوتا وطقم المفاتيح',
        productPrice: 4950,
        shippingFee: 500,
        totalPayable: 5450,
      };
      assert.equal(codOrderSubmissionSchema.safeParse(minName).success, true);

      // 100 characters (max boundary)
      const maxNameStr = 'أ'.repeat(100);
      const maxName: CodOrderSubmission = { ...minName, customerName: maxNameStr };
      assert.equal(codOrderSubmissionSchema.safeParse(maxName).success, true);

      // 1 character (should fail)
      const tooShort: CodOrderSubmission = { ...minName, customerName: 'أ' };
      assert.equal(codOrderSubmissionSchema.safeParse(tooShort).success, false);

      // 101 characters (should fail)
      const tooLong: CodOrderSubmission = { ...minName, customerName: 'أ'.repeat(101) };
      assert.equal(codOrderSubmissionSchema.safeParse(tooLong).success, false);
    });

    await test('R1.4: Algerian mobile phone normalizations and validations', () => {
      const validFormats = [
        '0550123456',
        '+213550123456',
        '00213661123456',
        '213770123456',
        '05 50 12 34 56',
        '05-50-12-34-56',
        '05.50.12.34.56',
      ];
      for (const phone of validFormats) {
        assert.equal(isValidAlgerianPhone(phone), true, `Failed validation for ${phone}`);
        const norm = normalizeAlgerianPhone(phone);
        assert.match(norm, /^(05|06|07)[0-9]{8}$/, `Normalized phone invalid: ${norm}`);
      }

      const invalidPhones = [
        '021123456',     // Landline
        '0555',          // Too short
        '0912345678',    // Invalid prefix
        '055012345678',  // Too long (12 digits)
        'abcdefghij',    // Non-numeric
      ];
      for (const phone of invalidPhones) {
        assert.equal(isValidAlgerianPhone(phone), false, `Should reject ${phone}`);
      }
    });

    await test('R1.5: Optional customerPhone2 handling (null, empty, valid, invalid)', () => {
      const base: CodOrderSubmission = {
        customerName: 'فاروق بوزيد',
        customerPhone: '0550123456',
        wilayaCode: 16,
        wilayaName: 'الجزائر',
        communeName: 'المرادية',
        deliveryType: 'DOMICILE',
        deliveryAddress: 'نهج الشهداء',
        packId: 'PACK1',
        productName: 'باك منفاخ تويوتا وطقم المفاتيح',
        productPrice: 4950,
        shippingFee: 500,
        totalPayable: 5450,
      };

      // undefined: allowed
      assert.equal(codOrderSubmissionSchema.safeParse(base).success, true);
      // empty string: allowed
      assert.equal(codOrderSubmissionSchema.safeParse({ ...base, customerPhone2: '' }).success, true);
      // whitespace string: allowed
      assert.equal(codOrderSubmissionSchema.safeParse({ ...base, customerPhone2: '   ' }).success, true);
      // valid phone: allowed
      assert.equal(codOrderSubmissionSchema.safeParse({ ...base, customerPhone2: '0661998877' }).success, true);
      // invalid phone: rejected
      assert.equal(codOrderSubmissionSchema.safeParse({ ...base, customerPhone2: '0123456' }).success, false);
    });

    await test('R1.6: Stop-Desk rules & Wilayas 49 to 58 restriction', () => {
      // Wilaya 16 (Alger) allows Stop-Desk (Zone 2: 400 DZD)
      const stopDeskAlger: CodOrderSubmission = {
        customerName: 'مراد قاسي',
        customerPhone: '0550123456',
        wilayaCode: 16,
        wilayaName: 'الجزائر',
        communeName: 'باب الزوار',
        deliveryType: 'STOP_DESK',
        deliveryAddress: '', // Stop desk allows empty or omitted
        packId: 'PACK1',
        productName: 'باك منفاخ تويوتا وطقم المفاتيح',
        productPrice: 4950,
        shippingFee: 400,
        totalPayable: 5350,
      };
      assert.equal(codOrderSubmissionSchema.safeParse(stopDeskAlger).success, true);

      // Wilaya 50 (El Meniaa) does NOT allow Stop-Desk
      assert.equal(isStopDeskAllowed(50), false);
      const stopDeskElMeniaa: CodOrderSubmission = {
        ...stopDeskAlger,
        wilayaCode: 50,
        wilayaName: 'المنيعة',
        communeName: 'المنيعة',
      };
      const res50 = codOrderSubmissionSchema.safeParse(stopDeskElMeniaa);
      assert.equal(res50.success, false);
      assert.match(res50.error!.issues[0].message, /Stop-Desk/);

      // Domicile in Wilaya 16 requires deliveryAddress >= 3 chars
      const domicileEmptyAddress: CodOrderSubmission = {
        customerName: 'سعيد بن عمر',
        customerPhone: '0550123456',
        wilayaCode: 16,
        wilayaName: 'الجزائر',
        communeName: 'بئر مراد رايس',
        deliveryType: 'DOMICILE',
        deliveryAddress: '  ',
        packId: 'PACK1',
        productName: 'باك منفاخ تويوتا وطقم المفاتيح',
        productPrice: 4950,
        shippingFee: 500,
        totalPayable: 5450,
      };
      const resDomicile = codOrderSubmissionSchema.safeParse(domicileEmptyAddress);
      assert.equal(resDomicile.success, false);
      assert.match(resDomicile.error!.issues[0].message, /Adresse de livraison requise/);
    });

    await test('R1.7: Canonical Pack pricing and arithmetic integrity verification', () => {
      // Pack 1: 4950
      // Pack 2: 12950 or 13390
      // Pack 3: 15950
      const baseSub: CodOrderSubmission = {
        customerName: 'جمال الدين',
        customerPhone: '0550123456',
        wilayaCode: 7, // Biskra (Origin Hub, Zone 1: Domicile 450, Stop-Desk 350)
        wilayaName: 'بسكرة',
        communeName: 'سيدي عقبة',
        deliveryType: 'DOMICILE',
        deliveryAddress: 'وسط المدينة',
        packId: 'PACK2',
        productName: 'باك ماكينة كراون CROWN 20V الأصلية',
        productPrice: 12950,
        shippingFee: 450,
        totalPayable: 13400,
      };
      assert.equal(codOrderSubmissionSchema.safeParse(baseSub).success, true);

      // Pack 3 verification
      const pack3Sub: CodOrderSubmission = {
        ...baseSub,
        packId: 'PACK3',
        productName: 'باك الأشغال الشاقة CROWN و Starcle Pro',
        productPrice: 15950,
        totalPayable: 16400,
      };
      assert.equal(codOrderSubmissionSchema.safeParse(pack3Sub).success, true);

      // Tampered pack price
      const tamperedPrice: CodOrderSubmission = {
        ...baseSub,
        productPrice: 9999,
        totalPayable: 9999 + 450,
      };
      const resTampered = codOrderSubmissionSchema.safeParse(tamperedPrice);
      assert.equal(resTampered.success, false);
      assert.match(resTampered.error!.issues[0].message, /Prix invalide/);

      // Tampered arithmetic (totalPayable != productPrice + shippingFee)
      const tamperedTotal: CodOrderSubmission = {
        ...baseSub,
        totalPayable: 1000,
      };
      const resTotal = codOrderSubmissionSchema.safeParse(tamperedTotal);
      assert.equal(resTotal.success, false);
      assert.match(resTotal.error!.issues[0].message, /égal au sous-total/);

      // Tampered shipping fee (expected 450 for Biskra domicile, submitted 100)
      const tamperedShipping: CodOrderSubmission = {
        ...baseSub,
        shippingFee: 100,
        totalPayable: 12950 + 100,
      };
      const resShipping = codOrderSubmissionSchema.safeParse(tamperedShipping);
      assert.equal(resShipping.success, false);
      assert.match(resShipping.error!.issues[0].message, /Frais de livraison incorrects/);
    });

    await test('R1.8: Honeypot anti-bot trap', () => {
      const botSubmission: CodOrderSubmission = {
        customerName: 'Spam Bot',
        customerPhone: '0550123456',
        wilayaCode: 16,
        wilayaName: 'الجزائر',
        communeName: 'الجزائر',
        deliveryType: 'DOMICILE',
        deliveryAddress: 'Rue Test',
        packId: 'PACK1',
        productName: 'باك منفاخ تويوتا وطقم المفاتيح',
        productPrice: 4950,
        shippingFee: 500,
        totalPayable: 5450,
        honeypot: 'http://spam-link.com',
      };
      const resBot = codOrderSubmissionSchema.safeParse(botSubmission);
      assert.equal(resBot.success, false);
      assert.match(resBot.error!.issues[0].message, /honeypot trap/);
    });

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 2: R1 Fallback Order Persistence & Simulated Server Restarts
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n--- Section 2: Fallback Persistence & Restart Simulation ---');

    await test('R1.9: Write order to fallback store and verify file serialization', () => {
      const testOrder: FallbackOrderRecord = {
        id: 'stress-test-order-01',
        orderNumber: 'ORV-STRESS-001',
        customerName: 'فوزي بوعلام',
        customerPhone: '0550112233',
        customerPhone2: null,
        wilayaCode: 16,
        wilayaName: 'الجزائر',
        communeName: 'الجزائر الوسطى',
        deliveryType: 'DOMICILE',
        deliveryAddress: 'شارع حسيبة بن بوعلي',
        packId: 'PACK1',
        productName: 'باك منفاخ تويوتا وطقم المفاتيح',
        productPrice: 4950,
        shippingFee: 500,
        totalPayable: 5450,
        status: 'PENDING',
        originHub: 'BISKRA_07',
        createdAt: new Date().toISOString(),
      };

      saveFallbackOrder(testOrder);

      // Verify file exists and contains the serialized order
      assert.equal(fs.existsSync(fallbackPath), true);
      const rawDisk = fs.readFileSync(fallbackPath, 'utf-8');
      const parsedDisk: FallbackOrderRecord[] = JSON.parse(rawDisk);
      assert.equal(Array.isArray(parsedDisk), true);
      const found = parsedDisk.find((o) => o.orderNumber === 'ORV-STRESS-001');
      assert.ok(found, 'Order not serialized to disk');
      assert.equal(found.customerName, 'فوزي بوعلام');
      assert.equal(found.totalPayable, 5450);
    });

    await test('R1.10: Server restart simulation (clearing globalThis and re-reading disk)', () => {
      // 1. Wipe in-memory storage to simulate process termination / new worker thread
      const globalForOrders = globalThis as unknown as { __fallbackOrdersStore?: FallbackOrderRecord[] };
      globalForOrders.__fallbackOrdersStore = undefined;
      assert.equal(globalForOrders.__fallbackOrdersStore, undefined);

      // 2. Call getStoredFallbackOrders() and verify re-hydration from physical disk
      const rehydrated = getStoredFallbackOrders();
      assert.ok(Array.isArray(rehydrated));
      const order = rehydrated.find((o) => o.orderNumber === 'ORV-STRESS-001');
      assert.ok(order, 'Failed to rehydrate order from disk on restart');
      assert.equal(order.customerPhone, '0550112233');
      assert.equal(order.productName, 'باك منفاخ تويوتا وطقم المفاتيح');

      // 3. Confirm that globalThis is repopulated
      assert.equal(globalForOrders.__fallbackOrdersStore, rehydrated);
    });

    await test('R1.11: Fallback orders proxy operations (push, unshift, index, mutation)', () => {
      const initialLen = fallbackOrdersStore.length;
      assert.ok(typeof initialLen === 'number');

      // Test push via proxy
      const orderPush: FallbackOrderRecord = {
        id: 'proxy-push-01',
        orderNumber: 'ORV-PROXY-PUSH',
        customerName: 'سفيان لواتي',
        customerPhone: '0661223344',
        customerPhone2: null,
        wilayaCode: 31,
        wilayaName: 'وهران',
        communeName: 'السانية',
        deliveryType: 'DOMICILE',
        deliveryAddress: 'حي الياسمين',
        packId: 'PACK2',
        productName: 'باك ماكينة كراون CROWN 20V الأصلية',
        productPrice: 12950,
        shippingFee: 500,
        totalPayable: 13450,
        status: 'PENDING',
        originHub: 'BISKRA_07',
        createdAt: new Date().toISOString(),
      };
      fallbackOrdersStore.push(orderPush);
      assert.equal(fallbackOrdersStore.length, initialLen + 1);

      // Test unshift via proxy
      const orderUnshift: FallbackOrderRecord = {
        id: 'proxy-unshift-01',
        orderNumber: 'ORV-PROXY-UNSHIFT',
        customerName: 'كريم مرواني',
        customerPhone: '0770334455',
        customerPhone2: null,
        wilayaCode: 25,
        wilayaName: 'قسنطينة',
        communeName: 'الخروب',
        deliveryType: 'STOP_DESK',
        deliveryAddress: 'Bureau Stop-Desk',
        packId: 'PACK3',
        productName: 'باك الأشغال الشاقة CROWN و Starcle Pro',
        productPrice: 15950,
        shippingFee: 400,
        totalPayable: 16350,
        status: 'PENDING',
        originHub: 'BISKRA_07',
        createdAt: new Date().toISOString(),
      };
      fallbackOrdersStore.unshift(orderUnshift);
      assert.equal(fallbackOrdersStore.length, initialLen + 2);

      // Test find and filter
      const foundPush = fallbackOrdersStore.find((o) => o.orderNumber === 'ORV-PROXY-PUSH');
      assert.ok(foundPush);
      assert.equal(foundPush.customerName, 'سفيان لواتي');

      // Test indexing
      assert.ok(fallbackOrdersStore[0]);

      // Test in-place update by orderNumber prevents duplicate creation
      saveFallbackOrder({
        ...orderPush,
        status: 'CONFIRMED',
        remarks: [{ action: 'STATUS_UPDATED', by: 'agent' }],
      });
      const allOrders = getStoredFallbackOrders();
      const pushMatches = allOrders.filter((o) => o.orderNumber === 'ORV-PROXY-PUSH');
      assert.equal(pushMatches.length, 1, 'In-place update created duplicate');
      assert.equal(pushMatches[0].status, 'CONFIRMED');
    });

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 3: R1 Delivery API Integration (/api/delivery)
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n--- Section 3: Delivery API Route Integration ---');

    await test('R1.12: GET /api/delivery?action=get_all_orders returns persistent fallback orders with Arabic descriptions', async () => {
      const req = new NextRequest('http://localhost:3000/api/delivery?action=get_all_orders');
      const res = await deliveryGet(req);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data));
      assert.ok(json.total >= 3);

      // Verify that our test order ORV-PROXY-PUSH is present with full details
      const item = json.data.find((o: any) => o.orderId === 'ORV-PROXY-PUSH');
      assert.ok(item, 'Order ORV-PROXY-PUSH not returned in delivery API');
      assert.equal(item.fullName, 'سفيان لواتي');
      assert.equal(item.productName, 'باك ماكينة كراون CROWN 20V الأصلية');
      assert.match(item.wilaya, /وهران/);
      assert.equal(item.priceNum, 12950);
    });

    await test('R1.13: POST /api/delivery?action=update_status updates fallback order on disk and in memory', async () => {
      const updateReq = new NextRequest('http://localhost:3000/api/delivery?action=update_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: 'ORV-PROXY-UNSHIFT',
          status: 'delivered',
          actor: 'challenger_test',
        }),
      });

      const res = await deliveryPost(updateReq);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.status, 'delivered');

      // Verify persistence in getStoredFallbackOrders()
      const stored = getStoredFallbackOrders();
      const updated = stored.find((o) => o.orderNumber === 'ORV-PROXY-UNSHIFT');
      assert.ok(updated);
      assert.equal(updated.status, 'DELIVERED');
    });

    await test('R1.14: GET /api/delivery with unknown action returns 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/delivery?action=unknown_test');
      const res = await deliveryGet(req);
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.success, false);
      assert.equal(json.error, 'Unknown action');
    });

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 4: R5 Telegram Alerts Normalization, HTML & Error Resilience
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n--- Section 4: Telegram Alerts Stress & Resilience ---');

    await test('R5.1: Telegram channel ID normalization logic stress test', () => {
      // Logic from checkout.ts:
      // if (/^\d{10,14}$/.test(chatId)) chatId = `-100${chatId}`;
      const normalizeChatId = (raw: string) => {
        let chatId = (raw || '').trim();
        if (/^\d{10,14}$/.test(chatId)) {
          chatId = `-100${chatId}`;
        }
        return chatId;
      };

      // 10 digits (common Telegram channel ID)
      assert.equal(normalizeChatId('3965560132'), '-1003965560132');
      // 14 digits (max channel ID range)
      assert.equal(normalizeChatId('12345678901234'), '-10012345678901234');
      // Already prefixed with -100 (should remain intact, NOT become -100-100...)
      assert.equal(normalizeChatId('-1003965560132'), '-1003965560132');
      // 9 digits (personal user chat ID, e.g. 987654321) must NOT be prefixed
      assert.equal(normalizeChatId('987654321'), '987654321');
      // 8 digits user ID
      assert.equal(normalizeChatId('12345678'), '12345678');
      // Channel username format
      assert.equal(normalizeChatId('@orvastore_orders'), '@orvastore_orders');
      // Trimming surrounding whitespace
      assert.equal(normalizeChatId('   3965560132   '), '-1003965560132');
      assert.equal(normalizeChatId('   -1003965560132   '), '-1003965560132');
    });

    await test('R5.2: Safe HTML escaping against malicious & entity injection', () => {
      const escapeHtml = (text: string) =>
        String(text || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

      const adversarialInputs = [
        {
          input: '<b>bold</b>',
          expected: '&lt;b&gt;bold&lt;/b&gt;',
        },
        {
          input: 'Tom & Jerry',
          expected: 'Tom &amp; Jerry',
        },
        {
          input: '<script>alert("xss")</script>',
          expected: '&lt;script&gt;alert("xss")&lt;/script&gt;',
        },
        {
          input: 'باك منفاخ <تويوتا> & مفاتيح > أصلية',
          expected: 'باك منفاخ &lt;تويوتا&gt; &amp; مفاتيح &gt; أصلية',
        },
        {
          input: null as any,
          expected: '',
        },
        {
          input: undefined as any,
          expected: '',
        },
      ];

      for (const item of adversarialInputs) {
        assert.equal(escapeHtml(item.input), item.expected);
      }
    });

    await test('R5.3: Telegram non-blocking resilience: HTTP 400 Bad Request simulation', async () => {
      // Mock global fetch to simulate Telegram API returning 400 Bad Request
      const originalFetch = globalThis.fetch;
      try {
        (globalThis as any).fetch = async (url: string, init: any) => {
          if (typeof url === 'string' && url.includes('api.telegram.org')) {
            return {
              ok: false,
              status: 400,
              statusText: 'Bad Request',
              json: async () => ({
                ok: false,
                error_code: 400,
                description: 'Bad Request: chat not found',
              }),
            };
          }
          return originalFetch(url, init);
        };

        const submission: CodOrderSubmission = {
          customerName: 'فارس الميلي',
          customerPhone: '0550998877',
          wilayaCode: 16,
          wilayaName: 'الجزائر',
          communeName: 'الجزائر',
          deliveryType: 'DOMICILE',
          deliveryAddress: 'شارع فلسطين',
          packId: 'PACK1',
          productName: 'باك منفاخ تويوتا وطقم المفاتيح',
          productPrice: 4950,
          shippingFee: 500,
          totalPayable: 5450,
        };

        // Execution of submitCodOrderAction must NOT throw or return error
        const result = await submitCodOrderAction(submission);
        assert.equal(result.success, true);
        assert.ok(result.orderNumber);
        assert.match(result.redirectUrl!, /\/checkout\/confirmation/);

        // Verify order persisted to fallback store despite Telegram failure
        const stored = getStoredFallbackOrders();
        const found = stored.find((o) => o.orderNumber === result.orderNumber);
        assert.ok(found, 'Order not persisted when Telegram returned 400');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    await test('R5.4: Telegram non-blocking resilience: HTTP 401 Unauthorized (invalid bot token)', async () => {
      const originalFetch = globalThis.fetch;
      try {
        (globalThis as any).fetch = async (url: string, init: any) => {
          if (typeof url === 'string' && url.includes('api.telegram.org')) {
            return {
              ok: false,
              status: 401,
              statusText: 'Unauthorized',
              json: async () => ({
                ok: false,
                error_code: 401,
                description: 'Unauthorized: invalid bot token',
              }),
            };
          }
          return originalFetch(url, init);
        };

        const submission: CodOrderSubmission = {
          customerName: 'طارق زيان',
          customerPhone: '0661998877',
          wilayaCode: 16,
          wilayaName: 'الجزائر',
          communeName: 'الجزائر',
          deliveryType: 'DOMICILE',
          deliveryAddress: 'شارع اول نوفمبر',
          packId: 'PACK1',
          productName: 'باك منفاخ تويوتا وطقم المفاتيح',
          productPrice: 4950,
          shippingFee: 500,
          totalPayable: 5450,
        };

        const result = await submitCodOrderAction(submission);
        assert.equal(result.success, true);
        assert.ok(result.orderNumber);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    await test('R5.5: Telegram non-blocking resilience: Network Timeout (AbortSignal simulation)', async () => {
      const originalFetch = globalThis.fetch;
      try {
        (globalThis as any).fetch = async (url: string, init: any) => {
          if (typeof url === 'string' && url.includes('api.telegram.org')) {
            const timeoutError = new Error('The operation was aborted due to timeout');
            timeoutError.name = 'TimeoutError';
            throw timeoutError;
          }
          return originalFetch(url, init);
        };

        const submission: CodOrderSubmission = {
          customerName: 'نبيل حشاني',
          customerPhone: '0770998877',
          wilayaCode: 16,
          wilayaName: 'الجزائر',
          communeName: 'الأبيار',
          deliveryType: 'DOMICILE',
          deliveryAddress: 'نهج العقيد لطفي',
          packId: 'PACK1',
          productName: 'باك منفاخ تويوتا وطقم المفاتيح',
          productPrice: 4950,
          shippingFee: 500,
          totalPayable: 5450,
        };

        const result = await submitCodOrderAction(submission);
        assert.equal(result.success, true);
        assert.ok(result.orderNumber);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    await test('R5.6: Telegram non-blocking resilience: Network connection failure (ECONNREFUSED)', async () => {
      const originalFetch = globalThis.fetch;
      try {
        (globalThis as any).fetch = async (url: string, init: any) => {
          if (typeof url === 'string' && url.includes('api.telegram.org')) {
            throw new Error('connect ECONNREFUSED 149.154.167.220:443');
          }
          return originalFetch(url, init);
        };

        const submission: CodOrderSubmission = {
          customerName: 'حمزة دحماني',
          customerPhone: '0550334455',
          wilayaCode: 16,
          wilayaName: 'الجزائر',
          communeName: 'الجزائر',
          deliveryType: 'DOMICILE',
          deliveryAddress: 'شارع العربي بن مهيدي',
          packId: 'PACK1',
          productName: 'باك منفاخ تويوتا وطقم المفاتيح',
          productPrice: 4950,
          shippingFee: 500,
          totalPayable: 5450,
        };

        const result = await submitCodOrderAction(submission);
        assert.equal(result.success, true);
        assert.ok(result.orderNumber);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    await test('R5.7: Telegram alert disabled flag (enabled = false)', async () => {
      let fetchCalled = false;
      const originalFetch = globalThis.fetch;
      try {
        (globalThis as any).fetch = async (url: string, init: any) => {
          if (typeof url === 'string' && url.includes('api.telegram.org')) {
            fetchCalled = true;
          }
          return originalFetch(url, init);
        };

        // Temporarily disable telegram in settings
        await saveSettingsAction({
          telegram: {
            botToken: '123456789:ABCDEF_mock_token_for_test',
            chatId: '3965560132',
            enabled: false,
          },
        });

        const submission: CodOrderSubmission = {
          customerName: 'ياسين بلخير',
          customerPhone: '0550556677',
          wilayaCode: 16,
          wilayaName: 'الجزائر',
          communeName: 'الجزائر',
          deliveryType: 'DOMICILE',
          deliveryAddress: 'حي البدر',
          packId: 'PACK1',
          productName: 'باك منفاخ تويوتا وطقم المفاتيح',
          productPrice: 4950,
          shippingFee: 500,
          totalPayable: 5450,
        };

        const result = await submitCodOrderAction(submission);
        assert.equal(result.success, true);
        // Wait small interval for background promises
        await new Promise((r) => setTimeout(r, 50));
        assert.equal(fetchCalled, false, 'Telegram API was invoked when enabled was false');
      } finally {
        globalThis.fetch = originalFetch;
        // Re-enable telegram
        await saveSettingsAction({
          telegram: {
            enabled: true,
          },
        });
      }
    });

    await test('R5.8: Telegram alert successful dispatch payload verification', async () => {
      let capturedPayload: any = null;
      let capturedUrl: string = '';
      const originalFetch = globalThis.fetch;

      try {
        (globalThis as any).fetch = async (url: string, init: any) => {
          if (typeof url === 'string' && url.includes('api.telegram.org')) {
            capturedUrl = url;
            capturedPayload = JSON.parse(init.body);
            return {
              ok: true,
              status: 200,
              json: async () => ({
                ok: true,
                result: { message_id: 12345 },
              }),
            };
          }
          return originalFetch(url, init);
        };

        // Configure test settings
        await saveSettingsAction({
          telegram: {
            botToken: '987654321:XYZ_test_bot_token',
            chatId: '3965560132', // raw 10 digits
            enabled: true,
          },
        });

        const submission: CodOrderSubmission = {
          customerName: 'عبد القادر "الزعيم" & الإخوة',
          customerPhone: '0550123456',
          wilayaCode: 16,
          wilayaName: 'الجزائر',
          communeName: 'الجزائر الوسطى',
          deliveryType: 'DOMICILE',
          deliveryAddress: 'نهج طرابلس',
          packId: 'PACK1',
          productName: 'باك منفاخ تويوتا وطقم المفاتيح <الأصلي>',
          productPrice: 4950,
          shippingFee: 500,
          totalPayable: 5450,
        };

        const result = await submitCodOrderAction(submission);
        assert.equal(result.success, true);

        // Wait for background settled promises (getAdminSettingsAction resolves in background)
        const start = Date.now();
        while (!capturedPayload && Date.now() - start < 2000) {
          await new Promise((r) => setTimeout(r, 50));
        }

        assert.ok(capturedPayload, 'Telegram dispatch was not called');
        assert.equal(capturedUrl, 'https://api.telegram.org/bot987654321:XYZ_test_bot_token/sendMessage');
        // Check -100 normalization
        assert.equal(capturedPayload.chat_id, '-1003965560132');
        assert.equal(capturedPayload.parse_mode, 'HTML');
        // Check HTML escaping in payload text
        assert.match(capturedPayload.text, /عبد القادر &quot;الزعيم&quot; &amp; الإخوة|عبد القادر &quot;الزعيم&quot;|عبد القادر "الزعيم" &amp; الإخوة/);
        assert.match(capturedPayload.text, /باك منفاخ تويوتا وطقم المفاتيح &lt;الأصلي&gt;/);
        assert.doesNotMatch(capturedPayload.text, /<الأصلي>/, 'Raw unescaped HTML tag found in payload text');
        assert.match(capturedPayload.text, /🔔 <b>طلب جديد — متجر أورفا ORVA COD<\/b>/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 5: R1 Route Redirection & Architecture Invariants
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n--- Section 5: Route Redirection & Architectural Contracts ---');

    await test('R1.15: /checkout route file exists and redirects to /pack1', () => {
      const checkoutPagePath = path.join(
        cwd,
        'src',
        'app',
        '(storefront)',
        'checkout',
        'page.tsx'
      );
      assert.equal(fs.existsSync(checkoutPagePath), true);
      const code = fs.readFileSync(checkoutPagePath, 'utf-8');
      assert.match(code, /redirect\(['"]\/pack1['"]\)/);
    });

    await test('R1.16: Embedded COD form dispatches BroadcastChannel and orva:orders-updated event', () => {
      const formPath = path.join(
        cwd,
        'src',
        'components',
        'storefront',
        'checkout',
        'embedded-cod-order-form.tsx'
      );
      assert.equal(fs.existsSync(formPath), true);
      const code = fs.readFileSync(formPath, 'utf-8');
      assert.match(code, /new BroadcastChannel\(["']orva_orders_channel["']\)/);
      assert.match(code, /window\.dispatchEvent\(new CustomEvent\(["']orva:orders-updated["']\)\)/);
    });

    await test('R1.17: Admin recent-orders listens to BroadcastChannel and orva:orders-updated', () => {
      const recentOrdersPath = path.join(
        cwd,
        'src',
        'app',
        '(main)',
        'dashboard',
        'ecommerce',
        '_components',
        'recent-orders.tsx'
      );
      assert.equal(fs.existsSync(recentOrdersPath), true);
      const code = fs.readFileSync(recentOrdersPath, 'utf-8');
      assert.match(code, /addEventListener\(["']orva:orders-updated["']/);
      assert.match(code, /new BroadcastChannel\(["']orva_orders_channel["']\)/);
    });

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 6: High-Stress Adversarial Concurrency & Edge Cases
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n--- Section 6: High-Stress Concurrency & Advanced Edge Cases ---');

    await test('R1.18: Bulk status update via /api/delivery?action=bulk_update_status', async () => {
      // Create two test orders
      const orderA: FallbackOrderRecord = {
        id: 'bulk-test-a',
        orderNumber: 'ORV-BULK-A',
        customerName: 'كمال بلعيد',
        customerPhone: '0550111111',
        customerPhone2: null,
        wilayaCode: 16,
        wilayaName: 'الجزائر',
        communeName: 'الجزائر',
        deliveryType: 'DOMICILE',
        deliveryAddress: 'Rue A',
        packId: 'PACK1',
        productName: 'باك منفاخ تويوتا وطقم المفاتيح',
        productPrice: 4950,
        shippingFee: 500,
        totalPayable: 5450,
        status: 'PENDING',
        originHub: 'BISKRA_07',
        createdAt: new Date().toISOString(),
      };
      const orderB: FallbackOrderRecord = {
        ...orderA,
        id: 'bulk-test-b',
        orderNumber: 'ORV-BULK-B',
        customerName: 'مراد بلعيد',
      };
      saveFallbackOrder(orderA);
      saveFallbackOrder(orderB);

      const bulkReq = new NextRequest('http://localhost:3000/api/delivery?action=bulk_update_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderIds: ['ORV-BULK-A', 'ORV-BULK-B'],
          status: 'SHIPPED',
          actor: 'challenger_test',
        }),
      });

      const res = await deliveryPost(bulkReq);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.updatedCount, 2);

      const stored = getStoredFallbackOrders();
      const updatedA = stored.find((o) => o.orderNumber === 'ORV-BULK-A');
      const updatedB = stored.find((o) => o.orderNumber === 'ORV-BULK-B');
      assert.equal(updatedA?.status, 'SHIPPED');
      assert.equal(updatedB?.status, 'SHIPPED');
    });

    await test('R1.19: Arabic diacritics / Tashkeel in customer name and product', () => {
      const subWithTashkeel: CodOrderSubmission = {
        customerName: 'مُحَمَّدٌ عَبْدُ الرَّحْمَٰنِ',
        customerPhone: '0550887766',
        wilayaCode: 16,
        wilayaName: 'الجزائر',
        communeName: 'سيدي امحمد',
        deliveryType: 'DOMICILE',
        deliveryAddress: 'شَارِعُ دِيدُوش مُرَاد رَقْمُ 12',
        packId: 'PACK1',
        productName: 'بَاك مِنْفَاخ تُويُوتَا وَطَقْمُ المَفَاتِيح',
        productPrice: 4950,
        shippingFee: 500,
        totalPayable: 5450,
      };
      const result = codOrderSubmissionSchema.safeParse(subWithTashkeel);
      assert.equal(result.success, true);
    });

    await test('R1.20: Concurrency stress: 10 parallel order submissions via Promise.all', async () => {
      const concurrentSubs: CodOrderSubmission[] = Array.from({ length: 10 }, (_, i) => ({
        customerName: `زبون متزامن رقم ${i + 1}`,
        customerPhone: `0550${String(i).padStart(6, '0')}`,
        wilayaCode: 16,
        wilayaName: 'الجزائر',
        communeName: 'الجزائر',
        deliveryType: 'DOMICILE',
        deliveryAddress: `عنوان رقم ${i + 1}`,
        packId: 'PACK1',
        productName: 'باك منفاخ تويوتا وطقم المفاتيح',
        productPrice: 4950,
        shippingFee: 500,
        totalPayable: 5450,
      }));

      const results = await Promise.all(
        concurrentSubs.map((sub) => submitCodOrderAction(sub))
      );

      for (let i = 0; i < results.length; i++) {
        assert.equal(results[i].success, true, `Concurrent submission ${i} failed`);
        assert.ok(results[i].orderNumber);
      }

      // Verify that all generated order numbers are unique
      const orderNums = results.map((r) => r.orderNumber);
      const uniqueOrderNums = new Set(orderNums);
      assert.equal(uniqueOrderNums.size, 10, 'Collision detected among concurrent order numbers');
    });

    await test('R1.21: Order number generator entropy & formatting (100 samples)', () => {
      const generated = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const num = generateOrderNumber();
        assert.match(num, /^ORV-\d{6}-[0-9A-Z]{4}$/, `Malformed order number: ${num}`);
        assert.equal(generated.has(num), false, `Order number collision: ${num}`);
        generated.add(num);
      }
    });

    await test('R5.9: Telegram resilience when API returns HTML 502 Bad Gateway page', async () => {
      const originalFetch = globalThis.fetch;
      try {
        (globalThis as any).fetch = async (url: string, init: any) => {
          if (typeof url === 'string' && url.includes('api.telegram.org')) {
            return {
              ok: false,
              status: 502,
              statusText: 'Bad Gateway',
              json: async () => {
                throw new Error('Unexpected token < in JSON at position 0');
              },
            };
          }
          return originalFetch(url, init);
        };

        const submission: CodOrderSubmission = {
          customerName: 'فايز عبد الحق',
          customerPhone: '0550667788',
          wilayaCode: 16,
          wilayaName: 'الجزائر',
          communeName: 'الجزائر',
          deliveryType: 'DOMICILE',
          deliveryAddress: 'نهج العربي التبسي',
          packId: 'PACK1',
          productName: 'باك منفاخ تويوتا وطقم المفاتيح',
          productPrice: 4950,
          shippingFee: 500,
          totalPayable: 5450,
        };

        const result = await submitCodOrderAction(submission);
        assert.equal(result.success, true);
        assert.ok(result.orderNumber);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

  } finally {
    // Restore original fallback-orders.json content
    try {
      fs.writeFileSync(fallbackPath, originalFileContent, 'utf-8');
      console.log('\n[Clean Up]: Restored src/data/fallback-orders.json to pre-test state.');
    } catch (cleanErr) {
      console.warn('[Clean Up Warning]:', cleanErr);
    }
  }

  console.log('\n================================================================');
  console.log(`   EXECUTION SUMMARY: ${passedTests} / ${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    console.error('FAILURES:');
    for (const f of failures) {
      console.error(`- ${f}`);
    }
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test Suite Unhandled Rejection:', err);
  process.exit(1);
});
