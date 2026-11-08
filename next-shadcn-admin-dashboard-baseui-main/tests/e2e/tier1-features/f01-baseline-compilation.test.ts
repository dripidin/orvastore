import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it, expect } from '../framework/test-suite';

describe('Feature 1: Baseline Compilation & Build Configuration', { tier: 'tier1', featureId: 'F01' }, () => {
  const projectRoot = path.resolve(__dirname, '../../../');

  it('F01-T01: tsconfig.json exists, is valid JSON, and enables strict mode', () => {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    expect(fs.existsSync(tsconfigPath)).toBeTruthy();
    const content = fs.readFileSync(tsconfigPath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.compilerOptions.strict).toBe(true);
  });

  it('F01-T02: tsconfig.json configures path alias @/* mapped to ./src/*', () => {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const content = fs.readFileSync(tsconfigPath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.compilerOptions.paths['@/*']).toEqual(['./src/*']);
  });

  it('F01-T03: package.json specifies required Next.js 16 and React 19 dependencies', () => {
    const pkgPath = path.join(projectRoot, 'package.json');
    expect(fs.existsSync(pkgPath)).toBeTruthy();
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(Boolean(pkg.dependencies.next)).toBe(true);
    expect(Boolean(pkg.dependencies.react)).toBe(true);
    expect(pkg.dependencies['@base-ui/react']).toBeDefined();
    expect(pkg.dependencies['@tanstack/react-table']).toBeDefined();
  });

  it('F01-T04: Core application directory structure conforms to Next.js App Router', () => {
    expect(fs.existsSync(path.join(projectRoot, 'src/app'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/lib'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/components'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'src/data'))).toBe(true);
  });

  it('F01-T05: Next.js globals.css stylesheet exists and defines Tailwind CSS directives', () => {
    const cssPath = path.join(projectRoot, 'src/app/globals.css');
    expect(fs.existsSync(cssPath)).toBe(true);
    const content = fs.readFileSync(cssPath, 'utf8');
    expect(content.length).toBeGreaterThan(100);
  });
});
