/**
 * Challenger M3_2 Adversarial & Empirical Stress Verification Suite
 * Milestone 3: Complete Store Integration & Order Freshness (Requirement R4)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// Configure environment
if (typeof (process as any).loadEnvFile === 'function') {
  try { (process as any).loadEnvFile('.env.local'); } catch {}
  try { (process as any).loadEnvFile('.env'); } catch {}
}

const mockServiceRoleJwt =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbXNqa2hkZmdoeXlkb2djdnZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYwOTQ1OTIwMCwiZXhwIjoxOTI1MDM1MjAwfQ.mock_signature_for_test_runner';
process.env.SUPABASE_SERVICE_ROLE_KEY = mockServiceRoleJwt;
process.env.ADMIN_JWT_SECRET = 'orva-store-dev-jwt-secret-key-32chars-min!!';

import { NextRequest } from 'next/server';
import { GET as getDelivery, POST as postDelivery } from '../src/app/api/delivery/route';
import { rerouteOrderAction } from '../src/app/actions/reroute';
import {
  generateSessionToken,
  SESSION_COOKIE_NAME,
} from '../src/lib/auth/admin-auth';
import {
  maskPhoneForPrivacy,
  normalizeAlgerianPhone,
  isValidAlgerianPhone,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  ALGERIA_58_WILAYAS,
} from '../src/lib/types/checkout';
import {
  __testSetSupabaseServerInstance,
  __testResetSupabaseServerInstance,
} from '../src/lib/supabase/server';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] Test ${totalTests.toString().padStart(2, '0')}: ${message}`);
  } else {
    console.error(`  [FAIL] Test ${totalTests.toString().padStart(2, '0')}: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ── In-Memory Relational Database Harness ────────────────────────────────────
function createMockSupabaseEngine() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      order_number TEXT NOT NULL UNIQUE,
      store_id TEXT DEFAULT 'orvastore',
      customer_name TEXT,
      full_name TEXT,
      phone TEXT,
      customer_phone TEXT,
      wilaya TEXT,
      wilaya_code INTEGER,
      wilaya_name TEXT,
      commune TEXT,
      commune_name TEXT,
      delivery_address TEXT,
      delivery_type TEXT,
      delivery_method TEXT,
      delivery_time TEXT DEFAULT '24 - 48 H',
      quantity INTEGER DEFAULT 1,
      pack_id TEXT,
      product_name TEXT,
      subtotal REAL,
      delivery_fee REAL,
      total REAL,
      total_payable REAL,
      price_num REAL,
      status TEXT DEFAULT 'PENDING',
      in_redex INTEGER DEFAULT 0,
      tracking_code TEXT,
      redex_tracking_code TEXT,
      courier_provider TEXT DEFAULT 'REDEX',
      remarks TEXT,
      metadata TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      provider TEXT DEFAULT 'REDEX',
      tracking_number TEXT,
      status TEXT,
      carrier_status TEXT,
      carrier_status_ar TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS admin_session_revocations (
      sid TEXT PRIMARY KEY,
      revoked_at TEXT,
      expires_at TEXT NOT NULL
    );
  `);

  const mockClient = {
    from(table: string) {
      if (table === 'orders') {
        return {
          select(_cols = '*') {
            return {
              order(col: string, { ascending }: { ascending: boolean } = { ascending: false }) {
                const rows = db.prepare(`SELECT * FROM orders ORDER BY ${col} ${ascending ? 'ASC' : 'DESC'}`).all() as any[];
                const mapped = rows.map((r) => ({
                  ...r,
                  remarks: r.remarks ? JSON.parse(r.remarks) : [],
                  metadata: r.metadata ? JSON.parse(r.metadata) : null,
                  in_redex: Boolean(r.in_redex),
                }));
                return Promise.resolve({ data: mapped, error: null });
              },
              or(condition: string) {
                return {
                  async maybeSingle() {
                    const parts = condition.split(',');
                    for (const p of parts) {
                      const [field, op, val] = p.split('.');
                      if (op === 'eq') {
                        const row = db.prepare(`SELECT * FROM orders WHERE ${field} = ? LIMIT 1`).get(val) as any;
                        if (row) {
                          return {
                            data: {
                              ...row,
                              remarks: row.remarks ? JSON.parse(row.remarks) : [],
                              metadata: row.metadata ? JSON.parse(row.metadata) : null,
                              in_redex: Boolean(row.in_redex),
                            },
                            error: null,
                          };
                        }
                      }
                    }
                    return { data: null, error: null };
                  },
                };
              },
              eq(col: string, val: any) {
                return {
                  async single() {
                    const row = db.prepare(`SELECT * FROM orders WHERE ${col} = ? LIMIT 1`).get(val) as any;
                    if (!row) return { data: null, error: new Error('Row not found') };
                    return {
                      data: {
                        ...row,
                        remarks: row.remarks ? JSON.parse(row.remarks) : [],
                        metadata: row.metadata ? JSON.parse(row.metadata) : null,
                        in_redex: Boolean(row.in_redex),
                      },
                      error: null,
                    };
                  },
                  async maybeSingle() {
                    const row = db.prepare(`SELECT * FROM orders WHERE ${col} = ? LIMIT 1`).get(val) as any;
                    if (!row) return { data: null, error: null };
                    return {
                      data: {
                        ...row,
                        remarks: row.remarks ? JSON.parse(row.remarks) : [],
                        metadata: row.metadata ? JSON.parse(row.metadata) : null,
                        in_redex: Boolean(row.in_redex),
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          },
          async insert(record: any) {
            const id = record.id || crypto.randomUUID();
            const orderId = record.order_id || record.order_number || id;
            const orderNumber = record.order_number || record.order_id || id;
            const remarks = record.remarks ? JSON.stringify(record.remarks) : '[]';
            const metadata = record.metadata ? JSON.stringify(record.metadata) : null;
            const createdAt = record.created_at || new Date().toISOString();

            db.prepare(`
              INSERT INTO orders (
                id, order_id, order_number, customer_name, full_name,
                phone, customer_phone, wilaya_code, wilaya_name,
                commune_name, delivery_address, delivery_method, delivery_type,
                subtotal, delivery_fee, total, total_payable, price_num,
                status, in_redex, remarks, metadata, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              id,
              orderId,
              orderNumber,
              record.customer_name || record.full_name || 'Client',
              record.full_name || record.customer_name || 'Client',
              record.phone || record.customer_phone || '',
              record.customer_phone || record.phone || '',
              record.wilaya_code || 16,
              record.wilaya_name || 'Alger',
              record.commune_name || 'Alger',
              record.delivery_address || '',
              record.delivery_method || 'DOMICILE',
              record.delivery_type || 'DOMICILE',
              record.subtotal || 4950,
              record.delivery_fee || 500,
              record.total || 5450,
              record.total_payable || 5450,
              record.price_num || 4950,
              record.status || 'PENDING',
              record.in_redex ? 1 : 0,
              remarks,
              metadata,
              createdAt
            );
            return { data: [record], error: null };
          },
          update(updates: any) {
            return {
              or(condition: string) {
                const parts = condition.split(',');
                let updatedRows: any[] = [];
                for (const p of parts) {
                  const [field, op, val] = p.split('.');
                  if (op === 'eq') {
                    const row = db.prepare(`SELECT * FROM orders WHERE ${field} = ?`).get(val) as any;
                    if (row) {
                      const newStatus = updates.status !== undefined ? updates.status : row.status;
                      const newRemarks = updates.remarks !== undefined ? JSON.stringify(updates.remarks) : row.remarks;
                      const newMetadata = updates.metadata !== undefined ? JSON.stringify(updates.metadata) : row.metadata;
                      const newUpdatedAt = updates.updated_at || new Date().toISOString();

                      db.prepare(`
                        UPDATE orders
                        SET status = ?, remarks = ?, metadata = ?, updated_at = ?
                        WHERE id = ?
                      `).run(newStatus, newRemarks, newMetadata, newUpdatedAt, row.id);

                      updatedRows.push({ id: row.id, status: newStatus });
                    }
                  }
                }
                return {
                  select(_cols: string) {
                    return Promise.resolve({ data: updatedRows, error: null });
                  },
                };
              },
            };
          },
          delete() {
            return {
              in(col: string, values: string[]) {
                for (const v of values) {
                  db.prepare(`DELETE FROM orders WHERE ${col} = ?`).run(v);
                }
                return Promise.resolve({ data: null, error: null });
              },
            };
          },
        };
      }

      if (table === 'deliveries') {
        return {
          select(_cols = '*') {
            return Promise.resolve({ data: [], error: null });
          },
          update(_updates: any) {
            return {
              or(_condition: string) {
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      }

      if (table === 'admin_session_revocations') {
        return {
          select(_cols = '*') {
            return {
              eq(col: string, val: string) {
                return {
                  maybeSingle() {
                    const row = db.prepare(`SELECT * FROM admin_session_revocations WHERE ${col} = ?`).get(val);
                    return Promise.resolve({ data: row || null, error: null });
                  },
                };
              },
            };
          },
          upsert(record: any) {
            db.prepare(`
              INSERT OR REPLACE INTO admin_session_revocations (sid, revoked_at, expires_at)
              VALUES (?, ?, ?)
            `).run(record.sid, record.revoked_at || new Date().toISOString(), record.expires_at);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }

      return {
        select() {
          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  };

  return { db, mockClient };
}

async function runAdversarialAudit() {
  console.log('================================================================================');
  console.log('   CHALLENGER M3_2: ADMIN ORDER MANAGEMENT & TARIFF MATRIX ADVERSARIAL AUDIT');
  console.log('   Timestamp: ' + new Date().toISOString());
  console.log('================================================================================\n');

  // ───────────────────────────────────────────────────────────────────────────
  // 1. FALLBACK ORDERS SANITIZATION & ZERO MOCK LEAKAGE
  // ───────────────────────────────────────────────────────────────────────────
  console.log('── 1. Fallback Orders Sanitization & Zero Mock Leakage');

  const fallbackPath = path.resolve('src/data/fallback-orders.json');
  assert(fs.existsSync(fallbackPath), 'src/data/fallback-orders.json exists on disk');

  const fallbackBuffer = fs.readFileSync(fallbackPath);
  assert(fallbackBuffer.length === 3, `fallback-orders.json length is exactly 3 bytes (actual: ${fallbackBuffer.length})`);
  assert(
    fallbackBuffer[0] === 91 && fallbackBuffer[1] === 93 && fallbackBuffer[2] === 10,
    'fallback-orders.json exact byte sequence is [91, 93, 10] ("[]\\n")'
  );

  const parsedFallback = JSON.parse(fallbackBuffer.toString('utf8'));
  assert(Array.isArray(parsedFallback) && parsedFallback.length === 0, 'Parsed fallback-orders.json is strictly an empty array []');

  // Verify historical backup preservation
  const backupPath = path.resolve('backups/pre-reset/fallback-orders.json');
  assert(fs.existsSync(backupPath), 'Pre-reset backup file backups/pre-reset/fallback-orders.json exists');
  const backupStat = fs.statSync(backupPath);
  assert(backupStat.size === 80609, `Backup file size is exactly 80,609 bytes (actual: ${backupStat.size})`);
  const backupOrders = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert(Array.isArray(backupOrders) && backupOrders.length === 114, `Backup file preserves all 114 historical mock orders (actual: ${backupOrders.length})`);
  const backupHash = crypto.createHash('sha256').update(fs.readFileSync(backupPath)).digest('hex');
  assert(
    backupHash === '6a2737f7ee1cb3c57cf734bdbd2db0133c97149931076596d447c65aaa0fc4e1',
    'Backup SHA-256 matches verified hash (6a2737f7ee1cb3c57cf734bdbd2db0133c97149931076596d447c65aaa0fc4e1)'
  );

  // 1.2 Authorization enforcement: unauthorized calls to /api/delivery?action=get_all_orders
  const unauthReq = new NextRequest('http://localhost:3000/api/delivery?action=get_all_orders');
  const unauthRes = await getDelivery(unauthReq);
  assert(unauthRes.status === 401, 'Calling /api/delivery?action=get_all_orders without auth returns HTTP 401 Unauthorized');
  const unauthJson = await unauthRes.json();
  assert(unauthJson.success === false && unauthJson.error?.includes('Unauthorized'), '401 payload contains Unauthorized error message');

  // Tampered token check
  const tamperedReq = new NextRequest('http://localhost:3000/api/delivery?action=get_all_orders', {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=forged.invalid_signature`,
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    },
  });
  const tamperedRes = await getDelivery(tamperedReq);
  assert(tamperedRes.status === 401, 'Calling /api/delivery?action=get_all_orders with tampered token returns HTTP 401 Unauthorized');

  // 1.3 Zero mock leakage when database has 0 rows
  const { db, mockClient } = createMockSupabaseEngine();
  __testSetSupabaseServerInstance(mockClient);

  const adminToken = generateSessionToken();
  const validAdminReq = new NextRequest('http://localhost:3000/api/delivery?action=get_all_orders', {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    },
  });

  const validAdminRes = await getDelivery(validAdminReq);
  assert(validAdminRes.status === 200, 'Calling /api/delivery?action=get_all_orders with valid admin session returns HTTP 200');
  const responsePayload = await validAdminRes.json();
  const returnedOrders = Array.isArray(responsePayload) ? responsePayload : responsePayload.data;
  assert(Array.isArray(returnedOrders), 'Admin orders response contains an Array in data');
  assert(returnedOrders.length === 0, `ZERO mock orders returned when database has 0 rows (actual count: ${returnedOrders.length})`);
  assert(responsePayload.total === 0, `Admin orders response total is 0 (actual: ${responsePayload.total})`);

  // ───────────────────────────────────────────────────────────────────────────
  // 2. ORDER LIFECYCLE & NON-DESTRUCTIVE STATUS TRANSITIONS
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n── 2. Order Lifecycle, Non-Destructive Transitions & Audit Trails');

  const testOrderNumber = `PACK1-${Date.now().toString().slice(-6)}`;
  await (mockClient as any).from('orders').insert({
    order_id: testOrderNumber,
    order_number: testOrderNumber,
    customer_name: 'Test Challenger Client',
    phone: '0798282495',
    wilaya_code: 16,
    wilaya_name: 'Alger',
    commune_name: 'Bab El Oued',
    delivery_address: 'Rue Didouche Mourad',
    delivery_method: 'DOMICILE',
    delivery_type: 'DOMICILE',
    subtotal: 4950,
    delivery_fee: 550,
    total: 5500,
    total_payable: 5500,
    status: 'PENDING',
    remarks: [{ event: 'ORDER_CREATED', actor: 'Storefront' }],
  });

  // Verify order retrieved by get_all_orders
  const populatedRes = await getDelivery(validAdminReq);
  const populatedPayload = await populatedRes.json();
  const populatedOrders = Array.isArray(populatedPayload) ? populatedPayload : populatedPayload.data;
  assert(populatedOrders.length === 1, `get_all_orders returns exactly 1 order after insertion (actual: ${populatedOrders.length})`);
  assert(populatedOrders[0].orderId === testOrderNumber, `Returned order ID matches inserted order (${testOrderNumber})`);
  assert(populatedOrders[0].status === 'pending', `Initial order status is 'pending'`);

  // 2.1 Update status PENDING -> CONFIRMED via API
  const updateReq = new NextRequest('http://localhost:3000/api/delivery', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify({
      action: 'update_status',
      orderId: testOrderNumber,
      status: 'CONFIRMED',
      actor: 'Admin_Challenger',
    }),
  });

  const updateRes = await postDelivery(updateReq);
  assert(updateRes.status === 200, 'POST /api/delivery action=update_status returns HTTP 200');
  const updateJson = await updateRes.json();
  assert(updateJson.success === true, 'Status update reported success: true');
  assert(updateJson.status === 'confirmed', `Reported status is 'confirmed' (actual: ${updateJson.status})`);

  // Verify DB state after CONFIRMED
  const rowAfterConfirm = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(testOrderNumber) as any;
  assert(rowAfterConfirm?.status === 'CONFIRMED', `Database status updated to CONFIRMED (actual: ${rowAfterConfirm?.status})`);
  assert(rowAfterConfirm?.order_number === testOrderNumber, 'Record is preserved non-destructively');

  // 2.2 Cancel order via cancel_order action
  const cancelReq = new NextRequest('http://localhost:3000/api/delivery', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify({
      action: 'cancel_order',
      orderId: testOrderNumber,
      reason: 'Challenger verification test cancellation',
      actor: 'Admin_Challenger',
    }),
  });

  const cancelRes = await postDelivery(cancelReq);
  assert(cancelRes.status === 200, 'POST /api/delivery action=cancel_order returns HTTP 200');
  const cancelJson = await cancelRes.json();
  assert(cancelJson.success === true, 'Cancellation reported success: true');

  // Verify DB state after CANCELLED
  const rowAfterCancel = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(testOrderNumber) as any;
  assert(!!rowAfterCancel, 'Order row still exists in database after cancellation (non-destructive preservation)');
  assert(rowAfterCancel.status === 'CANCELLED', `Database status is strictly CANCELLED (actual: ${rowAfterCancel.status})`);
  const parsedRemarks = JSON.parse(rowAfterCancel.remarks || '[]');
  assert(Array.isArray(parsedRemarks), 'Order remarks field is an array storing audit events');
  const cancelAudit = parsedRemarks.find((r: any) => r.event === 'ORDER_CANCELLED');
  assert(!!cancelAudit, 'Audit trail contains ORDER_CANCELLED event record');
  assert(cancelAudit.actor === 'Admin_Challenger', `Audit record captures correct actor: ${cancelAudit.actor}`);
  assert(cancelAudit.previous_status === 'CONFIRMED', `Audit record captures correct previous status: ${cancelAudit.previous_status}`);

  // 2.3 Test admin re-routing action (reroute.ts)
  const rerouteSourceNumber = `PACK2-${Date.now().toString().slice(-6)}`;
  await (mockClient as any).from('orders').insert({
    order_id: rerouteSourceNumber,
    order_number: rerouteSourceNumber,
    customer_name: 'Original Customer Biskra',
    phone: '0661234567',
    wilaya_code: 7,
    wilaya_name: 'Biskra',
    commune_name: 'Biskra',
    delivery_address: 'Centre Ville Biskra',
    delivery_method: 'DOMICILE',
    delivery_type: 'DOMICILE',
    subtotal: 12950,
    delivery_fee: 450,
    total: 13400,
    total_payable: 13400,
    status: 'CONFIRMED',
    metadata: { packId: 'PACK2' },
  });

  // Terminal block check: try with DELIVERED status
  const terminalOrderNumber = `PACK1-TERM-${Date.now().toString().slice(-6)}`;
  await (mockClient as any).from('orders').insert({
    order_id: terminalOrderNumber,
    order_number: terminalOrderNumber,
    customer_name: 'Terminal Customer',
    phone: '0550123456',
    wilaya_code: 16,
    wilaya_name: 'Alger',
    commune_name: 'Alger',
    status: 'DELIVERED',
    subtotal: 4950,
    delivery_fee: 550,
    total: 5500,
  });

  let terminalBlocked = false;
  try {
    await rerouteOrderAction({
      orderId: terminalOrderNumber,
      newCustomerName: 'New Client',
      newCustomerPhone: '0798282495',
      newWilayaCode: 31,
      newWilayaName: 'Oran',
      newCommuneName: 'Oran',
      newDeliveryType: 'DOMICILE',
      newDeliveryAddress: 'Boulevard Front de Mer',
      reason: 'Attempt on delivered',
      operator: 'Admin',
      shippedOverrideConfirmed: false,
    });
  } catch (termErr: any) {
    terminalBlocked = true;
    assert(termErr.message.includes('terminal status'), 'Re-routing blocked for DELIVERED order with terminal status message');
  }
  assert(terminalBlocked, 'Terminal order re-routing strictly prohibited');

  // Test successful re-route of CONFIRMED order
  const rerouteResult = await rerouteOrderAction({
    orderId: rerouteSourceNumber,
    newCustomerName: 'Karim Oran',
    newCustomerPhone: '0798282495',
    newWilayaCode: 31,
    newWilayaName: 'Oran',
    newCommuneName: 'Oran',
    newDeliveryType: 'DOMICILE',
    newDeliveryAddress: 'Akid Lotfi, Oran',
    reason: 'الزبون انتقل إلى ولاية وهران',
    operator: 'Admin_Auditor',
    shippedOverrideConfirmed: false,
  });

  assert(rerouteResult.success === true, 'Re-route action succeeded with success: true');
  assert(rerouteResult.orderId.startsWith(`REROUTE-${rerouteSourceNumber}-`), `Child order ID correctly formatted: ${rerouteResult.orderId}`);
  assert(typeof rerouteResult.formattedCourierNote === 'string' && rerouteResult.formattedCourierNote.includes('Karim Oran'), 'Courier instruction note generated with new customer details');
  assert(rerouteResult.updatedShippingFee === 500, `Oran domicile shipping fee correctly calculated (500 DZD, actual: ${rerouteResult.updatedShippingFee})`);
  assert(rerouteResult.updatedTotal === 12950 + 500, `Updated total correctly recalculated (13450 DZD, actual: ${rerouteResult.updatedTotal})`);

  // Verify source order metadata updated with rerouted audit log
  const sourceRowAfter = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(rerouteSourceNumber) as any;
  const sourceMeta = JSON.parse(sourceRowAfter?.metadata || '{}');
  assert(sourceMeta?.reroutedTo === rerouteResult.orderId, 'Source order metadata updated with child order reference');
  assert(sourceMeta?.lastConversion?.operator === 'Admin_Auditor', 'Source order captures operator audit in lastConversion');

  // Verify child order created in DB
  const childRow = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(rerouteResult.orderId) as any;
  assert(!!childRow, 'New child order persisted to orders database table');
  assert(childRow?.customer_name === 'Karim Oran', 'Child order customer name matches new details');
  assert(childRow?.wilaya_code === 31, 'Child order wilaya code matches Oran (31)');
  assert(Number(childRow?.delivery_fee) === 500, 'Child order delivery fee matches tariff matrix (500 DZD)');
  assert(Number(childRow?.total) === 13450, 'Child order total matches 13,450 DZD (12950 + 500)');

  // Empirical Observation: rerouteOrderAction pushes to fallbackOrdersStore on disk.
  // We sanitize fallback-orders.json back to pristine []\n to maintain repository integrity.
  fs.writeFileSync(fallbackPath, '[]\n', 'utf8');
  console.log('  [CLEANUP] Sanitized src/data/fallback-orders.json back to 3 bytes following reroute test.');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. PHONE PRIVACY MASKING VERIFICATION
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n── 3. Phone Privacy Masking Verification');

  // Test standard 10-digit number
  const maskedStandard = maskPhoneForPrivacy('0798282495');
  assert(maskedStandard === '0798 •• •• 95', `maskPhoneForPrivacy('0798282495') === '0798 •• •• 95' (actual: '${maskedStandard}')`);

  // Test international prefix +213
  const maskedIntl = maskPhoneForPrivacy('+213798282495');
  assert(maskedIntl === '0798 •• •• 95', `maskPhoneForPrivacy('+213798282495') === '0798 •• •• 95' (actual: '${maskedIntl}')`);

  // Test international prefix 00213
  const maskedDoubleZero = maskPhoneForPrivacy('00213798282495');
  assert(maskedDoubleZero === '0798 •• •• 95', `maskPhoneForPrivacy('00213798282495') === '0798 •• •• 95' (actual: '${maskedDoubleZero}')`);

  // Test prefix with leading zero in local: +2130798282495
  const maskedIntlWithZero = maskPhoneForPrivacy('+2130798282495');
  assert(maskedIntlWithZero === '0798 •• •• 95', `maskPhoneForPrivacy('+2130798282495') === '0798 •• •• 95' (actual: '${maskedIntlWithZero}')`);

  // Test prefix with spaces: +213 798 28 24 95
  const maskedWithSpaces = maskPhoneForPrivacy('+213 798 28 24 95');
  assert(maskedWithSpaces === '0798 •• •• 95', `maskPhoneForPrivacy('+213 798 28 24 95') === '0798 •• •• 95' (actual: '${maskedWithSpaces}')`);

  // Test Ooredoo prefix (05)
  const maskedOoredoo = maskPhoneForPrivacy('0550123456');
  assert(maskedOoredoo === '0550 •• •• 56', `maskPhoneForPrivacy('0550123456') === '0550 •• •• 56' (actual: '${maskedOoredoo}')`);

  // Test Mobilis prefix (06)
  const maskedMobilis = maskPhoneForPrivacy('0661234567');
  assert(maskedMobilis === '0661 •• •• 67', `maskPhoneForPrivacy('0661234567') === '0661 •• •• 67' (actual: '${maskedMobilis}')`);

  // Test non-standard / short phone gracefully returns original without crash
  const maskedShort = maskPhoneForPrivacy('12345');
  assert(maskedShort === '12345', `Non-standard short number returns unchanged: '${maskedShort}'`);

  // ───────────────────────────────────────────────────────────────────────────
  // 4. BISKRA ORIGIN HUB TARIFF MATRIX & STOP-DESK BARRIERS
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n── 4. Biskra 07 Origin Hub Tariff Matrix & Stop-Desk Constraints');

  // Zone 1: Central Origin (Biskra 07, Batna 05, Ouled Djellal 51)
  assert(calculateDeliveryTariff(7, 'DOMICILE') === 450, 'Zone 1 (Biskra 07) Domicile fee is 450 DZD');
  assert(calculateDeliveryTariff(7, 'STOP_DESK') === 350, 'Zone 1 (Biskra 07) Stop-Desk fee is 350 DZD');
  assert(isStopDeskAllowed(7) === true, 'Stop-Desk is permitted in Biskra (07)');

  // Zone 2: Northern & Coastal (Alger 16, Oran 31, Constantine 25)
  assert(calculateDeliveryTariff(16, 'DOMICILE') === 500, 'Zone 2 (Alger 16) Domicile fee is 500 DZD');
  assert(calculateDeliveryTariff(16, 'STOP_DESK') === 400, 'Zone 2 (Alger 16) Stop-Desk fee is 400 DZD');
  assert(calculateDeliveryTariff(31, 'DOMICILE') === 500, 'Zone 2 (Oran 31) Domicile fee is 500 DZD');
  assert(calculateDeliveryTariff(31, 'STOP_DESK') === 400, 'Zone 2 (Oran 31) Stop-Desk fee is 400 DZD');

  // Zone 3: High Plateaus (Djelfa 17, Tiaret 14, M'Sila 28)
  assert(calculateDeliveryTariff(17, 'DOMICILE') === 650, 'Zone 3 (Djelfa 17) Domicile fee is 650 DZD');
  assert(calculateDeliveryTariff(17, 'STOP_DESK') === 450, 'Zone 3 (Djelfa 17) Stop-Desk fee is 450 DZD');

  // Zone 4: Near Sahara (Ouargla 30, Ghardaia 47, El Oued 39)
  assert(calculateDeliveryTariff(30, 'DOMICILE') === 800, 'Zone 4 (Ouargla 30) Domicile fee is 800 DZD');
  assert(calculateDeliveryTariff(30, 'STOP_DESK') === 500, 'Zone 4 (Ouargla 30) Stop-Desk fee is 500 DZD');

  // Zone 5: Far South (Tamanrasset 11, Illizi 33, In Guezzam 54, Djanet 56)
  assert(calculateDeliveryTariff(11, 'DOMICILE') === 1000, 'Zone 5 (Tamanrasset 11) Domicile fee is 1000 DZD');
  assert(isStopDeskAllowed(11) === false, 'Stop-Desk is strictly prohibited in Zone 5 (Tamanrasset 11)');

  let zone5StopDeskBlocked = false;
  try {
    calculateDeliveryTariff(11, 'STOP_DESK');
  } catch (z5Err: any) {
    zone5StopDeskBlocked = true;
    assert(z5Err.message.includes('not available for Wilaya 11'), 'Zone 5 Stop-Desk request throws unavailable exception');
  }
  assert(zone5StopDeskBlocked, 'Zone 5 Stop-Desk throws expected exception');

  // Wilayas 49-58 Stop-Desk Barrier
  assert(isStopDeskAllowed(49) === false, 'Stop-Desk is prohibited for new Wilaya 49 (Timimoun)');
  assert(isStopDeskAllowed(54) === false, 'Stop-Desk is prohibited for new Wilaya 54 (In Guezzam)');

  // Invalid Wilaya Codes (<1 or >58)
  let invalidWilayaBlocked = false;
  try {
    calculateDeliveryTariff(99, 'DOMICILE');
  } catch (invErr: any) {
    invalidWilayaBlocked = true;
    assert(invErr.message.includes('Invalid Wilaya code: 99'), 'Invalid wilaya code 99 throws validation error');
  }
  assert(invalidWilayaBlocked, 'Invalid wilaya code > 58 is strictly blocked');

  // Reset test instance
  __testResetSupabaseServerInstance();

  // ───────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================================');
  console.log(`   ADVERSARIAL AUDIT RESULTS: ${passedTests} / ${totalTests} ASSERTIONS PASSED (100%)`);
  console.log('================================================================================\n');
}

runAdversarialAudit().catch((err) => {
  console.error('\n[AUDIT FAILURE]:', err);
  process.exit(1);
});
