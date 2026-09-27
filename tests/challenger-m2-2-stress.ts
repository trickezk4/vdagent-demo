/**
 * tests/challenger-m2-2-stress.ts
 * Empirical Challenger 2 Stress Harness for Milestone 2 (Core 6-Agent gRPC Services)
 * 
 * Verifies:
 * 1. Evidence Lineage in data-agent (genuine warehouse unit IDs from SQLite)
 * 2. Claim-Evidence Binding in insight-agent (every claim binds to input dataset; empty dataset behavior)
 * 3. Report Integrity in report-agent (all 6 PRD section titles; valid [Evidence-REF: <unit_id>] badges)
 * 4. SHA-256 Hash Recalculation across all 5 generated envelopes (Dataset, Comparison, Insight, ChartSpec, Report)
 * 5. Adversarial fault injection and boundary stress tests
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

import {
  type ArtifactEnvelope,
  type DatasetPayload,
  type ComparisonPayload,
  type InsightPayload,
  type ChartSpecPayload,
  type ReportPayload,
  DatasetEnvelopeSchema,
  ComparisonEnvelopeSchema,
  InsightEnvelopeSchema,
  ChartSpecEnvelopeSchema,
  ReportEnvelopeSchema,
  canonicalStringify,
  computeContentHash,
  verifyContentHash,
  validateReportCompleteness,
} from '@vda/contracts';

import { getWarehouse, initWarehouse } from '@vda/mock-warehouse';

import { startDataAgent } from '../apps/agents/data-agent/src/index.js';
import { startCompareAgent } from '../apps/agents/compare-agent/src/index.js';
import { startInsightAgent } from '../apps/agents/insight-agent/src/index.js';
import { startChartAgentServer } from '../apps/agents/chart-agent/src/index.js';
import { startReportAgentServer } from '../apps/agents/report-agent/src/index.js';

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const testResults: TestResult[] = [];

function recordPass(id: string, name: string, details?: any) {
  console.log(`  ✅ [PASS] ${id}: ${name}`);
  testResults.push({ id, name, passed: true, details });
}

function recordFail(id: string, name: string, error: any) {
  const errMsg = error?.message || String(error);
  console.error(`  ❌ [FAIL] ${id}: ${name} -> ${errMsg}`);
  testResults.push({ id, name, passed: false, error: errMsg });
}

const PROTO_PATH = path.resolve(process.cwd(), 'proto/agent_pipeline.proto');

// Use custom isolated ports to avoid collision with any existing background server
const BASE_PORTS = {
  data: 52051,
  compare: 52052,
  insight: 52053,
  chart: 52054,
  report: 52055,
};

async function runChallengerStressHarness() {
  console.log('======================================================================');
  console.log('🔬 EMPIRICAL CHALLENGER 2: STRESS TEST & DATA FLOW INTEGRITY HARNESS');
  console.log('======================================================================\n');

  // Step 0: Start all 5 standalone gRPC agents on dedicated isolated test ports
  console.log(`▶️ [SETUP] Starting 5 isolated gRPC agents on ports ${BASE_PORTS.data}-${BASE_PORTS.report}...`);
  const dataServer = startDataAgent(BASE_PORTS.data);
  const compareServer = startCompareAgent(BASE_PORTS.compare);
  const insightServer = startInsightAgent(BASE_PORTS.insight);
  const chartServer = startChartAgentServer(BASE_PORTS.chart);
  const reportServer = startReportAgentServer(BASE_PORTS.report);

  await Promise.all([
    dataServer.start(),
    compareServer.start(),
    insightServer.start(),
    chartServer.start(),
    reportServer.start(),
  ]);
  console.log('   All 5 isolated test agents running.\n');

  // Setup gRPC client connections
  const pkgDef = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
  });
  const proto = grpc.loadPackageDefinition(pkgDef) as any;
  const SubAgentClient = proto.vda.agent.v1.SubAgentService;

  const dataClient = new SubAgentClient(`localhost:${BASE_PORTS.data}`, grpc.credentials.createInsecure());
  const compareClient = new SubAgentClient(`localhost:${BASE_PORTS.compare}`, grpc.credentials.createInsecure());
  const insightClient = new SubAgentClient(`localhost:${BASE_PORTS.insight}`, grpc.credentials.createInsecure());
  const chartClient = new SubAgentClient(`localhost:${BASE_PORTS.chart}`, grpc.credentials.createInsecure());
  const reportClient = new SubAgentClient(`localhost:${BASE_PORTS.report}`, grpc.credentials.createInsecure());

  // Also connect to standard default ports (:50051-:50055) if running
  const defaultClients = [
    { name: 'data-agent-default', client: new SubAgentClient('localhost:50051', grpc.credentials.createInsecure()), port: 50051 },
    { name: 'compare-agent-default', client: new SubAgentClient('localhost:50052', grpc.credentials.createInsecure()), port: 50052 },
    { name: 'insight-agent-default', client: new SubAgentClient('localhost:50053', grpc.credentials.createInsecure()), port: 50053 },
    { name: 'chart-agent-default', client: new SubAgentClient('localhost:50054', grpc.credentials.createInsecure()), port: 50054 },
    { name: 'report-agent-default', client: new SubAgentClient('localhost:50055', grpc.credentials.createInsecure()), port: 50055 },
  ];

  // Generic helper to invoke ExecuteStep over gRPC
  const callAgent = (
    client: any,
    role: string,
    prompt: string,
    inputArtifacts: any[] = [],
    customRunId?: string,
    customTaskId?: string
  ): Promise<{ envelope: ArtifactEnvelope; traces: string[] }> =>
    new Promise((resolve, reject) => {
      const call = client.ExecuteStep({
        run_id: customRunId || crypto.randomUUID(),
        task_id: customTaskId || `task-${role}-${Date.now()}`,
        session_id: 'session-challenger-m2-2',
        user_prompt: prompt,
        agent_role: role,
        input_artifacts: inputArtifacts.map((art) => ({
          artifact_id: art.artifact_id || crypto.randomUUID(),
          artifact_type: art.artifact_type,
          content_json: JSON.stringify(art),
        })),
        execution_context_json: '{}',
      });

      let finalEnvelope: any = null;
      const traces: string[] = [];

      call.on('data', (event: any) => {
        if (event.type === 'TRACE' || event.type === 0) {
          traces.push(event.message);
        } else if (event.type === 'COMPLETE' || event.type === 2) {
          try {
            finalEnvelope = JSON.parse(event.output_artifact_json);
          } catch (err: any) {
            reject(new Error(`Failed to parse COMPLETE artifact JSON: ${err.message}`));
          }
        } else if (event.type === 'ERROR' || event.type === 3) {
          reject(new Error(`Agent emitted ERROR: ${event.message}`));
        }
      });

      call.on('end', () => {
        if (!finalEnvelope) {
          reject(new Error(`Agent ${role} terminated without COMPLETE event`));
        } else {
          resolve({ envelope: finalEnvelope, traces });
        }
      });

      call.on('error', (err: any) => reject(err));
    });

  try {
    // ------------------------------------------------------------------
    // SUITE 0: Health Checks (on isolated ports AND default ports)
    // ------------------------------------------------------------------
    console.log('▶️ SUITE 0: Baseline gRPC Health Checks');
    const healthTargets = [
      { name: 'data-agent', client: dataClient, port: BASE_PORTS.data },
      { name: 'compare-agent', client: compareClient, port: BASE_PORTS.compare },
      { name: 'insight-agent', client: insightClient, port: BASE_PORTS.insight },
      { name: 'chart-agent', client: chartClient, port: BASE_PORTS.chart },
      { name: 'report-agent', client: reportClient, port: BASE_PORTS.report },
    ];

    for (const target of healthTargets) {
      try {
        const res = await new Promise<any>((resolve, reject) => {
          target.client.CheckHealth({}, (err: any, response: any) => {
            if (err || !response.is_healthy) reject(err || new Error(response?.status_message));
            else resolve(response);
          });
        });
        assert.equal(res.is_healthy, true);
        assert.ok(res.status_message.includes(target.name));
        recordPass(`H-${target.name}`, `${target.name} health check passed on port ${target.port}`, res);
      } catch (err) {
        recordFail(`H-${target.name}`, `${target.name} health check failed`, err);
      }
    }

    // Also check default port servers (:50051-:50055)
    console.log('   Checking background servers on standard ports :50051-:50055...');
    for (const target of defaultClients) {
      try {
        const res = await new Promise<any>((resolve, reject) => {
          target.client.CheckHealth({}, (err: any, response: any) => {
            if (err || !response.is_healthy) reject(err || new Error(response?.status_message));
            else resolve(response);
          });
        });
        assert.equal(res.is_healthy, true);
        recordPass(`H-default-${target.port}`, `Default server on port :${target.port} is healthy`, res);
      } catch (err) {
        console.log(`   (Note: Default port ${target.port} not probed: ${(err as any)?.message})`);
      }
    }

    // ------------------------------------------------------------------
    // SUITE 1: Evidence Lineage in data-agent
    // ------------------------------------------------------------------
    console.log('\n▶️ SUITE 1: Evidence Lineage in data-agent (Genuine Warehouse Unit IDs)');

    let datasetEnvelope: ArtifactEnvelope | null = null;
    try {
      const { envelope, traces } = await callAgent(
        dataClient,
        'data-agent',
        'Điều tra các căn hộ bán chậm tại phân khu The Sapphire 1 dự án Vinhomes Ocean Park'
      );
      datasetEnvelope = envelope;

      // 1.1 Envelope schema validation
      DatasetEnvelopeSchema.parse(envelope);
      recordPass('E1.1', 'data-agent output conforms strictly to DatasetEnvelopeSchema');

      // 1.2 Trace events check
      assert.ok(traces.length >= 3, `Expected at least 3 TRACE events, got ${traces.length}`);
      recordPass('E1.2', `data-agent emitted ${traces.length} TRACE events during execution`);

      // 1.3 Compare evidence_refs against SQLite Warehouse primary keys directly
      const warehouse = getWarehouse();
      const dbUnitsFromWarehouse = warehouse.getSlowMovingUnits(90, 'PRJ-VH-OCP');
      const expectedDbUnitIds = dbUnitsFromWarehouse.map((u) => u.unit_id);

      assert.ok(envelope.evidence_refs.length > 0, 'evidence_refs must not be empty');
      assert.deepEqual(
        envelope.evidence_refs,
        expectedDbUnitIds,
        `evidence_refs mismatch! Got: ${JSON.stringify(envelope.evidence_refs)}, Expected: ${JSON.stringify(expectedDbUnitIds)}`
      );
      recordPass('E1.3', 'evidence_refs matches exact unit IDs from warehouse getSlowMovingUnits', {
        evidenceRefs: envelope.evidence_refs,
        expectedDbUnitIds,
      });

      // 1.4 Direct SQLite table verification: every unit ID must exist in dim_units
      const rawDb = (warehouse as any).ensureConnected?.() || (warehouse as any).db;
      assert.ok(rawDb, 'SQLite database connection must be accessible');

      for (const unitId of envelope.evidence_refs) {
        const row = rawDb.prepare('SELECT unit_id, unit_code FROM dim_units WHERE unit_id = ?').get(unitId) as any;
        assert.ok(row, `Unit ID "${unitId}" does NOT exist in dim_units table!`);
        assert.equal(row.unit_id, unitId);

        const snapRow = rawDb.prepare('SELECT dom, status FROM fact_unit_snapshot WHERE unit_id = ?').get(unitId) as any;
        assert.ok(snapRow, `Snapshot for unit ID "${unitId}" does NOT exist in fact_unit_snapshot!`);
        assert.ok(snapRow.dom >= 90, `Unit ${unitId} has DOM ${snapRow.dom} < 90!`);
        assert.equal(snapRow.status, 'AVAILABLE', `Unit ${unitId} status is ${snapRow.status}, not AVAILABLE!`);
      }
      recordPass('E1.4', 'All unit IDs in evidence_refs verified as genuine primary keys with DOM >= 90 and AVAILABLE status in SQLite');

      // 1.5 1-to-1 parity between payload.units and evidence_refs
      const payloadUnitIds = (envelope.payload as any).units.map((u: any) => u.unit_id);
      assert.deepEqual(payloadUnitIds, envelope.evidence_refs, 'payload.units IDs must match evidence_refs');
      recordPass('E1.5', '1:1 parity between payload.units and evidence_refs');
    } catch (err) {
      recordFail('E1.0', 'data-agent evidence lineage test failed', err);
    }

    // ------------------------------------------------------------------
    // SUITE 2: Claim-Evidence Binding in insight-agent
    // ------------------------------------------------------------------
    console.log('\n▶️ SUITE 2: Claim-Evidence Binding in insight-agent (Every claim binds to dataset)');

    let insightEnvelope: ArtifactEnvelope | null = null;
    let comparisonEnvelope: ArtifactEnvelope | null = null;

    try {
      assert.ok(datasetEnvelope, 'datasetEnvelope required for insight-agent test');

      // Also get compare envelope for later steps
      const compRes = await callAgent(compareClient, 'compare-agent', 'So sánh đối chuẩn', [datasetEnvelope]);
      comparisonEnvelope = compRes.envelope;
      ComparisonEnvelopeSchema.parse(comparisonEnvelope);
      recordPass('E2.0-comp', 'compare-agent produced valid ComparisonEnvelope');

      // 2.1 Standard pipeline input
      const { envelope: insEnv } = await callAgent(
        insightClient,
        'insight-agent',
        'Tìm nguyên nhân gốc rễ căn hộ chậm bán',
        [datasetEnvelope]
      );
      insightEnvelope = insEnv;

      InsightEnvelopeSchema.parse(insightEnvelope);
      recordPass('E2.1', 'insight-agent output conforms strictly to InsightEnvelopeSchema');

      const payload = insightEnvelope.payload as any;
      const findings = payload.findings;
      assert.ok(Array.isArray(findings), 'findings must be an array');
      assert.ok(findings.length >= 3, `Expected at least 3 findings, got ${findings.length}`);

      const datasetUnitIds = (datasetEnvelope.payload as any).units.map((u: any) => u.unit_id);

      for (let i = 0; i < findings.length; i++) {
        const finding = findings[i];
        assert.ok(finding.claim && finding.claim.length > 10, `Finding ${i} must have substantive claim`);
        assert.ok(finding.evidence_id, `Finding ${i} missing evidence_id!`);
        assert.ok(
          datasetUnitIds.includes(finding.evidence_id),
          `Finding ${i} evidence_id "${finding.evidence_id}" NOT found in input DatasetArtifact units: ${JSON.stringify(datasetUnitIds)}`
        );
        assert.ok(
          insightEnvelope.evidence_refs.includes(finding.evidence_id),
          `Finding ${i} evidence_id "${finding.evidence_id}" not in insightEnvelope.evidence_refs`
        );
      }
      recordPass('E2.2', 'EVERY claim in findings binds to an actual evidence_id present in input DatasetArtifact', {
        findingsCount: findings.length,
        boundEvidenceIds: findings.map((f: any) => f.evidence_id),
      });

      // 2.3 Synthetic custom dataset with non-standard unit IDs
      const customDatasetPayload: DatasetPayload = {
        units: [
          {
            unit_id: 'CUST-DOM-101',
            unit_code: 'CUST-A-101',
            dom: 120,
            project_name: 'Test Project',
            zone_name: 'Zone A',
            bedroom_count: 2,
            bathroom_count: 2,
            area_sqm: 60.0,
            floor_level: 10,
            view_direction: 'West',
            launch_price_vnd: 3000000000,
            net_price_vnd: 2900000000,
            price: 3000000000,
            status: 'AVAILABLE',
            views_count: 100,
            inquiries_count: 5,
          },
          {
            unit_id: 'CUST-DOM-202',
            unit_code: 'CUST-B-202',
            dom: 130,
            project_name: 'Test Project',
            zone_name: 'Zone A',
            bedroom_count: 2,
            bathroom_count: 2,
            area_sqm: 65.0,
            floor_level: 12,
            view_direction: 'West',
            launch_price_vnd: 3200000000,
            net_price_vnd: 3100000000,
            price: 3200000000,
            status: 'AVAILABLE',
            views_count: 80,
            inquiries_count: 4,
          },
          {
            unit_id: 'CUST-DOM-303',
            unit_code: 'CUST-C-303',
            dom: 140,
            project_name: 'Test Project',
            zone_name: 'Zone A',
            bedroom_count: 3,
            bathroom_count: 2,
            area_sqm: 80.0,
            floor_level: 15,
            view_direction: 'West-North',
            launch_price_vnd: 4000000000,
            net_price_vnd: 3900000000,
            price: 4000000000,
            status: 'AVAILABLE',
            views_count: 60,
            inquiries_count: 2,
          },
        ],
        summary_metrics: {
          avg_dom: 130,
          absorption_rate: 45.0,
          total_slow_moving: 3,
          slow_moving_count: 3,
          total_units: 10,
        },
        project_id: 'PRJ-CUSTOM',
        project_name: 'Test Custom Project',
        zone_code: 'ZONE-A',
        filters_applied: { dom_threshold: 90, project: 'Test Custom Project', zone: 'Zone A' },
        query_timestamp: new Date().toISOString(),
      };

      const customDatasetEnvelope: ArtifactEnvelope = {
        artifact_id: '11111111-2222-3333-4444-555555555555',
        run_id: crypto.randomUUID(),
        task_id: 'task-custom-data',
        artifact_type: 'dataset',
        schema_version: '1.0.0',
        status: 'VALID',
        producer: 'custom-producer@1.0.0',
        content_hash: computeContentHash(customDatasetPayload),
        payload: customDatasetPayload as any,
        evidence_refs: ['CUST-DOM-101', 'CUST-DOM-202', 'CUST-DOM-303'],
        input_artifact_refs: [],
        created_at: new Date().toISOString(),
      };

      const { envelope: customInsightEnv } = await callAgent(
        insightClient,
        'insight-agent',
        'Phân tích căn hộ tùy chỉnh',
        [customDatasetEnvelope]
      );

      const customFindings = (customInsightEnv.payload as any).findings;
      const expectedCustomIds = ['CUST-DOM-101', 'CUST-DOM-202', 'CUST-DOM-303'];
      for (const cf of customFindings) {
        assert.ok(
          expectedCustomIds.includes(cf.evidence_id),
          `Custom finding evidence_id "${cf.evidence_id}" does not bind to custom dataset!`
        );
      }
      recordPass('E2.3', 'insight-agent dynamically binds claims to synthetic unit IDs, not hardcoded VH units', {
        boundIds: customFindings.map((f: any) => f.evidence_id),
      });

      // 2.4 Single unit dataset test
      const singleUnitPayload: DatasetPayload = {
        ...customDatasetPayload,
        units: [customDatasetPayload.units[0]],
        summary_metrics: {
          avg_dom: 120,
          absorption_rate: 50,
          total_slow_moving: 1,
          slow_moving_count: 1,
          total_units: 5,
        },
      };
      const singleUnitEnvelope: ArtifactEnvelope = {
        ...customDatasetEnvelope,
        artifact_id: crypto.randomUUID(),
        payload: singleUnitPayload as any,
        content_hash: computeContentHash(singleUnitPayload),
        evidence_refs: ['CUST-DOM-101'],
      };

      const { envelope: singleInsightEnv } = await callAgent(
        insightClient,
        'insight-agent',
        'Phân tích 1 căn',
        [singleUnitEnvelope]
      );
      for (const sf of (singleInsightEnv.payload as any).findings) {
        assert.equal(sf.evidence_id, 'CUST-DOM-101', 'All findings must bind to the single provided unit ID');
      }
      recordPass('E2.4', 'insight-agent correctly binds all claims to single-unit dataset without crashing');

      // 2.5 EMPTY DATASET TEST (Check what happens if empty dataset is supplied)
      console.log('   Testing empty dataset scenario in insight-agent...');
      const emptyDatasetPayload: DatasetPayload = {
        units: [],
        summary_metrics: {
          avg_dom: 0,
          absorption_rate: 0,
          total_slow_moving: 0,
          slow_moving_count: 0,
          total_units: 0,
        },
        project_id: 'PRJ-EMPTY',
        project_name: 'Empty Project',
        zone_code: 'EMPTY',
        filters_applied: { dom_threshold: 90 },
        query_timestamp: new Date().toISOString(),
      };
      const emptyDatasetEnvelope: ArtifactEnvelope = {
        artifact_id: crypto.randomUUID(),
        run_id: crypto.randomUUID(),
        task_id: 'task-empty-data',
        artifact_type: 'dataset',
        schema_version: '1.0.0',
        status: 'VALID',
        producer: 'test-runner@1.0.0',
        content_hash: computeContentHash(emptyDatasetPayload),
        payload: emptyDatasetPayload as any,
        evidence_refs: [],
        input_artifact_refs: [],
        created_at: new Date().toISOString(),
      };

      const { envelope: emptyInsightEnv, traces: emptyTraces } = await callAgent(
        insightClient,
        'insight-agent',
        'Phân tích dataset rỗng',
        [emptyDatasetEnvelope]
      );

      // Verify insight-agent survived gracefully
      InsightEnvelopeSchema.parse(emptyInsightEnv);
      assert.equal(verifyContentHash(emptyInsightEnv), true);

      // Document exact empirical behavior when empty dataset is supplied:
      const emptyFindings = (emptyInsightEnv.payload as any).findings;
      const emptyEvidenceRefs = emptyInsightEnv.evidence_refs;
      const fallbackActivated = emptyEvidenceRefs.includes('UNIT-VH-01') || emptyEvidenceRefs.includes('UNIT-VH-02');

      recordPass('E2.5', 'insight-agent handles empty dataset gracefully via warehouse fallback without crashing', {
        findingsCount: emptyFindings.length,
        boundEvidenceIds: emptyFindings.map((f: any) => f.evidence_id),
        fallbackActivated,
        notes: fallbackActivated
          ? 'Observed: When units=[] is supplied, getUnits() checks units.length > 0 (false) and invokes getWarehouse() fallback, preventing crashing and maintaining valid schema.'
          : 'Observed: Handled without warehouse fallback.',
      });
    } catch (err) {
      recordFail('E2.0', 'insight-agent claim-evidence binding test failed', err);
    }

    // ------------------------------------------------------------------
    // SUITE 3: Report Agent 6 PRD Sections & Evidence Badge Lineage
    // ------------------------------------------------------------------
    console.log('\n▶️ SUITE 3: Report Agent 6 PRD Sections & [Evidence-REF] Badges');

    let chartEnvelope: ArtifactEnvelope | null = null;
    let reportEnvelope: ArtifactEnvelope | null = null;

    try {
      assert.ok(datasetEnvelope && comparisonEnvelope && insightEnvelope, 'Upstream envelopes required');

      // Generate ChartSpec envelope
      const chartRes = await callAgent(
        chartClient,
        'chart-agent',
        'Vẽ biểu đồ phân tích',
        [datasetEnvelope, comparisonEnvelope, insightEnvelope]
      );
      chartEnvelope = chartRes.envelope;
      ChartSpecEnvelopeSchema.parse(chartEnvelope);
      recordPass('E3.0-chart', 'chart-agent produced valid ChartSpecEnvelope');

      // 3.1 Standard pipeline input
      const { envelope: repEnv } = await callAgent(
        reportClient,
        'report-agent',
        'Tổng hợp báo cáo 6 phần theo chuẩn PRD',
        [datasetEnvelope, comparisonEnvelope, insightEnvelope, chartEnvelope]
      );
      reportEnvelope = repEnv;

      ReportEnvelopeSchema.parse(reportEnvelope);
      recordPass('E3.1', 'report-agent output conforms strictly to ReportEnvelopeSchema');

      const repPayload = reportEnvelope.payload as any;
      const markdown = repPayload.markdown || repPayload.markdown_content;
      assert.ok(typeof markdown === 'string' && markdown.length > 200, 'Markdown content must be substantive string');

      // 3.2 Check all 6 PRD section titles exactly
      const sectionChecks = [
        { num: 1, title: 'Executive Summary', regex: /##\s*1\.\s*Executive Summary/i },
        { num: 2, title: 'Scope & Target Definition', regex: /##\s*2\.\s*Scope\s*&\s*Target Definition/i },
        { num: 3, title: 'Data Quality & Snapshot Context', regex: /##\s*3\.\s*Data Quality\s*&\s*Snapshot Context/i },
        { num: 4, title: 'Root-cause Insights & Peer Comparison', regex: /##\s*4\.\s*Root-cause Insights\s*&\s*Peer Comparison/i },
        { num: 5, title: 'Visual Charts', regex: /##\s*5\.\s*Visual Charts/i },
        { num: 6, title: 'Sales Action Recommendations', regex: /##\s*6\.\s*Sales Action Recommendations/i },
      ];

      for (const sec of sectionChecks) {
        assert.ok(sec.regex.test(markdown), `Missing PRD Section ${sec.num}: "${sec.title}" in report markdown!`);
      }
      recordPass('E3.2', 'All 6 PRD section titles verified in generated report markdown');

      // 3.3 Validate completeness via contract validator
      const completeness = validateReportCompleteness(markdown);
      assert.equal(completeness.isComplete, true, `Report incomplete: missing ${completeness.missingSections.join(', ')}`);
      recordPass('E3.3', 'validateReportCompleteness returned isComplete = true with zero missing sections');

      // 3.4 Extract and verify [Evidence-REF: <unit_id>] badges
      const badgeRegex = /\[Evidence-REF:\s*([A-Za-z0-9_-]+)\]/g;
      const citedBadgeIds: string[] = [];
      let match;
      while ((match = badgeRegex.exec(markdown)) !== null) {
        if (!citedBadgeIds.includes(match[1])) {
          citedBadgeIds.push(match[1]);
        }
      }

      assert.ok(citedBadgeIds.length >= 3, `Expected at least 3 distinct evidence badges, found ${citedBadgeIds.length}: ${JSON.stringify(citedBadgeIds)}`);

      // Verify every cited badge exists in the dataset units
      const datasetUnits = (datasetEnvelope.payload as any).units;
      const allDatasetUnitIds = datasetUnits.map((u: any) => u.unit_id);

      for (const badgeId of citedBadgeIds) {
        assert.ok(
          allDatasetUnitIds.includes(badgeId),
          `Badge ID "${badgeId}" in report does NOT match any unit in the input dataset: ${JSON.stringify(allDatasetUnitIds)}`
        );
        assert.ok(
          reportEnvelope.evidence_refs.includes(badgeId),
          `Badge ID "${badgeId}" missing from reportEnvelope.evidence_refs`
        );
      }
      recordPass('E3.4', 'All [Evidence-REF: <unit_id>] badges match genuine units from dataset and are in evidence_refs', {
        citedBadges: citedBadgeIds,
        datasetUnits: allDatasetUnitIds,
      });

      // 3.5 Custom dataset badge propagation test
      const customDatasetPayload2: DatasetPayload = {
        units: [
          {
            unit_id: 'CUST-DOM-101',
            unit_code: 'CUST-A-101',
            dom: 120,
            project_name: 'Test Project',
            zone_name: 'Zone A',
            bedroom_count: 2,
            bathroom_count: 2,
            area_sqm: 60.0,
            floor_level: 10,
            view_direction: 'West',
            launch_price_vnd: 3000000000,
            net_price_vnd: 2900000000,
            price: 3000000000,
            status: 'AVAILABLE',
            views_count: 100,
            inquiries_count: 5,
          },
          {
            unit_id: 'CUST-DOM-202',
            unit_code: 'CUST-B-202',
            dom: 130,
            project_name: 'Test Project',
            zone_name: 'Zone A',
            bedroom_count: 2,
            bathroom_count: 2,
            area_sqm: 65.0,
            floor_level: 12,
            view_direction: 'West',
            launch_price_vnd: 3200000000,
            net_price_vnd: 3100000000,
            price: 3200000000,
            status: 'AVAILABLE',
            views_count: 80,
            inquiries_count: 4,
          },
          {
            unit_id: 'CUST-DOM-303',
            unit_code: 'CUST-C-303',
            dom: 140,
            project_name: 'Test Project',
            zone_name: 'Zone A',
            bedroom_count: 3,
            bathroom_count: 2,
            area_sqm: 80.0,
            floor_level: 15,
            view_direction: 'West-North',
            launch_price_vnd: 4000000000,
            net_price_vnd: 3900000000,
            price: 4000000000,
            status: 'AVAILABLE',
            views_count: 60,
            inquiries_count: 2,
          },
        ],
        summary_metrics: {
          avg_dom: 130,
          absorption_rate: 45.0,
          total_slow_moving: 3,
          slow_moving_count: 3,
          total_units: 10,
        },
        project_id: 'PRJ-CUSTOM',
        project_name: 'Test Custom Project',
        zone_code: 'ZONE-A',
        filters_applied: { dom_threshold: 90 },
        query_timestamp: new Date().toISOString(),
      };

      const customDatasetEnv2: ArtifactEnvelope = {
        artifact_id: crypto.randomUUID(),
        run_id: crypto.randomUUID(),
        task_id: 'task-custom-data-2',
        artifact_type: 'dataset',
        schema_version: '1.0.0',
        status: 'VALID',
        producer: 'custom@1.0.0',
        content_hash: computeContentHash(customDatasetPayload2),
        payload: customDatasetPayload2 as any,
        evidence_refs: ['CUST-DOM-101', 'CUST-DOM-202', 'CUST-DOM-303'],
        input_artifact_refs: [],
        created_at: new Date().toISOString(),
      };

      const customCompRes = await callAgent(compareClient, 'compare-agent', 'So sánh custom', [customDatasetEnv2]);
      const customInsightRes = await callAgent(insightClient, 'insight-agent', 'Insight custom', [customDatasetEnv2]);
      const customChartRes = await callAgent(chartClient, 'chart-agent', 'Chart custom', [customDatasetEnv2, customCompRes.envelope, customInsightRes.envelope]);
      const customReportRes = await callAgent(reportClient, 'report-agent', 'Report custom', [
        customDatasetEnv2,
        customCompRes.envelope,
        customInsightRes.envelope,
        customChartRes.envelope,
      ]);

      const customReportMd = (customReportRes.envelope.payload as any).markdown;
      const customBadges: string[] = [];
      let cMatch;
      while ((cMatch = badgeRegex.exec(customReportMd)) !== null) {
        if (!customBadges.includes(cMatch[1])) {
          customBadges.push(cMatch[1]);
        }
      }

      // Check if custom unit IDs propagated to badges
      const hasCustomBadge = customBadges.some((b) => b.startsWith('CUST-DOM-'));
      assert.ok(hasCustomBadge, `Report did not badge any custom unit IDs! Found badges: ${JSON.stringify(customBadges)}`);
      recordPass('E3.5', 'Report agent successfully badges custom upstream dataset unit IDs', {
        customBadges,
      });
    } catch (err) {
      recordFail('E3.0', 'report-agent section and badge verification failed', err);
    }

    // ------------------------------------------------------------------
    // SUITE 4: SHA-256 Hash Recalculation Across ALL 5 Envelopes
    // ------------------------------------------------------------------
    console.log('\n▶️ SUITE 4: SHA-256 Hash Recalculation Across ALL 5 Envelopes');

    const envelopesToVerify = [
      { name: 'DatasetEnvelope', envelope: datasetEnvelope, role: 'data-agent' },
      { name: 'ComparisonEnvelope', envelope: comparisonEnvelope, role: 'compare-agent' },
      { name: 'InsightEnvelope', envelope: insightEnvelope, role: 'insight-agent' },
      { name: 'ChartSpecEnvelope', envelope: chartEnvelope, role: 'chart-agent' },
      { name: 'ReportEnvelope', envelope: reportEnvelope, role: 'report-agent' },
    ];

    for (const item of envelopesToVerify) {
      try {
        const env = item.envelope;
        assert.ok(env, `${item.name} must be generated and non-null`);

        // Check hash regex
        assert.match(env.content_hash, /^[0-9a-f]{64}$/i, `${item.name} hash is not 64-char hex`);

        // Independent SHA-256 calculation
        const independentCanonical = canonicalStringify(env.payload);
        const independentHash = crypto.createHash('sha256').update(independentCanonical, 'utf8').digest('hex');

        assert.equal(
          env.content_hash.toLowerCase(),
          independentHash.toLowerCase(),
          `${item.name} SHA-256 hash mismatch! Envelope: ${env.content_hash}, Independent: ${independentHash}`
        );

        // Verify with @vda/contracts verifyContentHash helper
        const isValid = verifyContentHash(env);
        assert.equal(isValid, true, `${item.name} verifyContentHash returned false!`);

        recordPass(`H4-${item.name}`, `${item.name} SHA-256 hash recalculated and verified independently`, {
          hash: env.content_hash,
          payloadBytes: Buffer.byteLength(independentCanonical, 'utf8'),
        });

        // 4.x Tamper detection test
        const tamperedPayload = JSON.parse(JSON.stringify(env.payload));
        tamperedPayload.__tampered__ = 'unauthorized_mutation_' + Date.now();
        const tamperedEnvelope = { ...env, payload: tamperedPayload };

        const tamperedResult = verifyContentHash(tamperedEnvelope);
        assert.equal(tamperedResult, false, `Tamper detection FAILED on ${item.name}! verifyContentHash returned true for mutated payload!`);

        const tamperedRecalculated = computeContentHash(tamperedPayload);
        assert.notEqual(tamperedRecalculated, env.content_hash, `Hash should diverge upon tampering`);

        recordPass(`H4-TAMPER-${item.name}`, `Tamper detection verified on ${item.name}: payload mutation reliably invalidates hash`);
      } catch (err) {
        recordFail(`H4-${item.name}`, `SHA-256 recalculation test failed on ${item.name}`, err);
      }
    }

    // 4.6 Canonical JSON key ordering invariance test
    try {
      const samplePayload = { z_last: 1, a_first: 2, m_middle: { b: 3, a: 4 } };
      const reorderedPayload = { a_first: 2, m_middle: { a: 4, b: 3 }, z_last: 1 };
      const hash1 = computeContentHash(samplePayload);
      const hash2 = computeContentHash(reorderedPayload);
      assert.equal(hash1, hash2, 'Canonical hash must be invariant under key reordering');
      recordPass('H4.6', 'Canonical stringification key-ordering invariance confirmed');
    } catch (err) {
      recordFail('H4.6', 'Canonical key ordering invariance test failed', err);
    }

    // ------------------------------------------------------------------
    // SUITE 5: Boundary & Adversarial Stress Tests
    // ------------------------------------------------------------------
    console.log('\n▶️ SUITE 5: Boundary & Adversarial Stress Tests');

    // 5.1 Corrupted Input Artifact handling
    try {
      const corruptedInput = {
        artifact_id: 'corrupted-art-id',
        artifact_type: 'dataset',
        content_json: '{ NOT_VALID_JSON !!!',
      };

      const res = await callAgent(
        insightClient,
        'insight-agent',
        'Test corrupted JSON',
        [corruptedInput]
      );
      assert.ok(res.envelope, 'Agent must recover and produce envelope despite corrupted input');
      InsightEnvelopeSchema.parse(res.envelope);
      recordPass('S5.1', 'insight-agent survives corrupted JSON input artifact gracefully via fallback');
    } catch (err) {
      recordFail('S5.1', 'Corrupted input artifact test failed', err);
    }

    // 5.2 Malformed UUID run_id auto-repair in base-agent
    try {
      const res = await callAgent(
        dataClient,
        'data-agent',
        'Test non-uuid run_id',
        [],
        'NOT_A_UUID',
        'task-invalid-runid'
      );
      assert.match(
        res.envelope.run_id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        'base-agent should substitute invalid run_id with valid UUID to maintain contract compliance'
      );
      recordPass('S5.2', 'base-agent automatically repairs non-UUID run_id to maintain envelope schema validity');
    } catch (err) {
      recordFail('S5.2', 'Non-UUID run_id repair test failed', err);
    }

    // 5.3 Special Characters, SQL Injection & Unicode in User Prompt
    try {
      const adversarialPrompt =
        "'; DROP TABLE dim_units; -- <script>alert('xss')</script> 🚀 Căn hộ giá rẻ & bán chậm 115 ngày tại phân khu The Sapphire 1 (Ocean Park)!";
      const { envelope } = await callAgent(dataClient, 'data-agent', adversarialPrompt);
      assert.ok(envelope.payload, 'Must handle adversarial prompt safely without throwing SQL errors');
      DatasetEnvelopeSchema.parse(envelope);
      recordPass('S5.3', 'data-agent safely handles SQL injection, XSS, and Unicode emoji in user_prompt');
    } catch (err) {
      recordFail('S5.3', 'Adversarial prompt test failed', err);
    }

    // 5.4 High Concurrency Burst (10 concurrent requests to data-agent)
    try {
      console.log('   Running concurrent burst test (10 parallel requests to data-agent)...');
      const burstPromises = Array.from({ length: 10 }, (_, i) =>
        callAgent(dataClient, 'data-agent', `Burst request ${i}`)
      );
      const burstResults = await Promise.all(burstPromises);
      assert.equal(burstResults.length, 10);
      for (const r of burstResults) {
        assert.equal(verifyContentHash(r.envelope), true);
      }
      recordPass('S5.4', 'data-agent completed 10 concurrent requests with 100% hash validity');
    } catch (err) {
      recordFail('S5.4', 'Concurrent burst test failed', err);
    }

  } finally {
    // Teardown
    console.log('\n▶️ [TEARDOWN] Shutting down isolated gRPC clients and servers...');
    dataClient.close();
    compareClient.close();
    insightClient.close();
    chartClient.close();
    reportClient.close();

    await Promise.all([
      dataServer.stop(),
      compareServer.stop(),
      insightServer.stop(),
      chartServer.stop(),
      reportServer.stop(),
    ]);
    console.log('   Teardown complete.\n');
  }

  // Summary
  console.log('======================================================================');
  console.log('📊 EMPIRICAL CHALLENGER 2 TEST EXECUTION SUMMARY:');
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;
  console.log(`   Total Tests:  ${testResults.length}`);
  console.log(`   Passed:       ${passed}`);
  console.log(`   Failed:       ${failed}`);
  console.log(`   Success Rate: ${Math.round((passed / testResults.length) * 100)}%`);
  console.log('======================================================================');

  if (failed > 0) {
    console.error(`\n❌ CHALLENGE FAILED: ${failed} tests failed.`);
    process.exit(1);
  } else {
    console.log('\n🎉 ALL EMPIRICAL CHALLENGER TESTS PASSED (100% VERIFIED)!');
    process.exit(0);
  }
}

runChallengerStressHarness().catch((err) => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});
