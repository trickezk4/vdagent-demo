/**
 * apps/agents/insight-agent/src/index.ts
 * Standalone Insight Agent microservice running on gRPC Port 50053
 * Performs deep root-cause diagnostic investigation with live LLM Chain-of-Thought (CoT) reasoning.
 */

import { createSubAgentServer } from '../../base-agent.js';
import { analyzeRootCauses } from './analyzer.js';
import { type DatasetPayload, type InsightPayload, InsightPayloadSchema } from '@vda/contracts';
import { streamLlmReasoningWithFallback } from '../../llm-client.js';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config();

export const INSIGHT_AGENT_ROLE = 'insight-agent';
export const INSIGHT_AGENT_PORT = parseInt(process.env.INSIGHT_AGENT_PORT || '50053', 10);

export function startInsightAgent(port: number = INSIGHT_AGENT_PORT) {
  const serverInstance = createSubAgentServer({
    role: INSIGHT_AGENT_ROLE,
    port,
    handler: async (request, context) => {
      context.emitTrace(`[${INSIGHT_AGENT_ROLE}] Tiếp nhận yêu cầu điều tra nguyên nhân gốc rễ cho task: ${context.taskId}`);

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
          context.emitTrace(`[${INSIGHT_AGENT_ROLE}] Nạp thành công DatasetArtifact ID: ${inputArtifactId}`);
        } catch (err: any) {
          context.emitTrace(`[${INSIGHT_AGENT_ROLE}] Cảnh báo: Không thể giải mã DatasetArtifact JSON (${err.message}). Dùng database fallback.`);
        }
      } else {
        context.emitTrace(`[${INSIGHT_AGENT_ROLE}] Không có DatasetArtifact đầu vào. Kết nối Mock Warehouse fallback.`);
      }

      // 2. Perform baseline ground-truth root cause analysis
      const baseline = analyzeRootCauses(datasetPayload);
      const { payload: basePayload, evidenceRefs } = baseline;

      // 3. Execute LLM Reasoning Chain-of-Thought (CoT)
      const systemPrompt = `You are the Real Estate Root-Cause Investigator Agent.
Analyze the slow-moving units in The Sapphire 1 (Vinhomes Ocean Park) and perform concise reasoning.

Schema structure for InsightPayload:
{
  "findings": [
    {
      "claim": "Giá niêm yết 51.4 tr/m2 cao hơn 6.6% so với giá giao dịch thực tế",
      "evidence_id": "UNIT-VH-01",
      "confidence": 0.92,
      "category": "pricing",
      "detail": "Không có đợt điều chỉnh giảm giá nào sau 115 ngày lưu kho.",
      "impact_assessment": "Làm suy giảm nghiêm trọng lượng inquiries và chuyển đổi."
    }
  ],
  "overall_root_cause": "Tồn kho kéo dài do định giá cao, hướng Tây nắng nóng và hết hạn ưu đãi lãi suất.",
  "recommended_focus": "Điều chỉnh giá niêm yết giảm 5-8% và bổ sung gói hỗ trợ lãi suất mới."
}
Requirements:
1. Include at least 3 findings covering: 'pricing', 'design_layout', 'policy_financing'.
2. Every finding MUST cite a valid evidence unit ID (e.g. UNIT-VH-01, UNIT-VH-02, UNIT-VH-03).
3. Return the JSON object strictly matching this schema.`;

      const userPrompt = `Investigate root causes for slow-moving inventory.
Target Inventory Data: ${JSON.stringify(datasetPayload?.units?.slice(0, 4) || [])}
Baseline Findings: ${JSON.stringify(basePayload.findings)}

Perform your Chain-of-Thought reasoning and output the final JSON InsightPayload.`;

      const fallbackCoTSteps = [
        `[InsightAgent CoT 1/5] Khởi động mô hình điều tra nguyên nhân đa chiều: Định giá (Pricing), Kiến trúc & Hướng (Architecture), và Chính sách tín dụng (Financing).`,
        `[InsightAgent CoT 2/5] [Kiểm chứng Nguyên nhân 1]: Phân tích đơn giá niêm yết vs giá ròng. Căn UNIT-VH-01 (S102-1405) giá 51.4 tr/m² cao hơn 12.4% so với giá mở bán giai đoạn 1 mà không có thêm gói nội thất. -> Gán Evidence: UNIT-VH-01.`,
        `[InsightAgent CoT 3/5] [Kiểm chứng Nguyên nhân 2]: Khảo sát đặc tính vật lý. Căn UNIT-VH-02 (S102-1406) và UNIT-VH-03 (S105-0812) quay hướng Tây / Tây Bắc chịu nắng gắt buổi chiều, tầng 14 view nội khu bị tòa S1.01 che chắn một phần. -> Gán Evidence: UNIT-VH-02.`,
        `[InsightAgent CoT 4/5] [Kiểm chứng Nguyên nhân 3]: Rà soát chính sách ngân hàng. Gói hỗ trợ lãi suất 0% trong 18 tháng đã kết thúc, lãi suất thả nổi 11.5%/năm khiến chi phí trả góp hàng tháng tăng vọt. -> Gán Evidence: UNIT-VH-03.`,
        `[InsightAgent CoT 5/5] Tính toán độ tin cậy (Confidence 0.90 - 0.95), tổng hợp khuyến nghị chính sách chiết khấu 5-8% và đóng gói InsightArtifact.`,
      ];

      const finalPayload = await streamLlmReasoningWithFallback<InsightPayload>({
        role: INSIGHT_AGENT_ROLE,
        systemPrompt,
        userPrompt,
        schema: InsightPayloadSchema,
        fallbackGenerator: () => basePayload,
        fallbackCoTSteps,
        emitTrace: context.emitTrace,
        emitToken: context.emitToken,
      });

      return {
        artifact_type: 'insight',
        payload: finalPayload as unknown as Record<string, unknown>,
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
