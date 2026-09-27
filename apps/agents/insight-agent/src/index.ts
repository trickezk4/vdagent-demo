/**
 * apps/agents/insight-agent/src/index.ts
 * Standalone Insight Agent microservice running on gRPC Port 50053
 */

import { createSubAgentServer } from '../../base-agent.js';
import { analyzeRootCauses } from './analyzer.js';
import type { DatasetPayload } from '@vda/contracts';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export const INSIGHT_AGENT_ROLE = 'insight-agent';
export const INSIGHT_AGENT_PORT = parseInt(process.env.INSIGHT_AGENT_PORT || '50053', 10);

export function startInsightAgent(port: number = INSIGHT_AGENT_PORT) {
  const serverInstance = createSubAgentServer({
    role: INSIGHT_AGENT_ROLE,
    port,
    handler: async (request, context) => {
      context.emitTrace(`[${INSIGHT_AGENT_ROLE}] Starting root cause investigation for task: ${context.taskId}`);

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
          context.emitTrace(`[${INSIGHT_AGENT_ROLE}] Successfully ingested DatasetArtifact ID: ${inputArtifactId}`);
        } catch (err: any) {
          context.emitTrace(`[${INSIGHT_AGENT_ROLE}] Warning: Failed to parse input DatasetArtifact JSON (${err.message}). Using database fallback.`);
        }
      } else {
        context.emitTrace(`[${INSIGHT_AGENT_ROLE}] No upstream DatasetArtifact provided. Accessing Mock Warehouse fallback.`);
      }

      // 2. Perform Root Cause Analysis
      context.emitTrace(`[${INSIGHT_AGENT_ROLE}] Analyzing 3 root causes: Pricing Misalignment, Architectural Drawbacks, and Loan Financing Policy Expiration...`);
      const { payload, evidenceRefs } = analyzeRootCauses(datasetPayload);

      for (const finding of payload.findings) {
        context.emitTrace(
          `[${INSIGHT_AGENT_ROLE}] Finding [${finding.category}]: ${finding.claim.substring(0, 60)}... -> Bound Evidence: [${finding.evidence_id}] (Confidence: ${finding.confidence})`
        );
      }

      context.emitTrace(`[${INSIGHT_AGENT_ROLE}] Synthesizing executive recommendations and validating InsightEnvelope...`);

      return {
        artifact_type: 'insight',
        payload: payload as unknown as Record<string, unknown>,
        evidence_refs: evidenceRefs,
        input_artifact_refs: [inputArtifactId],
        producer: `${INSIGHT_AGENT_ROLE}@1.0.0`,
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
  const instance = startInsightAgent();
  instance.start().then((boundPort) => {
    console.log(`>>> [insight-agent] gRPC server running on port :${boundPort}`);
  }).catch((err) => {
    console.error(`Failed to start insight-agent:`, err);
    process.exit(1);
  });

  const handleShutdown = async () => {
    console.log('[insight-agent] Shutting down gracefully...');
    await instance.stop();
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
}
