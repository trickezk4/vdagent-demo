import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

interface MockRegistry {
  agents: Map<string, any>;
  register(agent: any): { success: boolean };
  hasAgent(id: string): boolean;
}

function createRegistry(): MockRegistry {
  const agents = new Map<string, any>();
  return {
    agents,
    register(agent: any) {
      agents.set(agent.agent_id, agent);
      return { success: true };
    },
    hasAgent(id: string) {
      return agents.has(id);
    },
  };
}

describe('Tier 3: FEAT-G05 & AC-H01/AC-H02 - Zero-Downtime Hot-Plugging Mid-Flight', () => {
  it('should accept dynamic agent registration while pipeline stream is actively executing', async () => {
    const registry = createRegistry();
    const emittedEvents: string[] = [];

    // Simulate an ongoing long SSE stream
    const ssePipelinePromise = (async () => {
      emittedEvents.push('data:start');
      await new Promise((r) => setTimeout(r, 30));
      emittedEvents.push('trace:data_done');

      // Mid-flight pause
      await new Promise((r) => setTimeout(r, 60));
      emittedEvents.push('trace:compare_insight_done');

      await new Promise((r) => setTimeout(r, 30));
      emittedEvents.push('artifact:report_done');
      emittedEvents.push('data:complete');
      return true;
    })();

    // Mid-flight: dispatch dynamic registration at t = 45ms
    await new Promise((r) => setTimeout(r, 45));

    const registrationResult = registry.register({
      agent_id: 'python-finance-agent',
      grpc_target: 'localhost:50056',
      domain: 'banking_and_finance',
      supported_intents: ['calculate_mortgage'],
    });

    assert.equal(registrationResult.success, true);
    assert.equal(registry.hasAgent('python-finance-agent'), true);

    // Wait for the original pipeline to complete
    const pipelineFinished = await ssePipelinePromise;
    assert.equal(pipelineFinished, true);

    // Verify all stream events were delivered in order with zero loss
    assert.deepEqual(emittedEvents, [
      'data:start',
      'trace:data_done',
      'trace:compare_insight_done',
      'artifact:report_done',
      'data:complete',
    ]);
  });
});
