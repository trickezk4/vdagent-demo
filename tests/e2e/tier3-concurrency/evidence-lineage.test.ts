import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createValidDatasetEnvelope,
  createValidInsightEnvelope,
  createValidReportEnvelope,
} from '../fixtures/sample-envelopes.js';

describe('Tier 3: AC-I02 - Evidence Lineage Traceability & Badge Integrity', () => {
  it('should maintain unbroken evidence lineage from dataset to insight to report markdown badge', () => {
    const datasetEnv = createValidDatasetEnvelope();
    const insightEnv = createValidInsightEnvelope();
    const reportEnv = createValidReportEnvelope();

    // 1. Data Agent emits units with unit IDs
    const warehouseUnitIds = datasetEnv.payload.units.map((u: any) => u.unit_id);
    assert.ok(warehouseUnitIds.length > 0);
    assert.deepEqual(datasetEnv.evidence_refs, warehouseUnitIds);

    // 2. Insight Agent findings must reference valid unit IDs from Dataset
    for (const finding of insightEnv.payload.findings) {
      assert.ok(
        warehouseUnitIds.includes(finding.evidence_id),
        `Finding evidence_id "${finding.evidence_id}" must exist in upstream dataset evidence_refs`
      );
    }

    // 3. Report Agent markdown must contain clickable [Evidence-REF: <ID>] badge for cited evidence
    const markdown = reportEnv.payload.markdown;
    const badgePattern = /\[Evidence-REF:\s*([A-Za-z0-9_-]+)\]/g;
    const matchedBadges: string[] = [];
    let match;

    while ((match = badgePattern.exec(markdown)) !== null) {
      matchedBadges.push(match[1]);
    }

    assert.ok(
      matchedBadges.length > 0,
      'Report markdown must contain at least one [Evidence-REF: ...] badge'
    );

    for (const badgeId of matchedBadges) {
      assert.ok(
        warehouseUnitIds.includes(badgeId),
        `Badge ID "${badgeId}" in report must correspond to an authentic unit ID in the warehouse dataset`
      );
    }

    // 4. Report envelope evidence_refs must contain all badge IDs
    for (const badgeId of matchedBadges) {
      assert.ok(
        reportEnv.evidence_refs.includes(badgeId),
        `Report envelope evidence_refs must include badge ID "${badgeId}"`
      );
    }
  });
});
