import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

interface SuiteResult {
  suite: string;
  tier: string;
  pass: boolean;
  durationMs: number;
  output: string;
}

const TS_SUITES = [
  // Tier 1
  { tier: 'Tier 1', path: 'tests/e2e/tier1-contracts/envelope-schema.test.ts' },
  { tier: 'Tier 1', path: 'tests/e2e/tier1-contracts/sha256-hash.test.ts' },
  { tier: 'Tier 1', path: 'tests/e2e/tier1-contracts/domain-artifacts.test.ts' },
  { tier: 'Tier 1', path: 'tests/e2e/tier1-contracts/warehouse-queries.test.ts' },
  { tier: 'Tier 1', path: 'tests/e2e/tier1-contracts/proto-contract.test.ts' },
  // Tier 2
  { tier: 'Tier 2', path: 'tests/e2e/tier2-boundaries/empty-warehouse.test.ts' },
  { tier: 'Tier 2', path: 'tests/e2e/tier2-boundaries/extreme-dom.test.ts' },
  { tier: 'Tier 2', path: 'tests/e2e/tier2-boundaries/fallback-llm.test.ts' },
  { tier: 'Tier 2', path: 'tests/e2e/tier2-boundaries/malformed-registration.test.ts' },
  // Tier 3
  { tier: 'Tier 3', path: 'tests/e2e/tier3-concurrency/dag-parallelism.test.ts' },
  { tier: 'Tier 3', path: 'tests/e2e/tier3-concurrency/hotplug-midflight.test.ts' },
  { tier: 'Tier 3', path: 'tests/e2e/tier3-concurrency/evidence-lineage.test.ts' },
  // Tier 4
  { tier: 'Tier 4', path: 'tests/e2e/tier4-stress/burst-queries.test.ts' },
  { tier: 'Tier 4', path: 'tests/e2e/tier4-stress/demo-flow-runner.test.ts' },
];

const PYTHON_SUITES = [
  { tier: 'Tier 1', path: 'tests/e2e/tier1-contracts/test_python_mortgage.py' },
];

function main() {
  console.log('======================================================================');
  console.log('🧪 VDaAgent PoC: Automated E2E Master Test Runner (Tiers 1 to 4)');
  console.log('======================================================================\n');

  const results: SuiteResult[] = [];
  const startGlobal = performance.now();

  // Run TypeScript Suites via tsx --test
  for (const s of TS_SUITES) {
    const fullPath = resolve(process.cwd(), s.path);
    const start = performance.now();
    const proc = spawnSync('npx', ['tsx', '--test', fullPath], {
      shell: true,
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    const duration = performance.now() - start;
    const passed = proc.status === 0;

    results.push({
      suite: s.path,
      tier: s.tier,
      pass: passed,
      durationMs: duration,
      output: proc.stdout || proc.stderr,
    });

    const statusIcon = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${s.tier}] ${statusIcon} - ${s.path} (${duration.toFixed(0)}ms)`);
    if (!passed) {
      console.error(proc.stdout || proc.stderr);
    }
  }

  // Run Python Suites via pytest
  for (const s of PYTHON_SUITES) {
    const fullPath = resolve(process.cwd(), s.path);
    const start = performance.now();
    const proc = spawnSync('pytest', [fullPath], {
      shell: true,
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    const duration = performance.now() - start;
    const passed = proc.status === 0;

    results.push({
      suite: s.path,
      tier: s.tier,
      pass: passed,
      durationMs: duration,
      output: proc.stdout || proc.stderr,
    });

    const statusIcon = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${s.tier}] ${statusIcon} - ${s.path} (${duration.toFixed(0)}ms)`);
    if (!passed) {
      console.error(proc.stdout || proc.stderr);
    }
  }

  const totalTime = performance.now() - startGlobal;
  const passedCount = results.filter((r) => r.pass).length;
  const failedCount = results.filter((r) => !r.pass).length;

  console.log('\n======================================================================');
  console.log('📊 TEST EXECUTION SUMMARY:');
  console.log(`  Total Suites: ${results.length}`);
  console.log(`  Passed:       ${passedCount}`);
  console.log(`  Failed:       ${failedCount}`);
  console.log(`  Total Time:   ${(totalTime / 1000).toFixed(2)}s`);
  console.log('======================================================================');

  if (failedCount > 0) {
    console.error(`\n❌ TEST RUN FAILED: ${failedCount} test suite(s) failed.`);
    process.exit(1);
  } else {
    console.log('\n🎉 ALL E2E TEST SUITES PASSED CLEANLY (100% SUCCESS RATE)!');
    process.exit(0);
  }
}

main();
