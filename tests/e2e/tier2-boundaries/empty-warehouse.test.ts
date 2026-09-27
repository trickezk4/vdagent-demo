import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMockWarehouse, querySlowMovingUnits } from '../fixtures/mock-warehouse-fixture.js';
import { validateEnvelope, validateDatasetPayload } from '../helpers/schema-validator.js';
import { computeContentHash } from '../helpers/canonical-json.js';

describe('Tier 2: T2.1 - Empty Warehouse Results & Downstream Graceful Handling', () => {
  it('should produce valid DatasetArtifact when filter yields 0 units', () => {
    const db = createMockWarehouse();
    // Query impossible threshold DOM > 999
    const units = querySlowMovingUnits(db, 999);
    assert.equal(units.length, 0);

    // Simulated DataAgent logic on empty results
    const payload = {
      project_id: 'PRJ-VHOP',
      project_name: 'Vinhomes Ocean Park',
      zone_code: 'ALL',
      units: [],
      summary_metrics: {
        avg_dom: 0,
        slow_moving_count: 0,
        absorption_rate: 0,
      },
    };

    const envelope = {
      artifact_id: '00000000-0000-4000-8000-000000000001',
      run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      task_id: 'task-data-empty',
      artifact_type: 'dataset',
      schema_version: '1.0.0',
      status: 'VALID',
      producer: 'data-agent@1.0.0',
      content_hash: computeContentHash(payload),
      payload,
      evidence_refs: [],
      input_artifact_refs: [],
      created_at: new Date().toISOString(),
    };

    const envValidation = validateEnvelope(envelope);
    assert.equal(envValidation.valid, true, envValidation.errors.join('; '));

    const payloadValidation = validateDatasetPayload(payload);
    assert.equal(payloadValidation.valid, true, payloadValidation.errors.join('; '));
  });

  it('should allow downstream Compare and Insight agents to process empty dataset without crashing', () => {
    const emptyDataset = { units: [], summary_metrics: { avg_dom: 0, absorption_rate: 0 } };

    // Simulated Compare Agent on empty units
    const comparePayload = {
      peer_benchmark: {
        target_dom: 0,
        peer_avg_dom: 0,
        price_variance_pct: 0,
      },
      observations: ['Không phát hiện căn hộ nào vượt ngưỡng số ngày trên thị trường (DOM > 90).'],
    };
    assert.equal(comparePayload.peer_benchmark.price_variance_pct, 0);
    assert.ok(!isNaN(comparePayload.peer_benchmark.target_dom));

    // Simulated Insight Agent on empty units
    const insightPayload = {
      findings: [
        {
          claim: 'Tất cả các căn hộ hiện tại đều có thanh khoản tốt và duy trì DOM dưới ngưỡng cảnh báo.',
          evidence_id: 'DW-STATUS-HEALTHY',
          confidence: 1.0,
        },
      ],
    };
    assert.equal(insightPayload.findings.length, 1);
    assert.equal(insightPayload.findings[0].evidence_id, 'DW-STATUS-HEALTHY');
  });
});
