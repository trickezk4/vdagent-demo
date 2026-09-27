import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDatasetPayload,
  validateComparisonPayload,
  validateInsightPayload,
  validateChartSpecPayload,
  validateReportPayload,
  validateFinancePlanPayload,
} from '../helpers/schema-validator.js';
import {
  createValidDatasetEnvelope,
  createValidComparisonEnvelope,
  createValidInsightEnvelope,
  createValidChartSpecEnvelope,
  createValidReportEnvelope,
  createValidFinancePlanEnvelope,
} from '../fixtures/sample-envelopes.js';

describe('Tier 1: FEAT-C03 - Domain Artifact Schemas & Payloads', () => {
  it('should validate DatasetArtifact payload correctly', () => {
    const env = createValidDatasetEnvelope();
    const res = validateDatasetPayload(env.payload);
    assert.equal(res.valid, true, res.errors.join('; '));

    // Negative test: missing summary_metrics
    const invalid = { units: [] };
    const negRes = validateDatasetPayload(invalid);
    assert.equal(negRes.valid, false);
    assert.match(negRes.errors.join(' '), /summary_metrics/);
  });

  it('should validate ComparisonArtifact payload correctly', () => {
    const env = createValidComparisonEnvelope();
    const res = validateComparisonPayload(env.payload);
    assert.equal(res.valid, true, res.errors.join('; '));

    // Negative test: missing peer_benchmark
    const invalid = { observations: [] };
    const negRes = validateComparisonPayload(invalid);
    assert.equal(negRes.valid, false);
    assert.match(negRes.errors.join(' '), /peer_benchmark/);
  });

  it('should validate InsightArtifact payload correctly and enforce evidence_id', () => {
    const env = createValidInsightEnvelope();
    const res = validateInsightPayload(env.payload);
    assert.equal(res.valid, true, res.errors.join('; '));

    // Negative test: missing evidence_id in a finding
    const invalid = {
      findings: [
        {
          claim: 'Căn hộ bán chậm do giá cao',
          evidence_id: '', // Empty evidence link
          confidence: 0.9,
        },
      ],
    };
    const negRes = validateInsightPayload(invalid);
    assert.equal(negRes.valid, false);
    assert.match(negRes.errors.join(' '), /evidence_id must be a non-empty string/);
  });

  it('should validate ChartSpecArtifact payload correctly for bar and scatter types', () => {
    const barEnv = createValidChartSpecEnvelope();
    const resBar = validateChartSpecPayload(barEnv.payload);
    assert.equal(resBar.valid, true, resBar.errors.join('; '));

    const scatterPayload = {
      chart_type: 'scatter',
      chart_data: [{ area: 64, price: 3600000000 }],
      x_axis: 'area',
      y_axis: 'price',
    };
    const resScatter = validateChartSpecPayload(scatterPayload);
    assert.equal(resScatter.valid, true, resScatter.errors.join('; '));

    // Negative test: unsupported chart type
    const invalid = { chart_type: 'pie', chart_data: [], x_axis: 'x', y_axis: 'y' };
    const negRes = validateChartSpecPayload(invalid);
    assert.equal(negRes.valid, false);
  });

  it('should validate ReportArtifact markdown payload containing all 6 PRD sections', () => {
    const env = createValidReportEnvelope();
    const res = validateReportPayload(env.payload);
    assert.equal(res.valid, true, res.errors.join('; '));

    // Negative test: missing section
    const incompleteMarkdown = `
# Incomplete Report
## 1. Executive Summary
Only summary here.
`;
    const negRes = validateReportPayload({ markdown: incompleteMarkdown });
    assert.equal(negRes.valid, false);
    assert.ok(negRes.errors.length >= 4, 'Should flag multiple missing PRD sections');
  });

  it('should validate FinancePlanArtifact payload correctly', () => {
    const env = createValidFinancePlanEnvelope();
    const res = validateFinancePlanPayload(env.payload);
    assert.equal(res.valid, true, res.errors.join('; '));

    // Negative test: invalid loan amount
    const invalid = { ...env.payload, loan_amount: -500 };
    const negRes = validateFinancePlanPayload(invalid);
    assert.equal(negRes.valid, false);
  });
});
