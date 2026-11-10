/**
 * ORVA STORE — CHECKOUT IDEMPOTENCY, LIFECYCLE & CONCURRENCY TEST SUITE
 *
 * Verifies all Section 3 requirements using a local relational SQLite engine (node:sqlite)
 * enforcing the exact schema constraints (UNIQUE(order_id), UNIQUE(idempotency_key))
 * with zero network calls to production Supabase or Telegram:
 *
 * 1. Missing or invalid idempotencyKey schema rejection
 * 2. Same key + same payload (idempotent replay)
 * 3. Same key + different payload (409 PayloadMismatch collision protection)
 * 4. Different keys + same phone number (independent orders permitted)
 * 5. New order after successful checkout in the same mounted form (CheckoutKeyLifecycle rotation)
 * 6. Retry after page reload / lost response (sessionStorage key retention)
 * 7. Concurrent requests reaching separate server instances & DB unique violation recovery
 * 8. Database lookup failure & total database persistence failure handling
 */

import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { submitCodOrderAction } from '../../src/app/actions/checkout';
import { CheckoutKeyLifecycle, IDEMPOTENCY_STORAGE_KEY, KeyStorageAdapter } from '../../src/lib/idempotency-lifecycle';
import { computeCanonicalPayloadHash } from '../../src/lib/payload-hash';
import {
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from '../../src/lib/supabase/server';
import { CodOrderSubmission } from '../../src/lib/types/checkout';

// ── Local Relational SQLite Adapter Emulating PostgREST / Supabase ──────────

interface SqliteAdapterHooks {
  onAfterSelect?: (key: string, row: any) => Promise<void>;
  failNextSelectCount?: number;
  failSelectErrorMessage?: string;
  failInsertWithError?: string | null;
}

function createSqliteBackedSupabaseClient(db: DatabaseSync, hooks: SqliteAdapterHooks = {}) {
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
      delivery_time TEXT,
      quantity INTEGER,
      product_name TEXT,
      product_total TEXT,
      shipping_fee TEXT,
      price_num REAL,
      grand_total TEXT,
      status TEXT,
      in_redex INTEGER,
      notes TEXT,
      risk_score INTEGER,
      risk_level TEXT,
      risk_decision TEXT,
      courier TEXT,
      created_at TEXT
    );
  `);

  return {
    from(table: string) {
      if (table !== 'orders') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
              single: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }

      return {
        select(_columns: string) {
          return {
            eq(column: string, value: string) {
              return {
                async maybeSingle() {
                  if (hooks.failNextSelectCount && hooks.failNextSelectCount > 0) {
                    hooks.failNextSelectCount--;
                    return {
                      data: null,
                      error: {
                        code: 'PGRST500',
                        message: hooks.failSelectErrorMessage || 'Simulated database SELECT error',
                      },
                    };
                  }

                  const stmt = db.prepare(
                    `SELECT id, order_id, idempotency_key, payload_hash, created_at FROM orders WHERE ${column} = ? LIMIT 1`
                  );
                  const row = stmt.get(value) as any;

                  if (hooks.onAfterSelect) {
                    await hooks.onAfterSelect(value, row);
                  }

                  return { data: row || null, error: null };
                },
              };
            },
          };
        },

        insert(payload: Record<string, any>) {
          return {
            select(_columns: string) {
              return {
                async single() {
                  if (hooks.failInsertWithError) {
                    return {
                      data: null,
                      error: { code: 'PGRST503', message: hooks.failInsertWithError },
                    };
                  }

                  const id = crypto.randomUUID();
                  const createdAt = new Date().toISOString();
                  try {
                    const stmt = db.prepare(`
                      INSERT INTO orders (
                        id, order_id, idempotency_key, payload_hash, store_id,
                        full_name, phone, wilaya, commune, delivery_type,
                        delivery_time, quantity, product_name, product_total,
                        shipping_fee, price_num, grand_total, status, in_redex,
                        notes, risk_score, risk_level, risk_decision, courier, created_at
                      ) VALUES (
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?, ?
                      )
                    `);
                    stmt.run(
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
                      payload.delivery_time ?? '',
                      payload.quantity ?? 1,
                      payload.product_name ?? '',
                      payload.product_total ?? '',
                      payload.shipping_fee ?? '',
                      payload.price_num ?? 0,
                      payload.grand_total ?? '',
                      payload.status ?? 'pending',
                      payload.in_redex ? 1 : 0,
                      payload.notes ?? '',
                      payload.risk_score ?? 0,
                      payload.risk_level ?? 'LOW',
                      payload.risk_decision ?? 'ALLOW',
                      payload.courier ?? 'REDEX',
                      createdAt
                    );
                    return {
                      data: { id, order_id: payload.order_id },
                      error: null,
                    };
                  } catch (err: any) {
                    const msg = String(err?.message || err);
                    const isUnique =
                      msg.includes('UNIQUE constraint failed') ||
                      msg.includes('SQLITE_CONSTRAINT');
                    return {
                      data: null,
                      error: {
                        code: isUnique ? '23505' : 'PGRST500',
                        message: isUnique
                          ? `duplicate key value violates unique constraint "orders_idempotency_key_key" (${msg})`
                          : msg,
                      },
                    };
                  }
                },
              };
            },
          };
        },
      };
    },
  };
}

class MockSessionStorage implements KeyStorageAdapter {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

async function runIdempotencyTests() {
  console.log('================================================================================');
  console.log('   ORVA STORE — CHECKOUT IDEMPOTENCY, LIFECYCLE & CONCURRENCY TEST SUITE');
  console.log('   Timestamp: ' + new Date().toISOString());
  console.log('================================================================================\n');

  // Isolate test environment from external network (Telegram / Meta CAPI / Remote Supabase)
  const originalFetch = globalThis.fetch;
  const originalBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalChatId = process.env.TELEGRAM_CHAT_ID;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  let telegramDispatchCount = 0;
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  process.env.TELEGRAM_CHAT_ID = 'test-chat-id';
  (process.env as any).NODE_ENV = 'production';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://local-sqlite-test.supabase.co';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const urlStr = String(input);
    if (urlStr.includes('api.telegram.org')) {
      telegramDispatchCount++;
      return new Response(JSON.stringify({ ok: true, result: { message_id: telegramDispatchCount } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  const db = new DatabaseSync(':memory:');
  const hooks: SqliteAdapterHooks = {};
  const sqliteSupabase = createSqliteBackedSupabaseClient(db, hooks);
  __testSetSupabaseServerInstance(sqliteSupabase);

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] Test ${String(totalTests).padStart(2, '0')}: ${testName}`);
    } else {
      console.error(`  [FAIL] Test ${String(totalTests).padStart(2, '0')}: ${testName}`);
      throw new Error(`Idempotency Assertion Failed: ${testName}`);
    }
  }

  function countOrdersInDb(): number {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM orders').get() as { cnt: number };
    return row.cnt;
  }

  try {
    const baseSubmission: CodOrderSubmission = {
      customerName: 'Karim Boukhalfa',
      customerPhone: '0661122334',
      wilayaCode: 16,
      wilayaName: 'Alger',
      communeName: 'Bab Ezzouar',
      deliveryType: 'DOMICILE',
      deliveryAddress: 'Cité Universitaire, Bloc 4',
      packId: 'PACK1',
      productName: 'عرض 4 في 1 المتكامل (PACK 4EN1)',
      productPrice: 4950,
      shippingFee: 500,
      totalPayable: 5450,
      idempotencyKey: 'idemp-test-valid-initial-001',
    };

    // ── GROUP 1: Idempotency Key Schema Validation ──────────────────────────
    console.log('── GROUP 1: Idempotency Key Schema Validation');

    const missingKeyRes = await submitCodOrderAction({
      ...baseSubmission,
      idempotencyKey: undefined as any,
    });
    assert(!missingKeyRes.success, 'Rejects submission with missing idempotencyKey');
    assert(
      Boolean(missingKeyRes.validationErrors?.idempotencyKey || missingKeyRes.error),
      'Returns validation error for missing idempotencyKey'
    );

    const emptyKeyRes = await submitCodOrderAction({
      ...baseSubmission,
      idempotencyKey: '   ',
    });
    assert(!emptyKeyRes.success, 'Rejects whitespace-only idempotencyKey');

    const shortKeyRes = await submitCodOrderAction({
      ...baseSubmission,
      idempotencyKey: 'short-key',
    });
    assert(!shortKeyRes.success, 'Rejects idempotencyKey shorter than 10 characters');

    const invalidCharsKeyRes = await submitCodOrderAction({
      ...baseSubmission,
      idempotencyKey: 'invalid key with spaces & @!#',
    });
    assert(!invalidCharsKeyRes.success, 'Rejects idempotencyKey with invalid characters');

    // ── GROUP 2: Same Key + Same Payload (Idempotent Replay) ────────────────
    console.log('\n── GROUP 2: Same Key + Same Payload (Idempotent Replay)');

    const stableKey = `idemp-replay-${Date.now()}-33333`;
    const alertsBeforeReplay = telegramDispatchCount;
    const countBeforeReplay = countOrdersInDb();

    const firstSubmissionRes = await submitCodOrderAction({
      ...baseSubmission,
      idempotencyKey: stableKey,
    });
    assert(firstSubmissionRes.success, 'Initial submission with stable key succeeds');
    assert(countOrdersInDb() === countBeforeReplay + 1, 'Persists exactly 1 row in SQLite orders table');
    assert(telegramDispatchCount === alertsBeforeReplay + 1, 'Dispatches 1 Telegram alert on initial order');

    const retryRes = await submitCodOrderAction({
      ...baseSubmission,
      idempotencyKey: stableKey,
    });
    assert(retryRes.success, 'Retry submission with same key + same payload succeeds');
    assert(
      retryRes.orderNumber === firstSubmissionRes.orderNumber,
      'Retry returns identical orderNumber without creating a second order'
    );
    assert(
      retryRes.redirectUrl === firstSubmissionRes.redirectUrl,
      'Retry returns identical confirmation redirect URL'
    );
    assert(
      countOrdersInDb() === countBeforeReplay + 1,
      'Database row count remains unchanged on idempotent retry'
    );
    assert(
      telegramDispatchCount === alertsBeforeReplay + 1,
      'Idempotent retry does NOT dispatch duplicate Telegram alert'
    );

    // ── GROUP 3: Same Key + Different Payload (409 PayloadMismatch) ─────────
    console.log('\n── GROUP 3: Same Key + Different Payload (PayloadMismatch Collision Guard)');

    const collisionKey = `idemp-collision-${Date.now()}-66666`;
    const initialPayloadRes = await submitCodOrderAction({
      ...baseSubmission,
      customerPhone: '0550112233',
      idempotencyKey: collisionKey,
      packId: 'PACK1',
    });
    assert(initialPayloadRes.success, 'Initial order with collision test key succeeds');
    const rowsAfterInitial = countOrdersInDb();

    const alteredPhoneRes = await submitCodOrderAction({
      ...baseSubmission,
      customerPhone: '0770998811',
      idempotencyKey: collisionKey,
      packId: 'PACK1',
    });
    assert(!alteredPhoneRes.success, 'Same key + different customer phone is strictly REJECTED');
    assert(
      Boolean(alteredPhoneRes.error?.includes('PayloadMismatch')),
      'Returns explicit PayloadMismatch error on phone collision'
    );

    const alteredPackRes = await submitCodOrderAction({
      ...baseSubmission,
      customerPhone: '0550112233',
      idempotencyKey: collisionKey,
      packId: 'PACK2',
      productName: 'عرض 5 في 1 الفاخر (PACK 5EN1)',
      productPrice: 12950,
      shippingFee: 500,
      totalPayable: 13450,
    });
    assert(!alteredPackRes.success, 'Same key + different pack/price is strictly REJECTED');
    assert(
      Boolean(alteredPackRes.error?.includes('PayloadMismatch')),
      'Returns explicit PayloadMismatch error on pack/price collision'
    );

    const alteredWilayaRes = await submitCodOrderAction({
      ...baseSubmission,
      customerPhone: '0550112233',
      idempotencyKey: collisionKey,
      wilayaCode: 31,
      wilayaName: 'Oran',
      communeName: 'Oran',
      shippingFee: 500,
      totalPayable: 5450,
    });
    assert(!alteredWilayaRes.success, 'Same key + different wilaya/commune is strictly REJECTED');
    assert(
      countOrdersInDb() === rowsAfterInitial,
      'Zero additional orders persisted during payload collision attempts'
    );

    // ── GROUP 4: Different Keys + Same Phone Number ─────────────────────────
    console.log('\n── GROUP 4: Different Keys + Same Phone Number');

    const keyA = `idemp-order-A-${Date.now()}-11111`;
    const keyB = `idemp-order-B-${Date.now()}-22222`;
    const commonPhone = '0770998877';

    const orderARes = await submitCodOrderAction({
      ...baseSubmission,
      customerPhone: commonPhone,
      idempotencyKey: keyA,
      packId: 'PACK1',
    });
    assert(orderARes.success, 'First order with key A succeeds');

    const orderBRes = await submitCodOrderAction({
      ...baseSubmission,
      customerPhone: commonPhone,
      idempotencyKey: keyB,
      packId: 'PACK2',
      productName: 'عرض 5 في 1 الفاخر (PACK 5EN1)',
      productPrice: 12950,
      shippingFee: 500,
      totalPayable: 13450,
    });
    assert(orderBRes.success, 'Second order with key B from SAME phone succeeds immediately');
    assert(
      orderARes.orderNumber !== orderBRes.orderNumber,
      'Different keys + same phone generate distinct independent orders'
    );

    // ── GROUP 5: Frontend Key Lifecycle (Mounted Form Rotation & Page Reload) ──
    console.log('\n── GROUP 5: Frontend Key Lifecycle (Same Mounted Form & Page Reload)');

    const mockStorage = new MockSessionStorage();
    const formLifecycle = new CheckoutKeyLifecycle(mockStorage);

    // 5.1 Rapid repeated clicks before completion reuse the exact same key
    const clickKey1 = formLifecycle.getOrCreateKey();
    const clickKey2 = formLifecycle.getOrCreateKey();
    const clickKey3 = formLifecycle.getOrCreateKey();
    assert(
      clickKey1 === clickKey2 && clickKey2 === clickKey3,
      'Repeated clicks on the same checkout attempt reuse the identical key'
    );

    // 5.2 Submit order 1 using the form lifecycle key, then simulate lost response + page reload
    const reloadOrderRes1 = await submitCodOrderAction({
      ...baseSubmission,
      customerPhone: '0662001122',
      idempotencyKey: clickKey1,
    });
    assert(reloadOrderRes1.success, 'Order persisted on server prior to simulated lost response');

    // Simulate browser page reload: new CheckoutKeyLifecycle instance reading from sessionStorage
    const reloadedFormLifecycle = new CheckoutKeyLifecycle(mockStorage);
    const keyAfterReload = reloadedFormLifecycle.getOrCreateKey();
    assert(
      keyAfterReload === clickKey1,
      'Retry after page reload / lost response restores the original key from sessionStorage'
    );

    const retryAfterReloadRes = await submitCodOrderAction({
      ...baseSubmission,
      customerPhone: '0662001122',
      idempotencyKey: keyAfterReload,
    });
    assert(
      retryAfterReloadRes.success && retryAfterReloadRes.orderNumber === reloadOrderRes1.orderNumber,
      'Retry after page reload safely recovers the original order without duplication'
    );

    // 5.3 Complete checkout in mounted form -> rotates key -> submit new order in same mounted form
    const nextAttemptKey = reloadedFormLifecycle.rotateKeyOnSuccess();
    assert(
      nextAttemptKey !== clickKey1,
      'Successful checkout completion rotates key in mounted form and sessionStorage'
    );
    assert(
      mockStorage.getItem(IDEMPOTENCY_STORAGE_KEY) === nextAttemptKey,
      'sessionStorage holds the newly rotated key for the next checkout attempt'
    );

    const secondOrderSameFormRes = await submitCodOrderAction({
      ...baseSubmission,
      customerPhone: '0662001122',
      idempotencyKey: reloadedFormLifecycle.getOrCreateKey(),
    });
    assert(
      secondOrderSameFormRes.success &&
        secondOrderSameFormRes.orderNumber !== reloadOrderRes1.orderNumber,
      'New order after successful checkout in the same mounted form creates a separate order'
    );

    // ── GROUP 6: Cross-Instance Concurrency & DB Unique Violation Recovery ──
    console.log('\n── GROUP 6: Concurrent Requests Across Separate Server Instances & DB UNIQUE Recovery');

    // Disable process-local in-memory coalescing so Request 1 and Request 2 act as
    // two separate serverless instances racing directly against the SQLite UNIQUE constraint.
    process.env.ORVA_DISABLE_IN_MEMORY_DEDUP = '1';

    let selectBarrierCount = 0;
    let releaseBarrier!: () => void;
    const barrierPromise = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });

    // Synchronize both instances AFTER preflight SELECT so BOTH read row=null before either inserts
    hooks.onAfterSelect = async (_key, row) => {
      if (row !== null) return; // Do not block post-23505 recovery SELECT
      selectBarrierCount++;
      if (selectBarrierCount === 2) {
        releaseBarrier();
      } else if (selectBarrierCount < 2) {
        await Promise.race([
          barrierPromise,
          new Promise<void>((r) => setTimeout(r, 200)),
        ]);
      }
    };

    const crossInstanceKey = `idemp-cross-instance-${Date.now()}-77777`;
    const rowsBeforeCrossRace = countOrdersInDb();
    const alertsBeforeCrossRace = telegramDispatchCount;

    const [instanceARes, instanceBRes] = await Promise.all([
      submitCodOrderAction({
        ...baseSubmission,
        customerPhone: '0551234567',
        idempotencyKey: crossInstanceKey,
      }),
      submitCodOrderAction({
        ...baseSubmission,
        customerPhone: '0551234567',
        idempotencyKey: crossInstanceKey,
      }),
    ]);

    hooks.onAfterSelect = undefined;

    assert(instanceARes.success && instanceBRes.success, 'Both cross-instance concurrent requests succeed');
    assert(
      instanceARes.orderNumber === instanceBRes.orderNumber,
      'Database UNIQUE constraint barrier resolves both instances to the exact same orderNumber'
    );
    assert(
      countOrdersInDb() === rowsBeforeCrossRace + 1,
      'Database UNIQUE constraint allows only 1 row to be inserted across racing instances'
    );
    assert(
      telegramDispatchCount === alertsBeforeCrossRace + 1,
      'Raced instance recovering from 23505 unique violation does NOT send duplicate Telegram alert'
    );

    // Test cross-instance race with DIFFERENT payloads on the same key
    selectBarrierCount = 0;
    const barrierPromise2 = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    hooks.onAfterSelect = async (_key, row) => {
      if (row !== null) return;
      selectBarrierCount++;
      if (selectBarrierCount === 2) {
        releaseBarrier();
      } else if (selectBarrierCount < 2) {
        await Promise.race([
          barrierPromise2,
          new Promise<void>((r) => setTimeout(r, 200)),
        ]);
      }
    };

    const crossCollisionKey = `idemp-cross-collision-${Date.now()}-88888`;
    const [raceOrigRes, raceTamperedRes] = await Promise.all([
      submitCodOrderAction({
        ...baseSubmission,
        customerPhone: '0559001122',
        idempotencyKey: crossCollisionKey,
        packId: 'PACK1',
      }),
      submitCodOrderAction({
        ...baseSubmission,
        customerPhone: '0779998877', // Different phone racing on the same key
        idempotencyKey: crossCollisionKey,
        packId: 'PACK1',
      }),
    ]);

    hooks.onAfterSelect = undefined;
    process.env.ORVA_DISABLE_IN_MEMORY_DEDUP = '0';

    const oneSucceededOneRejected =
      (raceOrigRes.success && !raceTamperedRes.success) ||
      (!raceOrigRes.success && raceTamperedRes.success);
    const rejectedOne = !raceOrigRes.success ? raceOrigRes : raceTamperedRes;

    assert(
      oneSucceededOneRejected,
      'Cross-instance race with same key + different payload accepts winner and rejects loser'
    );
    assert(
      Boolean(rejectedOne.error?.includes('PayloadMismatch')),
      'Loser of cross-instance race with mismatched payload is rejected with PayloadMismatch'
    );

    // ── GROUP 7: Database Lookup Failure & Insert Failure Handling ──────────
    console.log('\n── GROUP 7: Database Lookup Failure & Persistence Failure Handling');

    // 7.1 Transient preflight SELECT failure on an already-persisted key falls back to DB UNIQUE constraint
    hooks.failNextSelectCount = 1;
    hooks.failSelectErrorMessage = 'connection timeout during preflight SELECT';

    const lookupFailReplayRes = await submitCodOrderAction({
      ...baseSubmission,
      customerPhone: '0551234567',
      idempotencyKey: crossInstanceKey,
    });
    hooks.failNextSelectCount = 0;

    assert(
      lookupFailReplayRes.success && lookupFailReplayRes.orderNumber === instanceARes.orderNumber,
      'When preflight SELECT fails, DB UNIQUE constraint catches duplicate on INSERT and recovers order'
    );

    // 7.2 Total database unavailability (both lookup and insert fail in production)
    hooks.failNextSelectCount = 5;
    hooks.failSelectErrorMessage = 'TypeError: fetch failed (DB unreachable)';
    hooks.failInsertWithError = 'TypeError: fetch failed (DB unreachable)';

    const failDbRes = await submitCodOrderAction({
      ...baseSubmission,
      idempotencyKey: `idemp-fail-${Date.now()}-55555`,
    });

    hooks.failNextSelectCount = 0;
    hooks.failInsertWithError = null;

    assert(!failDbRes.success, 'Production mode strictly rejects when database persistence fails');
    assert(
      Boolean(failDbRes.error?.includes('تعذر تأكيد طلبكم')),
      'Returns descriptive localized error message upon DB persistence failure'
    );

    // ── GROUP 8: Canonical Payload Hash Determinism ─────────────────────────
    console.log('\n── GROUP 8: Canonical Payload Hash Determinism');

    const hash1 = computeCanonicalPayloadHash({
      customerPhone: '0550 11 22 33',
      wilayaCode: 16,
      communeName: ' Bab Ezzouar ',
      packId: 'pack1',
      totalPayable: 5450,
      deliveryType: 'DOMICILE',
    });

    const hash2 = computeCanonicalPayloadHash({
      customerPhone: '+213550112233',
      wilayaCode: 16,
      communeName: 'bab ezzouar',
      packId: 'PACK1',
      totalPayable: 5450,
      deliveryType: 'DOMICILE',
    });

    assert(hash1 === hash2, 'Canonical payload hash normalizes phone, casing, and whitespace deterministically');

    console.log('\n================================================================================');
    console.log(`   IDEMPOTENCY SUITE COMPLETED: ${passedTests} / ${totalTests} CHECKS PASSED (100%)`);
    console.log('================================================================================\n');
  } finally {
    db.close();
    globalThis.fetch = originalFetch;
    process.env.TELEGRAM_BOT_TOKEN = originalBotToken;
    process.env.TELEGRAM_CHAT_ID = originalChatId;
    (process.env as any).NODE_ENV = originalNodeEnv;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    delete process.env.ORVA_DISABLE_IN_MEMORY_DEDUP;
    __testResetSupabaseServerInstance();
  }
}

runIdempotencyTests().catch((err) => {
  console.error('[IDEMPOTENCY TEST SUITE FAILED FATALLY]:', err);
  process.exit(1);
});
