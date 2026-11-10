// ============================================================================
// ORVA Store v2.1.0 — Operational External Trust Anchor Module
// Stage 1.9: Asymmetric Ed25519 Signing Architecture & Trust Record Management
// ============================================================================
// STRICT SECURITY BOUNDARY:
// - Asymmetric Key Separation:
//   * PRIVATE KEY is held strictly in KMS / protected CI runner secrets.
//     Used exclusively at deployment time to sign pre-migration snapshot records.
//   * PUBLIC KEY is held by the application & rollback runner.
//     Used to verify external records without possessing signing capability.
//   * True cryptographic non-repudiation: The rollback runner cannot forge signatures.
// - External records are archived in immutable WORM storage (S3 Object Lock / Compliance).
// - Database actors (even with service_role) cannot modify external records or forge signatures.
// ============================================================================

import crypto from 'node:crypto';

export const CANONICAL_MIGRATION_ID = '20261108_000002_v2_1_deliveries_and_conversions';
export const CANONICAL_SCHEMA_VERSION = 'v2.1';
export const DEFAULT_MAX_TRUST_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days max rollback validity

/**
 * Utility: Generates a new Ed25519 key pair for deployment signing infrastructure.
 * @returns {{ publicKeyPem: string, privateKeyPem: string }}
 */
export function generateDeploymentKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

/**
 * Creates an immutable, asymmetric Ed25519 signed external trust anchor record.
 * Executed strictly by the trusted deployment pipeline outside the database immediately
 * upon pre-migration snapshot creation.
 *
 * @param {Object} params
 * @param {string} params.deploymentExecutionId - Unique deployment execution/run ID
 * @param {string} params.snapshotDigest - 64-char lowercase hex SHA-256 digest
 * @param {number} params.snapshotRowCount - Exact count of snapshot rows
 * @param {string|crypto.KeyObject} params.privateKey - Ed25519 private key (KMS / CI secret)
 * @param {string} [params.migrationId] - Defaults to CANONICAL_MIGRATION_ID
 * @param {string} [params.schemaVersion] - Defaults to CANONICAL_SCHEMA_VERSION
 * @param {string} [params.recordId] - Unique record identifier (UUIDv4)
 * @param {string} [params.timestamp] - ISO8601 timestamp
 * @returns {Object} Signed External Trust Record Envelope
 */
export function createExternalTrustRecord({
  deploymentExecutionId,
  snapshotDigest,
  snapshotRowCount,
  privateKey,
  migrationId = CANONICAL_MIGRATION_ID,
  schemaVersion = CANONICAL_SCHEMA_VERSION,
  recordId = 'orva-trust-' + crypto.randomUUID(),
  timestamp = new Date().toISOString(),
}) {
  if (!deploymentExecutionId || typeof deploymentExecutionId !== 'string') {
    throw new Error('MISSING_EXECUTION_ID: deploymentExecutionId is required and must be a string.');
  }
  if (!snapshotDigest || !/^[0-9a-f]{64}$/.test(snapshotDigest)) {
    throw new Error('INVALID_SNAPSHOT_DIGEST: snapshotDigest must be exactly 64 lowercase hexadecimal characters.');
  }
  if (snapshotRowCount === undefined || snapshotRowCount === null || typeof snapshotRowCount !== 'number' || snapshotRowCount < 0 || !Number.isInteger(snapshotRowCount)) {
    throw new Error('INVALID_ROW_COUNT: snapshotRowCount must be a non-negative integer.');
  }
  if (!privateKey) {
    throw new Error('MISSING_PRIVATE_KEY: Ed25519 privateKey is required to create signed external trust anchor.');
  }

  const payload = {
    record_id: String(recordId),
    deployment_execution_id: String(deploymentExecutionId),
    migration_id: String(migrationId),
    schema_version: String(schemaVersion),
    snapshot_digest: String(snapshotDigest),
    snapshot_row_count: Number(snapshotRowCount),
    timestamp: String(timestamp),
  };
  if (arguments[0] && arguments[0].status) {
    payload.status = String(arguments[0].status);
  }

  // Canonical JSON serialization with sorted keys
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
  const signature = crypto.sign(null, Buffer.from(canonicalString, 'utf8'), privateKey);

  return {
    version: '2.0',
    algorithm: 'Ed25519',
    payload,
    signature: signature.toString('hex'),
  };
}

/**
 * Verifies an external trust record using the Ed25519 public key.
 * Enforces cryptographic validity, freshness/expiration, migration ID,
 * schema version, and digest format.
 * Fails closed on any anomaly.
 *
 * @param {Object} envelope - The external trust record envelope
 * @param {Object} options
 * @param {string|crypto.KeyObject} options.publicKey - Ed25519 public key
 * @param {string} [options.expectedMigrationId] - Expected migration ID
 * @param {string} [options.expectedSchemaVersion] - Expected schema version
 * @param {number} [options.maxAgeMs] - Maximum allowed record age in milliseconds
 * @param {number} [options.now] - Current timestamp override for testing
 * @returns {{ valid: boolean, payload: Object }}
 */
export function verifyExternalTrustRecord(envelope, {
  publicKey,
  expectedMigrationId = CANONICAL_MIGRATION_ID,
  expectedSchemaVersion = CANONICAL_SCHEMA_VERSION,
  maxAgeMs = DEFAULT_MAX_TRUST_AGE_MS,
  now = Date.now(),
} = {}) {
  if (!envelope || typeof envelope !== 'object' || !envelope.payload || !envelope.signature) {
    throw new Error('EXTERNAL_TRUST_CORRUPTED: Envelope is missing required payload or signature structure.');
  }
  if (!publicKey) {
    throw new Error('MISSING_PUBLIC_KEY: Ed25519 publicKey is required for external trust verification.');
  }

  const { payload, signature } = envelope;

  // 1. Verify expiration and timestamp freshness (replay protection)
  const recordTime = Date.parse(payload.timestamp);
  if (isNaN(recordTime)) {
    throw new Error('EXTERNAL_TRUST_INVALID_TIMESTAMP: Timestamp in record is invalid.');
  }
  if (now - recordTime > maxAgeMs) {
    throw new Error(`EXTERNAL_TRUST_EXPIRED: Trust record expired (age: ${now - recordTime}ms exceeds max allowed ${maxAgeMs}ms).`);
  }
  if (recordTime > now + 300000) { // 5 minutes clock skew allowance
    throw new Error('EXTERNAL_TRUST_FUTURE_TIMESTAMP: Trust record timestamp is in the future.');
  }

  // 2. Cryptographic signature verification using Ed25519 public key
  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
  let isValid = false;
  try {
    isValid = crypto.verify(
      null,
      Buffer.from(canonicalString, 'utf8'),
      publicKey,
      Buffer.from(signature, 'hex')
    );
  } catch (err) {
    throw new Error(`EXTERNAL_TRUST_SIGNATURE_INVALID: Cryptographic verification threw: ${err.message}`);
  }

  if (!isValid) {
    throw new Error('EXTERNAL_TRUST_SIGNATURE_INVALID: External trust record Ed25519 signature verification failed. Record has been forged or modified outside deployment authority.');
  }

  // 3. Validate payload bindings
  if (payload.migration_id !== expectedMigrationId) {
    throw new Error(`EXTERNAL_TRUST_MIGRATION_MISMATCH: Expected migration "${expectedMigrationId}", got "${payload.migration_id}".`);
  }
  if (payload.schema_version !== expectedSchemaVersion) {
    throw new Error(`EXTERNAL_TRUST_SCHEMA_MISMATCH: Expected schema version "${expectedSchemaVersion}", got "${payload.schema_version}".`);
  }
  if (!payload.snapshot_digest || !/^[0-9a-f]{64}$/.test(payload.snapshot_digest)) {
    throw new Error('EXTERNAL_TRUST_INVALID_DIGEST: Digest format invalid in verified record.');
  }
  if (payload.snapshot_row_count === undefined || payload.snapshot_row_count === null || payload.snapshot_row_count < 0 || !Number.isInteger(payload.snapshot_row_count)) {
    throw new Error('EXTERNAL_TRUST_INVALID_ROW_COUNT: Row count invalid in verified record.');
  }
  if (!payload.record_id || typeof payload.record_id !== 'string') {
    throw new Error('EXTERNAL_TRUST_INVALID_RECORD_ID: Unique record_id is required.');
  }

  return {
    valid: true,
    payload,
  };
}

/**
 * ============================================================================
 * S3 Compliance Storage Client (WORM Storage Interface)
 * ============================================================================
 * Supports real AWS S3 SDK PutObject with Object Lock (COMPLIANCE mode)
 * or in-memory mock implementation with strict WORM compliance validation
 * for deterministic local negative testing.
 */
export class S3ComplianceStorageClient {
  constructor(options = {}) {
    this.s3Client = options.s3Client || null;
    this.isMock = options.isMock || !options.s3Client;
    this.mockStore = options.mockStore || new Map();
  }

  async putObject({
    Bucket,
    Key,
    Body,
    ContentType = 'application/json',
    ObjectLockMode = 'COMPLIANCE',
    ObjectLockRetainUntilDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  }) {
    if (!Bucket || !Key || !Body) {
      throw new Error('S3_PUT_INVALID_ARGS: Bucket, Key, and Body are required.');
    }

    if (this.isMock) {
      const storeKey = `${Bucket}/${Key}`;
      if (this.mockStore.has(storeKey)) {
        const existing = this.mockStore.get(storeKey);
        if (existing.ObjectLockMode === 'COMPLIANCE' && existing.ObjectLockRetainUntilDate > new Date()) {
          const err = new Error(`AccessDenied: Object "${Key}" is locked in COMPLIANCE mode until ${existing.ObjectLockRetainUntilDate.toISOString()} and cannot be overwritten.`);
          err.code = 'ObjectLocked';
          err.statusCode = 403;
          throw err;
        }
      }
      this.mockStore.set(storeKey, {
        Body: typeof Body === 'string' ? Body : JSON.stringify(Body),
        ContentType,
        ObjectLockMode,
        ObjectLockRetainUntilDate: new Date(ObjectLockRetainUntilDate),
        createdAt: new Date(),
      });
      return {
        ETag: '"mock-etag-' + crypto.randomUUID() + '"',
        VersionId: 'mock-vid-' + Date.now(),
      };
    }

    // Real AWS SDK client call (when configured in production CI/CD)
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    return await this.s3Client.send(
      new PutObjectCommand({
        Bucket,
        Key,
        Body,
        ContentType,
        ObjectLockMode,
        ObjectLockRetainUntilDate,
      })
    );
  }

  async deleteObject({ Bucket, Key, VersionId }) {
    if (this.isMock) {
      const storeKey = `${Bucket}/${Key}`;
      if (this.mockStore.has(storeKey)) {
        const existing = this.mockStore.get(storeKey);
        if (existing.ObjectLockMode === 'COMPLIANCE' && existing.ObjectLockRetainUntilDate > new Date()) {
          const err = new Error(`AccessDenied: Object "${Key}" is locked in COMPLIANCE mode until ${existing.ObjectLockRetainUntilDate.toISOString()} and cannot be deleted.`);
          err.code = 'ObjectLocked';
          err.statusCode = 403;
          throw err;
        }
        this.mockStore.delete(storeKey);
      }
      return {};
    }

    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    return await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket,
        Key,
        VersionId,
      })
    );
  }

  async getObject({ Bucket, Key }) {
    if (this.isMock) {
      const storeKey = `${Bucket}/${Key}`;
      if (!this.mockStore.has(storeKey)) {
        const err = new Error(`NoSuchKey: The specified key "${Key}" does not exist in bucket "${Bucket}".`);
        err.code = 'NoSuchKey';
        err.statusCode = 404;
        throw err;
      }
      return {
        Body: this.mockStore.get(storeKey).Body,
      };
    }

    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const res = await this.s3Client.send(
      new GetObjectCommand({
        Bucket,
        Key,
      })
    );
    const bodyString = await res.Body.transformToString();
    return { Body: bodyString };
  }
}

/**
 * ============================================================================
 * Canonical Atomic Deployment & External Trust Capture Sequence
 * ============================================================================
 * Resolves the atomic capture contradiction (Finding 2).
 * Guarantees that:
 * 1. Pre-migration snapshot generation, manifest computation, and privilege lockdown
 *    occur in the SAME database transaction.
 * 2. Manifest digest and row count are read on the SAME open connection before commit.
 * 3. Ed25519 digital signature is created and self-verified before commit.
 * 4. Immutable S3 WORM upload completes before commit.
 * 5. If signing fails OR S3 archival fails, the entire database transaction is rolled back cleanly.
 *
 * @param {Object} params
 * @param {Object} params.dbClient - Active PostgreSQL client connection
 * @param {string} params.deploymentExecutionId - Unique CI/CD deployment execution ID
 * @param {string|crypto.KeyObject} params.signingPrivateKey - Ed25519 private key
 * @param {S3ComplianceStorageClient} params.s3Client - S3 compliance storage client
 * @param {string} [params.s3Bucket] - Default: 'orva-compliance-backups'
 * @param {string} [params.containmentSql] - Optional containment SQL
 * @param {string} params.migrationSql - v2.1 Migration SQL
 * @returns {Promise<{ status: string, envelope: Object, s3Key: string }>}
 */
export function stripOuterTransaction(sql) {
  if (!sql) return sql;
  let cleaned = sql.replace(/(?:^|\n)\s*BEGIN\s*;\s*(?:\n|$)/i, '\n-- [atomic-runner] stripped outer-begin\n');
  cleaned = cleaned.replace(/(?:^|\n)\s*COMMIT\s*;\s*(?:\n|$)/i, '\n-- [atomic-runner] stripped outer-commit\n');
  return cleaned;
}

export async function executeAtomicMigrationAndCapture({
  dbClient,
  deploymentExecutionId,
  signingPrivateKey,
  s3Client,
  s3Bucket = 'orva-compliance-backups',
  containmentSql = null,
  migrationSql,
}) {
  if (!dbClient || !deploymentExecutionId || !signingPrivateKey || !s3Client || !migrationSql) {
    throw new Error('ATOMIC_MIGRATION_MISSING_ARGS: dbClient, deploymentExecutionId, signingPrivateKey, s3Client, and migrationSql are required.');
  }

  const runSql = dbClient.exec ? (sql) => dbClient.exec(sql) : (sql) => dbClient.query(sql);

  // 1. Begin deployment transaction
  await runSql('BEGIN;');

  try {
    // 2. Execute containment (if provided) and migration DDL inside the open transaction
    // Strip outer BEGIN/COMMIT from migration files so they run inside our single managed transaction
    if (containmentSql) {
      await runSql(stripOuterTransaction(containmentSql));
    }
    await runSql(stripOuterTransaction(migrationSql));

    // 3. Read manifest atomically on the SAME connection inside the transaction
    const manifestRes = await dbClient.query(
      'SELECT schema_version, migration_id, row_count, snapshot_digest FROM public._v21_snapshot_manifest WHERE id = 1'
    );
    if (!manifestRes.rows || manifestRes.rows.length === 0) {
      throw new Error('ATOMIC_CAPTURE_FAILED: Snapshot manifest was not created by migration.');
    }
    const manifest = manifestRes.rows[0];

    // 4. Create Ed25519 digital signature envelope
    const envelope = createExternalTrustRecord({
      deploymentExecutionId,
      snapshotDigest: manifest.snapshot_digest,
      snapshotRowCount: Number(manifest.row_count),
      migrationId: manifest.migration_id,
      schemaVersion: manifest.schema_version,
      privateKey: signingPrivateKey,
    });

    // 5. Self-verify signed envelope using public key
    const publicKeyPem = crypto.createPublicKey(signingPrivateKey).export({ type: 'spki', format: 'pem' });
    const verified = verifyExternalTrustRecord(envelope, { publicKey: publicKeyPem });
    if (!verified.valid) {
      throw new Error('ATOMIC_CAPTURE_FAILED: Self-verification of signed trust envelope failed.');
    }

    // 6. Archive to immutable WORM S3 storage (90-day retention)
    const s3Key = `trust-records/${envelope.payload.record_id}.json`;
    await s3Client.putObject({
      Bucket: s3Bucket,
      Key: s3Key,
      Body: JSON.stringify(envelope, null, 2),
      ContentType: 'application/json',
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    });

    // 7. ONLY when DDL, signing, self-verification, and S3 archival succeed: COMMIT!
    await runSql('COMMIT;');

    return {
      status: 'COMMITTED',
      envelope,
      s3Key,
    };
  } catch (err) {
    // 8. On ANY error (signing failure, S3 archival failure, DDL error):
    // Rollback the transaction immediately to prevent orphaned/unanchored migrations!
    await runSql('ROLLBACK;');
    throw new Error(`ATOMIC_DEPLOYMENT_ABORTED: Migration rolled back due to error: ${err.message}`);
  }
}

/**
 * Creates an immutable, signed Commit Confirmation Token after PostgreSQL COMMIT.
 * This token transitions a deployment record from PREPARED to COMMITTED_AND_CONFIRMED.
 *
 * @param {Object} params
 * @param {string} params.deploymentExecutionId
 * @param {string} params.snapshotDigest
 * @param {number} params.snapshotRowCount
 * @param {string|crypto.KeyObject} params.privateKey
 * @param {string} [params.migrationId]
 * @param {string} [params.schemaVersion]
 * @param {string} [params.recordId]
 * @param {string} [params.timestamp]
 * @param {string} [params.manifestRecordId]
 * @returns {{ version: string, type: string, algorithm: string, payload: Object, signature: string }}
 */
export function createCommitConfirmationRecord({
  deploymentExecutionId,
  snapshotDigest,
  snapshotRowCount,
  privateKey,
  migrationId = CANONICAL_MIGRATION_ID,
  schemaVersion = CANONICAL_SCHEMA_VERSION,
  recordId = 'orva-confirm-' + crypto.randomUUID(),
  timestamp = new Date().toISOString(),
  manifestRecordId = undefined,
}) {
  if (!deploymentExecutionId || !snapshotDigest || snapshotRowCount === undefined || !privateKey) {
    throw new Error('CONFIRMATION_RECORD_MISSING_ARGS: deploymentExecutionId, snapshotDigest, snapshotRowCount, and privateKey are required.');
  }

  const payload = {
    record_id: String(recordId),
    deployment_execution_id: String(deploymentExecutionId),
    migration_id: String(migrationId),
    schema_version: String(schemaVersion),
    snapshot_digest: String(snapshotDigest),
    snapshot_row_count: Number(snapshotRowCount),
    status: 'COMMITTED_AND_CONFIRMED',
    timestamp: String(timestamp),
  };
  if (manifestRecordId) {
    payload.manifest_record_id = String(manifestRecordId);
  }

  const canonicalString = JSON.stringify(payload, Object.keys(payload).sort());
  const signature = crypto.sign(null, Buffer.from(canonicalString, 'utf8'), privateKey);

  return {
    version: '2.0',
    type: 'COMMIT_CONFIRMATION',
    algorithm: 'Ed25519',
    payload,
    signature: signature.toString('hex'),
  };
}

/**
 * Verifies that an external deployment record is eligible for rollback authorization.
 * Mandates BOTH an authentic prepared manifest AND an authentic signed commit confirmation.
 * Rejects unconfirmed, phantom, mismatched, or expired records.
 *
 * @param {Object} params
 * @param {Object} params.manifestEnvelope - The prepared manifest envelope from S3
 * @param {Object} params.confirmationEnvelope - The commit confirmation envelope from S3
 * @param {string|crypto.KeyObject} params.publicKey - Ed25519 public key
 * @param {string} [params.expectedMigrationId]
 * @param {string} [params.expectedSchemaVersion]
 * @param {number} [params.maxAgeMs]
 * @param {number} [params.now]
 * @returns {{ eligible: boolean, manifest: Object, confirmation: Object }}
 */
export function verifyRollbackEligibility({
  manifestEnvelope,
  confirmationEnvelope,
  publicKey,
  expectedMigrationId = CANONICAL_MIGRATION_ID,
  expectedSchemaVersion = CANONICAL_SCHEMA_VERSION,
  maxAgeMs = DEFAULT_MAX_TRUST_AGE_MS,
  now = Date.now(),
} = {}) {
  if (!manifestEnvelope) {
    throw new Error('ROLLBACK_ABORT_MISSING_MANIFEST: Manifest envelope is missing.');
  }
  if (!confirmationEnvelope) {
    throw new Error('ROLLBACK_ABORT_UNCONFIRMED_DEPLOYMENT: Trust record is in PREPARED state but lacks signed commit confirmation. Rollback refused.');
  }

  // 1. Verify manifest envelope signature and structure
  verifyExternalTrustRecord(manifestEnvelope, {
    publicKey,
    expectedMigrationId,
    expectedSchemaVersion,
    maxAgeMs,
    now,
  });

  // 2. Verify confirmation envelope signature and structure
  verifyExternalTrustRecord(confirmationEnvelope, {
    publicKey,
    expectedMigrationId,
    expectedSchemaVersion,
    maxAgeMs,
    now,
  });

  // 3. Verify confirmation payload status
  if (confirmationEnvelope.payload.status !== 'COMMITTED_AND_CONFIRMED') {
    throw new Error(`ROLLBACK_ABORT_INVALID_STATUS: Confirmation status must be COMMITTED_AND_CONFIRMED, got "${confirmationEnvelope.payload.status}".`);
  }

  // 4. Verify cryptographic and logical bindings between manifest and confirmation
  if (manifestEnvelope.payload.deployment_execution_id !== confirmationEnvelope.payload.deployment_execution_id) {
    throw new Error('ROLLBACK_ABORT_EXECUTION_MISMATCH: Manifest and confirmation deployment_execution_id do not match.');
  }

  if (manifestEnvelope.payload.snapshot_digest !== confirmationEnvelope.payload.snapshot_digest) {
    throw new Error('ROLLBACK_ABORT_DIGEST_MISMATCH: Manifest and confirmation snapshot_digest do not match.');
  }

  if (manifestEnvelope.payload.snapshot_row_count !== confirmationEnvelope.payload.snapshot_row_count) {
    throw new Error('ROLLBACK_ABORT_ROW_COUNT_MISMATCH: Manifest and confirmation snapshot_row_count do not match.');
  }

  const manifestTime = Date.parse(manifestEnvelope.payload.timestamp);
  const confirmTime = Date.parse(confirmationEnvelope.payload.timestamp);
  if (confirmTime < manifestTime - 1000) {
    throw new Error('ROLLBACK_ABORT_TIMING_ANOMALY: Commit confirmation timestamp precedes manifest preparation timestamp.');
  }

  return {
    eligible: true,
    manifest: manifestEnvelope,
    confirmation: confirmationEnvelope,
  };
}

/**
 * Executes a two-phase transactional migration with commit confirmation.
 * Phase 1: Begins transaction, applies DDL, reads in-transaction manifest,
 *          signs PREPARED manifest, archives manifest to S3.
 * Phase 2: Commits database transaction.
 * Phase 3: Signs and archives COMMIT_CONFIRMATION token to S3.
 *
 * If Phase 2 fails, the prepared manifest remains unconfirmed in S3 and
 * cannot be used for rollback authorization.
 */
export async function executeTwoPhaseMigrationAndCapture({
  dbClient,
  deploymentExecutionId,
  signingPrivateKey,
  s3Client,
  s3Bucket = 'orva-compliance-backups',
  containmentSql = null,
  migrationSql,
}) {
  if (!dbClient || !deploymentExecutionId || !signingPrivateKey || !s3Client || !migrationSql) {
    throw new Error('TWO_PHASE_MIGRATION_MISSING_ARGS: dbClient, deploymentExecutionId, signingPrivateKey, s3Client, and migrationSql are required.');
  }

  const runSql = dbClient.exec ? (sql) => dbClient.exec(sql) : (sql) => dbClient.query(sql);

  // Phase 1: In-transaction execution and prepared manifest archival
  await runSql('BEGIN;');

  let manifestEnvelope;
  let manifestS3Key;

  try {
    if (containmentSql) {
      await runSql(stripOuterTransaction(containmentSql));
    }
    await runSql(stripOuterTransaction(migrationSql));

    const manifestRes = await dbClient.query(
      'SELECT schema_version, migration_id, row_count, snapshot_digest FROM public._v21_snapshot_manifest WHERE id = 1'
    );
    if (!manifestRes.rows || manifestRes.rows.length === 0) {
      throw new Error('TWO_PHASE_PREPARATION_FAILED: Snapshot manifest was not created by migration.');
    }
    const manifest = manifestRes.rows[0];

    manifestEnvelope = createExternalTrustRecord({
      deploymentExecutionId,
      snapshotDigest: manifest.snapshot_digest,
      snapshotRowCount: Number(manifest.row_count),
      migrationId: manifest.migration_id,
      schemaVersion: manifest.schema_version,
      privateKey: signingPrivateKey,
      status: 'PREPARED',
    });

    const publicKeyPem = crypto.createPublicKey(signingPrivateKey).export({ type: 'spki', format: 'pem' });
    const verified = verifyExternalTrustRecord(manifestEnvelope, { publicKey: publicKeyPem });
    if (!verified.valid) {
      throw new Error('TWO_PHASE_PREPARATION_FAILED: Self-verification of signed manifest failed.');
    }

    manifestS3Key = `trust-records/${deploymentExecutionId}/manifest.json`;
    await s3Client.putObject({
      Bucket: s3Bucket,
      Key: manifestS3Key,
      Body: JSON.stringify(manifestEnvelope, null, 2),
      ContentType: 'application/json',
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    });
  } catch (err) {
    await runSql('ROLLBACK;');
    throw new Error(`TWO_PHASE_PREPARATION_FAILED: ${err.message}`);
  }

  // Phase 2: Commit Database Transaction
  try {
    await runSql('COMMIT;');
  } catch (commitErr) {
    // Database commit failed; transaction rolled back.
    // The prepared manifest exists in S3 but lacks commit confirmation.
    throw new Error(`TWO_PHASE_COMMIT_FAILED: Database commit failed: ${commitErr.message}`);
  }

  // Phase 3: Archive Commit Confirmation Token in S3
  let confirmEnvelope;
  let confirmS3Key;
  try {
    confirmEnvelope = createCommitConfirmationRecord({
      deploymentExecutionId,
      snapshotDigest: manifestEnvelope.payload.snapshot_digest,
      snapshotRowCount: manifestEnvelope.payload.snapshot_row_count,
      migrationId: manifestEnvelope.payload.migration_id,
      schemaVersion: manifestEnvelope.payload.schema_version,
      privateKey: signingPrivateKey,
      manifestRecordId: manifestEnvelope.payload.record_id,
    });

    confirmS3Key = `trust-records/${deploymentExecutionId}/commit-confirmed.json`;
    await s3Client.putObject({
      Bucket: s3Bucket,
      Key: confirmS3Key,
      Body: JSON.stringify(confirmEnvelope, null, 2),
      ContentType: 'application/json',
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    });
  } catch (confirmErr) {
    return {
      status: 'COMMITTED_CONFIRMATION_PENDING',
      deploymentExecutionId,
      manifestEnvelope,
      manifestS3Key,
      confirmationPending: true,
      error: confirmErr.message,
    };
  }

  return {
    status: 'COMMITTED_AND_CONFIRMED',
    deploymentExecutionId,
    manifestEnvelope,
    manifestS3Key,
    confirmEnvelope,
    confirmS3Key,
  };
}

/**
 * Reconciles an incomplete deployment where PostgreSQL committed but runner crashed
 * before writing commit-confirmed.json. Inspects PostgreSQL and S3, validates state,
 * and issues confirmation if and only if database state confirms the commit.
 */
export async function reconcileCommitConfirmation({
  dbClient,
  deploymentExecutionId,
  signingPrivateKey,
  s3Client,
  s3Bucket = 'orva-compliance-backups',
}) {
  const manifestKey = `trust-records/${deploymentExecutionId}/manifest.json`;
  let manifestRaw;
  try {
    manifestRaw = await s3Client.getObject({ Bucket: s3Bucket, Key: manifestKey });
  } catch (err) {
    throw new Error(`RECONCILE_FAILED_MANIFEST_NOT_FOUND: ${err.message}`);
  }
  const manifestEnvelope = JSON.parse(manifestRaw.Body);

  let manifestRes;
  try {
    manifestRes = await dbClient.query(
      'SELECT schema_version, migration_id, row_count, snapshot_digest FROM public._v21_snapshot_manifest WHERE id = 1'
    );
  } catch (dbErr) {
    throw new Error(`RECONCILIATION_ABORT_NOT_COMMITTED: Database does not contain committed manifest table. Commit never took place; confirmation refused. (${dbErr.message})`);
  }
  if (!manifestRes.rows || manifestRes.rows.length === 0) {
    throw new Error(`RECONCILIATION_ABORT_NOT_COMMITTED: Database does not contain committed manifest for execution ${deploymentExecutionId}. Commit never took place; confirmation refused.`);
  }
  const dbManifest = manifestRes.rows[0];

  if (dbManifest.snapshot_digest !== manifestEnvelope.payload.snapshot_digest) {
    throw new Error('RECONCILIATION_ABORT_DIGEST_MISMATCH: Database committed digest does not match prepared S3 manifest.');
  }
  if (Number(dbManifest.row_count) !== manifestEnvelope.payload.snapshot_row_count) {
    throw new Error('RECONCILIATION_ABORT_ROW_COUNT_MISMATCH: Database row count does not match prepared S3 manifest.');
  }

  const confirmEnvelope = createCommitConfirmationRecord({
    deploymentExecutionId,
    snapshotDigest: dbManifest.snapshot_digest,
    snapshotRowCount: Number(dbManifest.row_count),
    migrationId: dbManifest.migration_id,
    schemaVersion: dbManifest.schema_version,
    privateKey: signingPrivateKey,
    manifestRecordId: manifestEnvelope.payload.record_id,
  });

  const confirmS3Key = `trust-records/${deploymentExecutionId}/commit-confirmed.json`;
  await s3Client.putObject({
    Bucket: s3Bucket,
    Key: confirmS3Key,
    Body: JSON.stringify(confirmEnvelope, null, 2),
    ContentType: 'application/json',
    ObjectLockMode: 'COMPLIANCE',
    ObjectLockRetainUntilDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  });

  return {
    status: 'CONFIRMATION_RECONCILED',
    confirmEnvelope,
    confirmS3Key,
  };
}

