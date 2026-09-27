/**
 * tests/challenger-m2-1-stress.ts
 * Challenger 1 Empirical Stress Test Suite for Milestone 2:
 * 1. gRPC CheckHealth on all 5 ports (50051-50055)
 * 2. Streaming ExecuteStep edge cases (empty prompt, invalid run_id, malformed input artifacts, ERROR event emission & server survival)
 * 3. Adversarial LLM Fallback: HTTP 402, timeout, invalid API key, missing API key, malformed JSON
 * 4. Concurrent gRPC load testing (100 concurrent requests across 5 agents)
 * 5. Full Pipeline Evidence Lineage Verification
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  validateEnvelope,
  verifyContentHash,
  computeContentHash,
  validateReportCompleteness,
  ChartSpecPayloadSchema,
  DatasetEnvelopeSchema,
  ComparisonEnvelopeSchema,
  InsightEnvelopeSchema,
  ChartSpecEnvelopeSchema,
  ReportEnvelopeSchema,
  ArtifactEnvelopeSchema,
} from '../packages/contracts/src/index.js';
import { callLlmWithFallback } from '../apps/agents/llm-client.js';
import { buildDeterministicChartPayload } from '../apps/agents/chart-agent/src/chart-builder.js';
import { buildDeterministicReportMarkdown } from '../apps/agents/report-agent/src/report-builder.js';
import { createSubAgentServer } from '../apps/agents/base-agent.js';
import { startDataAgent } from '../apps/agents/data-agent/src/index.js';
import { startCompareAgent } from '../apps/agents/compare-agent/src/index.js';
import { startInsightAgent } from '../apps/agents/insight-agent/src/index.js';
import { startChartAgentServer } from '../apps/agents/chart-agent/src/index.js';
import { startReportAgentServer } from '../apps/agents/report-agent/src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROTO_PATH = path.resolve(__dirname, '../proto/agent_pipeline.proto');

interface TestRecord {
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: any;
}

const records: TestRecord[] = [];

function recordPass(suite: string, name: string, durationMs: number, details?: any) {
  console.log(`  ✅ [PASS] ${name} (${durationMs}ms)`);
  records.push({ suite, name, passed: true, durationMs, details });
}

function recordFail(suite: string, name: string, durationMs: number, err: any) {
  const msg = err?.message || String(err);
  console.error(`  ❌ [FAIL] ${name} (${durationMs}ms) -> ${msg}`);
  records.push({ suite, name, passed: false, durationMs, error: msg });
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// gRPC helper
function createClient(port: number, proto: any) {
  const SubAgentClient = proto.vda.agent.v1.SubAgentService;
  return new SubAgentClient(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
}

function callCheckHealth(client: any, timeoutMs = 3000): Promise<{ is_healthy: boolean; status_message: string }> {
  return new Promise((resolve, reject) => {
    const deadline = new Date(Date.now() + timeoutMs);
    client.CheckHealth({}, { deadline }, (err: any, response: any) => {
      if (err) return reject(err);
      resolve(response);
    });
  });
}

function callExecuteStep(client: any, req: any, timeoutMs = 15000): Promise<{
  events: Array<{ type: string | number; message: string; output_artifact_json: string }>;
  completeEvent?: any;
  errorEvent?: any;
  outputEnvelope?: any;
}> {
  return new Promise((resolve, reject) => {
    const deadline = new Date(Date.now() + timeoutMs);
    const stream = client.ExecuteStep(req, { deadline });
    const events: any[] = [];
    let completeEvent: any = null;
    let errorEvent: any = null;
    let outputEnvelope: any = null;

    stream.on('data', (chunk: any) => {
      events.push(chunk);
      if (chunk.type === 'COMPLETE' || chunk.type === 2) {
        completeEvent = chunk;
        if (chunk.output_artifact_json) {
          try {
            outputEnvelope = JSON.parse(chunk.output_artifact_json);
          } catch (e) {
            // keep raw
          }
        }
      }
      if (chunk.type === 'ERROR' || chunk.type === 3) {
        errorEvent = chunk;
      }
    });

    stream.on('error', (err: any) => {
      reject(err);
    });

    stream.on('end', () => {
      resolve({ events, completeEvent, errorEvent, outputEnvelope });
    });
  });
}

async function runChallengerTestSuite() {
  console.log('======================================================================');
  console.log('🔬 CHALLENGER 1: EMPIRICAL STRESS TEST SUITE - MILESTONE 2');
  console.log('   Target: Core 5-Agent gRPC Services, Event Streaming, LLM Fallback');
  console.log('======================================================================\n');

  // Load Protobuf definitions
  const pkgDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
  });
  const proto = grpc.loadPackageDefinition(pkgDef) as any;

  // Start all 5 servers
  console.log('🚀 [SETUP] Initializing and binding 5 Core Agent gRPC Servers (50051-50055)...');
  const dataServer = startDataAgent(50051);
  const compareServer = startCompareAgent(50052);
  const insightServer = startInsightAgent(50053);
  const chartServer = startChartAgentServer(50054);
  const reportServer = startReportAgentServer(50055);

  await Promise.all([
    dataServer.start(),
    compareServer.start(),
    insightServer.start(),
    chartServer.start(),
    reportServer.start(),
  ]);
  console.log('   All 5 sub-agent servers started successfully.\n');

  const clients = {
    data: createClient(50051, proto),
    compare: createClient(50052, proto),
    insight: createClient(50053, proto),
    chart: createClient(50054, proto),
    report: createClient(50055, proto),
  };

  // -------------------------------------------------------------------------
  // SUITE 1: CheckHealth on all 5 ports + negative health check
  // -------------------------------------------------------------------------
  console.log('--- SUITE 1: gRPC CheckHealth Verification on Ports 50051-50055 ---');
  const agentConfigs = [
    { role: 'data-agent', port: 50051, client: clients.data },
    { role: 'compare-agent', port: 50052, client: clients.compare },
    { role: 'insight-agent', port: 50053, client: clients.insight },
    { role: 'chart-agent', port: 50054, client: clients.chart },
    { role: 'report-agent', port: 50055, client: clients.report },
  ];

  for (const cfg of agentConfigs) {
    const t0 = Date.now();
    try {
      const res = await callCheckHealth(cfg.client);
      assert.equal(res.is_healthy, true, `Server on ${cfg.port} reported is_healthy=false`);
      assert.ok(
        res.status_message.includes(cfg.role) && res.status_message.includes(String(cfg.port)),
        `Status message does not match: ${res.status_message}`
      );
      recordPass('SUITE 1', `CheckHealth Port ${cfg.port} (${cfg.role})`, Date.now() - t0, res);
    } catch (err) {
      recordFail('SUITE 1', `CheckHealth Port ${cfg.port} (${cfg.role})`, Date.now() - t0, err);
    }
  }

  // Negative test: CheckHealth on unused port 50099
  {
    const t0 = Date.now();
    try {
      const deadClient = createClient(50099, proto);
      let failed = false;
      try {
        await callCheckHealth(deadClient, 1000);
      } catch (err: any) {
        failed = true;
        assert.ok(err.message.includes('UNAVAILABLE') || err.message.includes('DEADLINE_EXCEEDED'));
      }
      deadClient.close();
      assert.ok(failed, 'CheckHealth to unused port should fail with UNAVAILABLE');
      recordPass('SUITE 1', 'CheckHealth Negative: Unbound Port 50099 properly fails with UNAVAILABLE', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 1', 'CheckHealth Negative: Unbound Port 50099', Date.now() - t0, err);
    }
  }

  // -------------------------------------------------------------------------
  // SUITE 2: ExecuteStep Edge Cases & Error Resilience
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 2: ExecuteStep Streaming Edge Cases & Resiliency ---');

  // Test 2.1: Empty prompt on data-agent
  {
    const t0 = Date.now();
    try {
      const res = await callExecuteStep(clients.data, {
        run_id: '11111111-1111-4111-8111-111111111111',
        task_id: 'task-empty-prompt',
        session_id: 'session-empty',
        user_prompt: '',
        agent_role: 'data-agent',
        input_artifacts: [],
      });
      assert.ok(res.completeEvent, 'Server should emit COMPLETE event on empty prompt');
      assert.ok(res.outputEnvelope, 'Server should output valid envelope');
      assert.equal(res.outputEnvelope.artifact_type, 'dataset');
      assert.equal(validateEnvelope(res.outputEnvelope).valid, true);
      assert.equal(verifyContentHash(res.outputEnvelope), true);
      recordPass('SUITE 2', 'ExecuteStep: Empty prompt gracefully defaults and returns valid DatasetArtifact', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 2', 'ExecuteStep: Empty prompt', Date.now() - t0, err);
    }
  }

  // Test 2.2: Invalid run_id (non-UUID string)
  {
    const t0 = Date.now();
    try {
      const res = await callExecuteStep(clients.data, {
        run_id: 'INVALID-NON-UUID-STRING-12345',
        task_id: 'task-invalid-runid',
        session_id: 'session-test',
        user_prompt: 'Test query',
        agent_role: 'data-agent',
        input_artifacts: [],
      });
      assert.ok(res.completeEvent, 'Server should complete');
      assert.ok(res.outputEnvelope, 'Envelope should exist');
      // Must generate a compliant UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      assert.ok(uuidRegex.test(res.outputEnvelope.run_id), `RunId should be sanitized to valid UUID, got ${res.outputEnvelope.run_id}`);
      assert.equal(validateEnvelope(res.outputEnvelope).valid, true);
      recordPass('SUITE 2', 'ExecuteStep: Invalid run_id is sanitized to valid UUID conforming to schema', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 2', 'ExecuteStep: Invalid run_id sanitization', Date.now() - t0, err);
    }
  }

  // Test 2.3: Downstream agents with empty input_artifacts (No upstream data)
  {
    const t0 = Date.now();
    try {
      const [compRes, insRes, chartRes, repRes] = await Promise.all([
        callExecuteStep(clients.compare, {
          run_id: '22222222-2222-4222-8222-222222222222',
          task_id: 'task-comp-empty-input',
          user_prompt: 'So sánh căn hộ',
          agent_role: 'compare-agent',
          input_artifacts: [],
        }),
        callExecuteStep(clients.insight, {
          run_id: '33333333-3333-4333-8333-333333333333',
          task_id: 'task-ins-empty-input',
          user_prompt: 'Tìm nguyên nhân',
          agent_role: 'insight-agent',
          input_artifacts: [],
        }),
        callExecuteStep(clients.chart, {
          run_id: '44444444-4444-4444-8444-444444444444',
          task_id: 'task-chart-empty-input',
          user_prompt: 'Vẽ biểu đồ',
          agent_role: 'chart-agent',
          input_artifacts: [],
        }),
        callExecuteStep(clients.report, {
          run_id: '55555555-5555-4555-8555-555555555555',
          task_id: 'task-rep-empty-input',
          user_prompt: 'Lập báo cáo',
          agent_role: 'report-agent',
          input_artifacts: [],
        }),
      ]);

      assert.equal(validateEnvelope(compRes.outputEnvelope).valid, true, 'CompareEnvelope valid');
      assert.equal(validateEnvelope(insRes.outputEnvelope).valid, true, 'InsightEnvelope valid');
      assert.equal(validateEnvelope(chartRes.outputEnvelope).valid, true, 'ChartSpecEnvelope valid');
      assert.equal(validateEnvelope(repRes.outputEnvelope).valid, true, 'ReportEnvelope valid');

      assert.equal(verifyContentHash(compRes.outputEnvelope), true);
      assert.equal(verifyContentHash(insRes.outputEnvelope), true);
      assert.equal(verifyContentHash(chartRes.outputEnvelope), true);
      assert.equal(verifyContentHash(repRes.outputEnvelope), true);

      recordPass('SUITE 2', 'ExecuteStep: Downstream agents survive empty input_artifacts via warehouse/mock fallback', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 2', 'ExecuteStep: Downstream empty input_artifacts', Date.now() - t0, err);
    }
  }

  // Test 2.4: Malformed input_artifacts (Corrupted JSON strings)
  {
    const t0 = Date.now();
    try {
      const corruptedInput = [
        {
          artifact_id: 'corrupt-1',
          artifact_type: 'dataset',
          content_json: '{ NOT_A_VALID_JSON: true, missing_bracket',
        },
        {
          artifact_id: 'corrupt-2',
          artifact_type: 'comparison',
          content_json: 'null',
        },
      ];

      const res = await callExecuteStep(clients.compare, {
        run_id: '66666666-6666-4666-8666-666666666666',
        task_id: 'task-corrupt-test',
        user_prompt: 'So sánh căn hộ',
        agent_role: 'compare-agent',
        input_artifacts: corruptedInput,
      });

      assert.ok(res.completeEvent, 'Server should survive corrupted input and complete');
      assert.equal(validateEnvelope(res.outputEnvelope).valid, true);
      assert.ok(
        res.events.some((e) => e.type === 'TRACE' && e.message.includes('Warning: Failed to parse input DatasetArtifact JSON')),
        'Trace log should warn about malformed JSON'
      );
      recordPass('SUITE 2', 'ExecuteStep: Compare agent handles corrupted JSON input without crashing', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 2', 'ExecuteStep: Corrupted JSON input', Date.now() - t0, err);
    }
  }

  // Test 2.5: Server Error Handling & ERROR event emission on fatal handler exception
  {
    const t0 = Date.now();
    try {
      const crashingAgent = createSubAgentServer({
        role: 'crashing-agent',
        port: 50058,
        handler: async () => {
          throw new Error('Fatal simulated crash in domain handler');
        },
      });
      await crashingAgent.start();
      const crashingClient = createClient(50058, proto);

      const res = await callExecuteStep(crashingClient, {
        run_id: '77777777-7777-4777-8777-777777777777',
        task_id: 'task-crash',
        user_prompt: 'Crash now',
        agent_role: 'crashing-agent',
        input_artifacts: [],
      });

      assert.ok(res.errorEvent, 'Server should emit StepStreamEvent of type ERROR');
      assert.ok(res.errorEvent.message.includes('Fatal simulated crash in domain handler'));
      assert.equal(res.errorEvent.output_artifact_json, '');

      // Verify server is STILL alive and responding to health checks
      const health = await callCheckHealth(crashingClient);
      assert.equal(health.is_healthy, true);

      crashingClient.close();
      await crashingAgent.stop();
      recordPass('SUITE 2', 'ExecuteStep: Handler exception emits ERROR event and server survives intact', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 2', 'ExecuteStep: ERROR event emission & server survival', Date.now() - t0, err);
    }
  }

  // -------------------------------------------------------------------------
  // SUITE 3: Adversarial LLM Fallback Stress-Testing (llm-client.ts)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Adversarial LLM Fallback Stress-Testing ---');

  // Test 3.1: Missing API Key fallback
  {
    const t0 = Date.now();
    try {
      const origKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const traces: string[] = [];
      const chartResult = await callLlmWithFallback({
        role: 'chart-agent',
        systemPrompt: 'Generate chart',
        userPrompt: 'DOM > 90',
        schema: ChartSpecPayloadSchema,
        fallbackGenerator: () => buildDeterministicChartPayload({}, {}, {}),
        emitTrace: (msg) => traces.push(msg),
      });

      assert.ok(traces.some((t) => t.includes('Missing OPENAI_API_KEY')), 'Trace logged missing API key');
      assert.equal(chartResult.chart_type, 'bar');
      assert.ok(ChartSpecPayloadSchema.parse(chartResult));

      process.env.OPENAI_API_KEY = origKey;
      recordPass('SUITE 3', 'LLM Fallback: Missing OPENAI_API_KEY immediately diverts to deterministic mock', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 3', 'LLM Fallback: Missing API Key', Date.now() - t0, err);
    }
  }

  // Test 3.2: Invalid API Key -> HTTP 401 intercepted -> fallback
  {
    const t0 = Date.now();
    try {
      const origKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-or-v1-invalid-adversarial-key-999999999999999999';

      const traces: string[] = [];
      const chartResult = await callLlmWithFallback({
        role: 'chart-agent',
        systemPrompt: 'Generate chart',
        userPrompt: 'Scatter plot',
        schema: ChartSpecPayloadSchema,
        fallbackGenerator: () => buildDeterministicChartPayload({}, {}, {}, 'scatter plot'),
        emitTrace: (msg) => traces.push(msg),
        timeoutMs: 5000,
      });

      assert.ok(traces.some((t) => t.includes('-FALLBACK] Intercepted LLM error:')), 'Trace logged intercepted error');
      assert.equal(chartResult.chart_type, 'scatter');
      assert.ok(ChartSpecPayloadSchema.parse(chartResult));

      process.env.OPENAI_API_KEY = origKey;
      recordPass('SUITE 3', 'LLM Fallback: Invalid API key (HTTP 401) intercepted and diverted to fallback', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 3', 'LLM Fallback: Invalid API key', Date.now() - t0, err);
    }
  }

  // Test 3.3: Simulated HTTP 402 Payment Required via local mock HTTP server
  {
    const t0 = Date.now();
    const mockHttpServer = http.createServer((req, res) => {
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Insufficient credits (Payment Required)', code: 402 } }));
    });

    await new Promise<void>((resolve) => mockHttpServer.listen(45671, '127.0.0.1', () => resolve()));

    try {
      const origBaseUrl = process.env.OPENAI_BASE_URL;
      const origKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_BASE_URL = 'http://127.0.0.1:45671';
      process.env.OPENAI_API_KEY = 'sk-mock-key';

      const traces: string[] = [];
      const reportMarkdown = await callLlmWithFallback<string>({
        role: 'report-agent',
        systemPrompt: 'Synthesize report',
        userPrompt: 'Báo cáo điều tra',
        fallbackGenerator: () => buildDeterministicReportMarkdown(),
        emitTrace: (msg) => traces.push(msg),
        timeoutMs: 3000,
      });

      assert.ok(traces.some((t) => t.includes('HTTP 402') && t.includes('FALLBACK')), 'Intercepted HTTP 402 error');
      const val = validateReportCompleteness(reportMarkdown);
      assert.equal(val.isComplete, true, `Report must have all 6 sections. Missing: ${val.missingSections.join(', ')}`);
      assert.ok(/\[Evidence-REF:\s*UNIT-VH-01\]/.test(reportMarkdown), 'Report contains Evidence citations');

      process.env.OPENAI_BASE_URL = origBaseUrl;
      process.env.OPENAI_API_KEY = origKey;
      recordPass('SUITE 3', 'LLM Fallback: HTTP 402 Payment Required gracefully falls back to 6-section Report', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 3', 'LLM Fallback: HTTP 402', Date.now() - t0, err);
    } finally {
      mockHttpServer.close();
    }
  }

  // Test 3.4: Simulated Network Timeout (AbortSignal timeout)
  {
    const t0 = Date.now();
    // HTTP server that never responds
    const hangingServer = http.createServer((_req, _res) => {
      // intentionally hang
    });
    await new Promise<void>((resolve) => hangingServer.listen(45672, '127.0.0.1', () => resolve()));

    try {
      const origBaseUrl = process.env.OPENAI_BASE_URL;
      const origKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_BASE_URL = 'http://127.0.0.1:45672';
      process.env.OPENAI_API_KEY = 'sk-mock-key';

      const traces: string[] = [];
      const chartResult = await callLlmWithFallback({
        role: 'chart-agent',
        systemPrompt: 'Generate chart',
        userPrompt: 'Timeout test',
        schema: ChartSpecPayloadSchema,
        fallbackGenerator: () => buildDeterministicChartPayload({}, {}, {}),
        emitTrace: (msg) => traces.push(msg),
        timeoutMs: 250, // fast timeout
      });

      assert.ok(traces.some((t) => t.includes('FALLBACK') && (t.includes('abort') || t.includes('timeout'))), 'Trace logged timeout abort');
      assert.equal(chartResult.chart_type, 'bar');
      assert.ok(ChartSpecPayloadSchema.parse(chartResult));

      process.env.OPENAI_BASE_URL = origBaseUrl;
      process.env.OPENAI_API_KEY = origKey;
      recordPass('SUITE 3', 'LLM Fallback: Network timeout (AbortSignal) safely diverts to valid ChartSpec', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 3', 'LLM Fallback: Network timeout', Date.now() - t0, err);
    } finally {
      hangingServer.close();
    }
  }

  // Test 3.5: Malformed JSON output from LLM -> parse failure -> fallback
  {
    const t0 = Date.now();
    const badJsonServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [
          {
            message: {
              content: '```json\n{ "invalid_json": true, "missing_ending_brace": \n```',
            },
          },
        ],
      }));
    });
    await new Promise<void>((resolve) => badJsonServer.listen(45673, '127.0.0.1', () => resolve()));

    try {
      const origBaseUrl = process.env.OPENAI_BASE_URL;
      const origKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_BASE_URL = 'http://127.0.0.1:45673';
      process.env.OPENAI_API_KEY = 'sk-mock-key';

      const traces: string[] = [];
      const chartResult = await callLlmWithFallback({
        role: 'chart-agent',
        systemPrompt: 'Generate chart',
        userPrompt: 'Bad JSON test',
        schema: ChartSpecPayloadSchema,
        fallbackGenerator: () => buildDeterministicChartPayload({}, {}, {}),
        emitTrace: (msg) => traces.push(msg),
        timeoutMs: 3000,
      });

      assert.ok(traces.some((t) => t.includes('FALLBACK') && (t.includes('Unexpected') || t.includes('JSON'))), 'Trace caught malformed JSON');
      assert.equal(chartResult.chart_type, 'bar');
      assert.ok(ChartSpecPayloadSchema.parse(chartResult));

      process.env.OPENAI_BASE_URL = origBaseUrl;
      process.env.OPENAI_API_KEY = origKey;
      recordPass('SUITE 3', 'LLM Fallback: Malformed JSON from LLM intercepted and diverted to fallback', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 3', 'LLM Fallback: Malformed JSON', Date.now() - t0, err);
    } finally {
      badJsonServer.close();
    }
  }

  // -------------------------------------------------------------------------
  // SUITE 4: Concurrent gRPC Stress Testing (100 concurrent requests)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Concurrent gRPC Load & Stress Testing ---');
  {
    const t0 = Date.now();
    const CONCURRENCY_PER_AGENT = 20;
    const totalRequests = CONCURRENCY_PER_AGENT * 5;

    console.log(`  Dispatching ${totalRequests} concurrent gRPC ExecuteStep calls across all 5 agents...`);

    const tasks: Promise<any>[] = [];

    // 20 to data-agent
    for (let i = 0; i < CONCURRENCY_PER_AGENT; i++) {
      tasks.push(
        callExecuteStep(clients.data, {
          run_id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          task_id: `task-data-concurrent-${i}`,
          user_prompt: `Query batch ${i}`,
          agent_role: 'data-agent',
          input_artifacts: [],
        })
      );
    }

    // 20 to compare-agent
    for (let i = 0; i < CONCURRENCY_PER_AGENT; i++) {
      tasks.push(
        callExecuteStep(clients.compare, {
          run_id: `20000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          task_id: `task-compare-concurrent-${i}`,
          user_prompt: `Compare batch ${i}`,
          agent_role: 'compare-agent',
          input_artifacts: [],
        })
      );
    }

    // 20 to insight-agent
    for (let i = 0; i < CONCURRENCY_PER_AGENT; i++) {
      tasks.push(
        callExecuteStep(clients.insight, {
          run_id: `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          task_id: `task-insight-concurrent-${i}`,
          user_prompt: `Insight batch ${i}`,
          agent_role: 'insight-agent',
          input_artifacts: [],
        })
      );
    }

    // 20 to chart-agent
    for (let i = 0; i < CONCURRENCY_PER_AGENT; i++) {
      tasks.push(
        callExecuteStep(clients.chart, {
          run_id: `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          task_id: `task-chart-concurrent-${i}`,
          user_prompt: `Chart batch ${i}`,
          agent_role: 'chart-agent',
          input_artifacts: [],
        })
      );
    }

    // 20 to report-agent
    for (let i = 0; i < CONCURRENCY_PER_AGENT; i++) {
      tasks.push(
        callExecuteStep(clients.report, {
          run_id: `50000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          task_id: `task-report-concurrent-${i}`,
          user_prompt: `Report batch ${i}`,
          agent_role: 'report-agent',
          input_artifacts: [],
        })
      );
    }

    try {
      const results = await Promise.all(tasks);
      const durationMs = Date.now() - t0;

      assert.equal(results.length, totalRequests, `All ${totalRequests} requests must resolve`);

      // Verify every envelope
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        assert.ok(res.completeEvent, `Request ${i} missing COMPLETE event`);
        assert.ok(res.outputEnvelope, `Request ${i} missing envelope`);
        assert.equal(validateEnvelope(res.outputEnvelope).valid, true, `Request ${i} envelope invalid`);
        assert.equal(verifyContentHash(res.outputEnvelope), true, `Request ${i} content_hash mismatch`);
      }

      const avgPerReq = (durationMs / totalRequests).toFixed(1);
      const qps = ((totalRequests / durationMs) * 1000).toFixed(1);

      recordPass(
        'SUITE 4',
        `100 concurrent requests across 5 agents completed with 0 errors (Throughput: ${qps} req/s, ${avgPerReq}ms/req)`,
        durationMs,
        { totalRequests, qps, avgPerReq }
      );
    } catch (err) {
      recordFail('SUITE 4', 'Concurrent gRPC Load Test', Date.now() - t0, err);
    }
  }

  // -------------------------------------------------------------------------
  // SUITE 5: Full Multi-Agent DAG Pipeline Flow with Lineage
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Full 5-Agent DAG Pipeline Flow & Evidence Lineage ---');
  {
    const t0 = Date.now();
    const runId = '99999999-9999-4999-8999-999999999999';

    try {
      // Step 1: Data Agent
      console.log('  Executing Step 1: data-agent...');
      const dataRes = await callExecuteStep(clients.data, {
        run_id: runId,
        task_id: 'task-dag-step1',
        session_id: 'session-dag-test',
        user_prompt: 'Điều tra căn hộ có DOM >= 90 tại phân khu Sapphire',
        agent_role: 'data-agent',
        input_artifacts: [],
      });
      assert.ok(dataRes.outputEnvelope);
      const datasetEnvelope = dataRes.outputEnvelope;
      assert.equal(datasetEnvelope.artifact_type, 'dataset');
      assert.ok(datasetEnvelope.evidence_refs.length >= 3, 'Must have at least 3 evidence refs');
      console.log(`    Step 1 produced ${datasetEnvelope.payload.units.length} units with evidence refs: [${datasetEnvelope.evidence_refs.join(', ')}]`);

      // Step 2: Parallel Compare + Insight
      console.log('  Executing Step 2: Parallel [compare-agent, insight-agent] (Promise.all)...');
      const step2Input = [
        {
          artifact_id: datasetEnvelope.artifact_id,
          artifact_type: datasetEnvelope.artifact_type,
          content_json: JSON.stringify(datasetEnvelope),
        },
      ];

      const [compRes, insRes] = await Promise.all([
        callExecuteStep(clients.compare, {
          run_id: runId,
          task_id: 'task-dag-step2-compare',
          session_id: 'session-dag-test',
          user_prompt: 'So sánh đối chuẩn rổ hàng peer group',
          agent_role: 'compare-agent',
          input_artifacts: step2Input,
        }),
        callExecuteStep(clients.insight, {
          run_id: runId,
          task_id: 'task-dag-step2-insight',
          session_id: 'session-dag-test',
          user_prompt: 'Phân tích nguyên nhân chậm bán',
          agent_role: 'insight-agent',
          input_artifacts: step2Input,
        }),
      ]);

      const compEnvelope = compRes.outputEnvelope;
      const insEnvelope = insRes.outputEnvelope;
      assert.equal(compEnvelope.artifact_type, 'comparison');
      assert.equal(insEnvelope.artifact_type, 'insight');
      assert.ok(compEnvelope.input_artifact_refs.includes(datasetEnvelope.artifact_id));
      assert.ok(insEnvelope.input_artifact_refs.includes(datasetEnvelope.artifact_id));
      console.log(`    Step 2 completed: Comparison variance: +${compEnvelope.payload.peer_benchmark.price_variance_pct}%, Insights: ${insEnvelope.payload.findings.length} findings`);

      // Step 3: Chart Agent
      console.log('  Executing Step 3: chart-agent...');
      const step3Input = [
        ...step2Input,
        {
          artifact_id: compEnvelope.artifact_id,
          artifact_type: compEnvelope.artifact_type,
          content_json: JSON.stringify(compEnvelope),
        },
        {
          artifact_id: insEnvelope.artifact_id,
          artifact_type: insEnvelope.artifact_type,
          content_json: JSON.stringify(insEnvelope),
        },
      ];

      const chartRes = await callExecuteStep(clients.chart, {
        run_id: runId,
        task_id: 'task-dag-step3-chart',
        session_id: 'session-dag-test',
        user_prompt: 'Tạo cấu hình biểu đồ tương quan DOM và giá',
        agent_role: 'chart-agent',
        input_artifacts: step3Input,
      });

      const chartEnvelope = chartRes.outputEnvelope;
      assert.equal(chartEnvelope.artifact_type, 'chart_spec');
      assert.ok(chartEnvelope.payload.chart_data.length >= 3);
      console.log(`    Step 3 completed: ChartSpec (${chartEnvelope.payload.chart_type}) with ${chartEnvelope.payload.chart_data.length} data points`);

      // Step 4: Report Agent
      console.log('  Executing Step 4: report-agent...');
      const step4Input = [
        ...step3Input,
        {
          artifact_id: chartEnvelope.artifact_id,
          artifact_type: chartEnvelope.artifact_type,
          content_json: JSON.stringify(chartEnvelope),
        },
      ];

      const reportRes = await callExecuteStep(clients.report, {
        run_id: runId,
        task_id: 'task-dag-step4-report',
        session_id: 'session-dag-test',
        user_prompt: 'Tổng hợp báo cáo 6 phần theo chuẩn PRD',
        agent_role: 'report-agent',
        input_artifacts: step4Input,
      });

      const reportEnvelope = reportRes.outputEnvelope;
      assert.equal(reportEnvelope.artifact_type, 'report');
      const val = validateReportCompleteness(reportEnvelope.payload.markdown);
      assert.equal(val.isComplete, true, `Report must have all 6 sections. Missing: ${val.missingSections.join(', ')}`);

      // Check evidence badges
      const badgeRegex = /\[Evidence-REF:\s*([A-Za-z0-9_-]+)\]/g;
      const foundBadges: string[] = [];
      let match;
      while ((match = badgeRegex.exec(reportEnvelope.payload.markdown)) !== null) {
        if (!foundBadges.includes(match[1])) foundBadges.push(match[1]);
      }
      assert.ok(foundBadges.length >= 3, `Expected at least 3 evidence badges, found ${foundBadges.length}: [${foundBadges.join(', ')}]`);

      // Lineage check: original dataset unit IDs must match evidence citations
      for (const ref of datasetEnvelope.evidence_refs.slice(0, 3)) {
        assert.ok(foundBadges.includes(ref), `Report badge must cite original dataset unit ${ref}`);
      }

      console.log(`    Step 4 completed: 6-section report with ${foundBadges.length} evidence badges: [${foundBadges.join(', ')}]`);

      recordPass('SUITE 5', 'Full 5-Agent DAG pipeline: unbroken evidence lineage from mock warehouse to Report badges', Date.now() - t0);
    } catch (err) {
      recordFail('SUITE 5', 'Full DAG Pipeline Flow', Date.now() - t0, err);
    }
  }

  // -------------------------------------------------------------------------
  // CLEANUP
  // -------------------------------------------------------------------------
  console.log('\n🧹 [TEARDOWN] Closing gRPC clients and terminating 5 agent servers...');
  for (const client of Object.values(clients)) {
    client.close();
  }
  await Promise.all([
    dataServer.stop(),
    compareServer.stop(),
    insightServer.stop(),
    chartServer.stop(),
    reportServer.stop(),
  ]);
  console.log('   All gRPC servers cleanly shut down.\n');

  // Summary
  console.log('======================================================================');
  console.log('📊 EMPIRICAL STRESS TEST RESULTS:');
  const passedCount = records.filter((r) => r.passed).length;
  const failedCount = records.filter((r) => !r.passed).length;
  console.log(`   Total Tests:  ${records.length}`);
  console.log(`   Passed:       ${passedCount}`);
  console.log(`   Failed:       ${failedCount}`);
  console.log('======================================================================');

  if (failedCount > 0) {
    console.error(`\n❌ VERDICT: FAIL - ${failedCount} stress tests failed.`);
    process.exit(1);
  } else {
    console.log(`\n🎉 VERDICT: PASS - 100% OF EMPIRICAL CHALLENGES PASSED!`);
    process.exit(0);
  }
}

runChallengerTestSuite().catch((err) => {
  console.error('Fatal test harness error:', err);
  process.exit(1);
});
