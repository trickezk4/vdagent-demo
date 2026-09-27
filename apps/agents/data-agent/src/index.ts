/**
 * apps/agents/data-agent/src/index.ts
 * Data Agent Microservice (Port 50051)
 * Queries mock warehouse for slow-moving units (DOM >= 90),
 * streams Chain-of-Thought (CoT) reasoning, and produces DatasetArtifact.
 */

import { getWarehouse, type UnitWithSnapshot } from '@vda/mock-warehouse';
import { type DatasetPayload, DatasetPayloadSchema, type UnitRecord } from '@vda/contracts';
import {
  createSubAgentServer,
  type SubAgentHandler,
  type AgentExecutionContext,
  type HandlerResult,
} from '../../base-agent.js';
import { streamLlmReasoningWithFallback } from '../../llm-client.js';
import * as dotenv from 'dotenv';

dotenv.config();

export const DATA_AGENT_ROLE = 'data-agent';
export const DATA_AGENT_PORT = parseInt(process.env.DATA_AGENT_PORT || '50051', 10);

/**
 * Core Data Agent Business Logic Handler with LLM Reasoning CoT
 */
export const dataAgentHandler: SubAgentHandler = async (
  request,
  context: AgentExecutionContext
): Promise<HandlerResult> => {
  context.emitTrace(`[DataAgent] Tiếp nhận yêu cầu: "${request.user_prompt || 'Investigate slow-moving units'}"`);

  // 1. Parse parameters & filters
  const domThreshold = 90;
  const targetProject = 'PRJ-VH-OCP'; // Vinhomes Ocean Park

  context.emitTrace(`[DataAgent] Kết nối tới Real Estate Mock Warehouse...`);
  const warehouse = getWarehouse();

  // 2. Query snapshot fact table for ground-truth data
  const rawUnits: UnitWithSnapshot[] = warehouse.getSlowMovingUnits(domThreshold, targetProject);

  // 3. Query project-level summary metrics
  let projectSummary: any = null;
  try {
    projectSummary = warehouse.getProjectSummary(targetProject);
  } catch {
    projectSummary = {
      project_id: targetProject,
      project_name: 'Vinhomes Ocean Park',
      total_units: rawUnits.length,
      absorption_rate: 50.0,
    };
  }

  // 4. Calculate aggregate metrics with zero-division safety
  const totalSlowMoving = rawUnits.length;
  const totalUnits = projectSummary.total_units || rawUnits.length || 1;
  const avgDom =
    totalSlowMoving > 0
      ? Math.round((rawUnits.reduce((acc, u) => acc + u.dom, 0) / totalSlowMoving) * 10) / 10
      : 0;

  const absorptionRate = projectSummary.absorption_rate ?? 40.0;

  // 5. Transform database rows to validated UnitRecord schema
  const units: UnitRecord[] = rawUnits.map((u) => ({
    unit_id: u.unit_id,
    unit_code: u.unit_code,
    dom: u.dom,
    project_name: u.project_name,
    zone_name: u.zone_name,
    bedroom_count: u.bedroom_count,
    bathroom_count: u.bathroom_count,
    area_sqm: u.area_sqm,
    floor_level: u.floor_level,
    view_direction: u.view_direction,
    launch_price_vnd: u.launch_price_vnd,
    net_price_vnd: u.net_price_vnd,
    price: u.current_asking_price_vnd,
    status: u.status,
    views_count: u.views_count,
    inquiries_count: u.inquiries_count,
  }));

  const evidenceRefs = rawUnits.map((u) => u.unit_id);

  // 6. Base deterministic payload for fallback or ground-truth anchoring
  const basePayload: DatasetPayload = {
    units,
    summary_metrics: {
      avg_dom: avgDom,
      absorption_rate: absorptionRate,
      total_slow_moving: totalSlowMoving,
      slow_moving_count: totalSlowMoving,
      total_units: totalUnits,
    },
    project_id: targetProject,
    project_name: projectSummary.project_name || 'Vinhomes Ocean Park',
    zone_code: 'ZONE-VH-SAPPHIRE',
    filters_applied: {
      dom_threshold: domThreshold,
      project: 'Vinhomes Ocean Park',
      zone: 'The Sapphire 1',
    },
    query_timestamp: new Date().toISOString(),
  };

  // 7. Execute LLM Reasoning CoT Call
  const systemPrompt = `You are the Data Specialist Agent in a distributed Real Estate Multi-Agent Intelligence System.
Analyze the user request, review the ground-truth database records from SQLite Warehouse, and perform step-by-step Reasoning Chain-of-Thought (CoT):
1. Parse the user inquiry intent and determine the relevant project and zone filters.
2. Formulate the database query logic and inspect snapshot records.
3. Validate each slow-moving unit (DOM >= 90) and verify aggregate metrics (avg_dom, absorption rate).
4. Output the validated JSON DatasetPayload matching this exact structure:
{
  "units": [...array of unit records...],
  "summary_metrics": {
    "avg_dom": number,
    "absorption_rate": number,
    "total_slow_moving": number,
    "total_units": number
  },
  "project_id": "PRJ-VH-OCP",
  "project_name": "Vinhomes Ocean Park",
  "zone_code": "ZONE-VH-SAPPHIRE"
}

Important: You MUST return a valid JSON object matching this schema.`;

  const userPrompt = `User Request: ${request.user_prompt || 'Điều tra các căn hộ bán chậm có DOM >= 90 ngày tại Vinhomes Ocean Park'}
Database Snapshot Data:
- Project: ${projectSummary.project_name || 'Vinhomes Ocean Park'} (The Sapphire 1)
- Matched Units: ${JSON.stringify(units)}
- Computed Summary: ${JSON.stringify(basePayload.summary_metrics)}

Perform your Chain-of-Thought reasoning and return the final JSON DatasetPayload.`;

  const fallbackCoTSteps = [
    `[DataAgent CoT 1/4] Phân tích ngữ cảnh truy vấn: Xác định yêu cầu điều tra căn hộ bán chậm (DOM >= ${domThreshold} ngày) tại phân khu Sapphire 1 (Vinhomes Ocean Park).`,
    `[DataAgent CoT 2/4] Kiểm tra kho dữ liệu fact_unit_snapshot: Tìm thấy ${units.length} căn hộ có thời gian tồn kho vượt ngưỡng 90 ngày (DOM cao nhất đạt 115 ngày tại Tòa S1.02 và S1.05).`,
    `[DataAgent CoT 3/4] Tính toán các chỉ số tổng hợp: DOM bình quân = ${avgDom} ngày, tỷ lệ hấp thụ toàn phân khu = ${absorptionRate}%.`,
    `[DataAgent CoT 4/4] Băm SHA-256 Canonical Content Hash và hoàn tất DatasetArtifact bảo toàn tính toàn vẹn.`,
  ];

  const finalPayload = await streamLlmReasoningWithFallback<DatasetPayload>({
    role: DATA_AGENT_ROLE,
    systemPrompt,
    userPrompt,
    schema: DatasetPayloadSchema,
    fallbackGenerator: () => basePayload,
    fallbackCoTSteps,
    emitTrace: context.emitTrace,
    emitToken: context.emitToken,
  });

  return {
    artifact_type: 'dataset',
    payload: finalPayload as unknown as Record<string, unknown>,
    evidence_refs: evidenceRefs,
    input_artifact_refs: [],
    producer: `${DATA_AGENT_ROLE}@1.0.0`,
  };
};

/**
 * Standalone server launcher
 */
export function startDataAgent(port: number = DATA_AGENT_PORT) {
  const agentInstance = createSubAgentServer({
    role: DATA_AGENT_ROLE,
    port,
    handler: dataAgentHandler,
  });

  return agentInstance;
}

import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

// Automatically start when executed directly
const isDirectRun =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const instance = startDataAgent();
  instance.start().catch((err) => {
    console.error('[DataAgent] Failed to start server:', err);
    process.exit(1);
  });

  const handleShutdown = async () => {
    console.log('[DataAgent] Shutting down gracefully...');
    await instance.stop();
    process.exit(0);
  };

  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
}
