/**
 * scripts/verify-start-agents.ts
 * Verifies that startCoreAgents can start all 5 agents concurrently and detect health readiness.
 * Ensures synchronous cleanup and port release verification before exiting.
 */

import { startCoreAgents, waitForPortsReleased, CORE_AGENTS } from './start-core-agents.js';

async function test() {
  console.log('Testing startCoreAgents in non-blocking mode...');
  const { cleanup } = await startCoreAgents({ blocking: false });
  console.log('✅ startCoreAgents completed readiness check successfully!');

  console.log('🛑 Triggering synchronous cleanup of all agents...');
  cleanup();

  console.log('⏳ Waiting for all agent ports to be completely released...');
  const released = await waitForPortsReleased(CORE_AGENTS, 10000);
  if (!released) {
    throw new Error('❌ Ports were not released within timeout after cleanup');
  }
  console.log('✅ All agent ports verified closed and released. Clean exit.');
  process.exit(0);
}

test().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});

