/**
 * scripts/verify-m2-full-pipeline.ts
 * Comprehensive end-to-end gRPC verification for all 5 core sub-agents (Ports 50051 - 50055)
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  validateEnvelope,
  verifyContentHash,
  validateReportCompleteness,
  DatasetEnvelopeSchema,
  ComparisonEnvelopeSchema,
  InsightEnvelopeSchema,
  ChartSpecEnvelopeSchema,
  ReportEnvelopeSchema,
} from '@vda/contracts';
import { startDataAgent } from '../apps/agents/data-agent/src/index.js';
import { startCompareAgent } from '../apps/agents/compare-agent/src/index.js';
import { startInsightAgent } from '../apps/agents/insight-agent/src/index.js';
import { startChartAgentServer } from '../apps/agents/chart-agent/src/index.js';
import { startReportAgentServer } from '../apps/agents/report-agent/src/index.js';

const PROTO_PATH = path.resolve(process.cwd(), 'proto/agent_pipeline.proto');

async function runFullPipelineVerification() {
  console.log('======================================================================');
  console.log('🧪 VERIFYING FULL MILESTONE 2 CORE 5-AGENT gRPC PIPELINE (50051-50055)');
  console.log('======================================================================\n');

  // 1. Start all 5 servers
  console.log('▶️ [STEP 0] Launching all 5 standalone gRPC agents...');
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
  console.log('✅ All 5 gRPC servers are running.\n');

  // 2. Setup gRPC client connections
  const pkgDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
  });
  const proto = grpc.loadPackageDefinition(pkgDef) as any;
  const SubAgentClient = proto.vda.agent.v1.SubAgentService;

  const dataClient = new SubAgentClient('localhost:50051', grpc.credentials.createInsecure());
  const compareClient = new SubAgentClient('localhost:50052', grpc.credentials.createInsecure());
  const insightClient = new SubAgentClient('localhost:50053', grpc.credentials.createInsecure());
  const chartClient = new SubAgentClient('localhost:50054', grpc.credentials.createInsecure());
  const reportClient = new SubAgentClient('localhost:50055', grpc.credentials.createInsecure());

  const clients = [
    { name: 'data-agent', client: dataClient, port: 50051 },
    { name: 'compare-agent', client: compareClient, port: 50052 },
    { name: 'insight-agent', client: insightClient, port: 50053 },
    { name: 'chart-agent', client: chartClient, port: 50054 },
    { name: 'report-agent', client: reportClient, port: 50055 },
  ];

  try {
    // 3. Health Checks
    console.log('▶️ [HEALTH CHECK] Verifying CheckHealth on all 5 agents...');
    for (const c of clients) {
      const res = await new Promise<any>((resolve, reject) => {
        c.client.CheckHealth({}, (err: any, response: any) => {
          if (err || !response.is_healthy) {
            reject(new Error(`${c.name} health check failed: ${err?.message || response?.status_message}`));
          } else {
            resolve(response);
          }
        });
      });
      console.log(`  💚 [HEALTH-OK] ${c.name} (Port ${c.port}): ${res.status_message}`);
    }
    console.log('✅ All 5 health checks passed.\n');

    // Helper to execute step
    const executeStep = (client: any, role: string, inputArtifacts: any[] = []): Promise<any> =>
      new Promise((resolve, reject) => {
        const call = client.ExecuteStep({
          run_id: '12345678-1234-4234-8234-123456789abc',
          task_id: `task-${role}-flow`,
          session_id: 'session-full-pipeline-test',
          user_prompt: 'Tại sao phân khu Sapphire có căn hộ bán chậm hơn 90 ngày?',
          agent_role: role,
          input_artifacts: inputArtifacts.map((art) => ({
            artifact_id: art.artifact_id,
            artifact_type: art.artifact_type,
            content_json: JSON.stringify(art),
          })),
          execution_context_json: '{}',
        });

        let finalEnvelope: any = null;
        let traceCount = 0;

        call.on('data', (event: any) => {
          if (event.type === 'TRACE' || event.type === 0) {
            traceCount++;
            console.log(`    🔍 [${role} TRACE] ${event.message}`);
          } else if (event.type === 'COMPLETE' || event.type === 2) {
            finalEnvelope = JSON.parse(event.output_artifact_json);
          } else if (event.type === 'ERROR' || event.type === 3) {
            console.error(`    ❌ [${role} ERROR EVENT] ${event.message}`);
            reject(new Error(`${role} emitted ERROR event: ${event.message}`));
          }
        });

        call.on('end', () => {
          if (!finalEnvelope) {
            reject(new Error(`${role} ended without COMPLETE event`));
          } else if (traceCount < 2) {
            reject(new Error(`${role} emitted insufficient TRACE events (${traceCount})`));
          } else {
            resolve(finalEnvelope);
          }
        });

        call.on('error', (err: any) => reject(err));
      });

    // 4. Step 1: Data Agent
    console.log('▶️ [DAG STEP 1] Executing Data Agent (Port 50051)...');
    const datasetEnv = await executeStep(dataClient, 'data-agent', []);
    DatasetEnvelopeSchema.parse(datasetEnv);
    assert.equal(verifyContentHash(datasetEnv), true, 'Dataset content_hash mismatch');
    assert.ok(datasetEnv.payload.units.length >= 3, 'Must have at least 3 slow units');
    console.log(`  📦 [DATASET-OK] Retrieved ${datasetEnv.payload.units.length} slow units. Avg DOM: ${datasetEnv.payload.summary_metrics.avg_dom}d\n`);

    // 5. Step 2: Parallel Compare & Insight Agents
    console.log('▶️ [DAG STEP 2] Executing Parallel Step: Promise.all([compareClient, insightClient])...');
    const [compareEnv, insightEnv] = await Promise.all([
      executeStep(compareClient, 'compare-agent', [datasetEnv]),
      executeStep(insightClient, 'insight-agent', [datasetEnv]),
    ]);

    ComparisonEnvelopeSchema.parse(compareEnv);
    assert.equal(verifyContentHash(compareEnv), true, 'Compare content_hash mismatch');
    console.log(`  📦 [COMPARISON-OK] Target DOM: ${compareEnv.payload.peer_benchmark.target_dom}d, Peer DOM: ${compareEnv.payload.peer_benchmark.peer_avg_dom}d, Price Var: +${compareEnv.payload.peer_benchmark.price_variance_pct}%`);

    InsightEnvelopeSchema.parse(insightEnv);
    assert.equal(verifyContentHash(insightEnv), true, 'Insight content_hash mismatch');
    assert.ok(insightEnv.payload.findings.length >= 3, 'Must have 3 root causes');
    const categories = insightEnv.payload.findings.map((f: any) => f.category);
    assert.ok(categories.includes('pricing') && categories.includes('design_layout') && categories.includes('policy_financing'));
    console.log(`  📦 [INSIGHT-OK] 3 Root Causes verified with bound evidence citations: ${JSON.stringify(insightEnv.evidence_refs)}\n`);

    // 6. Step 3: Chart Agent
    console.log('▶️ [DAG STEP 3] Executing Chart Agent (Port 50054)...');
    const chartEnv = await executeStep(chartClient, 'chart-agent', [datasetEnv, compareEnv, insightEnv]);
    ChartSpecEnvelopeSchema.parse(chartEnv);
    assert.equal(verifyContentHash(chartEnv), true, 'ChartSpec content_hash mismatch');
    assert.ok(['bar', 'scatter'].includes(chartEnv.payload.chart_type));
    console.log(`  📦 [CHARTSPEC-OK] Generated Recharts-compliant ${chartEnv.payload.chart_type.toUpperCase()} chart spec with ${chartEnv.payload.chart_data.length} data points.\n`);

    // 7. Step 4: Report Agent
    console.log('▶️ [DAG STEP 4] Executing Report Agent (Port 50055)...');
    const reportEnv = await executeStep(reportClient, 'report-agent', [datasetEnv, compareEnv, insightEnv, chartEnv]);
    ReportEnvelopeSchema.parse(reportEnv);
    assert.equal(verifyContentHash(reportEnv), true, 'Report content_hash mismatch');

    const reportMarkdown = reportEnv.payload.markdown || reportEnv.payload.markdown_content;
    const completeness = validateReportCompleteness(reportMarkdown);
    assert.equal(completeness.isComplete, true, `Report missing sections: ${completeness.missingSections.join(', ')}`);

    // Check evidence citations
    assert.ok(reportEnv.evidence_refs.length > 0, 'Report must cite evidence');
    console.log(`  📦 [REPORT-OK] Validated 6-section report with ${reportEnv.evidence_refs.length} cited evidence references.`);
    console.log('  📄 Executive Summary snippet:\n' + reportMarkdown.split('## 2.')[0].trim());

    console.log('\n======================================================================');
    console.log('🎉 FULL MILESTONE 2 5-AGENT PIPELINE VERIFIED 100% PASSING!');
    console.log('======================================================================\n');
  } finally {
    dataClient.close();
    compareClient.close();
    insightClient.close();
    chartClient.close();
    reportClient.close();

    await Promise.all([
      dataServer.stop(),
      compareServer.stop(),
      insightServer.stop(),
      chartServer.stop(),
      reportServer.stop(),
    ]);
  }
}

runFullPipelineVerification().catch((err) => {
  console.error('❌ Full pipeline verification failed:', err);
  process.exit(1);
});
