import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMockWarehouse, querySlowMovingUnits } from '../fixtures/mock-warehouse-fixture.js';
import { computeContentHash } from '../helpers/canonical-json.js';

describe('Tier 4: T4.1 - Burst Query Execution & Resource Stability', () => {
  it('should execute 25 consecutive pipeline queries without resource leak or error', () => {
    const db = createMockWarehouse();
    const queryCount = 25;
    const runResults: string[] = [];

    const memBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < queryCount; i++) {
      const units = querySlowMovingUnits(db, 90);
      assert.equal(units.length, 3);

      const payload = {
        query_index: i,
        units_found: units.length,
        avg_dom: 115,
      };

      const hash = computeContentHash(payload);
      assert.equal(hash.length, 64);
      runResults.push(hash);
    }

    assert.equal(runResults.length, queryCount);

    const memAfter = process.memoryUsage().heapUsed;
    const memDeltaMb = (memAfter - memBefore) / (1024 * 1024);

    // Verify heap usage did not grow out of bounds (< 50MB delta)
    assert.ok(
      memDeltaMb < 50,
      `Heap memory growth should be bounded, observed delta: ${memDeltaMb.toFixed(2)} MB`
    );
  });
});
