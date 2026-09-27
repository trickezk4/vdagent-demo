import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalStringify,
  computeContentHash,
  verifyContentHash,
} from '../helpers/canonical-json.js';
import {
  createValidDatasetEnvelope,
  createValidInsightEnvelope,
  createValidReportEnvelope,
} from '../fixtures/sample-envelopes.js';

describe('Tier 1: FEAT-C02 & FEAT-R01 - SHA-256 Immutability and Canonical Hash Verification', () => {
  it('should generate identical canonical strings regardless of object key insertion order', () => {
    const objA = {
      zebra: 100,
      apple: 'red',
      banana: { yellow: true, sweet: true },
      mango: [3, 2, 1],
    };

    const objB = {
      mango: [3, 2, 1],
      apple: 'red',
      banana: { sweet: true, yellow: true },
      zebra: 100,
    };

    const strA = canonicalStringify(objA);
    const strB = canonicalStringify(objB);

    assert.equal(strA, strB);
    assert.equal(computeContentHash(objA), computeContentHash(objB));
  });

  it('should verify content_hash correctly on valid envelopes', () => {
    const datasetEnv = createValidDatasetEnvelope();
    const insightEnv = createValidInsightEnvelope();
    const reportEnv = createValidReportEnvelope();

    assert.equal(verifyContentHash(datasetEnv), true);
    assert.equal(verifyContentHash(insightEnv), true);
    assert.equal(verifyContentHash(reportEnv), true);
  });

  it('should detect and reject any payload tampering', () => {
    const env = createValidDatasetEnvelope();

    // Tamper single value in payload
    const tamperedPayload = {
      ...env.payload,
      summary_metrics: {
        ...env.payload.summary_metrics,
        avg_dom: 999, // tampered from 115
      },
    };

    const tamperedEnv = {
      ...env,
      payload: tamperedPayload,
    };

    assert.equal(
      verifyContentHash(tamperedEnv),
      false,
      'verifyContentHash should return false when payload data is tampered'
    );
  });

  it('should produce 64-character lowercase hex string for SHA-256', () => {
    const hash = computeContentHash({ test: 'data', timestamp: 123456 });
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash.length, 64);
  });
});
