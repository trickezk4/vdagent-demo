/**
 * scripts/verify-m2-compare-insight.ts
 * Standalone verification script for compare-agent (50052) and insight-agent (50053)
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';
import {
  ComparisonEnvelopeSchema,
  InsightEnvelopeSchema,
  verifyContentHash,
} from '@vda/contracts';
import { startCompareAgent } from '../apps/agents/compare-agent/src/index.js';
import { startInsightAgent } from '../apps/agents/insight-agent/src/index.js';

const PROTO_PATH = path.resolve(process.cwd(), 'proto/agent_pipeline.proto');

async function runVerification() {
  console.log('===============================================================');
  console.log('🧪 VERIFYING MILESTONE 2: COMPARE AGENT & INSIGHT AGENT (gRPC)');
  console.log('===============================================================\n');

  // 1. Start both microservices locally
  const compareServer = startCompareAgent(50052);
  const insightServer = startInsightAgent(50053);

  await Promise.all([compareServer.start(), insightServer.start()]);
  console.log('✅ compare-agent (:50052) and insight-agent (:50053) started successfully.\n');

  // 2. Load gRPC client stubs
  const packageDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
  });
  const proto = grpc.loadPackageDefinition(packageDef) as any;
  const SubAgentClient = proto.vda.agent.v1.SubAgentService;

  const compareClient = new SubAgentClient(
    'localhost:50052',
    grpc.credentials.createInsecure()
  );
  const insightClient = new SubAgentClient(
    'localhost:50053',
    grpc.credentials.createInsecure()
  );

  try {
    // 3. Test CheckHealth on both
    const checkHealth = (client: any, name: string): Promise<void> =>
      new Promise((resolve, reject) => {
        client.CheckHealth({}, (err: any, response: any) => {
          if (err || !response.is_healthy) {
            reject(new Error(`${name} health check failed: ${err?.message || response?.status_message}`));
          } else {
            console.log(`  💚 [HEALTH-OK] ${name}: ${response.status_message}`);
            resolve();
          }
        });
      });

    await Promise.all([
      checkHealth(compareClient, 'compare-agent'),
      checkHealth(insightClient, 'insight-agent'),
    ]);

    // Mock input DatasetArtifact
    const mockDatasetEnvelope = {
      artifact_id: '11111111-1111-4111-8111-111111111111',
      run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      task_id: 'task-data-step-1',
      artifact_type: 'dataset',
      schema_version: '1.0.0',
      status: 'VALID',
      producer: 'data-agent@1.0.0',
      payload: {
        units: [
          { unit_id: 'UNIT-VH-01', unit_code: 'VH-OCP-S102-1405', dom: 115, area_sqm: 55.4, launch_price_vnd: 2850000000, view_direction: 'West' },
          { unit_id: 'UNIT-VH-02', unit_code: 'VH-OCP-S102-1406', dom: 115, area_sqm: 55.4, launch_price_vnd: 2890000000, view_direction: 'West' },
          { unit_id: 'UNIT-VH-03', unit_code: 'VH-OCP-S105-0812', dom: 115, area_sqm: 43.2, launch_price_vnd: 2150000000, view_direction: 'West-North' },
        ],
        summary_metrics: { avg_dom: 115, absorption_rate: 50.0 },
      },
    };

    // Helper to execute step
    const executeStep = (client: any, role: string): Promise<any> =>
      new Promise((resolve, reject) => {
        const call = client.ExecuteStep({
          run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          task_id: `task-${role}-verify`,
          session_id: 'session-01',
          user_prompt: 'Điều tra căn hộ chậm bán tại Sapphire',
          agent_role: role,
          input_artifacts: [
            {
              artifact_id: mockDatasetEnvelope.artifact_id,
              artifact_type: mockDatasetEnvelope.artifact_type,
              content_json: JSON.stringify(mockDatasetEnvelope),
            },
          ],
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
          } else if (traceCount < 3) {
            reject(new Error(`${role} emitted insufficient TRACE events (${traceCount})`));
          } else {
            resolve(finalEnvelope);
          }
        });

        call.on('error', (err: any) => {
        console.error(`    ❌ [${role} CALL ERROR]:`, err);
        reject(err);
      });
      });

    // 4. Test parallel DAG step 2: Promise.all([compare, insight])
    console.log('\n▶️ Executing Parallel Step 2: Promise.all([compareClient, insightClient])...');
    const [compEnvelope, insightEnvelope] = await Promise.all([
      executeStep(compareClient, 'compare-agent'),
      executeStep(insightClient, 'insight-agent'),
    ]);

    // 5. Assert ComparisonArtifact
    console.log('\n🔎 Validating ComparisonArtifact Schema & Invariants...');
    ComparisonEnvelopeSchema.parse(compEnvelope);
    if (!verifyContentHash(compEnvelope)) throw new Error('ComparisonEnvelope content_hash verification failed');
    if (compEnvelope.payload.peer_benchmark.target_dom !== 115) throw new Error('Invalid target_dom');
    if (compEnvelope.payload.peer_benchmark.peer_avg_dom !== 35) throw new Error('Invalid peer_avg_dom');
    if (compEnvelope.payload.peer_benchmark.price_variance_pct !== 6.6) throw new Error('Invalid price_variance_pct');
    console.log('  ✅ ComparisonArtifact passed all validation checks.');

    // 6. Assert InsightArtifact
    console.log('\n🔎 Validating InsightArtifact Schema & Invariants...');
    InsightEnvelopeSchema.parse(insightEnvelope);
    if (!verifyContentHash(insightEnvelope)) throw new Error('InsightEnvelope content_hash verification failed');
    if (!insightEnvelope.payload.findings || insightEnvelope.payload.findings.length < 3) throw new Error('Insight findings must contain 3 root causes');

    // Verify explicit evidence_id binding
    const categories = insightEnvelope.payload.findings.map((f: any) => f.category);
    const evidenceIds = insightEnvelope.payload.findings.map((f: any) => f.evidence_id);

    if (!categories.includes('pricing') || !categories.includes('design_layout') || !categories.includes('policy_financing')) {
      throw new Error('Insight findings missing required root cause categories');
    }
    if (!evidenceIds.includes('UNIT-VH-01') || !evidenceIds.includes('UNIT-VH-02') || !evidenceIds.includes('UNIT-VH-03')) {
      throw new Error('Insight findings failed to bind to explicit evidence IDs');
    }
    console.log('  ✅ InsightArtifact passed all validation checks with bound evidence IDs:', evidenceIds);

    console.log('\n===============================================================');
    console.log('🎉 ALL VERIFICATION CHECKS PASSED FOR COMPARE & INSIGHT AGENTS!');
    console.log('===============================================================\n');
  } finally {
    compareClient.close();
    insightClient.close();
    await Promise.all([compareServer.stop(), insightServer.stop()]);
  }
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
