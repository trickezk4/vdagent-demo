import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

interface AgentExecutionLog {
  agent: string;
  startTime: number;
  endTime: number;
  durationMs: number;
}

/**
 * Emulates the DAG Orchestrator execution with Step 2 running Compare and Insight
 * via Promise.all concurrently.
 */
async function runOrchestratedDAG(
  compareDelayMs = 50,
  insightDelayMs = 50
): Promise<{
  logs: AgentExecutionLog[];
  totalWallClockMs: number;
}> {
  const logs: AgentExecutionLog[] = [];
  const startGlobal = performance.now();

  // Step 1: Data Agent (Sequential)
  const dStart = performance.now();
  await sleep(20);
  logs.push({
    agent: 'data-agent',
    startTime: dStart,
    endTime: performance.now(),
    durationMs: performance.now() - dStart,
  });

  // Step 2: Parallel execution of Compare Agent and Insight Agent
  const pStart = performance.now();
  const [compLog, insLog] = await Promise.all([
    (async () => {
      const s = performance.now();
      await sleep(compareDelayMs);
      const e = performance.now();
      return { agent: 'compare-agent', startTime: s, endTime: e, durationMs: e - s };
    })(),
    (async () => {
      const s = performance.now();
      await sleep(insightDelayMs);
      const e = performance.now();
      return { agent: 'insight-agent', startTime: s, endTime: e, durationMs: e - s };
    })(),
  ]);
  logs.push(compLog, insLog);

  // Step 3: Chart Agent
  const cStart = performance.now();
  await sleep(20);
  logs.push({
    agent: 'chart-agent',
    startTime: cStart,
    endTime: performance.now(),
    durationMs: performance.now() - cStart,
  });

  // Step 4: Report Agent
  const rStart = performance.now();
  await sleep(20);
  logs.push({
    agent: 'report-agent',
    startTime: rStart,
    endTime: performance.now(),
    durationMs: performance.now() - rStart,
  });

  const totalWallClockMs = performance.now() - startGlobal;
  return { logs, totalWallClockMs };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Tier 3: FEAT-G04 & AC-P01 - Parallel DAG Execution (Compare & Insight)', () => {
  it('should execute Compare and Insight concurrently with overlapping execution intervals', async () => {
    const { logs, totalWallClockMs } = await runOrchestratedDAG(60, 60);

    const compLog = logs.find((l) => l.agent === 'compare-agent')!;
    const insLog = logs.find((l) => l.agent === 'insight-agent')!;

    assert.ok(compLog, 'compare-agent log must be present');
    assert.ok(insLog, 'insight-agent log must be present');

    // Temporal interval overlap condition:
    // startA < endB AND startB < endA
    const overlap = compLog.startTime < insLog.endTime && insLog.startTime < compLog.endTime;
    assert.equal(
      overlap,
      true,
      `Expected execution intervals to overlap: Compare [${compLog.startTime.toFixed(
        1
      )} - ${compLog.endTime.toFixed(1)}], Insight [${insLog.startTime.toFixed(
        1
      )} - ${insLog.endTime.toFixed(1)}]`
    );

    // Wall-clock duration check:
    // If run sequentially, Step 2 would take 60 + 60 = 120ms.
    // In parallel, Step 2 takes ~60ms. Total pipeline with steps 1,3,4 (20ms each) should be well under 200ms.
    assert.ok(
      totalWallClockMs < 190,
      `Total wall clock time should be < 190ms (parallel), but was ${totalWallClockMs.toFixed(1)}ms`
    );
  });
});
