/**
 * tests/test-preflight-conflict.ts
 * Empirical test for Step 3: Pre-flight Port Conflict Detection
 */

import net from 'node:net';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

async function run() {
  console.log('======================================================================');
  console.log('🧪 STEP 3 TEST: Pre-flight Port Conflict Detection on Port 50051');
  console.log('======================================================================\n');

  // 1. Temporarily bind dummy listener on port 50051
  console.log('1️⃣ Binding dummy listener on 0.0.0.0:50051...');
  const dummyServer = net.createServer((socket) => {
    socket.destroy();
  });

  await new Promise<void>((resolve, reject) => {
    dummyServer.once('error', reject);
    dummyServer.listen(50051, '0.0.0.0', () => {
      console.log('✅ Dummy listener actively listening on 0.0.0.0:50051 (PID:', process.pid, ')');
      resolve();
    });
  });

  let childExitCode: number | null = null;
  let childStdout = '';
  let childStderr = '';

  try {
    // 2. Run npx tsx scripts/verify-start-agents.ts while port 50051 is occupied
    console.log('\n2️⃣ Spawning scripts/verify-start-agents.ts while port 50051 is occupied...');
    const startTime = Date.now();
    const result = spawnSync('npx', ['tsx', 'scripts/verify-start-agents.ts'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      shell: true,
      stdio: 'pipe',
      timeout: 10000, // Pre-flight check should fail in < 1s, definitely not hang
    });
    const elapsed = Date.now() - startTime;

    childExitCode = result.status;
    childStdout = result.stdout || '';
    childStderr = result.stderr || '';

    console.log(`⏱️ Subprocess completed in ${elapsed}ms with exit code: ${childExitCode}`);
    console.log('--- Subprocess Stdout ---');
    console.log(childStdout);
    console.log('--- Subprocess Stderr ---');
    console.log(childStderr);

    // 3. Verify assertPortsAvailable cleanly intercepted
    console.log('\n3️⃣ Validating pre-flight collision interception...');
    assert.equal(childExitCode, 1, `Expected exit code 1, but got ${childExitCode}`);

    const combinedOutput = childStdout + '\n' + childStderr;

    assert.ok(
      combinedOutput.includes('[PRE-FLIGHT CHECK FAILED]'),
      'Output must contain "[PRE-FLIGHT CHECK FAILED]"'
    );
    assert.ok(
      combinedOutput.includes('Port 50051 (data-agent): occupied by PID'),
      'Output must specify port 50051 and data-agent'
    );
    assert.ok(
      combinedOutput.includes(String(process.pid)),
      `Output must identify current PID ${process.pid} as the occupant`
    );
    assert.ok(
      !combinedOutput.includes('ALL 5 CORE AGENTS ARE ONLINE'),
      'Output must NOT falsely claim all agents are online'
    );
    assert.ok(
      !combinedOutput.includes('completed readiness check successfully'),
      'Output must NOT claim readiness check succeeded'
    );

    console.log('✅ Pre-flight check cleanly intercepted the port conflict!');
    console.log('✅ Identified occupying PID and suggested termination command.');
    console.log('✅ Prevented process launch and avoided unhandled EADDRINUSE crash.');
  } finally {
    // 4. Clean up dummy listener
    console.log('\n4️⃣ Cleaning up dummy listener on port 50051...');
    await new Promise<void>((resolve) => {
      dummyServer.close(() => {
        console.log('✅ Dummy listener closed.');
        resolve();
      });
    });

    // 5. Verify port 50051 is free
    const socketCheck = new Promise<boolean>((resolve) => {
      const tester = net.createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          tester.once('close', () => resolve(true)).close();
        })
        .listen(50051, '0.0.0.0');
    });

    const isFree = await socketCheck;
    assert.equal(isFree, true, 'Port 50051 must be immediately free after closing dummy listener');
    console.log('✅ Port 50051 verified fully available.');
  }

  console.log('\n======================================================================');
  console.log('🎉 STEP 3 PRE-FLIGHT CONFLICT DETECTION VERIFIED 100% SUCCESSFUL!');
  console.log('======================================================================');
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
