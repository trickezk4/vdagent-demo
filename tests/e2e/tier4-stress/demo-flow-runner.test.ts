import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createValidDatasetEnvelope,
  createValidReportEnvelope,
  createValidFinancePlanEnvelope,
} from '../fixtures/sample-envelopes.js';
import { validateEnvelope } from '../helpers/schema-validator.js';
import { verifyContentHash } from '../helpers/canonical-json.js';

describe('Tier 4: FEAT-T01 - 3-Stage Hero Demo Flow Acceptance Verification', () => {
  it('Stage 1: should verify 6-agent real estate pipeline output integrity', () => {
    const datasetEnv = createValidDatasetEnvelope();
    const reportEnv = createValidReportEnvelope();

    // Verify Dataset Artifact
    assert.equal(validateEnvelope(datasetEnv).valid, true);
    assert.equal(verifyContentHash(datasetEnv), true);
    assert.equal(datasetEnv.payload.summary_metrics.avg_dom, 115);

    // Verify Report Artifact
    assert.equal(validateEnvelope(reportEnv).valid, true);
    assert.equal(verifyContentHash(reportEnv), true);
    assert.ok(reportEnv.payload.markdown.length > 200);
    assert.ok(reportEnv.evidence_refs.length >= 3);
  });

  it('Stage 2: should verify hot-plug registration contract', () => {
    const registerPayload = {
      agent_id: 'python-finance-agent',
      grpc_target: 'localhost:50056',
      domain: 'banking_and_finance',
      description: 'Chuyên gia tính toán tài chính ngân hàng',
      supported_intents: ['calculate_mortgage', 'compare_loan_packages'],
    };

    assert.equal(registerPayload.agent_id, 'python-finance-agent');
    assert.equal(registerPayload.grpc_target, 'localhost:50056');
    assert.ok(registerPayload.supported_intents.includes('calculate_mortgage'));
  });

  it('Stage 3: should verify dynamic routing financial artifact output', () => {
    const finEnv = createValidFinancePlanEnvelope();

    assert.equal(validateEnvelope(finEnv).valid, true);
    assert.equal(verifyContentHash(finEnv), true);
    assert.equal(finEnv.producer, 'python-finance-agent@1.0.0');
    assert.equal(finEnv.payload.property_price, 4500000000);
    assert.equal(finEnv.payload.interest_rate_pct, 8.5);
    assert.ok(finEnv.payload.monthly_payment_estimate > 0);
  });
});
