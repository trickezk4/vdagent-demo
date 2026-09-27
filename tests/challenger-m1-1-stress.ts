import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import crypto from 'node:crypto';
import * as protoLoader from '@grpc/proto-loader';
import * as grpc from '@grpc/grpc-js';
import {
  ArtifactStatusSchema,
  ArtifactTypeSchema,
  ArtifactEnvelopeSchema,
  canonicalStringify,
  computeContentHash,
  verifyContentHash,
  createArtifactEnvelope,
  validateEnvelope,
  safeValidateEnvelope,
  UnitRecordSchema,
  DatasetPayloadSchema,
  ComparisonPayloadSchema,
  FindingRecordSchema,
  InsightPayloadSchema,
  ChartSpecPayloadSchema,
  ReportSectionSchema,
  MANDATORY_REPORT_SECTIONS,
  ReportPayloadSchema,
  FinancePlanPayloadSchema,
  validateReportCompleteness,
  DatasetEnvelopeSchema,
  ComparisonEnvelopeSchema,
  InsightEnvelopeSchema,
  ChartSpecEnvelopeSchema,
  ReportEnvelopeSchema,
  FinancePlanEnvelopeSchema,
  TypedArtifactEnvelopeSchema,
} from '../packages/contracts/src/index.js';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function recordPass(name: string, details?: any) {
  console.log(`  ✅ PASS: ${name}`);
  results.push({ name, passed: true, details });
}

function recordFail(name: string, error: any) {
  console.error(`  ❌ FAIL: ${name} ->`, error?.message || error);
  results.push({ name, passed: false, error: error?.message || String(error) });
}

console.log('===============================================================');
console.log('🔬 CHALLENGER 1: EMPIRICAL STRESS TEST SUITE FOR CONTRACTS & PROTO');
console.log('===============================================================\n');

// Standard valid sample envelope generator for baseline mutations
function makeBaseEnvelope(overrides: Record<string, unknown> = {}) {
  const payload = {
    project_id: 'PRJ-VHOP',
    project_name: 'Vinhomes Ocean Park',
    zone_code: 'SAPPHIRE',
    units: [
      {
        unit_id: 'UNIT-VHOP-S1-01',
        unit_code: 'S1.02-12A08',
        dom: 115,
        price: 3600000000,
        area: 64.5,
        orientation: 'North-West',
      },
    ],
    summary_metrics: {
      avg_dom: 115,
      slow_moving_count: 1,
      absorption_rate: 0.12,
    },
  };

  const base = {
    artifact_id: '11111111-1111-4111-8111-111111111111',
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task_id: 'task-data-step-1',
    artifact_type: 'dataset',
    schema_version: '1.0.0',
    status: 'VALID',
    producer: 'data-agent@1.0.0',
    content_hash: computeContentHash(payload),
    payload,
    evidence_refs: ['UNIT-VHOP-S1-01'],
    input_artifact_refs: [],
    limitations: ['Mock snapshot data only'],
    created_at: '2026-09-26T22:50:00.000Z',
  };

  return { ...base, ...overrides };
}

// ============================================================================
// SUITE 1: ADVERSARIAL ZOD SCHEMA STRESS TESTS (FEAT-C02 & FEAT-C03)
// ============================================================================
console.log('▶️ SUITE 1: Adversarial Zod Schema Stress Tests');

// 1.1 Malformed UUID Tests
try {
  const malformedUUIDs = [
    { label: 'empty string', val: '' },
    { label: 'random non-uuid text', val: 'not-a-valid-uuid' },
    { label: '35 chars (too short)', val: '11111111-1111-4111-8111-11111111111' },
    { label: '37 chars (too long)', val: '11111111-1111-4111-8111-1111111111111' },
    { label: 'invalid hex char (g)', val: '11111111-1111-4111-8111-11111111111g' },
    { label: 'missing dashes', val: '11111111111141118111111111111111' },
    { label: 'double dash', val: '11111111--1111-4111-8111-111111111111' },
    { label: 'whitespace padded', val: ' 11111111-1111-4111-8111-111111111111 ' },
    { label: 'sql injection', val: "' OR 1=1 --" },
    { label: 'xss script tag', val: '<script>alert("xss")</script>' },
    { label: 'number as uuid', val: 12345678 },
    { label: 'null as uuid', val: null },
    { label: 'undefined as uuid', val: undefined },
  ];

  let rejectedCountArtifactId = 0;
  let rejectedCountRunId = 0;

  for (const item of malformedUUIDs) {
    const envBadArtifactId = makeBaseEnvelope({ artifact_id: item.val });
    const resA = safeValidateEnvelope(envBadArtifactId);
    if (!resA.success) rejectedCountArtifactId++;

    const envBadRunId = makeBaseEnvelope({ run_id: item.val });
    const resR = safeValidateEnvelope(envBadRunId);
    if (!resR.success) rejectedCountRunId++;
  }

  assert.equal(rejectedCountArtifactId, malformedUUIDs.length);
  assert.equal(rejectedCountRunId, malformedUUIDs.length);
  recordPass('Malformed UUIDs rejected 100% across artifact_id and run_id', {
    testedVariations: malformedUUIDs.length,
  });

  // Test Nil UUID and Uppercase UUID
  const nilUUID = '00000000-0000-0000-0000-000000000000';
  const nilRes = safeValidateEnvelope(makeBaseEnvelope({ artifact_id: nilUUID, run_id: nilUUID }));
  assert.equal(nilRes.success, true, 'Nil UUID should be RFC 4122 compliant and valid');

  const upperUUID = '11111111-1111-4111-8111-111111111111'.toUpperCase();
  const upperRes = safeValidateEnvelope(makeBaseEnvelope({ artifact_id: upperUUID }));
  assert.equal(upperRes.success, true, 'Uppercase UUID should be accepted by Zod uuid()');
  recordPass('RFC 4122 Nil UUID and standard Uppercase UUID accepted properly');
} catch (err) {
  recordFail('1.1 Malformed UUID stress test', err);
}

// 1.2 Invalid Artifact Types
try {
  const invalidTypes = [
    'unknown',
    'database',
    'sql',
    'Dataset', // Wrong case
    'DATASET', // Uppercase
    'dataset ', // Trailing space
    'chart', // Truncated
    'finance', // Truncated
    '',
    12345,
    null,
    {},
    [],
  ];

  let rejectedTypes = 0;
  for (const badType of invalidTypes) {
    const env = makeBaseEnvelope({ artifact_type: badType });
    const res = safeValidateEnvelope(env);
    if (!res.success) rejectedTypes++;
  }
  assert.equal(rejectedTypes, invalidTypes.length);
  recordPass('Invalid artifact types rejected completely', { count: invalidTypes.length });

  // Verify all 7 official artifact types are accepted
  const allowedTypes = ['dataset', 'metric', 'comparison', 'insight', 'chart_spec', 'report', 'finance_plan'];
  for (const t of allowedTypes) {
    const env = makeBaseEnvelope({ artifact_type: t });
    const res = safeValidateEnvelope(env);
    assert.equal(res.success, true, `Allowed type '${t}' should be valid in base envelope`);
  }
  recordPass('All 7 PRD/AGENT.md artifact types recognized cleanly');
} catch (err) {
  recordFail('1.2 Invalid artifact types test', err);
}

// 1.3 Missing Required Fields & Default Values
try {
  const requiredFields = [
    'artifact_id',
    'run_id',
    'task_id',
    'artifact_type',
    'producer',
    'content_hash',
    'payload',
    'created_at',
  ];

  for (const field of requiredFields) {
    const raw = makeBaseEnvelope();
    delete (raw as any)[field];
    const res = safeValidateEnvelope(raw);
    assert.equal(res.success, false, `Envelope missing required field '${field}' MUST fail validation`);
  }
  recordPass('All 8 mandatory envelope fields strictly enforced (omission rejected)');

  // Empty string / whitespace checks on task_id and producer
  assert.equal(safeValidateEnvelope(makeBaseEnvelope({ task_id: '' })).success, false);
  assert.equal(safeValidateEnvelope(makeBaseEnvelope({ task_id: '   ' })).success, false);
  assert.equal(safeValidateEnvelope(makeBaseEnvelope({ producer: '' })).success, false);
  assert.equal(safeValidateEnvelope(makeBaseEnvelope({ producer: '   ' })).success, false);
  recordPass('Empty or whitespace-only task_id and producer strictly rejected');

  // Default values test: schema_version, status, evidence_refs, input_artifact_refs
  const envWithDefaults = {
    artifact_id: '11111111-1111-4111-8111-111111111111',
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task_id: 'task-1',
    artifact_type: 'dataset',
    producer: 'data-agent@1.0.0',
    content_hash: computeContentHash({}),
    payload: {},
    created_at: new Date().toISOString(),
  };
  const parsedDefaults = ArtifactEnvelopeSchema.parse(envWithDefaults);
  assert.equal(parsedDefaults.schema_version, '1.0.0');
  assert.equal(parsedDefaults.status, 'VALID');
  assert.deepEqual(parsedDefaults.evidence_refs, []);
  assert.deepEqual(parsedDefaults.input_artifact_refs, []);
  recordPass('Default envelope fields correctly populated (schema_version=1.0.0, status=VALID, refs=[])');
} catch (err) {
  recordFail('1.3 Missing fields and default values test', err);
}

// 1.4 Non-ISO Timestamps
try {
  const badTimestamps = [
    { label: 'empty string', val: '' },
    { label: 'date only', val: '2026-09-26' },
    { label: 'missing timezone offset', val: '2026-09-26T22:50:00' },
    { label: 'space instead of T', val: '2026-09-26 22:50:00Z' },
    { label: 'sql format', val: '2026-09-26 22:50:00.000' },
    { label: 'epoch number as string', val: '1727391600000' },
    { label: 'invalid month', val: '2026-13-26T22:50:00Z' },
    { label: 'invalid day', val: '2026-09-32T22:50:00Z' },
    { label: 'arbitrary string', val: 'yesterday-at-noon' },
  ];

  let rejectedTimestamps = 0;
  for (const item of badTimestamps) {
    const env = makeBaseEnvelope({ created_at: item.val });
    const res = safeValidateEnvelope(env);
    if (!res.success) rejectedTimestamps++;
  }
  assert.equal(rejectedTimestamps, badTimestamps.length);
  recordPass('Non-ISO timestamps rejected 100%', { count: badTimestamps.length });

  // Valid ISO timestamps with Zulu and numeric offsets
  const validTimestamps = [
    '2026-09-26T22:50:00.000Z',
    '2026-09-26T22:50:00Z',
    '2026-09-26T22:50:00+07:00',
    '2026-09-26T22:50:00-05:00',
    '2026-09-26T22:50:00.123456Z',
  ];
  for (const ts of validTimestamps) {
    const env = makeBaseEnvelope({ created_at: ts });
    const res = safeValidateEnvelope(env);
    assert.equal(res.success, true, `Timestamp ${ts} should be accepted`);
  }
  recordPass('Valid ISO 8601 timestamps (Z and numeric offsets) cleanly accepted');
} catch (err) {
  recordFail('1.4 Non-ISO timestamps test', err);
}

// 1.5 Invalid Statuses
try {
  const badStatuses = ['PENDING', 'RUNNING', 'FAILED', 'SUCCESS', 'draft', 'valid', 'INVALID_STATUS', ''];
  let rejectedStatusCount = 0;
  for (const st of badStatuses) {
    const env = makeBaseEnvelope({ status: st });
    const res = safeValidateEnvelope(env);
    if (!res.success) rejectedStatusCount++;
  }
  assert.equal(rejectedStatusCount, badStatuses.length);
  recordPass('Invalid status enums rejected 100%');

  const validStatuses = ['DRAFT', 'VALID', 'PARTIAL', 'INVALID', 'SUPERSEDED'];
  for (const st of validStatuses) {
    const env = makeBaseEnvelope({ status: st });
    const res = safeValidateEnvelope(env);
    assert.equal(res.success, true, `Status ${st} must be accepted`);
  }
  recordPass('All 5 official lifecycle statuses (DRAFT, VALID, PARTIAL, INVALID, SUPERSEDED) accepted');
} catch (err) {
  recordFail('1.5 Status enum validation test', err);
}

// 1.6 Malformed Content Hash Checks
try {
  const badHashes = [
    { label: '63 chars (too short)', val: 'a'.repeat(63) },
    { label: '65 chars (too long)', val: 'a'.repeat(65) },
    { label: 'non-hex character z', val: 'a'.repeat(63) + 'z' },
    { label: 'non-hex character G', val: 'a'.repeat(63) + 'G' },
    { label: 'empty string', val: '' },
    { label: 'whitespace inside', val: 'a'.repeat(30) + ' ' + 'a'.repeat(33) },
  ];

  let rejectedHashCount = 0;
  for (const item of badHashes) {
    const env = makeBaseEnvelope({ content_hash: item.val });
    const res = safeValidateEnvelope(env);
    if (!res.success) rejectedHashCount++;
  }
  assert.equal(rejectedHashCount, badHashes.length);
  recordPass('Malformed SHA-256 hash strings rejected 100%');

  const validLowerHash = crypto.createHash('sha256').update('test').digest('hex');
  const validUpperHash = validLowerHash.toUpperCase();
  assert.equal(safeValidateEnvelope(makeBaseEnvelope({ content_hash: validLowerHash })).success, true);
  assert.equal(safeValidateEnvelope(makeBaseEnvelope({ content_hash: validUpperHash })).success, true);
  recordPass('64-char hex content_hash accepted (case-insensitive)');
} catch (err) {
  recordFail('1.6 Malformed content hash test', err);
}

// 1.7 Domain Payload Boundary & Stress Tests
try {
  // DatasetPayload
  assert.equal(DatasetPayloadSchema.safeParse({ units: 'not-array', summary_metrics: { avg_dom: 10, absorption_rate: 0.1 } }).success, false);
  assert.equal(DatasetPayloadSchema.safeParse({ units: [], summary_metrics: { avg_dom: -5, absorption_rate: 0.1 } }).success, false); // negative avg_dom
  assert.equal(DatasetPayloadSchema.safeParse({ units: [], summary_metrics: { avg_dom: 10, absorption_rate: 0.1 } }).success, true); // empty units is valid
  recordPass('DatasetPayloadSchema: strictly rejects non-array units and negative metrics');

  // ComparisonPayload
  assert.equal(ComparisonPayloadSchema.safeParse({}).success, false);
  assert.equal(ComparisonPayloadSchema.safeParse({ peer_benchmark: { target_dom: 115, peer_avg_dom: 45 } }).success, false); // missing price_variance_pct
  assert.equal(ComparisonPayloadSchema.safeParse({ peer_benchmark: { target_dom: 115, peer_avg_dom: 45, price_variance_pct: 12.5 } }).success, true);
  recordPass('ComparisonPayloadSchema: strictly validates peer_benchmark fields');

  // InsightPayload
  assert.equal(InsightPayloadSchema.safeParse({ findings: [] }).success, false); // min(1)
  assert.equal(
    InsightPayloadSchema.safeParse({
      findings: [{ claim: '', evidence_id: 'EV-1', confidence: 0.8 }],
    }).success,
    false // empty claim
  );
  assert.equal(
    InsightPayloadSchema.safeParse({
      findings: [{ claim: 'High DOM', evidence_id: '', confidence: 0.8 }],
    }).success,
    false // empty evidence_id
  );
  assert.equal(
    InsightPayloadSchema.safeParse({
      findings: [{ claim: 'High DOM', evidence_id: 'EV-1', confidence: 1.5 }],
    }).success,
    false // confidence > 1
  );
  assert.equal(
    InsightPayloadSchema.safeParse({
      findings: [{ claim: 'High DOM', evidence_id: 'EV-1', confidence: -0.1 }],
    }).success,
    false // confidence < 0
  );
  assert.equal(
    InsightPayloadSchema.safeParse({
      findings: [{ claim: 'High DOM', evidence_id: 'EV-1', confidence: 0.95, category: 'pricing' }],
    }).success,
    true
  );
  recordPass('InsightPayloadSchema: strictly enforces non-empty findings, non-empty claims/evidence_id, and 0<=confidence<=1');

  // ChartSpecPayload
  assert.equal(ChartSpecPayloadSchema.safeParse({ chart_type: 'pie', chart_data: [], x_axis: 'code', y_axis: 'dom' }).success, false);
  assert.equal(ChartSpecPayloadSchema.safeParse({ chart_type: 'line', chart_data: [], x_axis: 'code', y_axis: 'dom' }).success, false);
  assert.equal(ChartSpecPayloadSchema.safeParse({ chart_type: 'bar', chart_data: 'invalid', x_axis: 'code', y_axis: 'dom' }).success, false);
  assert.equal(ChartSpecPayloadSchema.safeParse({ chart_type: 'bar', chart_data: [], x_axis: '', y_axis: 'dom' }).success, false);
  assert.equal(ChartSpecPayloadSchema.safeParse({ chart_type: 'bar', chart_data: [{ code: 'S1', dom: 115 }], x_axis: 'code', y_axis: 'dom' }).success, true);
  assert.equal(ChartSpecPayloadSchema.safeParse({ chart_type: 'scatter', chart_data: [{ price: 3.5, dom: 115 }], x_axis: 'price', y_axis: 'dom' }).success, true);
  recordPass('ChartSpecPayloadSchema: restricts chart_type to bar|scatter and requires non-empty axes');

  // ReportPayload & Completeness Helper
  assert.equal(ReportPayloadSchema.safeParse({ title: 'Report' }).success, false); // missing markdown/markdown_content
  assert.equal(ReportPayloadSchema.safeParse({ markdown: '   ' }).success, false); // whitespace markdown
  assert.equal(ReportPayloadSchema.safeParse({ markdown: '# Báo cáo phân tích\nĐầy đủ nội dung' }).success, true);

  const fullReport = `
# Executive Summary
Tóm tắt kết quả điều tra bất động sản bán chậm.
## Scope & Target Definition
Phân khu Sapphire 1, Vinhomes Ocean Park.
## Data Quality & Snapshot Context
Snapshot 10 căn hộ, dữ liệu xác thực kho dữ liệu SQLite.
## Root-cause Insights & Peer Comparison
Phân tích nguyên nhân chênh lệch giá và thời gian chào bán.
## Visual Charts
Biểu đồ phân phối DOM và giá căn hộ.
## Sales Action Recommendations
Đề xuất các phương án kích cầu và điều chỉnh chính sách.
  `;
  const completenessRes = validateReportCompleteness(fullReport);
  assert.equal(completenessRes.isComplete, true);
  assert.equal(completenessRes.missingSections.length, 0);

  const incompleteReport = `# Executive Summary\nTóm tắt sơ lược.`;
  const incompleteRes = validateReportCompleteness(incompleteReport);
  assert.equal(incompleteRes.isComplete, false);
  assert.equal(incompleteRes.missingSections.length, 5);
  recordPass('ReportPayloadSchema & validateReportCompleteness: verifies 6 mandatory PRD sections');

  // FinancePlanPayload
  assert.equal(
    FinancePlanPayloadSchema.safeParse({
      property_price: -1000,
      loan_amount: 500,
      term_years: 20,
      monthly_installment: 10,
      interest_rate: 0.08,
    }).success,
    false // negative property price
  );
  assert.equal(
    FinancePlanPayloadSchema.safeParse({
      property_price: 1000,
      loan_amount: 500,
      term_years: 0,
      monthly_installment: 10,
      interest_rate: 0.08,
    }).success,
    false // non-positive term
  );
  assert.equal(
    FinancePlanPayloadSchema.safeParse({
      property_price: 1000,
      loan_amount: 500,
      term_years: 20,
      interest_rate: 0.08,
    }).success,
    false // missing monthly payment
  );
  assert.equal(
    FinancePlanPayloadSchema.safeParse({
      property_price: 3600000000,
      loan_amount: 2500000000,
      term_years: 25,
      monthly_installment: 21500000,
      interest_rate_pct: 7.5,
    }).success,
    true
  );
  recordPass('FinancePlanPayloadSchema: strictly verifies positive monetary amounts, terms, and payments');

  // 1.8 TypedArtifactEnvelopeSchema Discriminated Union
  const mismatchEnvelope = {
    artifact_id: '11111111-1111-4111-8111-111111111111',
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task_id: 'task-chart',
    artifact_type: 'chart_spec', // Claimed type is chart_spec
    schema_version: '1.0.0',
    status: 'VALID',
    producer: 'chart-agent@1.0.0',
    content_hash: computeContentHash({}),
    payload: {
      // But payload is Insight payload, missing chart_type, chart_data, x_axis, y_axis
      findings: [{ claim: 'Wrong payload', evidence_id: 'EV-1', confidence: 0.9 }],
    },
    created_at: new Date().toISOString(),
  };
  const unionRes = TypedArtifactEnvelopeSchema.safeParse(mismatchEnvelope);
  assert.equal(unionRes.success, false, 'Discriminated union must reject payload mismatched with artifact_type');
  recordPass('TypedArtifactEnvelopeSchema discriminated union rejects type/payload mismatches cleanly');
} catch (err) {
  recordFail('1.7 Domain payload boundary tests', err);
}

// ============================================================================
// SUITE 2: ADVERSARIAL SHA-256 CANONICAL HASHING & TAMPERING TESTS
// ============================================================================
console.log('\n▶️ SUITE 2: Adversarial SHA-256 Canonical Hashing & Tamper Detection');

// 2.1 Deep Nested Object Key Reordering
try {
  const deepObjA = {
    z_level1: {
      m_level2: {
        a_level3: {
          x_level4: [1, 2, { deep_key: 'target', another_key: 42 }],
          b_level4: 'value-b',
        },
        z_level3: 9999,
      },
      a_level2: true,
    },
    a_level1: 'start',
    p_level1: null,
  };

  const deepObjB = {
    p_level1: null,
    a_level1: 'start',
    z_level1: {
      a_level2: true,
      m_level2: {
        z_level3: 9999,
        a_level3: {
          b_level4: 'value-b',
          x_level4: [1, 2, { another_key: 42, deep_key: 'target' }],
        },
      },
    },
  };

  const strA = canonicalStringify(deepObjA);
  const strB = canonicalStringify(deepObjB);
  assert.equal(strA, strB, 'Deeply nested objects with reversed key orders must serialize identically');

  const hashA = computeContentHash(deepObjA);
  const hashB = computeContentHash(deepObjB);
  assert.equal(hashA, hashB, 'Hashes must be identical regardless of key order at any depth');
  recordPass('Deep nested object key reordering (4+ levels) produces identical canonical JSON & SHA-256', {
    hash: hashA,
  });
} catch (err) {
  recordFail('2.1 Deep nested key reordering', err);
}

// 2.2 Special Characters, Unicode, Vietnamese Diacritics, Emojis, Empty Objects
try {
  const unicodeCases = [
    {
      name: 'Vietnamese diacritics & currency',
      payload: {
        title: 'Căn hộ chung cư Sapphire 1, Vinhomes Ocean Park',
        mo_ta: 'Tầng 12A, ban công Đông Nam nhìn ra hồ nước ngọt 24.5ha, giá niêm yết 3,600,000,000 ₫',
        dac_diem: ['Đầy đủ nội thất', 'Sổ đỏ sẵn sàng', 'Hỗ trợ vay 70%'],
      },
    },
    {
      name: 'Emojis and Unicode Symbols',
      payload: {
        icons: '🏠 🏢 📊 📈 💰 🔑 🚀',
        math: '∀x ∈ ℝ: x² ≥ 0, Δ = b² - 4ac, ∑_{i=1}^n x_i',
        arrows: '→ ← ↑ ↓ ↔ ⇄',
      },
    },
    {
      name: 'Escaped characters & Control Codes',
      payload: {
        escapes: 'Line1\nLine2\r\nLine3\tTabbed "Quoted" \\Backslash\\ /Slash/',
        nullByte: 'BeforeNull\u0000AfterNull',
      },
    },
    {
      name: 'Empty and nested empty structures',
      payload: {
        emptyObj: {},
        emptyArr: [],
        nestedEmpty: { a: {}, b: [], c: { d: {} } },
      },
    },
  ];

  for (const c of unicodeCases) {
    const serialized = canonicalStringify(c.payload);
    assert.ok(serialized.length > 0);
    const h1 = computeContentHash(c.payload);
    const h2 = computeContentHash(c.payload);
    assert.equal(h1, h2, `Hash must be deterministic for ${c.name}`);
    assert.match(h1, /^[0-9a-f]{64}$/);
  }
  recordPass('Deterministic hashing verified across Vietnamese text, emojis, escape codes, empty structures');
} catch (err) {
  recordFail('2.2 Unicode and special characters test', err);
}

// 2.3 Array Ordering Sensitivity
try {
  const arr1 = { items: [1, 2, 3, 4, 5] };
  const arr2 = { items: [5, 4, 3, 2, 1] };
  const arr3 = { items: [1, 2, 4, 3, 5] };

  assert.notEqual(canonicalStringify(arr1), canonicalStringify(arr2));
  assert.notEqual(computeContentHash(arr1), computeContentHash(arr2));
  assert.notEqual(computeContentHash(arr1), computeContentHash(arr3));

  const objArr1 = { units: [{ id: 'A', dom: 100 }, { id: 'B', dom: 200 }] };
  const objArr2 = { units: [{ id: 'B', dom: 200 }, { id: 'A', dom: 100 }] };
  assert.notEqual(computeContentHash(objArr1), computeContentHash(objArr2));

  recordPass('Array order sensitivity strictly maintained (element reordering changes hash)');
} catch (err) {
  recordFail('2.3 Array ordering sensitivity test', err);
}

// 2.4 Single-Bit & Single-Character Tampering Oracle
try {
  const masterPayload = {
    project: 'Vinhomes Ocean Park',
    total_units: 10,
    units: [
      { unit_id: 'UNIT-01', dom: 115, active: true, price_vnd: 3600000000 },
      { unit_id: 'UNIT-02', dom: 95, active: false, price_vnd: 4200000000 },
    ],
    metadata: {
      auditor: 'system-agent',
      version: 1,
      flags: [1, 0, 1],
    },
  };

  const validHash = computeContentHash(masterPayload);
  const envelope = {
    payload: masterPayload,
    content_hash: validHash,
  };

  assert.equal(verifyContentHash(envelope), true, 'Master envelope hash must verify true');

  // Test 50 distinct mutations
  const mutations: Array<{ desc: string; mutate: () => any }> = [
    // String single char change
    { desc: 'single character change in project name', mutate: () => ({ ...masterPayload, project: 'Vinhomes Ocean ParK' }) },
    { desc: 'single character change in unit_id', mutate: () => ({ ...masterPayload, units: [{ ...masterPayload.units[0], unit_id: 'UNIT-02' }, masterPayload.units[1]] }) },
    // Numeric 1-bit / single unit change
    { desc: 'DOM altered 115 -> 116', mutate: () => ({ ...masterPayload, units: [{ ...masterPayload.units[0], dom: 116 }, masterPayload.units[1]] }) },
    { desc: 'DOM altered 115 -> 114', mutate: () => ({ ...masterPayload, units: [{ ...masterPayload.units[0], dom: 114 }, masterPayload.units[1]] }) },
    { desc: 'Price altered by 1 VND', mutate: () => ({ ...masterPayload, units: [{ ...masterPayload.units[0], price_vnd: 3600000001 }, masterPayload.units[1]] }) },
    { desc: 'total_units 10 -> 11', mutate: () => ({ ...masterPayload, total_units: 11 }) },
    // Boolean toggle
    { desc: 'active toggled true -> false', mutate: () => ({ ...masterPayload, units: [{ ...masterPayload.units[0], active: false }, masterPayload.units[1]] }) },
    // Array mutations
    { desc: 'array flag mutated [1,0,1] -> [1,1,1]', mutate: () => ({ ...masterPayload, metadata: { ...masterPayload.metadata, flags: [1, 1, 1] } }) },
    { desc: 'additional array item', mutate: () => ({ ...masterPayload, metadata: { ...masterPayload.metadata, flags: [1, 0, 1, 0] } }) },
    { desc: 'array item removed', mutate: () => ({ ...masterPayload, metadata: { ...masterPayload.metadata, flags: [1, 0] } }) },
    // Field addition & deletion
    { desc: 'extra field added with null', mutate: () => ({ ...masterPayload, extra_field: null }) },
    { desc: 'extra field added with string', mutate: () => ({ ...masterPayload, extra_field: '' }) },
    { desc: 'field deleted', mutate: () => { const copy: any = { ...masterPayload }; delete copy.total_units; return copy; } },
  ];

  // Add 37 more algorithmic mutations (flipping characters and numbers across fields)
  for (let i = 0; i < 37; i++) {
    mutations.push({
      desc: `algorithmic mutation #${i + 1}`,
      mutate: () => {
        const copy: any = JSON.parse(JSON.stringify(masterPayload));
        copy.units[0].dom += (i + 1);
        return copy;
      },
    });
  }

  let detectedTamperCount = 0;
  for (const m of mutations) {
    const tamperedPayload = m.mutate();
    const isVerified = verifyContentHash({
      payload: tamperedPayload,
      content_hash: validHash,
    });
    if (!isVerified) {
      detectedTamperCount++;
    }
  }

  assert.equal(detectedTamperCount, mutations.length, `Expected all ${mutations.length} mutations to be detected`);
  recordPass(`Single-bit/single-character tampering detected 100% across ${mutations.length} distinct mutations`);
} catch (err) {
  recordFail('2.4 Tampering oracle test', err);
}

// 2.5 Canonical Stringifier Edge Cases (undefined, null, Date)
try {
  // Undefined properties are omitted in objects
  const objWithUndef = { a: 1, b: undefined, c: 'hello' };
  const objWithoutUndef = { a: 1, c: 'hello' };
  assert.equal(canonicalStringify(objWithUndef), canonicalStringify(objWithoutUndef));
  assert.equal(computeContentHash(objWithUndef), computeContentHash(objWithoutUndef));

  // Null properties are PRESERVED
  const objWithNull = { a: 1, b: null, c: 'hello' };
  assert.notEqual(canonicalStringify(objWithNull), canonicalStringify(objWithoutUndef));
  assert.notEqual(computeContentHash(objWithNull), computeContentHash(objWithoutUndef));

  // Date objects serialize to ISO string
  const d1 = new Date('2026-09-26T22:50:00.000Z');
  const dObj = { timestamp: d1 };
  const sObj = { timestamp: '2026-09-26T22:50:00.000Z' };
  assert.equal(canonicalStringify(dObj), canonicalStringify(sObj));

  recordPass('canonicalStringify edge cases: undefined omitted, null preserved, Date serialized to ISO');
} catch (err) {
  recordFail('2.5 Canonical stringifier edge cases test', err);
}

// 2.6 Cross-Language Equivalence: TypeScript canonicalStringify vs Python json.dumps
try {
  const { execSync } = await import('node:child_process');
  const crossLangPayload = {
    project: 'Vinhomes Ocean Park - Phân khu Sapphire 1',
    summary_metrics: {
      avg_dom: 115,
      slow_moving_count: 3,
      absorption_rate: 0.12,
    },
    units: [
      { unit_id: 'UNIT-01', dom: 115, price: 3600000000, features: ['view hồ', 'nội thất'] },
      { unit_id: 'UNIT-02', dom: 95, price: 4200000000, available: false, notes: null },
    ],
  };

  const tsHash = computeContentHash(crossLangPayload);

  // Run python script via stdin to avoid Windows shell quoting issues
  const pyCode = [
    'import json, hashlib, sys',
    `payload = json.loads(${JSON.stringify(JSON.stringify(crossLangPayload))})`,
    "s = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False)",
    "h = hashlib.sha256(s.encode('utf-8')).hexdigest()",
    'sys.stdout.write(h)',
  ].join('\n');

  const pyHash = execSync('python', {
    input: pyCode,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();

  assert.equal(tsHash, pyHash, `TypeScript hash (${tsHash}) must match Python hash (${pyHash})`);
  recordPass('Cross-Language Equivalence: TypeScript canonicalStringify and Python json.dumps produce identical SHA-256', {
    sha256: tsHash,
  });
} catch (err) {
  recordFail('2.6 Cross-Language canonical hash test', err);
}

// ============================================================================
// SUITE 3: PROTOBUF PROTO-LOADER & SERIALIZATION STRESS TESTS (FEAT-C01)
// ============================================================================
console.log('\n▶️ SUITE 3: Protobuf proto-loader & Serialization Stress Tests');

const protoFilePath = resolve(process.cwd(), 'proto/agent_pipeline.proto');

// 3.1 proto-loader with keepCase: true (snake_case preserved)
try {
  const packageDefSnake = protoLoader.loadSync(protoFilePath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const grpcObjSnake = grpc.loadPackageDefinition(packageDefSnake) as any;
  const vdaPackage = grpcObjSnake.vda?.agent?.v1;

  assert.ok(vdaPackage, 'vda.agent.v1 package must be defined');
  assert.ok(vdaPackage.SubAgentService, 'SubAgentService must be defined in vda.agent.v1');

  const subAgentService = vdaPackage.SubAgentService.service;
  assert.ok(subAgentService.ExecuteStep, 'ExecuteStep RPC must be defined');
  assert.equal(subAgentService.ExecuteStep.requestStream, false);
  assert.equal(subAgentService.ExecuteStep.responseStream, true, 'ExecuteStep must be server-streaming');

  assert.ok(subAgentService.CheckHealth, 'CheckHealth RPC must be defined');
  assert.equal(subAgentService.CheckHealth.requestStream, false);
  assert.equal(subAgentService.CheckHealth.responseStream, false, 'CheckHealth must be unary');

  // Verify message definitions in package definition
  const reqType = packageDefSnake['vda.agent.v1.StepExecutionRequest'] as any;
  assert.ok(reqType, 'StepExecutionRequest definition exists');
  const reqFields = reqType.type.field.map((f: any) => f.name);
  assert.ok(reqFields.includes('run_id'), 'Field run_id preserved in snake_case');
  assert.ok(reqFields.includes('task_id'), 'Field task_id preserved in snake_case');
  assert.ok(reqFields.includes('session_id'), 'Field session_id preserved in snake_case');
  assert.ok(reqFields.includes('user_prompt'), 'Field user_prompt preserved in snake_case');
  assert.ok(reqFields.includes('agent_role'), 'Field agent_role preserved in snake_case');
  assert.ok(reqFields.includes('input_artifacts'), 'Field input_artifacts preserved in snake_case');
  assert.ok(reqFields.includes('execution_context_json'), 'Field execution_context_json preserved in snake_case');

  const eventType = packageDefSnake['vda.agent.v1.StepStreamEvent'] as any;
  assert.ok(eventType, 'StepStreamEvent definition exists');
  const eventFields = eventType.type.field.map((f: any) => f.name);
  assert.ok(eventFields.includes('type'), 'Field type preserved in snake_case');
  assert.ok(eventFields.includes('message'), 'Field message preserved in snake_case');
  assert.ok(eventFields.includes('output_artifact_json'), 'Field output_artifact_json preserved in snake_case');

  recordPass('proto-loader with keepCase=true: loads package, SubAgentService, and snake_case fields correctly', {
    reqFields,
    eventFields,
  });
} catch (err) {
  recordFail('3.1 proto-loader keepCase=true', err);
}

// 3.2 proto-loader with keepCase: false (camelCase conversion) & Mismatch Demonstration
try {
  const packageDefCamel = protoLoader.loadSync(protoFilePath, {
    keepCase: false,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const reqTypeCamel = packageDefCamel['vda.agent.v1.StepExecutionRequest'] as any;
  assert.ok(reqTypeCamel, 'StepExecutionRequest exists in camelCase def');
  const camelFields = reqTypeCamel.type.field.map((f: any) => f.name);

  assert.ok(camelFields.includes('runId'), 'Field converted to camelCase: runId');
  assert.ok(camelFields.includes('taskId'), 'Field converted to camelCase: taskId');
  assert.ok(camelFields.includes('sessionId'), 'Field converted to camelCase: sessionId');
  assert.ok(camelFields.includes('userPrompt'), 'Field converted to camelCase: userPrompt');
  assert.ok(camelFields.includes('agentRole'), 'Field converted to camelCase: agentRole');
  assert.ok(camelFields.includes('inputArtifacts'), 'Field converted to camelCase: inputArtifacts');
  assert.ok(camelFields.includes('executionContextJson'), 'Field converted to camelCase: executionContextJson');

  const eventTypeCamel = packageDefCamel['vda.agent.v1.StepStreamEvent'] as any;
  const eventCamelFields = eventTypeCamel.type.field.map((f: any) => f.name);
  assert.ok(eventCamelFields.includes('outputArtifactJson'), 'Field converted to camelCase: outputArtifactJson');

  const healthResCamel = packageDefCamel['vda.agent.v1.HealthResponse'] as any;
  const healthCamelFields = healthResCamel.type.field.map((f: any) => f.name);
  assert.ok(healthCamelFields.includes('isHealthy'), 'Field converted to camelCase: isHealthy');
  assert.ok(healthCamelFields.includes('statusMessage'), 'Field converted to camelCase: statusMessage');

  // Demonstrate empirical risk: passing snake_case when keepCase is false drops all fields!
  const grpcObjCamel = grpc.loadPackageDefinition(packageDefCamel) as any;
  const svcCamel = grpcObjCamel.vda.agent.v1.SubAgentService.service;
  const snakeInput = { run_id: 'test-run', task_id: 'test-task' };
  const serializedSnake = svcCamel.ExecuteStep.requestSerialize(snakeInput);
  const deserializedCamel = svcCamel.ExecuteStep.requestDeserialize(serializedSnake);
  // Fields are completely dropped and fall back to proto3 empty string default!
  assert.notEqual(deserializedCamel.runId, 'test-run');
  assert.equal(deserializedCamel.runId, '');
  assert.equal(deserializedCamel.taskId, '');

  // But passing camelCase preserves fields
  const camelInput = { runId: 'test-run', taskId: 'test-task' };
  const serializedCamel = svcCamel.ExecuteStep.requestSerialize(camelInput);
  const deserializedValidCamel = svcCamel.ExecuteStep.requestDeserialize(serializedCamel);
  assert.equal(deserializedValidCamel.runId, 'test-run');
  assert.equal(deserializedValidCamel.taskId, 'test-task');

  recordPass('proto-loader with keepCase=false: camelCase conversion verified, snake/camel mismatch risk proven empirically', {
    camelFields,
    mismatchDroppedFields: true,
  });
} catch (err) {
  recordFail('3.2 proto-loader keepCase=false', err);
}

// 3.3 Protobuf Binary Serialization / Deserialization Round-Trip via gRPC Service Serializer
try {
  const packageDef = protoLoader.loadSync(protoFilePath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const grpcObj = grpc.loadPackageDefinition(packageDef) as any;
  const svc = grpcObj.vda.agent.v1.SubAgentService.service;

  // Build a realistic COMPLETE event containing serialized ArtifactEnvelope
  const validEnvelope = makeBaseEnvelope({
    producer: 'data-agent@1.0.0',
    evidence_refs: ['UNIT-VHOP-S1-01', 'UNIT-VHOP-S1-02'],
  });
  const serializedEnvelopeStr = JSON.stringify(validEnvelope);

  const testEvent = {
    type: 'COMPLETE',
    message: 'Data agent query executed successfully',
    output_artifact_json: serializedEnvelopeStr,
  };

  // Binary serialize using gRPC service response serializer
  const encodedBuffer = svc.ExecuteStep.responseSerialize(testEvent);
  assert.ok(Buffer.isBuffer(encodedBuffer) || encodedBuffer instanceof Uint8Array);
  assert.ok(encodedBuffer.length > 0, 'Encoded buffer must not be empty');

  // Binary deserialize using gRPC service response deserializer
  const decodedEvent = svc.ExecuteStep.responseDeserialize(encodedBuffer);
  assert.equal(decodedEvent.type, 'COMPLETE');
  assert.equal(decodedEvent.message, 'Data agent query executed successfully');
  assert.equal(decodedEvent.output_artifact_json, serializedEnvelopeStr);

  // Parse inner envelope and validate against Zod contract
  const parsedEnvelope = JSON.parse(decodedEvent.output_artifact_json);
  const validatedEnvelope = validateEnvelope(parsedEnvelope);
  assert.equal(validatedEnvelope.artifact_type, 'dataset');
  assert.equal(verifyContentHash(validatedEnvelope), true);

  recordPass('Protobuf binary round-trip encode/decode verified: envelope survived with 100% fidelity', {
    encodedBytes: encodedBuffer.length,
    envelopeVerified: true,
  });

  // Test large payload (100KB+ JSON string in output_artifact_json)
  const largeUnits = [];
  for (let i = 0; i < 500; i++) {
    largeUnits.push({
      unit_id: `UNIT-${i}`,
      unit_code: `CODE-${i}`,
      dom: 100 + (i % 50),
      price: 3000000000 + i * 10000000,
      description: 'Căn hộ thử nghiệm áp lực với độ dài chuỗi văn bản lớn để kiểm thử buffer serialization',
    });
  }
  const largeEnvelope = makeBaseEnvelope({
    payload: { units: largeUnits, count: 500 },
  });
  const largeJsonStr = JSON.stringify(largeEnvelope);
  assert.ok(largeJsonStr.length > 50000, 'Payload size should exceed 50KB');

  const largeEvent = {
    type: 'COMPLETE',
    message: 'Large batch step complete',
    output_artifact_json: largeJsonStr,
  };

  const largeEncoded = svc.ExecuteStep.responseSerialize(largeEvent);
  const largeDecoded = svc.ExecuteStep.responseDeserialize(largeEncoded);
  assert.equal(largeDecoded.output_artifact_json.length, largeJsonStr.length);

  recordPass('Large protobuf payload serialization (500 units, >80KB buffer) completed without truncation', {
    bufferBytes: largeEncoded.length,
  });
} catch (err) {
  recordFail('3.3 Protobuf binary serialization test', err);
}

// 3.4 Enum & Status Value Mapping Tests
try {
  // Test both String and Number enum configurations
  const packageDefStr = protoLoader.loadSync(protoFilePath, {
    keepCase: true,
    enums: String,
    defaults: true,
  });
  const svcStr = (grpc.loadPackageDefinition(packageDefStr) as any).vda.agent.v1.SubAgentService.service;

  // With enums: String, numbers or strings can be serialized and decode to string
  const bufTrace = svcStr.ExecuteStep.responseSerialize({ type: 'TRACE', message: 'thought log', output_artifact_json: '' });
  const bufToken = svcStr.ExecuteStep.responseSerialize({ type: 1, message: 'token content', output_artifact_json: '' });
  const bufComp = svcStr.ExecuteStep.responseSerialize({ type: 'COMPLETE', message: 'done', output_artifact_json: '{}' });
  const bufErr = svcStr.ExecuteStep.responseSerialize({ type: 3, message: 'error', output_artifact_json: '' });

  assert.equal(svcStr.ExecuteStep.responseDeserialize(bufTrace).type, 'TRACE');
  assert.equal(svcStr.ExecuteStep.responseDeserialize(bufToken).type, 'TOKEN');
  assert.equal(svcStr.ExecuteStep.responseDeserialize(bufComp).type, 'COMPLETE');
  assert.equal(svcStr.ExecuteStep.responseDeserialize(bufErr).type, 'ERROR');

  // Test enums: Number
  const packageDefNum = protoLoader.loadSync(protoFilePath, {
    keepCase: true,
    enums: Number,
    defaults: true,
  });
  const svcNum = (grpc.loadPackageDefinition(packageDefNum) as any).vda.agent.v1.SubAgentService.service;
  assert.equal(svcNum.ExecuteStep.responseDeserialize(bufTrace).type, 0);
  assert.equal(svcNum.ExecuteStep.responseDeserialize(bufToken).type, 1);
  assert.equal(svcNum.ExecuteStep.responseDeserialize(bufComp).type, 2);
  assert.equal(svcNum.ExecuteStep.responseDeserialize(bufErr).type, 3);

  recordPass('Protobuf StepStreamEvent.EventType enum mapping verified in both String and Number modes');
} catch (err) {
  recordFail('3.4 Enum mapping test', err);
}

// 3.5 Full Request & HealthCheck Serialization
try {
  const packageDef = protoLoader.loadSync(protoFilePath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const svc = (grpc.loadPackageDefinition(packageDef) as any).vda.agent.v1.SubAgentService.service;

  // StepExecutionRequest serialization
  const stepReq = {
    run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    task_id: 'task-compare',
    session_id: 'sess-001',
    user_prompt: 'Điều tra căn hộ bán chậm',
    agent_role: 'compare-agent',
    input_artifacts: [
      {
        artifact_id: '11111111-1111-4111-8111-111111111111',
        artifact_type: 'dataset',
        content_json: '{"units":[]}',
      },
    ],
    execution_context_json: '{"threshold":90}',
  };

  const reqBuf = svc.ExecuteStep.requestSerialize(stepReq);
  const decodedReq = svc.ExecuteStep.requestDeserialize(reqBuf);
  assert.equal(decodedReq.run_id, stepReq.run_id);
  assert.equal(decodedReq.task_id, stepReq.task_id);
  assert.equal(decodedReq.user_prompt, stepReq.user_prompt);
  assert.equal(decodedReq.input_artifacts.length, 1);
  assert.equal(decodedReq.input_artifacts[0].artifact_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(decodedReq.input_artifacts[0].content_json, '{"units":[]}');

  // CheckHealth serialization
  const healthReqBuf = svc.CheckHealth.requestSerialize({});
  const decodedHealthReq = svc.CheckHealth.requestDeserialize(healthReqBuf);
  assert.ok(decodedHealthReq !== null);

  const healthResBuf = svc.CheckHealth.responseSerialize({
    is_healthy: true,
    status_message: 'CompareAgent UP on port 50052',
  });
  const decodedHealthRes = svc.CheckHealth.responseDeserialize(healthResBuf);
  assert.equal(decodedHealthRes.is_healthy, true);
  assert.equal(decodedHealthRes.status_message, 'CompareAgent UP on port 50052');

  recordPass('Full StepExecutionRequest & HealthCheck request/response serialization round-trip verified');
} catch (err) {
  recordFail('3.5 Full Request & HealthCheck serialization', err);
}

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n===============================================================');
console.log('📊 CHALLENGER 1 TEST RESULTS SUMMARY');
console.log('===============================================================');

const passedCount = results.filter((r) => r.passed).length;
const failedCount = results.filter((r) => !r.passed).length;

console.log(`Total tests: ${results.length}`);
console.log(`Passed:      ${passedCount}`);
console.log(`Failed:      ${failedCount}`);

if (failedCount > 0) {
  console.error('\n❌ VERDICT: REQUEST_CHANGES');
  process.exit(1);
} else {
  console.log('\n✅ VERDICT: APPROVE');
  process.exit(0);
}
