import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from '../framework/test-suite';
import { ALGERIA_58_WILAYAS } from '../framework/domain-engine';

describe('Feature 3: Cascading Wilayas (58) & Communes (1541)', { tier: 'tier1', featureId: 'F03' }, () => {
  const communesJsonPath = path.resolve(__dirname, '../../../src/data/geoalgeria/communes.json');

  it('F03-T01: Database contains exactly 1,541 Algerian communes', () => {
    expect(fs.existsSync(communesJsonPath)).toBe(true);
    const communes = JSON.parse(fs.readFileSync(communesJsonPath, 'utf8'));
    expect(communes.length).toBe(1541);
  });

  it('F03-T02: Exactly 58 official Algerian Wilayas are inventoried with Arabic and French names', () => {
    expect(ALGERIA_58_WILAYAS.length).toBe(58);
    expect(ALGERIA_58_WILAYAS[0].code).toBe(1);
    expect(ALGERIA_58_WILAYAS[0].nameFr).toBe('Adrar');
    expect(ALGERIA_58_WILAYAS[57].code).toBe(58);
    expect(ALGERIA_58_WILAYAS[57].nameFr).toBe('El Meniaa');
  });

  it('F03-T03: Filtering by Wilaya 16 (Alger) returns only communes belonging to Algiers', () => {
    const communes = JSON.parse(fs.readFileSync(communesJsonPath, 'utf8'));
    const algerCommunes = communes.filter((c: any) => c.wilaya_code === 16);
    expect(algerCommunes.length).toBeGreaterThan(50);
    const names = algerCommunes.map((c: any) => c.commune_name_fr);
    expect(names).toContain('Hydra');
    expect(names).toContain('El Biar');
  });

  it('F03-T04: Filtering by Wilaya 31 (Oran) returns Oran communes', () => {
    const communes = JSON.parse(fs.readFileSync(communesJsonPath, 'utf8'));
    const oranCommunes = communes.filter((c: any) => c.wilaya_code === 31);
    expect(oranCommunes.length).toBeGreaterThan(20);
    const names = oranCommunes.map((c: any) => c.commune_name_fr);
    expect(names).toContain('Es Senia');
    expect(names).toContain('Bir El Djir');
  });

  it('F03-T05: Origin Hub Wilaya 07 (Biskra) exists with valid commune records', () => {
    const communes = JSON.parse(fs.readFileSync(communesJsonPath, 'utf8'));
    const biskraCommunes = communes.filter((c: any) => c.wilaya_code === 7);
    expect(biskraCommunes.length).toBeGreaterThan(10);
    const names = biskraCommunes.map((c: any) => c.commune_name_fr);
    expect(names).toContain('Biskra');
  });
});
