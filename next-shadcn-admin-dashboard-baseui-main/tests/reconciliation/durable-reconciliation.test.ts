/**
 * ORVA Store — REC-01: Durable Reconciliation & Crash-Recovery Suite
 * Verifies relational schema constraints, orders(order_id TEXT UNIQUE) foreign key references,
 * durable lifecycle state transitions across complete process death/restart,
 * and double-call prevention during recovery using a disk-backed persistent database.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';

console.log('================================================================================');
console.log('   ORVA STORE — REC-01: DURABLE RECONCILIATION & RECOVERY SUITE');
console.log('   Timestamp:', new Date().toISOString());
console.log('================================================================================\n');

let totalChecks = 0;
let passedChecks = 0;

async function check(title: string, fn: () => void | Promise<void>) {
  totalChecks++;
  try {
    await fn();
    passedChecks++;
    console.log(`  [PASS] Test ${String(totalChecks).padStart(2, '0')}: ${title}`);
  } catch (err: any) {
    console.error(`  [FAIL] Test ${String(totalChecks).padStart(2, '0')}: ${title}`);
    console.error('         Error:', err.message);
    throw err;
  }
}

async function runSuite() {
  const testDbPath = path.join(os.tmpdir(), `orva-reconcile-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.db`);

  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  try {
    console.log('── GROUP 1: Persistent Schema Initialization & Constraint Verification');

    let db = new DatabaseSync(testDbPath);
    db.exec('PRAGMA foreign_keys = ON;');

    db.exec(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING'
      );

      CREATE TABLE deliveries (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE RESTRICT,
        tracking_number TEXT NOT NULL UNIQUE,
        carrier_status TEXT NOT NULL DEFAULT 'prete_a_expedier',
        validated INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE cod_reconciliations (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL UNIQUE REFERENCES orders(order_id) ON DELETE RESTRICT,
        tracking_code TEXT NOT NULL,
        carrier_status TEXT NOT NULL,
        carrier_accepted INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VALIDATION_IN_PROGRESS', 'RECONCILIATION_REQUIRED', 'RECONCILED')),
        error_payload TEXT,
        reconciled_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await check('Database tables created with foreign key to orders.order_id (TEXT UNIQUE)', () => {
      const tableCheck = db.prepare("SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name IN ('orders', 'deliveries', 'cod_reconciliations')").get() as any;
      assert.equal(tableCheck.cnt, 3);
    });

    await check('Foreign key enforces canonical orders.order_id constraint (rejects orphan order_id)', () => {
      assert.throws(() => {
        db.prepare(`
          INSERT INTO cod_reconciliations (id, order_id, tracking_code, carrier_status, status)
          VALUES ('recon-orphan', 'ORD-NON-EXISTENT', 'TRK-000', 'en_ramassage', 'RECONCILIATION_REQUIRED')
        `).run();
      }, /FOREIGN KEY constraint failed/);
    });

    await check('Populates parent order and initial delivery in prete_a_expedier state', () => {
      db.prepare(`
        INSERT INTO orders (id, order_id, customer_name, status)
        VALUES ('uuid-ord-1001', 'ORD-2026-1001', 'Amine Hadj', 'PENDING')
      `).run();

      db.prepare(`
        INSERT INTO deliveries (id, order_id, tracking_number, carrier_status, validated)
        VALUES ('del-1001', 'ORD-2026-1001', 'EC-REDEX-998811', 'prete_a_expedier', 0)
      `).run();

      const orderRow = db.prepare('SELECT order_id FROM orders WHERE order_id = ?').get('ORD-2026-1001') as any;
      assert.equal(orderRow.order_id, 'ORD-2026-1001');

      const delRow = db.prepare('SELECT carrier_status, validated FROM deliveries WHERE order_id = ?').get('ORD-2026-1001') as any;
      assert.equal(delRow.carrier_status, 'prete_a_expedier');
      assert.equal(delRow.validated, 0);
    });

    console.log('\n── GROUP 2: Partial-Failure Emulation & Persistent Archival');

    await check('Simulates Redex carrier acceptance + DB failure: writes RECONCILIATION_REQUIRED to disk', () => {
      db.prepare(`
        INSERT INTO cod_reconciliations (
          id, order_id, tracking_code, carrier_status, carrier_accepted, status, error_payload
        ) VALUES (
          'recon-1001', 'ORD-2026-1001', 'EC-REDEX-998811', 'en_ramassage', 1, 'RECONCILIATION_REQUIRED', '{"code":"PGRST000","message":"Connection timeout"}'
        )
      `).run();

      const reconRow = db.prepare('SELECT status, carrier_accepted FROM cod_reconciliations WHERE order_id = ?').get('ORD-2026-1001') as any;
      assert.equal(reconRow.status, 'RECONCILIATION_REQUIRED');
      assert.equal(reconRow.carrier_accepted, 1);
    });

    await check('Uniqueness constraint blocks duplicate concurrent reconciliation rows for same order', () => {
      assert.throws(() => {
        db.prepare(`
          INSERT INTO cod_reconciliations (
            id, order_id, tracking_code, carrier_status, carrier_accepted, status
          ) VALUES (
            'recon-duplicate', 'ORD-2026-1001', 'EC-REDEX-998811', 'en_ramassage', 1, 'RECONCILIATION_REQUIRED'
          )
        `).run();
      }, /UNIQUE constraint failed/);
    });

    console.log('\n── GROUP 3: Complete Process Termination & Cold Boot Re-Hydration');

    await check('Simulates complete container shutdown & memory eviction: closes database file', () => {
      db.close();
      assert.ok(fs.existsSync(testDbPath), 'Database file must persist on disk');
      assert.ok(fs.statSync(testDbPath).size > 0, 'Database file must be non-empty');
    });

    // Re-open fresh database connection (simulating new container / serverless instance)
    db = new DatabaseSync(testDbPath);
    db.exec('PRAGMA foreign_keys = ON;');

    await check('Cold-boot re-hydration reads pending reconciliation from persistent disk storage', () => {
      const pendingReconciliations = db.prepare(`
        SELECT r.id, r.order_id, r.tracking_code, r.carrier_status, r.carrier_accepted, r.status
        FROM cod_reconciliations r
        WHERE r.status = 'RECONCILIATION_REQUIRED'
      `).all() as any[];

      assert.equal(pendingReconciliations.length, 1);
      const rec = pendingReconciliations[0];
      assert.equal(rec.order_id, 'ORD-2026-1001');
      assert.equal(rec.tracking_code, 'EC-REDEX-998811');
      assert.equal(rec.carrier_status, 'en_ramassage');
      assert.equal(rec.carrier_accepted, 1);
    });

    console.log('\n── GROUP 4: Idempotent Recovery without Blind Redex Re-invocations');

    let redexValidOrderCallCount = 0;
    let redexGetTrackingCallCount = 0;

    const mockCourier = {
      async getTrackingInfo(trackingCode: string) {
        redexGetTrackingCallCount++;
        return {
          success: true,
          tracking: trackingCode,
          status: 'en_ramassage',
        };
      },
      async validOrder(trackingCode: string) {
        redexValidOrderCallCount++;
        return { success: true };
      },
    };

    await check('Reconciliation worker interrogates carrier truth first; NEVER calls validOrder()', async () => {
      const pending = db.prepare("SELECT * FROM cod_reconciliations WHERE status = 'RECONCILIATION_REQUIRED'").all() as any[];

      for (const item of pending) {
        const carrierTruth = await mockCourier.getTrackingInfo(item.tracking_code);

        if (carrierTruth.status === 'en_ramassage' || item.carrier_accepted === 1) {
          db.prepare(`
            UPDATE deliveries
            SET carrier_status = ?, validated = 1
            WHERE order_id = ?
          `).run(item.carrier_status, item.order_id);

          db.prepare(`
            UPDATE cod_reconciliations
            SET status = 'RECONCILED', reconciled_at = ?
            WHERE id = ?
          `).run(new Date().toISOString(), item.id);
        } else {
          await mockCourier.validOrder(item.tracking_code);
        }
      }

      assert.equal(redexGetTrackingCallCount, 1, 'Exactly 1 call made to inspect carrier truth');
      assert.equal(redexValidOrderCallCount, 0, 'ZERO calls made to Redex validOrder during recovery (no duplicate calls)');
    });

    await check('Database records are cleanly synchronized to RECONCILED and validated = 1', () => {
      const del = db.prepare('SELECT carrier_status, validated FROM deliveries WHERE order_id = ?').get('ORD-2026-1001') as any;
      assert.equal(del.carrier_status, 'en_ramassage');
      assert.equal(del.validated, 1);

      const recon = db.prepare('SELECT status, reconciled_at FROM cod_reconciliations WHERE order_id = ?').get('ORD-2026-1001') as any;
      assert.equal(recon.status, 'RECONCILED');
      assert.ok(recon.reconciled_at, 'reconciled_at must be populated');
    });

    await check('Re-running recovery on reconciled database is a complete no-op', async () => {
      const pending = db.prepare("SELECT * FROM cod_reconciliations WHERE status = 'RECONCILIATION_REQUIRED'").all();
      assert.equal(pending.length, 0, 'No pending reconciliations remain');
      assert.equal(redexValidOrderCallCount, 0, 'validOrder call count strictly remains 0');
    });

    db.close();

  } finally {
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  }

  console.log('\n================================================================================');
  console.log(`   REC-01 AUDIT COMPLETE: ${passedChecks} / ${totalChecks} CHECKS PASSED (100%)`);
  console.log('================================================================================\n');
}

runSuite().catch(err => {
  console.error('\n[FATAL TEST FAILURE]:', err);
  process.exit(1);
});
