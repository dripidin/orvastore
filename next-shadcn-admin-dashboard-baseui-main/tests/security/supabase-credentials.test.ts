/**
 * ORVA Store — SEC-01: Supabase Credentials Fail-Closed Security Suite
 * Verifies strict rejection of publishable/anon keys, malformed credentials,
 * fail-closed semantics in production, secret leakage prevention, and client isolation.
 */

import assert from 'node:assert/strict';
import {
  validateServiceRoleKey,
  isServiceRoleConfigured,
  getSupabaseServerClient,
  supabaseServer,
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from '../../src/lib/supabase/server';
import { getSupabaseClient } from '../../src/lib/supabase/client';

console.log('================================================================================');
console.log('   ORVA STORE — SEC-01: SUPABASE CREDENTIALS FAIL-CLOSED SECURITY SUITE');
console.log('   Timestamp:', new Date().toISOString());
console.log('================================================================================\n');

let passCount = 0;
let totalCount = 0;

function check(title: string, fn: () => void) {
  totalCount++;
  try {
    fn();
    passCount++;
    console.log(`  [PASS] Test ${String(totalCount).padStart(2, '0')}: ${title}`);
  } catch (err: any) {
    console.error(`  [FAIL] Test ${String(totalCount).padStart(2, '0')}: ${title}`);
    console.error('         Error:', err.message);
    throw err;
  }
}

// Synthetic JWT generators for negative testing
function createMockJwt(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = 'synthetic_signature_for_local_negative_testing_only';
  return `${header}.${body}.${signature}`;
}

const originalEnv = { ...process.env };

try {
  console.log('── GROUP 1: Credential Validation Logic (validateServiceRoleKey)');

  check('Undefined credential is rejected', () => {
    const res = validateServiceRoleKey(undefined);
    assert.equal(res.valid, false);
    assert.ok(res.reason?.includes('missing'));
  });

  check('Null credential is rejected', () => {
    const res = validateServiceRoleKey(null as any);
    assert.equal(res.valid, false);
  });

  check('Empty string credential is rejected', () => {
    const res = validateServiceRoleKey('');
    assert.equal(res.valid, false);
    assert.ok(res.reason?.includes('empty'));
  });

  check('Whitespace-only credential is rejected', () => {
    const res = validateServiceRoleKey('   \t\n  ');
    assert.equal(res.valid, false);
    assert.ok(res.reason?.includes('empty'));
  });

  check('Publishable key with prefix sb_publishable_ is strictly rejected', () => {
    const res = validateServiceRoleKey('sb_publishable_7c9dtcV6aM5B32hwxWxPGw_JLLC7tmu');
    assert.equal(res.valid, false);
    assert.ok(res.reason?.includes('Publishable key'));
  });

  check('Key matching NEXT_PUBLIC_SUPABASE_ANON_KEY is strictly rejected', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'custom-public-anon-key-1234567890';
    const res = validateServiceRoleKey('custom-public-anon-key-1234567890');
    assert.equal(res.valid, false);
    assert.ok(res.reason?.includes('Public anonymous key'));
  });

  check('JWT credential with role "anon" is strictly rejected', () => {
    const anonJwt = createMockJwt({
      iss: 'supabase',
      ref: 'olmsjkhdfghyydogcvvy',
      role: 'anon',
      exp: 1999999999,
    });
    const res = validateServiceRoleKey(anonJwt);
    assert.equal(res.valid, false);
    assert.ok(res.reason?.includes('JWT role claim is "anon"'));
  });

  check('JWT credential with role "authenticated" is strictly rejected', () => {
    const authJwt = createMockJwt({
      iss: 'supabase',
      ref: 'olmsjkhdfghyydogcvvy',
      role: 'authenticated',
      exp: 1999999999,
    });
    const res = validateServiceRoleKey(authJwt);
    assert.equal(res.valid, false);
    assert.ok(res.reason?.includes('JWT role claim is "authenticated"'));
  });

  check('Malformed JWT with unparseable payload is rejected', () => {
    const malformed = 'eyJhbGciOiJIUzI1NiJ9.not-valid-base64-json!?.signature';
    const res = validateServiceRoleKey(malformed);
    assert.equal(res.valid, false);
    assert.ok(res.reason?.includes('Malformed JWT'));
  });

  check('Credential with insufficient length (< 20 chars) is rejected', () => {
    const res = validateServiceRoleKey('short-token-123');
    assert.equal(res.valid, false);
    assert.ok(res.reason?.includes('insufficient'));
  });

  check('Genuine service_role JWT is accepted', () => {
    const serviceRoleJwt = createMockJwt({
      iss: 'supabase',
      ref: 'olmsjkhdfghyydogcvvy',
      role: 'service_role',
      exp: 1999999999,
    });
    const res = validateServiceRoleKey(serviceRoleJwt);
    assert.equal(res.valid, true);
    assert.equal(res.reason, undefined);
  });

  check('Valid modern secret key format is accepted', () => {
    const validSecretKey = 'sb_secret_live_production_key_sample_8832749102';
    const res = validateServiceRoleKey(validSecretKey);
    assert.equal(res.valid, true);
  });

  console.log('\n── GROUP 2: Fail-Closed Server Operations & Environment Gates');

  check('isServiceRoleConfigured() reflects environment state accurately', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(isServiceRoleConfigured(), false);

    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_publishable_cannot_use_this';
    assert.equal(isServiceRoleConfigured(), false);

    process.env.SUPABASE_SERVICE_ROLE_KEY = createMockJwt({ role: 'service_role' });
    assert.equal(isServiceRoleConfigured(), true);
  });

  check('getSupabaseServerClient() throws fail-closed error when key missing in Production', () => {
    __testResetSupabaseServerInstance();
    (process.env as any).NODE_ENV = 'production';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    assert.throws(
      () => getSupabaseServerClient(),
      /Privileged operations require a valid SUPABASE_SERVICE_ROLE_KEY/
    );
  });

  check('getSupabaseServerClient() throws fail-closed error when publishable key passed in Production', () => {
    __testResetSupabaseServerInstance();
    (process.env as any).NODE_ENV = 'production';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_publishable_7c9dtcV6aM5B32hwxWxPGw_JLLC7tmu';

    assert.throws(
      () => getSupabaseServerClient(),
      /Publishable key cannot be used for administrative operations/
    );
  });

  check('getSupabaseServerClient() throws fail-closed error when anon key passed in Development', () => {
    __testResetSupabaseServerInstance();
    (process.env as any).NODE_ENV = 'development';
    process.env.SUPABASE_SERVICE_ROLE_KEY = createMockJwt({ role: 'anon' });

    assert.throws(
      () => getSupabaseServerClient(),
      /JWT role claim is "anon"/
    );
  });

  check('getSupabaseServerClient() initializes successfully when valid service_role key provided', () => {
    __testResetSupabaseServerInstance();
    (process.env as any).NODE_ENV = 'production';
    process.env.SUPABASE_SERVICE_ROLE_KEY = createMockJwt({
      iss: 'supabase',
      role: 'service_role',
    });

    const client = getSupabaseServerClient();
    assert.ok(client, 'Server client must be defined');
    assert.equal(typeof client.from, 'function', 'client.from must be a function');
  });

  check('supabaseServer proxy accesses client lazily and fails closed without valid credential', () => {
    __testResetSupabaseServerInstance();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    assert.throws(
      () => supabaseServer.from('orders'),
      /Privileged operations require a valid SUPABASE_SERVICE_ROLE_KEY/
    );
  });

  check('Secret values are NEVER leaked in error messages', () => {
    __testResetSupabaseServerInstance();
    const sensitiveTestSecret = 'sb_publishable_SUPER_SECRET_TOKEN_DO_NOT_LEAK_99999';
    process.env.SUPABASE_SERVICE_ROLE_KEY = sensitiveTestSecret;

    try {
      getSupabaseServerClient();
      assert.fail('Should have thrown');
    } catch (err: any) {
      assert.equal(
        err.message.includes(sensitiveTestSecret),
        false,
        'Error message must NOT contain the secret value'
      );
    }
  });

  console.log('\n── GROUP 3: Public Browser Client vs Server Client Isolation');

  check('Browser client in client.ts uses public anon key and remains separate from server', () => {
    const publicClient = getSupabaseClient();
    assert.ok(publicClient, 'Public browser client must initialize safely');
    assert.equal(typeof publicClient.from, 'function');
  });

  check('__testSetSupabaseServerInstance allows clean test mocks without credentials', () => {
    __testResetSupabaseServerInstance();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const mockClient: any = {
      from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
    };

    __testSetSupabaseServerInstance(mockClient);
    const client = getSupabaseServerClient();
    assert.equal(client, mockClient);
    __testResetSupabaseServerInstance();
  });

} finally {
  // Restore pristine environment
  for (const k of Object.keys(process.env)) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  Object.assign(process.env, originalEnv);
  __testResetSupabaseServerInstance();
}

console.log('\n================================================================================');
console.log(`   SEC-01 AUDIT COMPLETE: ${passCount} / ${totalCount} CHECKS PASSED (100%)`);
console.log('================================================================================\n');
