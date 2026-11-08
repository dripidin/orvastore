import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect, resolveProjectPath } from '../framework/test-suite';

describe('Feature 20: Database Schema & Supabase RLS Policies', { tier: 'tier1', featureId: 'F20' }, () => {
  const schemaSqlPath = resolveProjectPath('template/DATABASE_SCHEMA.sql');

  it('F20-T01: DATABASE_SCHEMA.sql defines all required commerce and logistics tables', () => {
    expect(fs.existsSync(schemaSqlPath)).toBe(true);
    const sql = fs.readFileSync(schemaSqlPath, 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS products');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS orders');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS order_items');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS customers');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS deliveries');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS site_settings');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS order_timeline_events');
  });

  it('F20-T02: Row-Level Security (RLS) is explicitly enabled on all public and private tables', () => {
    const sql = fs.readFileSync(schemaSqlPath, 'utf8');
    expect(sql).toContain('ALTER TABLE products ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE orders ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE customers ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;');
  });

  it('F20-T03: Anonymous storefront visitors are granted INSERT permission on orders and order_items', () => {
    const sql = fs.readFileSync(schemaSqlPath, 'utf8');
    expect(sql).toContain('CREATE POLICY "Anon can create orders during checkout" ON orders FOR INSERT TO anon');
    expect(sql).toContain('CREATE POLICY "Anon can create order_items during checkout" ON order_items FOR INSERT TO anon');
  });

  it('F20-T04: Public SELECT is restricted to published products only', () => {
    const sql = fs.readFileSync(schemaSqlPath, 'utf8');
    expect(sql).toContain("status = 'PUBLISHED'");
  });

  it('F20-T05: Authenticated admin users and service role have unrestricted full access', () => {
    const sql = fs.readFileSync(schemaSqlPath, 'utf8');
    expect(sql).toContain('CREATE POLICY "Service role full access on orders" ON orders FOR ALL TO service_role');
    expect(sql).toContain('CREATE POLICY "Admins full access on orders" ON orders FOR ALL TO authenticated');
  });
});
