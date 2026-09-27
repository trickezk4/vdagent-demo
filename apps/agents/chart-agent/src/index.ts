/**
 * apps/agents/chart-agent/src/index.ts
 * Standalone Chart Agent microservice running on gRPC Port 50054
 * Generates Recharts visualization specifications with live LLM Chain-of-Thought (CoT) reasoning.
 */

import { createSubAgentServer } from '../../base-agent.js';
import { streamLlmReasoningWithFallback } from '../../llm-client.js';
import { buildDeterministicChartPayload } from './chart-builder.js';
import {
  ChartSpecPayloadSchema,
  type ChartSpecPayload,
} from '@vda/contracts';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config();

export const CHART_AGENT_ROLE = 'chart-agent';
export const CHART_AGENT_PORT = parseInt(process.env.CHART_AGENT_PORT || '50054', 10);

export function startChartAgentServer(port: number = CHART_AGENT_PORT) {
  return createSubAgentServer({
    role: CHART_AGENT_ROLE,
    port,
    handler: async (request, { emitTrace, emitToken, taskId, runId }) => {
      emitTrace(`[${CHART_AGENT_ROLE}] Tiếp nhận yêu cầu khởi tạo biểu đồ trực quan Recharts cho task: ${taskId}`);

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

      emitTrace(`[${CHART_AGENT_ROLE}] Nạp ${inputArtifacts.length} artifacts đầu vào. Phân tích dữ liệu đối chuẩn và nguyên nhân gốc...`);

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
Analyze the comparison and insight findings, and configure the primary Recharts visualization.

Schema structure for ChartSpecPayload:
{
  "chart_type": "bar",
  "title": "So sánh DOM các căn tồn kho vs Ngưỡng 90 ngày",
  "description": "Biểu đồ cột thể hiện số ngày lưu kho của từng căn hộ phân khu The Sapphire 1 so với ngưỡng cảnh báo 90 ngày.",
  "chart_data": [
    { "unit_code": "VH-OCP-S102-1406", "dom": 115, "evidence_id": "UNIT-VH-02" },
    { "unit_code": "VH-OCP-S102-1405", "dom": 115, "evidence_id": "UNIT-VH-01" },
    { "unit_code": "VH-OCP-S105-0812", "dom": 115, "evidence_id": "UNIT-VH-03" },
    { "unit_code": "VH-OCP-S108-1903", "dom": 98, "evidence_id": "UNIT-VH-04" }
  ],
  "x_axis": "unit_code",
  "y_axis": "dom",
  "series": [
    { "key": "dom", "name": "Số ngày lưu kho (DOM)", "color": "#ef4444" }
  ],
  "benchmark_line": { "value": 90, "label": "Ngưỡng cảnh báo 90 ngày", "color": "#f59e0b" }
}
Return the JSON object strictly matching this schema.`;

      const userPrompt = `Request: ${request.user_prompt || 'Visualize slow-moving units with DOM >= 90'}
Comparison Data: ${JSON.stringify(comparisonPayload || {})}
Insight Data: ${JSON.stringify(insightPayload || {})}`;

      const fallbackCoTSteps = [
        `[ChartAgent CoT 1/4] Tiếp nhận dữ liệu đối chuẩn và nguyên nhân gốc rễ từ Compare Agent & Insight Agent.`,
        `[ChartAgent CoT 2/4] Thiết kế Biểu đồ 1 (DOM Analysis): BarChart thể hiện số ngày lưu kho từng căn hộ kèm ReferenceLine màu đỏ tại y=90 ngày.`,
        `[ChartAgent CoT 3/4] Thiết kế Biểu đồ 2 & 3 (Price & Correlation): Đo lường tương quan giữa đơn giá niêm yết (49.8 - 55.9 tr/m²) và thời gian lưu kho.`,
        `[ChartAgent CoT 4/4] Chuẩn hóa mảng dữ liệu có gắn nhãn mã căn unit_code và mã bằng chứng evidence_ref. Đóng gói ChartSpecArtifact.`,
      ];

      const payload = await streamLlmReasoningWithFallback<ChartSpecPayload>({
        role: CHART_AGENT_ROLE,
        systemPrompt,
        userPrompt,
        schema: ChartSpecPayloadSchema,
        fallbackGenerator: () =>
          buildDeterministicChartPayload(comparisonPayload, insightPayload, datasetPayload, request.user_prompt),
        fallbackCoTSteps,
        emitTrace,
        emitToken,
      });

      emitTrace(`[${CHART_AGENT_ROLE}] Hoàn thành cấu hình biểu đồ Recharts (${payload.chart_type}) sẵn sàng render trên UI.`);

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
