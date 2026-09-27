import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEnvelope } from '../helpers/schema-validator.js';
import {
  createValidDatasetEnvelope,
  createValidComparisonEnvelope,
  createValidInsightEnvelope,
  createValidChartSpecEnvelope,
  createValidReportEnvelope,
  createValidFinancePlanEnvelope,
} from '../fixtures/sample-envelopes.js';

describe('Tier 1: FEAT-C02 - ArtifactEnvelope Schema Validation', () => {
  it('should validate all standard envelope types cleanly', () => {
    const validEnvelopes = [
      createValidDatasetEnvelope(),
      createValidComparisonEnvelope(),
      createValidInsightEnvelope(),
      createValidChartSpecEnvelope(),
      createValidReportEnvelope(),
      createValidFinancePlanEnvelope(),
    ];

    for (const env of validEnvelopes) {
      const res = validateEnvelope(env);
      assert.equal(
        res.valid,
        true,
        `Expected envelope of type ${env.artifact_type} to be valid, but got errors: ${res.errors.join('; ')}`
      );
      assert.equal(res.errors.length, 0);
    }
  });

  it('should reject non-object or null envelopes', () => {
    assert.equal(validateEnvelope(null).valid, false);
    assert.equal(validateEnvelope(undefined).valid, false);
    assert.equal(validateEnvelope('string').valid, false);
    assert.equal(validateEnvelope([1, 2, 3]).valid, false);
  });

  it('should reject invalid UUIDs for artifact_id and run_id', () => {
    const env = createValidDatasetEnvelope();

    // Invalid artifact_id
    const badArtifactId = { ...env, artifact_id: 'not-a-uuid' };
    const res1 = validateEnvelope(badArtifactId);
    assert.equal(res1.valid, false);
    assert.match(res1.errors.join(' '), /artifact_id must be a valid UUID/);

    // Invalid run_id
    const badRunId = { ...env, run_id: '12345' };
    const res2 = validateEnvelope(badRunId);
    assert.equal(res2.valid, false);
    assert.match(res2.errors.join(' '), /run_id must be a valid UUID/);
  });

  it('should reject empty or whitespace-only task_id', () => {
    const env = createValidDatasetEnvelope();
    const badTask = { ...env, task_id: '   ' };
    const res = validateEnvelope(badTask);
    assert.equal(res.valid, false);
    assert.match(res.errors.join(' '), /task_id must be a non-empty string/);
  });

  it('should reject invalid artifact_type', () => {
    const env = createValidDatasetEnvelope();
    const badType = { ...env, artifact_type: 'unknown_type' as any };
    const res = validateEnvelope(badType);
    assert.equal(res.valid, false);
    assert.match(res.errors.join(' '), /artifact_type must be one of/);
  });

  it('should reject invalid status enums', () => {
    const env = createValidDatasetEnvelope();
    const badStatus = { ...env, status: 'UNKNOWN_STATUS' as any };
    const res = validateEnvelope(badStatus);
    assert.equal(res.valid, false);
    assert.match(res.errors.join(' '), /status must be one of/);
  });

  it('should reject malformed content_hash', () => {
    const env = createValidDatasetEnvelope();

    // Short hash
    const shortHash = { ...env, content_hash: 'abcdef' };
    assert.equal(validateEnvelope(shortHash).valid, false);

    // Non-hex hash
    const nonHexHash = { ...env, content_hash: 'z'.repeat(64) };
    assert.equal(validateEnvelope(nonHexHash).valid, false);
  });

  it('should reject invalid ISO-8601 created_at format', () => {
    const env = createValidDatasetEnvelope();
    const badDate = { ...env, created_at: '2026-09-26 22:50:00' }; // missing 'T' and timezone
    const res = validateEnvelope(badDate);
    assert.equal(res.valid, false);
    assert.match(res.errors.join(' '), /created_at must be an ISO-8601/);
  });
});
