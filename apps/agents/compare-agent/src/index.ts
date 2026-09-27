/**
 * apps/agents/compare-agent/src/index.ts
 * Standalone Compare Agent microservice running on gRPC Port 50052
 */

import { createSubAgentServer } from '../../base-agent.js';
import { computePeerBenchmark } from './comparator.js';
import type { DatasetPayload } from '@vda/contracts';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export const COMPARE_AGENT_ROLE = 'compare-agent';
export const COMPARE_AGENT_PORT = parseInt(process.env.COMPARE_AGENT_PORT || '50052', 10);

export function startCompareAgent(port: number = COMPARE_AGENT_PORT) {
  const serverInstance = createSubAgentServer({
    role: COMPARE_AGENT_ROLE,
    port,
    handler: async (request, context) => {
      context.emitTrace(`[${COMPARE_AGENT_ROLE}] Starting peer group benchmark analysis for task: ${context.taskId}`);

      // 1. Extract DatasetArtifact from input_artifacts
      let datasetPayload: DatasetPayload | undefined;
      let inputArtifactId = 'dataset-input';

      const datasetInput = request.input_artifacts?.find(
        (a) => a.artifact_type === 'dataset'
      );

      if (datasetInput) {
        inputArtifactId = datasetInput.artifact_id || inputArtifactId;
        try {
          const parsed = JSON.parse(datasetInput.content_json);
          datasetPayload = parsed.payload ? parsed.payload : parsed;
          context.emitTrace(`[${COMPARE_AGENT_ROLE}] Successfully ingested DatasetArtifact ID: ${inputArtifactId}`);
        } catch (err: any) {
          context.emitTrace(`[${COMPARE_AGENT_ROLE}] Warning: Failed to parse input DatasetArtifact JSON (${err.message}). Using database fallback.`);
        }
      } else {
        context.emitTrace(`[${COMPARE_AGENT_ROLE}] No upstream DatasetArtifact provided. Accessing Mock Warehouse fallback.`);
      }

      // 2. Perform peer benchmark calculations
      context.emitTrace(`[${COMPARE_AGENT_ROLE}] Filtering peer group with ±10% area tolerance, matching floor band, and launch phase...`);
      const { payload, evidenceRefs, targetUnits, peerUnits } = computePeerBenchmark(datasetPayload, {
        areaTolerancePct: 10,
        sameZone: true,
      });

      context.emitTrace(
        `[${COMPARE_AGENT_ROLE}] Target DOM: ${payload.peer_benchmark.target_dom}d vs Peer Avg DOM: ${payload.peer_benchmark.peer_avg_dom}d. Price Variance: +${payload.peer_benchmark.price_variance_pct}%.`
      );
      context.emitTrace(`[${COMPARE_AGENT_ROLE}] Benchmarked ${targetUnits.length} target units against ${peerUnits.length} peer units.`);

      return {
        artifact_type: 'comparison',
        payload: payload as unknown as Record<string, unknown>,
        evidence_refs: evidenceRefs,
        input_artifact_refs: [inputArtifactId],
        producer: `${COMPARE_AGENT_ROLE}@1.0.0`,
      };
    },
  });

  return serverInstance;
}

// Automatically start when executed directly
const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const instance = startCompareAgent();
  instance.start().then((boundPort) => {
    console.log(`>>> [compare-agent] gRPC server running on port :${boundPort}`);
  }).catch((err) => {
    console.error(`Failed to start compare-agent:`, err);
    process.exit(1);
  });

  const handleShutdown = async () => {
    console.log('[compare-agent] Shutting down gracefully...');
    await instance.stop();
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
}
