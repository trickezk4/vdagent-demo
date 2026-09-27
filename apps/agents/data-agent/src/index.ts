/**
 * apps/agents/data-agent/src/index.ts
 * Data Agent Microservice (Port 50051)
 * Queries mock warehouse for slow-moving units (DOM >= 90) and produces DatasetArtifact
 */

import { getWarehouse, type UnitWithSnapshot } from '@vda/mock-warehouse';
import { type DatasetPayload, type UnitRecord } from '@vda/contracts';
import {
  createSubAgentServer,
  type SubAgentHandler,
  type AgentExecutionContext,
  type HandlerResult,
} from '../../base-agent.js';
import dotenv from 'dotenv';

dotenv.config();

export const DATA_AGENT_ROLE = 'data-agent';
export const DATA_AGENT_PORT = parseInt(process.env.DATA_AGENT_PORT || '50051', 10);

/**
 * Core Data Agent Business Logic Handler
 */
export const dataAgentHandler: SubAgentHandler = async (
  request,
  context: AgentExecutionContext
): Promise<HandlerResult> => {
  context.emitTrace(`[DataAgent] Processing query: "${request.user_prompt || 'Investigate slow-moving units'}"`);

  // 1. Parse parameters & filters
  const domThreshold = 90;
  const targetProject = 'PRJ-VH-OCP'; // Vinhomes Ocean Park

  context.emitTrace(`[DataAgent] Connecting to Real Estate Mock Warehouse...`);
  const warehouse = getWarehouse();

  // 2. Query slow-moving units with DOM >= 90
  context.emitTrace(`[DataAgent] Querying snapshot fact table for units with DOM >= ${domThreshold} at ${targetProject}...`);
  const rawUnits: UnitWithSnapshot[] = warehouse.getSlowMovingUnits(domThreshold, targetProject);

  // 3. Query project-level summary metrics
  context.emitTrace(`[DataAgent] Querying project summary metrics for ${targetProject}...`);
  let projectSummary: any = null;
  try {
    projectSummary = warehouse.getProjectSummary(targetProject);
  } catch (err: any) {
    context.emitTrace(`[DataAgent] Project summary warning: ${err.message}. Using default project stats.`);
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

  const absorptionRate = projectSummary.absorption_rate ?? 50.0;

  context.emitTrace(
    `[DataAgent] Identified ${totalSlowMoving} slow-moving units (Avg DOM: ${avgDom} days). Project absorption rate: ${absorptionRate}%.`
  );

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

  // 6. Bind explicit evidence references (primary unit IDs)
  const evidenceRefs = rawUnits.map((u) => u.unit_id);
  context.emitTrace(`[DataAgent] Bound evidence citations: [${evidenceRefs.join(', ')}]`);

  // 7. Assemble DatasetPayload
  const payload: DatasetPayload = {
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

  context.emitTrace(`[DataAgent] Formatted DatasetPayload with ${units.length} unit records. Ready for canonical hashing.`);

  return {
    artifact_type: 'dataset',
    payload,
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
import path from 'node:path';

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
