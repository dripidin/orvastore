import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { submitCodOrderAction } from '../../src/app/actions/checkout';
import {
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from '../../src/lib/supabase/server';
import { CodOrderSubmission } from '../../src/lib/types/checkout';

function createLocalPersistenceDbClient(db: DatabaseSync, state: { failAll?: boolean }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      idempotency_key TEXT UNIQUE,
      payload_hash TEXT,
      store_id TEXT,
      full_name TEXT,
      phone TEXT,
      wilaya TEXT,
      commune TEXT,
      delivery_type TEXT,
      price_num REAL,
      status TEXT,
      created_at TEXT
    );
  `);

  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(col: string, val: string) {
              return {
                async maybeSingle() {
                  if (state.failAll) {
                    return { data: null, error: { code: 'PGRST500', message: 'Database connection refused' } };
                  }
                  const row = db
                    .prepare(`SELECT id, order_id, payload_hash, created_at FROM orders WHERE ${col} = ? LIMIT 1`)
                    .get(val) as any;
                  return { data: row || null, error: null };
                },
              };
            },
          };
        },
        insert(payload: Record<string, any>) {
          return {
            select(_cols: string) {
              return {
                async single() {
                  if (state.failAll) {
                    return { data: null, error: { code: 'PGRST500', message: 'Database connection refused' } };
                  }
                  const id = crypto.randomUUID();
                  db.prepare(
                    `INSERT INTO orders (id, order_id, idempotency_key, payload_hash, store_id, full_name, phone, wilaya, commune, delivery_type, price_num, status, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                  ).run(
                    id,
                    payload.order_id,
                    payload.idempotency_key ?? null,
                    payload.payload_hash ?? null,
                    payload.store_id ?? 'orvastore',
                    payload.full_name ?? '',
                    payload.phone ?? '',
                    payload.wilaya ?? '',
                    payload.commune ?? '',
                    payload.delivery_type ?? '',
                    payload.price_num ?? 0,
                    payload.status ?? 'pending',
                    new Date().toISOString()
                  );
                  return { data: { id, order_id: payload.order_id }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

async function runCheckoutTests() {
  console.log('================================================================================');
  console.log('   ORVA STORE — STEP 2 CHECKOUT RELIABILITY & PERSISTENCE TEST SUITE');
  console.log('   Timestamp: ' + new Date().toISOString());
  console.log('================================================================================\n');

  const originalFetch = globalThis.fetch;
  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  process.env.TELEGRAM_CHAT_ID = 'test-chat-id';
  (process.env as any).NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local-sqlite-persistence.supabase.co';

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;

  const db = new DatabaseSync(':memory:');
  const state = { failAll: false };
  __testSetSupabaseServerInstance(createLocalPersistenceDbClient(db, state));

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] Test ${totalTests.toString().padStart(2, '0')}: ${testName}`);
    } else {
      console.error(`  [FAIL] Test ${totalTests.toString().padStart(2, '0')}: ${testName}`);
      throw new Error(`Checkout Assertion Failed: ${testName}`);
    }
  }

  try {
    const validPayload: CodOrderSubmission = {
      customerName: 'Aymen Mansouri',
      customerPhone: '0551234567',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Hydra',
      deliveryType: 'DOMICILE',
      deliveryAddress: 'Cité 500 Logements, Bâtiment C, N° 12',
      packId: 'PACK1',
      productName: 'عرض 4 في 1 المتكامل (PACK 4EN1)',
      productPrice: 4950,
      shippingFee: 500,
      totalPayable: 5450,
      idempotencyKey: 'test-idemp-domicile-key-12345678',
    };

    // ── TEST 1: Zod Server-Side Schema Validation ─────────────────────────────
    console.log('── GROUP 1: Zod Validation & Input Integrity');

    const shortNameRes = await submitCodOrderAction({ ...validPayload, customerName: 'A' });
    assert(!shortNameRes.success, 'Rejects customer name shorter than 2 characters');
    assert(Boolean(shortNameRes.error), 'Provides descriptive validation error for short name');

    const invalidPhoneRes = await submitCodOrderAction({ ...validPayload, customerPhone: '021123456' });
    assert(!invalidPhoneRes.success, 'Rejects non-mobile landline phone number (021)');

    const foreignPhoneRes = await submitCodOrderAction({ ...validPayload, customerPhone: '+33612345678' });
    assert(!foreignPhoneRes.success, 'Rejects international non-Algerian phone number');

    const missingAddrRes = await submitCodOrderAction({ ...validPayload, deliveryType: 'DOMICILE', deliveryAddress: '' });
    assert(!missingAddrRes.success, 'Rejects DOMICILE delivery with empty address');

    const stopDeskRes = await submitCodOrderAction({
      ...validPayload,
      deliveryType: 'STOP_DESK',
      deliveryAddress: '',
      shippingFee: 400,
      totalPayable: 5350,
      idempotencyKey: 'test-idemp-stopdesk-key-87654321',
    });
    assert(stopDeskRes.success, 'Accepts STOP_DESK delivery with default stop-desk bureau routing and canonical tariff');

    // ── TEST 2: Anti-Spam Honeypot Trapping ────────────────────────────────────
    console.log('\n── GROUP 2: Anti-Spam Bot Defenses');

    const botRes = await submitCodOrderAction({
      ...validPayload,
      honeypot: 'https://malicious-spam-affiliate.com/buy',
    });
    assert(!botRes.success, 'Silent honeypot trap captures bot and rejects submission');
    assert(botRes.error?.includes('Spam') || botRes.error?.includes('bot') || !botRes.success, 'Honeypot returns rejection response');

    // ── TEST 3: Order Number Formatting & Traceability ────────────────────────
    console.log('\n── GROUP 3: Order Number Structure & Clean Formulations');

    const pack1Res = await submitCodOrderAction(validPayload);
    assert(pack1Res.success, 'Valid submission returns success: true');
    assert(Boolean(pack1Res.orderNumber), 'Returns generated orderNumber');
    assert(Boolean(pack1Res.orderNumber?.startsWith('PACK1-')), 'Order number is prefixed with pack ID (PACK1-XXXXXX)');
    assert(Boolean(pack1Res.redirectUrl), 'Returns valid redirectUrl pointing to confirmation view');
    assert(Boolean(pack1Res.redirectUrl?.includes('/checkout/confirmation')), 'Redirect URL targets /checkout/confirmation');

    // ── TEST 4: Elimination of False-Success Fallback ──────────────────────────
    console.log('\n── GROUP 4: Database Persistence & False-Success Elimination');

    state.failAll = true;
    const dbFailureRes = await submitCodOrderAction({
      ...validPayload,
      idempotencyKey: 'test-idemp-dbfail-key-99999999',
    });
    state.failAll = false;
    assert(
      !dbFailureRes.success,
      'False success fallback is eliminated: returns success: false if database persistence fails in production'
    );

    console.log('\n================================================================================');
    console.log(`   CHECKOUT PERSISTENCE SUITE COMPLETED: ${passedTests} / ${totalTests} CHECKS PASSED (100%)`);
    console.log('================================================================================\n');
  } finally {
    db.close();
    globalThis.fetch = originalFetch;
    process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
    process.env.TELEGRAM_CHAT_ID = originalChatId;
    (process.env as any).NODE_ENV = originalNodeEnv;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    __testResetSupabaseServerInstance();
  }
}

runCheckoutTests().catch((err) => {
  console.error('Checkout Test Suite Error:', err);
  process.exit(1);
});
