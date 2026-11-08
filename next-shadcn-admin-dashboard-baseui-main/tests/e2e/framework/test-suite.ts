/**
 * ORVA COD E-Commerce Platform — E2E Test Suite Framework
 * 
 * Lightweight, zero-dependency, self-contained test harness supporting:
 * - 4-Tier structured test organization (Tier 1: Features, Tier 2: Boundaries, Tier 3: Pairwise, Tier 4: Scenarios)
 * - Rich assertions (equal, deepEqual, matches, throws, rejects, truthy, falsy)
 * - Both standalone per-file execution and aggregate execution via runner.ts
 */

export type Tier = 'tier1' | 'tier2' | 'tier3' | 'tier4';

export interface TestCase {
  id: string;
  name: string;
  tier: Tier;
  featureId?: string;
  fn: () => void | Promise<void>;
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  error?: Error;
  durationMs?: number;
}

export interface TestSuite {
  name: string;
  tier: Tier;
  featureId?: string;
  cases: TestCase[];
}

export interface RunResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  byTier: Record<Tier, { total: number; passed: number; failed: number }>;
  failures: Array<{ suite: string; name: string; error: Error }>;
}

// Global registry for registered suites
export const globalSuites: TestSuite[] = [];

let currentSuite: TestSuite | null = null;

export function describe(name: string, options: { tier: Tier; featureId?: string }, fn: () => void): TestSuite {
  const suite: TestSuite = {
    name,
    tier: options.tier,
    featureId: options.featureId,
    cases: []
  };

  currentSuite = suite;
  globalSuites.push(suite);
  fn();
  currentSuite = null;
  return suite;
}

export function it(name: string, fn: () => void | Promise<void>): void {
  if (!currentSuite) {
    throw new Error(`Cannot register test "${name}" outside of a describe() block`);
  }

  const id = `${currentSuite.tier}-${currentSuite.featureId || 'suite'}-${currentSuite.cases.length + 1}`;
  currentSuite.cases.push({
    id,
    name,
    tier: currentSuite.tier,
    featureId: currentSuite.featureId,
    fn,
    status: 'pending'
  });
}

// Lightweight assertion library
export class AssertionError extends Error {
  constructor(message: string, public actual?: unknown, public expected?: unknown) {
    super(message);
    this.name = 'AssertionError';
  }
}

export const expect = (actual: unknown) => ({
  toBe(expected: unknown) {
    if (actual !== expected) {
      throw new AssertionError(`Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`, actual, expected);
    }
  },
  toEqual(expected: unknown) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
      throw new AssertionError(`Expected deep equality:\nActual:   ${a}\nExpected: ${b}`, actual, expected);
    }
  },
  toBeTruthy() {
    if (!actual) {
      throw new AssertionError(`Expected truthy value, got ${JSON.stringify(actual)}`, actual, true);
    }
  },
  toBeFalsy() {
    if (actual) {
      throw new AssertionError(`Expected falsy value, got ${JSON.stringify(actual)}`, actual, false);
    }
  },
  toBeGreaterThan(expected: number) {
    if (typeof actual !== 'number' || actual <= expected) {
      throw new AssertionError(`Expected ${actual} > ${expected}`, actual, expected);
    }
  },
  toBeGreaterThanOrEqual(expected: number) {
    if (typeof actual !== 'number' || actual < expected) {
      throw new AssertionError(`Expected ${actual} >= ${expected}`, actual, expected);
    }
  },
  toBeLessThan(expected: number) {
    if (typeof actual !== 'number' || actual >= expected) {
      throw new AssertionError(`Expected ${actual} < ${expected}`, actual, expected);
    }
  },
  toBeLessThanOrEqual(expected: number) {
    if (typeof actual !== 'number' || actual > expected) {
      throw new AssertionError(`Expected ${actual} <= ${expected}`, actual, expected);
    }
  },
  toContain(item: unknown) {
    if (Array.isArray(actual)) {
      if (!actual.includes(item)) {
        throw new AssertionError(`Expected array to contain ${JSON.stringify(item)}`, actual, item);
      }
    } else if (typeof actual === 'string') {
      if (!actual.includes(String(item))) {
        throw new AssertionError(`Expected string to contain ${JSON.stringify(item)}`, actual, item);
      }
    } else {
      throw new AssertionError(`Cannot check toContain on type ${typeof actual}`);
    }
  },
  toMatch(regex: RegExp) {
    if (typeof actual !== 'string' || !regex.test(actual)) {
      throw new AssertionError(`Expected "${actual}" to match regex ${regex}`, actual, regex);
    }
  },
  toBeDefined() {
    if (actual === undefined) {
      throw new AssertionError(`Expected defined value, got undefined`);
    }
  },
  toBeNull() {
    if (actual !== null) {
      throw new AssertionError(`Expected null, got ${JSON.stringify(actual)}`, actual, null);
    }
  },
  toHaveLength(expectedLen: number) {
    const len = Array.isArray(actual) || typeof actual === 'string' ? actual.length : (actual as any)?.length;
    if (len !== expectedLen) {
      throw new AssertionError(`Expected length ${expectedLen}, got ${len}`, len, expectedLen);
    }
  },
  not: {
    toContain(item: unknown) {
      if (Array.isArray(actual)) {
        if (actual.includes(item)) {
          throw new AssertionError(`Expected array NOT to contain ${JSON.stringify(item)}`, actual, item);
        }
      } else if (typeof actual === 'string') {
        if (actual.includes(String(item))) {
          throw new AssertionError(`Expected string NOT to contain ${JSON.stringify(item)}`, actual, item);
        }
      }
    },
    toBe(expected: unknown) {
      if (actual === expected) {
        throw new AssertionError(`Expected ${JSON.stringify(actual)} NOT to be ${JSON.stringify(expected)}`, actual, expected);
      }
    }
  }
});

export const assertThrows = (fn: () => void, expectedErrorRegexOrMsg?: string | RegExp): void => {
  let threw = false;
  let caughtError: any = null;
  try {
    fn();
  } catch (err) {
    threw = true;
    caughtError = err;
  }
  if (!threw) {
    throw new AssertionError(`Expected function to throw, but it executed without error.`);
  }
  if (expectedErrorRegexOrMsg) {
    const msg = caughtError?.message || String(caughtError);
    if (expectedErrorRegexOrMsg instanceof RegExp) {
      if (!expectedErrorRegexOrMsg.test(msg)) {
        throw new AssertionError(`Expected error message "${msg}" to match ${expectedErrorRegexOrMsg}`);
      }
    } else {
      if (!msg.includes(expectedErrorRegexOrMsg)) {
        throw new AssertionError(`Expected error message "${msg}" to contain "${expectedErrorRegexOrMsg}"`);
      }
    }
  }
};

export const assertRejects = async (fn: () => Promise<void>, expectedErrorRegexOrMsg?: string | RegExp): Promise<void> => {
  let threw = false;
  let caughtError: any = null;
  try {
    await fn();
  } catch (err) {
    threw = true;
    caughtError = err;
  }
  if (!threw) {
    throw new AssertionError(`Expected async function to reject, but it resolved successfully.`);
  }
  if (expectedErrorRegexOrMsg) {
    const msg = caughtError?.message || String(caughtError);
    if (expectedErrorRegexOrMsg instanceof RegExp) {
      if (!expectedErrorRegexOrMsg.test(msg)) {
        throw new AssertionError(`Expected rejected error message "${msg}" to match ${expectedErrorRegexOrMsg}`);
      }
    } else {
      if (!msg.includes(expectedErrorRegexOrMsg)) {
        throw new AssertionError(`Expected rejected error message "${msg}" to contain "${expectedErrorRegexOrMsg}"`);
      }
    }
  }
};

/**
 * Execute all suites in the registry
 */
export async function runAllSuites(suites: TestSuite[] = globalSuites): Promise<RunResults> {
  const startTime = Date.now();
  const results: RunResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
    byTier: {
      tier1: { total: 0, passed: 0, failed: 0 },
      tier2: { total: 0, passed: 0, failed: 0 },
      tier3: { total: 0, passed: 0, failed: 0 },
      tier4: { total: 0, passed: 0, failed: 0 }
    },
    failures: []
  };

  for (const suite of suites) {
    for (const testCase of suite.cases) {
      results.total++;
      results.byTier[testCase.tier].total++;
      const testStart = Date.now();
      try {
        await testCase.fn();
        testCase.status = 'passed';
        testCase.durationMs = Date.now() - testStart;
        results.passed++;
        results.byTier[testCase.tier].passed++;
      } catch (err: any) {
        testCase.status = 'failed';
        testCase.error = err;
        testCase.durationMs = Date.now() - testStart;
        results.failed++;
        results.byTier[testCase.tier].failed++;
        results.failures.push({
          suite: suite.name,
          name: testCase.name,
          error: err
        });
      }
    }
  }

  results.durationMs = Date.now() - startTime;
  return results;
}

// Auto-run if executed standalone (not through runner.ts)
if (typeof process !== 'undefined' && process.argv && process.argv[1]) {
  const entryFile = process.argv[1].replace(/\\/g, '/');
  if (!entryFile.endsWith('runner.ts') && !entryFile.endsWith('runner.js') && !entryFile.endsWith('domain-engine.ts')) {
    setImmediate(async () => {
      if (globalSuites.length > 0 && globalSuites[0].cases[0]?.status === 'pending') {
        const res = await runAllSuites();
        console.log(`Standalone execution: ${res.passed}/${res.total} passed in ${res.durationMs}ms.`);
        if (res.failed > 0) {
          for (const f of res.failures) {
            console.error(`❌ [${f.suite}] ${f.name}: ${f.error.message}`);
          }
          process.exit(1);
        }
      }
    });
  }
}

