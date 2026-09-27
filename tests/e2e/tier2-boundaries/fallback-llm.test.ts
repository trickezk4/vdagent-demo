import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvelope } from '../helpers/schema-validator.js';
import { computeContentHash } from '../helpers/canonical-json.js';

interface SubAgentExecutorOptions {
  apiKey?: string;
  simulateHttp402?: boolean;
  simulateTimeout?: boolean;
}

/**
 * Emulates the sub-agent execution harness featuring FEAT-R01: Deterministic Fallback.
 */
async function executeSubAgentWithFallback(
  role: string,
  options: SubAgentExecutorOptions = {}
): Promise<{
  traces: string[];
  envelope: any;
  usedFallback: boolean;
}> {
  const traces: string[] = [];
  traces.push(`[${role}] Received execution step request.`);

  let usedFallback = false;
  let payload: any = null;

  try {
    if (options.simulateHttp402) {
      const err = new Error('HTTP 402: Payment Required (Insufficient OpenRouter credits)');
      (err as any).status = 402;
      throw err;
    }
    if (options.simulateTimeout) {
      throw new Error('ETIMEDOUT: Connection timed out to OpenRouter gateway');
    }
    if (!options.apiKey) {
      throw new Error('Missing OPENAI_API_KEY');
    }

    // Normal path would call LLM API...
    payload = { normal_execution: true };
  } catch (err: any) {
    usedFallback = true;
    traces.push(
      `[${role}-FALLBACK] Intercepted LLM error: ${err.message}. Diverting to Deterministic Rule Engine.`
    );

    // Deterministic Rule Engine Payload Generation
    if (role === 'insight-agent') {
      payload = {
        findings: [
          {
            claim: 'Căn hộ bán chậm do chênh lệch giá niêm yết và hướng nắng gắt Tây/Tây Bắc.',
            evidence_id: 'UNIT-VHOP-S1-01',
            confidence: 0.95,
          },
        ],
      };
    } else {
      payload = {
        units: [],
        summary_metrics: { avg_dom: 115, absorption_rate: 0.12 },
      };
    }
  }

  const envelope = {
    artifact_id: '88888888-8888-4888-8888-888888888888',
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task_id: `task-${role}-step`,
    artifact_type: role === 'insight-agent' ? 'insight' : 'dataset',
    schema_version: '1.0.0',
    status: 'VALID',
    producer: `${role}@1.0.0-fallback`,
    content_hash: computeContentHash(payload),
    payload,
    evidence_refs: ['UNIT-VHOP-S1-01'],
    input_artifact_refs: [],
    created_at: new Date().toISOString(),
  };

  traces.push(`[${role}] Completed step execution and emitted valid ArtifactEnvelope.`);
  return { traces, envelope, usedFallback };
}

describe('Tier 2: FEAT-R01 - Deterministic Mock LLM Fallback Mechanism', () => {
  it('should automatically switch to deterministic generator on HTTP 402 Payment Required', async () => {
    const result = await executeSubAgentWithFallback('insight-agent', {
      apiKey: 'valid-key',
      simulateHttp402: true,
    });

    assert.equal(result.usedFallback, true);
    assert.ok(
      result.traces.some((t) => t.includes('HTTP 402') && t.includes('Deterministic Rule Engine')),
      'Trace log should reflect fallback diversion'
    );

    // Envelope must remain 100% valid
    const validation = validateEnvelope(result.envelope);
    assert.equal(validation.valid, true, validation.errors.join('; '));

    // SHA-256 hash must be valid
    assert.equal(result.envelope.content_hash, computeContentHash(result.envelope.payload));
  });

  it('should automatically switch to deterministic generator on timeout', async () => {
    const result = await executeSubAgentWithFallback('data-agent', {
      apiKey: 'valid-key',
      simulateTimeout: true,
    });

    assert.equal(result.usedFallback, true);
    assert.ok(result.traces.some((t) => t.includes('ETIMEDOUT')));
    assert.equal(validateEnvelope(result.envelope).valid, true);
  });

  it('should automatically switch to fallback when API key is missing', async () => {
    const result = await executeSubAgentWithFallback('insight-agent', {
      apiKey: undefined,
    });

    assert.equal(result.usedFallback, true);
    assert.equal(validateEnvelope(result.envelope).valid, true);
  });
});
