/**
 * tests/challenger-m2-3-stress.ts
 * Empirical Challenger 3 Stress Harness for Milestone 2 Remediation
 * 
 * Verifies:
 * 1. Rapid Sequential Restarts: Run agent startup and teardown twice in rapid succession.
 *    Confirm port release guarantee prevents EADDRINUSE on second run.
 * 2. Immediate Sequential Pipeline Execution: verify-start-agents followed immediately by
 *    verify-m2-full-pipeline. Confirm zero socket leakage or port collision.
 * 3. Pre-flight Port Conflict Detection: Bind dummy listener on 50051 via net.createServer.
 *    Confirm assertPortsAvailable cleanly intercepts with diagnostic error (no hang, no false success).
 * 4. Post-flight Port Status Verification: Confirm all ports 50051-50055 are unallocated (LISTEN count = 0).
 */

import net from 'node:net';
import { spawnSync, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

import {
  startCoreAgents,
  waitForPortsReleased,
  assertPortsAvailable,
  isPortAvailable,
  CORE_AGENTS,
} from '../scripts/start-core-agents.js';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

function checkPortListening(port: number): boolean {
  try {
    if (process.platform === 'win32') {
      const stdout = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const regex = new RegExp(`[:.]${port}\\s+.*?LISTENING`, 'i');
      return regex.test(stdout);
    } else {
      const stdout = execSync(`lsof -ti :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return stdout.length > 0;
    }
  } catch {
    return false;
  }
}

async function runTest(id: string, name: string, fn: () => Promise<void>) {
  console.log(`\n======================================================================`);
  console.log(`🧪 [TEST ${id}] ${name}`);
  console.log(`======================================================================`);
  const start = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - start;
    console.log(`✅ [PASS] ${id} (${durationMs}ms)`);
    results.push({ id, name, passed: true, durationMs });
  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.error(`❌ [FAIL] ${id} (${durationMs}ms):`, err?.message || err);
    results.push({ id, name, passed: false, error: err?.message || String(err), durationMs });
  }
}

async function main() {
  console.log('🚀 Initiating Challenger 3 Empirical Stress Suite for Milestone 2...\n');

  // Test 1: Rapid Sequential Restarts
  await runTest('T1-RAPID-RESTARTS', 'Rapid Sequential Restarts (Back-to-Back Subprocess Launches)', async () => {
    console.log('--- Iteration 1/2 ---');
    const run1 = await startCoreAgents({ blocking: false });
    console.log('Run 1 online. Triggering synchronous cleanup...');
    run1.cleanup();
    const released1 = await waitForPortsReleased(CORE_AGENTS, 10000);
    assert.equal(released1, true, 'Iteration 1 ports failed to release within 10s');
    for (const agent of CORE_AGENTS) {
      assert.equal(await isPortAvailable(agent.port), true, `Port ${agent.port} still occupied after Run 1`);
    }

    console.log('--- Iteration 2/2 (Immediate) ---');
    // Immediate second start without delay
    const run2 = await startCoreAgents({ blocking: false });
    console.log('Run 2 online without EADDRINUSE. Triggering synchronous cleanup...');
    run2.cleanup();
    const released2 = await waitForPortsReleased(CORE_AGENTS, 10000);
    assert.equal(released2, true, 'Iteration 2 ports failed to release within 10s');
    for (const agent of CORE_AGENTS) {
      assert.equal(await isPortAvailable(agent.port), true, `Port ${agent.port} still occupied after Run 2`);
    }
  });

  // Test 2: Immediate Sequential Pipeline Execution
  await runTest('T2-IMMEDIATE-PIPELINE', 'Immediate Sequential Pipeline Execution (verify-start-agents -> verify-m2-full-pipeline)', async () => {
    console.log('Invoking scripts/verify-start-agents.ts in subprocess...');
    const startResult = spawnSync('npx', ['tsx', 'scripts/verify-start-agents.ts'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      shell: true,
      stdio: 'pipe',
    });

    if (startResult.status !== 0) {
      console.error('verify-start-agents stdout:\n', startResult.stdout);
      console.error('verify-start-agents stderr:\n', startResult.stderr);
      throw new Error(`verify-start-agents.ts failed with exit code ${startResult.status}`);
    }
    assert.ok(startResult.stdout.includes('All agent ports verified closed and released'), 'Missing release confirmation');

    console.log('Immediately invoking verify-m2-full-pipeline.ts in subprocess...');
    const result = spawnSync('npx', ['tsx', 'scripts/verify-m2-full-pipeline.ts'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      shell: true,
      stdio: 'pipe',
    });

    if (result.status !== 0) {
      console.error('Pipeline stdout:\n', result.stdout);
      console.error('Pipeline stderr:\n', result.stderr);
      throw new Error(`verify-m2-full-pipeline.ts failed with exit code ${result.status}`);
    }

    assert.ok(result.stdout.includes('FULL MILESTONE 2 5-AGENT PIPELINE VERIFIED 100% PASSING'), 'Missing success banner in pipeline output');
    assert.ok(!result.stderr.includes('EADDRINUSE'), 'Detected EADDRINUSE in pipeline execution stderr');
  });

  // Test 3: Pre-flight Port Conflict Detection
  await runTest('T3-PORT-CONFLICT', 'Pre-flight Port Conflict Interception with Dummy Listener on 50051', async () => {
    // 1. Create a dummy listener on 50051
    const dummyServer = net.createServer((c) => c.destroy());
    await new Promise<void>((resolve, reject) => {
      dummyServer.once('error', reject);
      dummyServer.listen(50051, '0.0.0.0', () => resolve());
    });
    console.log('✅ Dummy listener successfully bound to 0.0.0.0:50051');

    try {
      // 2. Direct unit test of assertPortsAvailable
      let errorThrown = false;
      let errorMsg = '';
      try {
        await assertPortsAvailable(CORE_AGENTS, { autoKill: false });
      } catch (err: any) {
        errorThrown = true;
        errorMsg = err.message;
      }
      assert.equal(errorThrown, true, 'assertPortsAvailable should have thrown an error on occupied port 50051');
      assert.ok(errorMsg.includes('[PRE-FLIGHT CHECK FAILED]'), `Error should contain [PRE-FLIGHT CHECK FAILED], got: ${errorMsg}`);
      assert.ok(errorMsg.includes('50051'), `Error should mention port 50051, got: ${errorMsg}`);
      console.log('✅ assertPortsAvailable correctly caught port conflict with diagnostic message.');

      // 3. Subprocess test: Run verify-start-agents.ts with port 50051 occupied
      console.log('Invoking verify-start-agents.ts with port 50051 held...');
      const subProc = spawnSync('npx', ['tsx', 'scripts/verify-start-agents.ts'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        shell: true,
        stdio: 'pipe',
        timeout: 15000, // Should fail immediately in pre-flight, not hang
      });

      assert.notEqual(subProc.status, 0, 'verify-start-agents.ts should have exited with non-zero exit code');
      const combinedOutput = (subProc.stdout || '') + (subProc.stderr || '');
      assert.ok(combinedOutput.includes('[PRE-FLIGHT CHECK FAILED]'), 'Expected [PRE-FLIGHT CHECK FAILED] in output');
      assert.ok(combinedOutput.includes('50051'), 'Expected port 50051 mentioned in output');
      assert.ok(!combinedOutput.includes('ALL 5 CORE AGENTS ARE ONLINE'), 'Must NOT report false success!');
      console.log('✅ Subprocess verify-start-agents.ts cleanly rejected launch without hanging or claiming success.');
    } finally {
      // 4. Clean up dummy listener
      await new Promise<void>((resolve) => dummyServer.close(() => resolve()));
      console.log('🧹 Dummy listener on port 50051 closed.');

      // Ensure port 50051 is available again
      const nowAvailable = await isPortAvailable(50051);
      assert.equal(nowAvailable, true, 'Port 50051 must be available after dummy server teardown');
      console.log('✅ Port 50051 confirmed available after cleanup.');
    }
  });

  // Test 4: Post-flight Port Status Verification
  await runTest('T4-POST-FLIGHT-PORTS', 'Post-flight Port Status Verification (LISTEN count == 0)', async () => {
    const ports = [50051, 50052, 50053, 50054, 50055];
    console.log(`Verifying TCP listener release across ports: ${ports.join(', ')}...`);

    const released = await waitForPortsReleased(ports, 5000);
    assert.equal(released, true, 'Ports were not fully released within 5000ms');

    const occupiedPorts: number[] = [];
    for (const port of ports) {
      const isListening = checkPortListening(port);
      const isFree = await isPortAvailable(port);
      console.log(`  - Port ${port}: listening=${isListening}, available=${isFree}`);
      if (isListening || !isFree) {
        occupiedPorts.push(port);
      }
    }

    assert.equal(
      occupiedPorts.length,
      0,
      `Detected remaining TCP listeners or unavailable ports: ${occupiedPorts.join(', ')}`
    );
    console.log('✅ Zero active listeners across ports 50051-50055. Socket state 100% clean.');
  });

  // Summary
  console.log('\n======================================================================');
  console.log('📊 CHALLENGER 3 STRESS SUITE SUMMARY');
  console.log('======================================================================');
  let allPassed = true;
  for (const r of results) {
    const mark = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${mark} [${r.id}] ${r.name} (${r.durationMs}ms)`);
    if (!r.passed) {
      allPassed = false;
      console.log(`      Error: ${r.error}`);
    }
  }
  console.log('======================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled suite error:', err);
  process.exit(1);
});
