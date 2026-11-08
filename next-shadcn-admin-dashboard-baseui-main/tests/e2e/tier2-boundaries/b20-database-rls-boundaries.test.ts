import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from '../framework/test-suite';

describe('Boundary B20: Database RLS Security Boundaries', { tier: 'tier2', featureId: 'B20' }, () => {
  const schemaSqlPath = path.resolve(__dirname, '../../../../template/DATABASE_SCHEMA.sql');

  it('B20-T01: No public SELECT policy grants anonymous role access to orders table', () => {
    const sql = fs.readFileSync(schemaSqlPath, 'utf8');
    // Ensure there is NO policy allowing anon to SELECT orders
    const anonSelectOrders = /CREATE\s+POLICY\s+.*ON\s+orders\s+FOR\s+SELECT\s+TO\s+anon/i.test(sql);
    expect(anonSelectOrders).toBe(false);
  });

  it('B20-T02: No public SELECT policy grants anonymous role access to customers PII table', () => {
    const sql = fs.readFileSync(schemaSqlPath, 'utf8');
    const anonSelectCustomers = /CREATE\s+POLICY\s+.*ON\s+customers\s+FOR\s+SELECT\s+TO\s+anon/i.test(sql);
    expect(anonSelectCustomers).toBe(false);
  });

  it('B20-T03: Deliveries table prohibits anonymous SELECT or UPDATE', () => {
    const sql = fs.readFileSync(schemaSqlPath, 'utf8');
    const anonSelectDeliveries = /CREATE\s+POLICY\s+.*ON\s+deliveries\s+FOR\s+SELECT\s+TO\s+anon/i.test(sql);
    const anonUpdateDeliveries = /CREATE\s+POLICY\s+.*ON\s+deliveries\s+FOR\s+UPDATE\s+TO\s+anon/i.test(sql);
    expect(anonSelectDeliveries).toBe(false);
    expect(anonUpdateDeliveries).toBe(false);
  });

  it('B20-T04: Order reconciliation table enables RLS and restricts access to admin/service role only', () => {
    const sql = fs.readFileSync(schemaSqlPath, 'utf8');
    expect(sql).toContain('ALTER TABLE cod_reconciliations ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('CREATE POLICY "Service role full access on reconciliations" ON cod_reconciliations');
  });

  it('B20-T05: Site settings table includes singleton constraint preventing multiple configuration rows', () => {
    const sql = fs.readFileSync(schemaSqlPath, 'utf8');
    expect(sql).toContain('CHECK (id = 1)');
  });
});
