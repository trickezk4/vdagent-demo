/**
 * apps/agents/chart-agent/src/index.ts
 * Standalone Chart Agent microservice running on gRPC Port 50054
 */

import { createSubAgentServer } from '../../base-agent.js';
import { callLlmWithFallback } from '../../llm-client.js';
import { buildDeterministicChartPayload } from './chart-builder.js';
import {
  ChartSpecPayloadSchema,
  type ChartSpecPayload,
} from '@vda/contracts';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export const CHART_AGENT_ROLE = 'chart-agent';
export const CHART_AGENT_PORT = parseInt(process.env.CHART_AGENT_PORT || '50054', 10);

export function startChartAgentServer(port: number = CHART_AGENT_PORT) {
  return createSubAgentServer({
    role: CHART_AGENT_ROLE,
    port,
    handler: async (request, { emitTrace, taskId, runId }) => {
      emitTrace(`[${CHART_AGENT_ROLE}] Starting visual chart specification generation for task: ${taskId}`);

      // Extract prior artifacts
      const inputArtifacts = request.input_artifacts || [];
      const comparisonArt = inputArtifacts.find((a: any) => a.artifact_type === 'comparison');
      const insightArt = inputArtifacts.find((a: any) => a.artifact_type === 'insight');
      const datasetArt = inputArtifacts.find((a: any) => a.artifact_type === 'dataset');

      const parseContent = (art: any) => {
        if (!art || !art.content_json) return null;
        try {
          const parsed = JSON.parse(art.content_json);
          return parsed.payload ?? parsed;
        } catch {
          return null;
        }
      };

      const comparisonPayload = parseContent(comparisonArt);
      const insightPayload = parseContent(insightArt);
      const datasetPayload = parseContent(datasetArt);

      emitTrace(`[${CHART_AGENT_ROLE}] Ingested upstream artifacts. Analyzing peer comparison and insight findings...`);

      // Collect evidence and input artifact refs
      const inputArtifactRefs: string[] = inputArtifacts
        .map((a: any) => a.artifact_id)
        .filter(Boolean);

      const evidenceRefs: string[] = [];
      if (datasetPayload?.units) {
        for (const u of datasetPayload.units) {
          if ((u.dom ?? 0) >= 90 && u.unit_id && !evidenceRefs.includes(u.unit_id)) {
            evidenceRefs.push(u.unit_id);
          }
        }
      }
      if (comparisonPayload?.target_units) {
        for (const id of comparisonPayload.target_units) {
          if (!evidenceRefs.includes(id)) evidenceRefs.push(id);
        }
      }
      if (evidenceRefs.length === 0) {
        evidenceRefs.push('UNIT-VH-01', 'UNIT-VH-02', 'UNIT-VH-03');
      }

      const systemPrompt = `You are a Visual Analytics Specialist Agent for Real Estate.
Generate a valid ChartSpecPayload JSON matching:
{
  "chart_type": "bar" | "scatter",
  "title": string,
  "description": string,
  "chart_data": array of flat objects,
  "x_axis": string,
  "y_axis": string,
  "benchmark_line": { "value": number, "label": string, "color": string },
  "series": array of { "key": string, "name": string, "color": string }
}
Output ONLY valid JSON.`;

      const userPrompt = `Request: ${request.user_prompt || 'Visualize slow-moving units with DOM > 90'}
Comparison Data: ${JSON.stringify(comparisonPayload || {})}
Insight Data: ${JSON.stringify(insightPayload || {})}`;

      const payload = await callLlmWithFallback<ChartSpecPayload>({
        role: CHART_AGENT_ROLE,
        systemPrompt,
        userPrompt,
        schema: ChartSpecPayloadSchema,
        fallbackGenerator: () =>
          buildDeterministicChartPayload(comparisonPayload, insightPayload, datasetPayload, request.user_prompt),
        emitTrace,
      });

      emitTrace(`[${CHART_AGENT_ROLE}] Successfully created Recharts-compliant ChartSpec (${payload.chart_type} chart).`);

      return {
        artifact_type: 'chart_spec',
        payload: payload as unknown as Record<string, unknown>,
        evidence_refs: evidenceRefs,
        input_artifact_refs: inputArtifactRefs,
        producer: `${CHART_AGENT_ROLE}@1.0.0`,
      };
    },
  });
}

// Automatically start when executed directly
const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const server = startChartAgentServer(CHART_AGENT_PORT);
  server.start().then((boundPort) => {
    console.log(`>>> [${CHART_AGENT_ROLE}] gRPC server running on port :${boundPort}`);
  }).catch((err: any) => {
    console.error(`Failed to start ${CHART_AGENT_ROLE}:`, err);
    process.exit(1);
  });

  const handleShutdown = async () => {
    console.log(`[${CHART_AGENT_ROLE}] Shutting down gracefully...`);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
}
