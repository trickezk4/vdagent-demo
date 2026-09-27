import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

interface AgentRegistrationPayload {
  agent_id: string;
  grpc_target: string;
  domain: string;
  description: string;
  supported_intents: string[];
}

interface RegistrationResponse {
  status: number;
  body: {
    success: boolean;
    error?: string;
    registered_agent?: AgentRegistrationPayload;
  };
}

/**
 * Emulates the Gateway's POST /api/v1/agents/register endpoint validation logic.
 */
function handleRegisterRequest(
  payload: Partial<AgentRegistrationPayload>,
  currentRegistry: Map<string, AgentRegistrationPayload>
): RegistrationResponse {
  // Validate agent_id
  if (!payload.agent_id || typeof payload.agent_id !== 'string' || payload.agent_id.trim().length === 0) {
    return {
      status: 400,
      body: { success: false, error: 'agent_id is required and must be a non-empty string' },
    };
  }

  // Validate grpc_target
  if (!payload.grpc_target || typeof payload.grpc_target !== 'string') {
    return {
      status: 400,
      body: { success: false, error: 'grpc_target is required' },
    };
  }

  // Must match host:port format
  const targetRegex = /^([a-zA-Z0-9.-]+):(\d{1,5})$/;
  const match = payload.grpc_target.match(targetRegex);
  if (!match) {
    return {
      status: 400,
      body: { success: false, error: 'grpc_target must follow host:port format (e.g. localhost:50056)' },
    };
  }

  const port = parseInt(match[2], 10);
  if (port <= 0 || port > 65535) {
    return {
      status: 400,
      body: { success: false, error: 'Port number in grpc_target must be between 1 and 65535' },
    };
  }

  // Validate supported_intents
  if (!Array.isArray(payload.supported_intents) || payload.supported_intents.length === 0) {
    return {
      status: 400,
      body: { success: false, error: 'supported_intents must be a non-empty array of strings' },
    };
  }

  // Valid registration - update registry idempotently
  const fullRecord: AgentRegistrationPayload = {
    agent_id: payload.agent_id,
    grpc_target: payload.grpc_target,
    domain: payload.domain || 'general',
    description: payload.description || '',
    supported_intents: payload.supported_intents,
  };

  currentRegistry.set(payload.agent_id, fullRecord);

  return {
    status: 200,
    body: {
      success: true,
      registered_agent: fullRecord,
    },
  };
}

describe('Tier 2: FEAT-G05 - Malformed Hot-Plug Registration & Idempotency', () => {
  it('should reject payload with missing agent_id with HTTP 400', () => {
    const registry = new Map<string, AgentRegistrationPayload>();
    const res = handleRegisterRequest(
      {
        grpc_target: 'localhost:50056',
        supported_intents: ['calculate_mortgage'],
      },
      registry
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.error || '', /agent_id/);
    assert.equal(registry.size, 0);
  });

  it('should reject payload with invalid grpc_target format with HTTP 400', () => {
    const registry = new Map<string, AgentRegistrationPayload>();

    // Missing port
    const res1 = handleRegisterRequest(
      {
        agent_id: 'python-finance-agent',
        grpc_target: 'localhost',
        supported_intents: ['calculate_mortgage'],
      },
      registry
    );
    assert.equal(res1.status, 400);
    assert.match(res1.body.error || '', /host:port/);

    // Out of range port
    const res2 = handleRegisterRequest(
      {
        agent_id: 'python-finance-agent',
        grpc_target: 'localhost:99999',
        supported_intents: ['calculate_mortgage'],
      },
      registry
    );
    assert.equal(res2.status, 400);
    assert.match(res2.body.error || '', /between 1 and 65535/);
  });

  it('should reject payload with empty supported_intents with HTTP 400', () => {
    const registry = new Map<string, AgentRegistrationPayload>();
    const res = handleRegisterRequest(
      {
        agent_id: 'python-finance-agent',
        grpc_target: 'localhost:50056',
        supported_intents: [],
      },
      registry
    );

    assert.equal(res.status, 400);
    assert.match(res.body.error || '', /supported_intents/);
  });

  it('should accept valid registration with HTTP 200 and handle duplicate registration idempotently', () => {
    const registry = new Map<string, AgentRegistrationPayload>();
    const payload: AgentRegistrationPayload = {
      agent_id: 'python-finance-agent',
      grpc_target: 'localhost:50056',
      domain: 'banking_and_finance',
      description: 'Chuyên gia tài chính',
      supported_intents: ['calculate_mortgage', 'compare_loan_packages'],
    };

    // First registration
    const res1 = handleRegisterRequest(payload, registry);
    assert.equal(res1.status, 200);
    assert.equal(res1.body.success, true);
    assert.equal(registry.size, 1);

    // Duplicate registration (idempotent update)
    const updatedPayload = { ...payload, description: 'Cập nhật mô tả mới' };
    const res2 = handleRegisterRequest(updatedPayload, registry);
    assert.equal(res2.status, 200);
    assert.equal(res2.body.success, true);
    assert.equal(registry.size, 1, 'Registry should not duplicate agent entry');
    assert.equal(registry.get('python-finance-agent')?.description, 'Cập nhật mô tả mới');
  });
});
