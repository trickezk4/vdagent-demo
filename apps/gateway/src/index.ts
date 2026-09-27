/**
 * apps/gateway/src/index.ts
 * API Gateway & Core Orchestrator entry point (Hono HTTP & SSE Server)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { registry, type RegisterAgentPayload } from './registry.js';
import { grpcHub } from './grpc-hub.js';
import { dagOrchestrator } from './dag-orchestrator.js';
import { sessionStore } from './session-store.js';
import { getWarehouse } from '@vda/mock-warehouse';

dotenv.config();

export const app = new Hono();

// Enable CORS for all routes (supporting frontend on Port 5173)
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// 1. Health check endpoint
app.get('/health', async (c) => {
  const agents = registry.getAll();
  const healthResults: Record<string, any> = {};

  for (const agent of agents) {
    try {
      const h = await grpcHub.checkHealth(agent.agent_id);
      healthResults[agent.agent_id] = h;
      registry.updateStatus(agent.agent_id, h.is_healthy ? 'HEALTHY' : 'UNAVAILABLE');
    } catch {
      healthResults[agent.agent_id] = { is_healthy: false, status_message: 'Unreachable' };
      registry.updateStatus(agent.agent_id, 'UNAVAILABLE');
    }
  }

  return c.json({
    status: 'OK',
    gateway: 'vda-gateway@1.0.0',
    timestamp: new Date().toISOString(),
    services: healthResults,
  });
});

// 2. List all registered agents
app.get('/api/v1/agents', (c) => {
  return c.json({
    success: true,
    total: registry.getAll().length,
    agents: registry.getAll(),
  });
});

// 3. Hot-plug registration endpoint (Zero-Downtime Autonomous Agent Registration)
app.post('/api/v1/agents/register', async (c) => {
  try {
    const body = (await c.req.json()) as RegisterAgentPayload;

    if (!body.agent_id || !body.grpc_target) {
      return c.json(
        {
          success: false,
          error: 'Missing required fields: agent_id, grpc_target',
        },
        400
      );
    }

    console.log(`[Gateway] Hot-plugging agent received: ${body.agent_id} (${body.grpc_target})`);

    // Register into GrpcHub
    grpcHub.registerDynamicClient(body.agent_id, body.grpc_target);

    // Register into AgentRegistry
    const registered = registry.register(body, true);

    return c.json({
      success: true,
      message: `Agent ${body.agent_id} hot-plugged successfully without downtime`,
      registered_agent: registered,
    });
  } catch (err: any) {
    console.error('[Gateway] Failed to register dynamic agent:', err);
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 4. SSE Stream endpoint for DAG & Dynamic Chat queries
app.get('/api/v1/chat/stream', async (c) => {
  const prompt = c.req.query('prompt') || 'Tại sao phân khu Sapphire có căn hộ bán chậm hơn 90 ngày?';
  const agentId = c.req.query('agent_id') || 'orchestrator';
  const sessionId = c.req.query('session_id') || 'default-session';

  return streamSSE(c, async (stream) => {
    const sseWriter = {
      writeEvent: async (event: string, data: any) => {
        await stream.writeSSE({
          event,
          data: typeof data === 'string' ? data : JSON.stringify(data),
        });
      },
    };

    try {
      await dagOrchestrator.handleChatRequest(prompt, agentId, sessionId, sseWriter);
    } catch (err: any) {
      await sseWriter.writeEvent('error', { message: err.message });
    }
  });
});

// 5. Session messages persistence endpoint
app.get('/api/v1/sessions/:sessionId/messages', (c) => {
  const sessionId = c.req.param('sessionId');
  const agentId = c.req.query('agent_id');
  const messages = sessionStore.getMessages(sessionId, agentId);

  return c.json({
    success: true,
    session_id: sessionId,
    total: messages.length,
    messages,
  });
});

// 6. Session artifacts persistence endpoint
app.get('/api/v1/sessions/:sessionId/artifacts', (c) => {
  const sessionId = c.req.param('sessionId');
  const artifacts = sessionStore.getArtifacts(sessionId);

  return c.json({
    success: true,
    session_id: sessionId,
    artifacts,
  });
});

// 7. Warehouse units list endpoint
app.get('/api/v1/warehouse/units', (c) => {
  try {
    const warehouse = getWarehouse();
    const units = warehouse.getAllUnits();
    return c.json({
      success: true,
      total: units.length,
      units,
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 8. Warehouse unit detail / evidence inspection endpoint
app.get('/api/v1/warehouse/units/:unitId', (c) => {
  const unitId = c.req.param('unitId');
  try {
    const warehouse = getWarehouse();
    const unit = warehouse.getUnitDetails(unitId);

    if (!unit) {
      return c.json({ success: false, error: `Unit ${unitId} not found in Mock Warehouse` }, 404);
    }

    const isSlowMoving = (unit.dom ?? 0) >= 90;
    const rootCauses = [];

    if (
      unit.view_direction?.toLowerCase().includes('west') ||
      unit.view_direction?.toLowerCase().includes('tây')
    ) {
      rootCauses.push({
        code: 'WEST_ORIENTATION',
        title: 'Hướng Tây hấp thụ bức xạ nhiệt cao',
        description:
          'Căn hộ quay hướng Tây chịu nắng gắt buổi chiều (13h-17h). Khách mua thực tế đánh giá cao về bất lợi nhiệt độ, tỷ lệ từ chối đạt 65%.',
        severity: 'HIGH',
      });
    }

    if (unit.price_per_sqm_vnd && unit.price_per_sqm_vnd > 50000000) {
      rootCauses.push({
        code: 'PRICE_PREMIUM',
        title: 'Đơn giá cao hơn mức chuẩn giỏ hàng (+9.4%)',
        description: `Đơn giá ${(unit.price_per_sqm_vnd / 1e6).toFixed(1)} tr/m² cao hơn mức trung bình phân khu The Sapphire (~47.6 tr/m²).`,
        severity: 'MEDIUM',
      });
    }

    rootCauses.push({
      code: 'POLICY_EXPIRED',
      title: 'Hết hạn gói hỗ trợ lãi suất ưu đãi 0%',
      description:
        'Gói hỗ trợ tài chính ân hạn gốc và lãi suất 0% từ chủ đầu tư đã hết hạn 3 tháng trước. Khách hàng phải chịu lãi suất thị trường ~8.5-9.5%/năm.',
      severity: 'HIGH',
    });

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ unit_id: unit.unit_id, dom: unit.dom, asking_price: unit.current_asking_price_vnd }))
      .digest('hex');

    return c.json({
      success: true,
      unit: {
        ...unit,
        is_slow_moving: isSlowMoving,
        root_causes: rootCauses,
        verified_hash: hash,
        audit_timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// 9. Default root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'VDaAgent API Gateway & Core Orchestrator',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      agents: 'GET /api/v1/agents',
      register: 'POST /api/v1/agents/register',
      chat_stream: 'GET /api/v1/chat/stream?prompt=...&agent_id=...&session_id=...',
      session_messages: 'GET /api/v1/sessions/:sessionId/messages',
      session_artifacts: 'GET /api/v1/sessions/:sessionId/artifacts',
      warehouse_units: 'GET /api/v1/warehouse/units',
      warehouse_unit_detail: 'GET /api/v1/warehouse/units/:unitId',
    },
  });
});

// Server launcher
const PORT = parseInt(process.env.PORT || '3000', 10);

if (process.env.NODE_ENV !== 'test') {
  serve(
    {
      fetch: app.fetch,
      port: PORT,
    },
    (info) => {
      console.log(`🚀 [Gateway] Hono HTTP/SSE Gateway is listening on http://localhost:${info.port}`);
    }
  );
}

export default app;
