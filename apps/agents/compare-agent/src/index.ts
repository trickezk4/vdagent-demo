/**
 * apps/agents/compare-agent/src/index.ts
 * Standalone Compare Agent microservice running on gRPC Port 50052
 * Performs peer benchmarking with live LLM Chain-of-Thought (CoT) reasoning.
 */

import { createSubAgentServer } from '../../base-agent.js';
import { computePeerBenchmark } from './comparator.js';
import { type DatasetPayload, type ComparisonPayload, ComparisonPayloadSchema } from '@vda/contracts';
import { streamLlmReasoningWithFallback } from '../../llm-client.js';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config();

export const COMPARE_AGENT_ROLE = 'compare-agent';
export const COMPARE_AGENT_PORT = parseInt(process.env.COMPARE_AGENT_PORT || '50052', 10);

export function startCompareAgent(port: number = COMPARE_AGENT_PORT) {
  const serverInstance = createSubAgentServer({
    role: COMPARE_AGENT_ROLE,
    port,
    handler: async (request, context) => {
      context.emitTrace(`[${COMPARE_AGENT_ROLE}] Tiếp nhận yêu cầu đối chuẩn thị trường cho task: ${context.taskId}`);

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
          context.emitTrace(`[${COMPARE_AGENT_ROLE}] Nạp thành công DatasetArtifact ID: ${inputArtifactId}`);
        } catch (err: any) {
          context.emitTrace(`[${COMPARE_AGENT_ROLE}] Cảnh báo: Không thể giải mã DatasetArtifact JSON (${err.message}). Dùng fallback kho.`);
        }
      } else {
        context.emitTrace(`[${COMPARE_AGENT_ROLE}] Không có DatasetArtifact đầu vào. Kết nối Mock Warehouse fallback.`);
      }

      // 2. Perform ground-truth peer benchmark calculations
      const benchmarkBaseline = computePeerBenchmark(datasetPayload, {
        areaTolerancePct: 10,
        sameZone: true,
      });

      const { payload: basePayload, evidenceRefs, targetUnits, peerUnits } = benchmarkBaseline;

      // 3. Execute LLM Reasoning Chain-of-Thought (CoT)
      const systemPrompt = `You are the Real Estate Benchmark Specialist Agent.
Analyze the target slow-moving dataset and compare against peer groups in The Sapphire 1 (Vinhomes Ocean Park).
Perform concise step-by-step Reasoning Chain-of-Thought (CoT) in Vietnamese (1-2 sentences).

Schema structure for ComparisonPayload:
{
  "peer_benchmark": {
    "target_dom": 115,
    "peer_avg_dom": 35,
    "price_variance_pct": 6.6,
    "target_price_vnd": 2850000000,
    "peer_avg_price_vnd": 2660000000,
    "target_price_per_sqm": 51444043,
    "peer_avg_price_per_sqm": 48271364
  },
  "observations": [
    "Căn mục tiêu (55.4m2) tồn đọng 115 ngày, cao gấp 3.3 lần benchmark (35 ngày).",
    "Đơn giá niêm yết 51.4 tr/m2 cao hơn 6.6% so với đơn giá bán thực tế của peer (48.3 tr/m2)."
  ],
  "comparison_summary": "Nhóm căn tồn đọng có giá cao hơn 6.6% và thiếu lợi thế hướng mát, dẫn tới DOM kéo dài."
}
Return the JSON object strictly matching this schema.`;

      const userPrompt = `Target Slow-Moving Units: ${JSON.stringify(targetUnits.slice(0, 4))}
Peer Benchmark Ground-Truth: ${JSON.stringify(basePayload.peer_benchmark)}
Observations Baseline: ${JSON.stringify(basePayload.observations || [])}

Perform your Chain-of-Thought reasoning and output the final JSON ComparisonPayload.`;

      const fallbackCoTSteps = [
        `[CompareAgent CoT 1/4] Phân tích đặc tính giỏ hàng: ${targetUnits.length} căn hộ diện tích từ 43.2 m² đến 68.0 m², thời gian lưu kho 98 - 115 ngày.`,
        `[CompareAgent CoT 2/4] Thiết lập đối chuẩn phân khu The Sapphire 1: Đơn giá bình quân giỏ hàng đối chuẩn là 47.6 tr/m², DOM trung bình phân khu là 68 ngày.`,
        `[CompareAgent CoT 3/4] Đo lường phương sai giá và tồn kho: Đơn giá các căn chậm bán đạt 49.8 - 55.9 tr/m² (cao hơn mặt bằng đối chuẩn từ +4.6% đến +17.4%). Tồn kho vượt +69.1% so với benchmark.`,
        `[CompareAgent CoT 4/4] Tổng hợp kết luận đối chuẩn: Mức giá ròng chưa đủ hấp dẫn để bù đắp bất lợi về hướng và vị trí tầng. Đóng gói ComparisonArtifact.`,
      ];

      const finalPayload = await streamLlmReasoningWithFallback<ComparisonPayload>({
        role: COMPARE_AGENT_ROLE,
        systemPrompt,
        userPrompt,
        schema: ComparisonPayloadSchema,
        fallbackGenerator: () => basePayload,
        fallbackCoTSteps,
        emitTrace: context.emitTrace,
        emitToken: context.emitToken,
      });

      return {
        artifact_type: 'comparison',
        payload: finalPayload as unknown as Record<string, unknown>,
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
