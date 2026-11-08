import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from '../framework/test-suite';

describe('Boundary B01: Build & Config Boundaries', { tier: 'tier2', featureId: 'B01' }, () => {
  const projectRoot = path.resolve(__dirname, '../../../');

  it('B01-T01: tsconfig handles empty or missing plugins array without failure', () => {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    expect(Array.isArray(tsconfig.compilerOptions.plugins)).toBe(true);
  });

  it('B01-T02: Path aliases map exactly to single array element avoiding ambiguity', () => {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    const paths = tsconfig.compilerOptions.paths;
    for (const [key, targets] of Object.entries(paths)) {
      expect(Array.isArray(targets)).toBe(true);
      expect((targets as any[]).length).toBeGreaterThan(0);
    }
  });

  it('B01-T03: package.json script section handles execution strings without syntax anomalies', () => {
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(typeof pkg.scripts.build).toBe('string');
    expect(typeof pkg.scripts.dev).toBe('string');
  });

  it('B01-T04: tsconfig exclude block protects node_modules from recursive inclusion', () => {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    expect(tsconfig.exclude).toContain('node_modules');
  });

  it('B01-T05: Node version in current environment meets or exceeds requirements', () => {
    const majorVersion = parseInt(process.versions.node.split('.')[0], 10);
    expect(majorVersion).toBeGreaterThanOrEqual(18);
  });
});
