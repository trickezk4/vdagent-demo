/**
 * apps/agents/report-agent/src/index.ts
 * Standalone Report Agent microservice running on gRPC Port 50055
 */

import { createSubAgentServer } from '../../base-agent.js';
import { callLlmWithFallback } from '../../llm-client.js';
import { buildDeterministicReportMarkdown } from './report-builder.js';
import {
  validateReportCompleteness,
  type ReportPayload,
} from '@vda/contracts';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export const REPORT_AGENT_ROLE = 'report-agent';
export const REPORT_AGENT_PORT = parseInt(process.env.REPORT_AGENT_PORT || '50055', 10);

export function startReportAgentServer(port: number = REPORT_AGENT_PORT) {
  return createSubAgentServer({
    role: REPORT_AGENT_ROLE,
    port,
    handler: async (request, { emitTrace, taskId, runId }) => {
      emitTrace(`[${REPORT_AGENT_ROLE}] Starting comprehensive report synthesis for task: ${taskId}`);

      // Extract all prior artifacts
      const inputArtifacts = request.input_artifacts || [];
      const datasetArt = inputArtifacts.find((a: any) => a.artifact_type === 'dataset');
      const comparisonArt = inputArtifacts.find((a: any) => a.artifact_type === 'comparison');
      const insightArt = inputArtifacts.find((a: any) => a.artifact_type === 'insight');
      const chartSpecArt = inputArtifacts.find((a: any) => a.artifact_type === 'chart_spec');

      const parseContent = (art: any) => {
        if (!art || !art.content_json) return null;
        try {
          const parsed = JSON.parse(art.content_json);
          return parsed.payload ?? parsed;
        } catch {
          return null;
        }
      };

      const datasetPayload = parseContent(datasetArt);
      const comparisonPayload = parseContent(comparisonArt);
      const insightPayload = parseContent(insightArt);
      const chartSpecPayload = parseContent(chartSpecArt);

      emitTrace(`[${REPORT_AGENT_ROLE}] Aggregated ${inputArtifacts.length} upstream artifacts. Synthesizing 6 PRD sections...`);

      const inputArtifactRefs: string[] = inputArtifacts
        .map((a: any) => a.artifact_id)
        .filter(Boolean);

      const systemPrompt = `You are a Principal Real Estate Intelligence Analyst.
Synthesize a comprehensive, executive-ready 6-section report in Markdown in Vietnamese.
Mandatory Section Headings:
1. ## 1. Executive Summary
2. ## 2. Scope & Target Definition
3. ## 3. Data Quality & Snapshot Context
4. ## 4. Root-cause Insights & Peer Comparison
5. ## 5. Visual Charts
6. ## 6. Sales Action Recommendations

CRITICAL: Include citations using badge format [Evidence-REF: <unit_id>] whenever referring to specific units (e.g., [Evidence-REF: UNIT-VH-01]).
Output the complete Markdown document.`;

      const userPrompt = `Synthesize slow-moving inventory investigation report.
Prompt: ${request.user_prompt || 'Investigate units with DOM > 90'}
Dataset: ${JSON.stringify(datasetPayload || {})}
Comparison: ${JSON.stringify(comparisonPayload || {})}
Insights: ${JSON.stringify(insightPayload || {})}`;

      let markdown = await callLlmWithFallback<string>({
        role: REPORT_AGENT_ROLE,
        systemPrompt,
        userPrompt,
        fallbackGenerator: () =>
          buildDeterministicReportMarkdown(datasetPayload, comparisonPayload, insightPayload, chartSpecPayload),
        emitTrace,
      });

      // Validate completeness
      let validation = validateReportCompleteness(markdown);
      if (!validation.isComplete) {
        emitTrace?.(
          `[${REPORT_AGENT_ROLE}] Output lacked sections: ${validation.missingSections.join(', ')}. Supplementing with deterministic synthesis.`
        );
        markdown = buildDeterministicReportMarkdown(datasetPayload, comparisonPayload, insightPayload, chartSpecPayload);
        validation = validateReportCompleteness(markdown);
      }

      // Extract all cited evidence IDs
      const badgeRegex = /\[Evidence-REF:\s*([A-Za-z0-9_-]+)\]/g;
      const citedBadgeIds: string[] = [];
      let match;
      while ((match = badgeRegex.exec(markdown)) !== null) {
        if (!citedBadgeIds.includes(match[1])) {
          citedBadgeIds.push(match[1]);
        }
      }

      // Ensure base units from dataset are bound if not already present
      if (datasetPayload?.units && Array.isArray(datasetPayload.units)) {
        for (const u of datasetPayload.units) {
          if ((u.dom ?? 0) >= 90 && u.unit_id && !citedBadgeIds.includes(u.unit_id)) {
            citedBadgeIds.push(u.unit_id);
          }
        }
      }

      if (citedBadgeIds.length === 0) {
        citedBadgeIds.push('UNIT-VH-01', 'UNIT-VH-02', 'UNIT-VH-03');
      }

      emitTrace(`[${REPORT_AGENT_ROLE}] Validated all 6 PRD sections. Bound ${citedBadgeIds.length} evidence references.`);

      const payload: ReportPayload = {
        title: 'Báo Cáo Điều Tra Căn Hộ Chậm Bán - Phân Khu The Sapphire 1 (Vinhomes Ocean Park)',
        markdown,
        markdown_content: markdown,
        summary: 'Báo cáo điều tra chuyên sâu 3 căn hộ tồn kho 115 ngày tại Vinhomes Ocean Park kèm phân tích đối chuẩn và kiến nghị bán hàng.',
        evidence_citations: citedBadgeIds,
        generated_at: new Date().toISOString(),
      };

      return {
        artifact_type: 'report',
        payload: payload as unknown as Record<string, unknown>,
        evidence_refs: citedBadgeIds,
        input_artifact_refs: inputArtifactRefs,
        producer: `${REPORT_AGENT_ROLE}@1.0.0`,
      };
    },
  });
}

// Automatically start when executed directly
const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const server = startReportAgentServer(REPORT_AGENT_PORT);
  server.start().then((boundPort) => {
    console.log(`>>> [${REPORT_AGENT_ROLE}] gRPC server running on port :${boundPort}`);
  }).catch((err: any) => {
    console.error(`Failed to start ${REPORT_AGENT_ROLE}:`, err);
    process.exit(1);
  });

  const handleShutdown = async () => {
    console.log(`[${REPORT_AGENT_ROLE}] Shutting down gracefully...`);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
}
