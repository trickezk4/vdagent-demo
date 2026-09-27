# VDaAgent PoC: Test Infrastructure & Verification Blueprint

- **Document Version**: 1.0.0
- **Status**: Authoritative & Active
- **Target Platform**: Windows (Node.js 22+, Python 3.14+, PowerShell)
- **Scope**: End-to-End, Integration, and Contract Verification for FEAT-C01 through FEAT-T01

---

## 1. Test Philosophy: Opaque-Box & Requirement-Driven

The **VDaAgent PoC** is an evidence-backed distributed multi-agent real estate intelligence system. The test philosophy strictly adheres to the following principles:

1. **Opaque-Box (Black-Box & Gray-Box) Verification**:
   - The test harness interacts with the system exclusively through its public transport and contract interfaces:
     - **gRPC / Protocol Buffers (HTTP/2 TCP)** over localhost ports (50051–50056).
     - **HTTP / Server-Sent Events (SSE)** over localhost port 3000.
     - **Standardized Data Schemas**: `ArtifactEnvelope` contracts, canonical JSON SHA-256 digests, and SQLite warehouse queries.
   - Internal private agent state is not coupled to tests; tests verify observable outcomes, protocol compliance, message ordering, and data immutability.

2. **Zero Hypervisor & Zero External Cloud Dependency**:
   - Despite legacy virtualization naming conventions (`vdagent`), VDaAgent is a **Virtual Distributed Analytics Agent** multi-agent platform running over localhost TCP network sockets. No physical hypervisors (QEMU/KVM), virtio devices, or hypervisor daemons are used.
   - External cloud LLM calls are decoupled from test reliability: each sub-agent implements an automated **Deterministic Mock LLM Fallback** triggered on API errors (HTTP 402 Payment Required, HTTP 429 Rate Limit, network timeout, or absent API keys). Tests run 100% offline, deterministically, and cost-free.

3. **Strict Interface & Data Lineage Invariants**:
   - **Immutability Invariant**: Every `ArtifactEnvelope` produced must carry a valid SHA-256 `content_hash` matching the canonical serialization of its `payload`.
   - **Lineage Invariant**: Every insight finding must reference an `evidence_id` originating from the mock warehouse dataset, which is in turn rendered as a clickable badge `[Evidence-REF: ...]` in the final report.
   - **Zero-Downtime Hot-Plugging**: The API Gateway process PID must remain unchanged when remote agents register via `POST /api/v1/agents/register`.

---

## 2. Feature Inventory Mapping (26 Features: FEAT-C01 to FEAT-T01)

The following matrix authoritatively maps all 26 system features specified in `PROJECT.md` and `AGENT.md` to their verification requirements and oracle sources:

| # | Feature ID | Category | Feature Name | Target Source Files | Protocol / Interface Contract | Primary Verification Oracle & Criteria |
|---|---|---|---|---|---|---|
| 1 | **FEAT-C01** | Contract | Protobuf Pipeline Definition | `proto/agent_pipeline.proto` | gRPC `vda.agent.v1.SubAgentService` (`ExecuteStep`, `CheckHealth`) | Proto loader syntax check; validates RPC methods, message enums (`TRACE=0, TOKEN=1, COMPLETE=2, ERROR=3`), stubs compilation. |
| 2 | **FEAT-C02** | Contract | ArtifactEnvelope Zod Schema | `packages/contracts/src/envelope.ts` | Zod `ArtifactEnvelopeSchema` | Schema validates mandatory fields (`artifact_id`, `run_id`, `task_id`, `artifact_type`, `status`, `producer`, `content_hash`, `payload`, `evidence_refs`, `created_at`). Rejects invalid UUIDs, malformed ISO timestamps, invalid status. |
| 3 | **FEAT-C03** | Contract | Domain Artifact Schemas | `packages/contracts/src/artifacts.ts` | Zod schemas: `Dataset`, `Comparison`, `Insight`, `ChartSpec`, `Report`, `FinancePlan` | Strict schema validation for domain-specific payloads (e.g. `findings` must include `evidence_id`; `chart_spec` must specify `chart_type` and axis configurations). |
| 4 | **FEAT-W01** | Warehouse | 4-Tier Real Estate Schema | `packages/mock-warehouse/src/schema.sql` | SQLite DDL (`dim_markets`, `dim_projects`, `dim_zones`, `dim_units`, `fact_unit_snapshot`) | DDL executes cleanly; creates tables, foreign keys, and indexes matching the 4-tier hierarchy. |
| 5 | **FEAT-W02** | Warehouse | Seed Data with DOM > 90 | `packages/mock-warehouse/src/seed-data.ts` | SQLite tables seeded with 10+ units; Vinhomes Ocean Park Sapphire | Query `SELECT * FROM fact_unit_snapshot WHERE dom > 90` yields at least 3 slow-moving units (e.g., DOM = 115 days) with complete unit attributes. |
| 6 | **FEAT-A01** | Sub-Agent | Base gRPC Server Runner | `apps/agents/base-agent.ts` | gRPC Server factory `createSubAgentServer` | `CheckHealth` RPC returns `{ is_healthy: true }`; `ExecuteStep` RPC streams `TRACE` and `COMPLETE` events according to proto contract. |
| 7 | **FEAT-A02** | Sub-Agent | Data Agent Service | `apps/agents/data-agent/src/index.ts` | Port 50051; `SubAgentService` | Executes DW query, calculates `avg_dom` and `absorption_rate`, produces `dataset` artifact with canonical hash. |
| 8 | **FEAT-A03** | Sub-Agent | Compare Agent Service | `apps/agents/compare-agent/src/index.ts` | Port 50052; `SubAgentService` | Consumes `DatasetArtifact`, benchmarks slow-moving units against peer group ($\pm 10\%$ price/area), produces `comparison` artifact. |
| 9 | **FEAT-A04** | Sub-Agent | Insight Agent Service | `apps/agents/insight-agent/src/index.ts` | Port 50053; `SubAgentService` | Consumes `DatasetArtifact`, identifies root causes (pricing, orientation, loan terms); every finding links to valid `evidence_id`. Produces `insight` artifact. |
| 10 | **FEAT-A05** | Sub-Agent | Chart Agent Service | `apps/agents/chart-agent/src/index.ts` | Port 50054; `SubAgentService` | Consumes comparison and insight artifacts, generates Recharts-compatible `bar` or `scatter` `chart_spec` artifact. |
| 11 | **FEAT-A06** | Sub-Agent | Report Agent Service | `apps/agents/report-agent/src/index.ts` | Port 50055; `SubAgentService` | Aggregates all upstream artifacts into 6-section PRD Markdown report with clickable `[Evidence-REF: ...]` badges. |
| 12 | **FEAT-R01** | Reliability | Deterministic Mock LLM Fallback | `apps/agents/*/fallback.ts` | Sub-agent error interceptor | Upon simulated HTTP 402, 429, timeout, or missing API key, switches to deterministic rule-based generator, producing valid domain artifacts without failure. |
| 13 | **FEAT-G01** | Gateway | Hono HTTP & SSE Server | `apps/gateway/src/index.ts` | Port 3000; HTTP/1.1 REST & SSE | Exposes `GET /health`, `GET /api/v1/agents`, `POST /api/v1/agents/register`, and `GET /api/v1/chat/stream?prompt=...`. |
| 14 | **FEAT-G02** | Gateway | gRPC Hub Connection Pool | `apps/gateway/src/grpc-hub.ts` | `GrpcHub` client manager | Manages channel pool for static ports (50051–50055) and dynamic ports (50056); handles reconnections and connection health. |
| 15 | **FEAT-G03** | Gateway | Dynamic Intent Router | `apps/gateway/src/dynamic-router.ts` | Intent classification & routing engine | Classifies prompt intent: Real estate query -> 4-stage DAG; Banking/Mortgage query -> Python FinanceAgent (when registered). |
| 16 | **FEAT-G04** | Gateway | Parallel DAG Orchestrator | `apps/gateway/src/dag-orchestrator.ts` | DAG coordination engine | Coordinates: Step 1 (Data) -> Step 2 (`Promise.all([Compare, Insight])`) -> Step 3 (Chart) -> Step 4 (Report). Validates concurrent execution timestamps. |
| 17 | **FEAT-G05** | Gateway | Zero-Downtime Hot-Plug Endpoint | `apps/gateway/src/index.ts` | `POST /api/v1/agents/register` | Accepts registration payload, adds client to `GrpcHub`, updates routing table, returns HTTP 200 without restarting Gateway process. |
| 18 | **FEAT-P01** | External | Python Finance Agent Server | `external-agents/python-finance-agent/src/server.py` | Port 50056; gRPC `SubAgentService` | Python gRPC service implementing `CheckHealth` and `ExecuteStep`, streaming `TRACE` and `finance_plan` artifact. |
| 19 | **FEAT-P02** | External | Python Mortgage Calculation | `external-agents/python-finance-agent/src/models.py` | Pydantic `MortgagePlan` model | Accurate monthly installment calculation based on 8.5% interest rate, 20-year term, 70% loan ratio. Pydantic validation passes. |
| 20 | **FEAT-P03** | External | Python Hot-Plug Registration Script | `external-agents/python-finance-agent/src/register.py` | HTTP POST client script | Transmits registration metadata to `http://localhost:3000/api/v1/agents/register`, receives status 200. |
| 21 | **FEAT-U01** | UI | Investigation Prompt Bar | `apps/web/src/components/PromptBar.tsx` | Web Component | Displays input bar with pre-configured suggestion chips for slow-moving investigation and mortgage loan queries. |
| 22 | **FEAT-U02** | UI | Agent DAG Pipeline Stepper | `apps/web/src/components/AgentStepper.tsx` | Web Component | Real-time 5-stage stepper displaying active spinner and live TRACE thought process streamed from SSE. |
| 23 | **FEAT-U03** | UI | Recharts Dashboard | `apps/web/src/components/ChartViewer.tsx` | Recharts rendering | Visualizes DOM distribution and price variance from `ChartSpecArtifact` payload. |
| 24 | **FEAT-U04** | UI | 6-Section Report Viewer | `apps/web/src/components/ReportViewer.tsx` | Markdown renderer | Renders 6 PRD report sections with interactive, styled evidence badges (`[Evidence-REF: UNIT-...]`). |
| 25 | **FEAT-U05** | UI | Hot-Plugging Control Panel | `apps/web/src/components/HotPlugPanel.tsx` | Web Component | Renders active agent status indicators; "Cắm Agent Tài chính" triggers dynamic registration and updates agent list without page reload. |
| 26 | **FEAT-T01** | Testing | Automated E2E Test Suite | `scripts/run-demo-flow.ts` & `tests/e2e/` | E2E CLI test runner (`pnpm test:demo`) | Executes 3-stage validation: Stage 1 (Real estate DAG), Stage 2 (Hot-plug), Stage 3 (Polyglot financial query); exits with code 0. |

---

## 3. Test Architecture & Runner Semantics

### 3.1 Directory Structure (`tests/e2e/`)

```
tests/e2e/
├── fixtures/                         # Test fixtures and schemas
│   ├── sample-envelopes.ts           # Canonical envelope examples for each artifact type
│   └── mock-warehouse-fixture.ts     # In-memory SQLite fixture with 10 units & DOM > 90
├── helpers/                          # Opaque-box testing utilities
│   ├── canonical-json.ts             # Deterministic JSON canonicalization & SHA-256 hash calculator
│   ├── sse-consumer.ts               # Resilient HTTP SSE reader with chunk accumulation & timeout
│   ├── grpc-probe.ts                 # gRPC health probe and client helper using @grpc/grpc-js
│   ├── mock-subagent-server.ts       # Standalone mock gRPC subagent server for boundary testing
│   └── process-manager.ts            # Windows-safe process launcher and process tree terminator
├── tier1-contracts/                  # Tier 1: Core contracts, schemas, warehouse queries
│   ├── proto-contract.test.ts        # FEAT-C01: Protobuf syntax and stub validation
│   ├── envelope-schema.test.ts       # FEAT-C02: Zod envelope validation & schema rejection
│   ├── domain-artifacts.test.ts      # FEAT-C03: Domain artifact structure validation
│   ├── sha256-hash.test.ts           # FEAT-C02, FEAT-R01: Payload immutability & hash verification
│   ├── warehouse-queries.test.ts     # FEAT-W01, FEAT-W02: 4-tier schema & DOM > 90 filtering
│   └── python-mortgage.test.py       # FEAT-P01, FEAT-P02: Python Pydantic mortgage calculation
├── tier2-boundaries/                 # Tier 2: Edge cases, fallbacks, malformed requests
│   ├── empty-warehouse.test.ts       # Empty query results handling without pipeline crash
│   ├── extreme-dom.test.ts           # DOM = 0 and DOM = 2000 arithmetic safety (no NaN/div0)
│   ├── fallback-llm.test.ts          # Deterministic mock fallback on simulated 402/timeout
│   └── malformed-registration.test.ts # Rejection of invalid hot-plug payloads (HTTP 400)
├── tier3-concurrency/                # Tier 3: Concurrency, parallel execution, hot-plug mid-flight
│   ├── dag-parallelism.test.ts       # Validates Compare & Insight run concurrently via Promise.all
│   ├── hotplug-midflight.test.ts     # Hot-plugging Agent 7 while SSE stream is active
│   ├── client-isolation.test.ts      # Multiple concurrent client SSE requests isolation
│   └── evidence-lineage.test.ts      # End-to-end evidence lineage tracking across envelope chain
├── tier4-stress/                     # Tier 4: Workloads, stress, and full demo flow
│   ├── burst-queries.test.ts         # High-frequency sequential query stress test
│   └── demo-flow-runner.test.ts      # 3-stage hero demo validation
├── run-all.ts                        # Master test runner orchestrating all tiers
└── package.json                      # Test harness dependencies and execution scripts
```

### 3.2 Runner Semantics on Windows

1. **Native Node.js 22 Test Runner (`node:test`) & `tsx`**:
   - Tests leverage the Node.js native test runner (`import { describe, it } from 'node:test'`) and native assertion library (`import assert from 'node:assert/strict'`).
   - Execution is powered by `tsx` (or Node 22 native `--experimental-strip-types`), allowing zero-compilation TypeScript execution directly on Windows PowerShell without intermediate build directories.
   - For Python tests, `pytest` is invoked directly with `pytest tests/e2e/tier1-contracts/python-mortgage.test.py`.

2. **Windows Process & Port Management**:
   - Port collisions (especially in Windows `TIME_WAIT` states) are prevented by `process-manager.ts`, which performs pre-flight socket checks and uses `taskkill /pid $PID /T /F` or PowerShell `Stop-Process` to terminate entire child process trees cleanly.
   - Forward and backward slashes in paths are normalized using `path.resolve()` and `path.join()`.

---

## 4. Four-Tier Testing Methodology

### Tier 1: Feature Coverage (Core Contracts & Foundations)
- **Objective**: Verify that fundamental data structures, protocol definitions, and database queries operate according to formal specifications.
- **Scope**:
  - `FEAT-C01`: Validate `proto/agent_pipeline.proto` definitions, method signatures, and message enumerations.
  - `FEAT-C02`: Validate `ArtifactEnvelopeSchema` under Zod: verify acceptance of complete envelopes and rejection of missing fields, invalid UUIDs, bad timestamps, or invalid status enums.
  - `FEAT-C03`: Validate domain schemas (`DatasetArtifact`, `ComparisonArtifact`, `InsightArtifact`, `ChartSpecArtifact`, `ReportArtifact`, `FinancePlanArtifact`).
  - `FEAT-C02` Hash Check: Validate that canonical JSON SHA-256 computation matches `content_hash` exactly.
  - `FEAT-W01` & `FEAT-W02`: Validate SQLite DDL execution, sample data insertion (10+ units at Vinhomes Ocean Park Sapphire), and query `WHERE dom > 90` returning slow-moving units (DOM = 115 days).
  - `FEAT-P01` & `FEAT-P02`: Validate Python Pydantic mortgage model formula: 4.5B VNĐ property, 70% loan, 8.5% interest, 20-year term -> exact monthly installment.

### Tier 2: Boundary & Corner Cases (Resilience & Error Handling)
- **Objective**: Prove the system handles abnormal conditions, missing resources, and adversarial inputs without crashing or returning corrupted state.
- **Scope**:
  - `T2.1 Empty Warehouse Results`: When filtering returns 0 slow-moving units (e.g. `DOM > 999`), verify data agent produces `{ units: [], avg_dom: 0 }` and downstream agents emit valid empty/summary artifacts without throwing exceptions.
  - `T2.2 Extreme Numerical Values`: Boundary testing on DOM = 0, DOM = 2500, property price = 0, or property price = 100B VNĐ. Asserts no `NaN`, `Infinity`, or division-by-zero crashes.
  - `T2.3 LLM Failure Fallback (FEAT-R01)`: Sub-agents encountering API errors (e.g. HTTP 402 Payment Required or timeout) automatically divert to Deterministic Mock LLM, emitting a fallback trace and completing with valid artifacts.
  - `T2.4 Malformed Hot-Plug Registration`: Calling `POST /api/v1/agents/register` with missing `grpc_target`, non-numeric port, or missing `agent_id` returns HTTP 400 Bad Request with descriptive message; Gateway client pool remains pristine.
  - `T2.5 Duplicate Registration`: Calling `POST /api/v1/agents/register` twice with the same `agent_id` updates the client pool idempotently without resource leak or error.

### Tier 3: Pairwise Combinations & Concurrency
- **Objective**: Verify correct timing, orchestration, and state isolation when features interact concurrently.
- **Scope**:
  - `T3.1 Parallel DAG Execution (FEAT-G04)`: Verify that Step 2 of the DAG executes `compare-agent` and `insight-agent` concurrently via `Promise.all`. Verified by asserting that their recorded start and execution intervals overlap.
  - `T3.2 Hot-Plugging Mid-Flight (FEAT-G05)`: Initiate a 6-agent real estate SSE query; while the stream is active, dispatch `POST /api/v1/agents/register` for Agent 7. Asserts:
    1. Active SSE stream completes with 100% integrity.
    2. Hot-plug registration returns HTTP 200.
    3. Dynamic router immediately routes subsequent financial questions to Agent 7.
    4. Gateway process PID remains unchanged throughout.
  - `T3.3 Multi-Client SSE Stream Isolation`: Execute multiple concurrent client streams on `GET /api/v1/chat/stream`; assert distinct `run_id` and zero event interleaving.
  - `T3.4 Evidence Lineage Traceability`: Trace end-to-end evidence flow from SQLite `dim_units.unit_code` -> `DatasetArtifact.units[i].unit_id` -> `InsightArtifact.findings[j].evidence_id` -> `ReportArtifact.payload.markdown` badge `[Evidence-REF: UNIT-...]`.

### Tier 4: Real-World Workloads & Stress
- **Objective**: Validate system behavior under burst traffic, large datasets, and the complete official acceptance demo flow.
- **Scope**:
  - `T4.1 High-Frequency Query Bursts`: 25 consecutive queries to Gateway; assert zero memory leak, zero orphaned TCP sockets, and zero unhandled rejections.
  - `T4.2 High-Density Data Volume`: Mock warehouse seeded with 500 units; assert Protobuf streaming serialization and Recharts spec generation execute within < 2 seconds.
  - `T4.3 Full Demo Flow Automation (FEAT-T01 / pnpm test:demo)`: Automated execution of `scripts/run-demo-flow.ts` covering Stage 1 (6 Core Agents), Stage 2 (Python Hot-Plug), and Stage 3 (Dynamic Intent Routing).

---

## 5. Test Execution Matrix & Commands

| Scope | Test Command | Target Modules | Expected Result |
|---|---|---|---|
| **Tier 1 (Contracts & Schemas)** | `tsx tests/e2e/tier1-contracts/envelope-schema.test.ts` | `packages/contracts` | All schema validations pass; invalid fields rejected |
| **Tier 1 (SHA-256 Immutability)** | `tsx tests/e2e/tier1-contracts/sha256-hash.test.ts` | `packages/contracts` | Canonical JSON SHA-256 match 100% |
| **Tier 1 (Mock Warehouse)** | `tsx tests/e2e/tier1-contracts/warehouse-queries.test.ts` | `packages/mock-warehouse` | 10+ units seeded; DOM > 90 returns >= 3 units |
| **Tier 1 (Protobuf Stubs)** | `tsx tests/e2e/tier1-contracts/proto-contract.test.ts` | `proto/agent_pipeline.proto` | Proto loads dynamically; methods & enums match |
| **Tier 1 (Python Mortgage)** | `pytest tests/e2e/tier1-contracts/python-mortgage.test.py` | `external-agents/python-finance-agent` | Installment computation passes within 1 VNĐ tolerance |
| **Tier 2 (Boundaries & Edge Cases)**| `tsx tests/e2e/tier2-boundaries/empty-warehouse.test.ts` | Gateway & Sub-agents | Graceful handling of empty results & extreme values |
| **Tier 3 (Concurrency & Lineage)** | `tsx tests/e2e/tier3-concurrency/dag-parallelism.test.ts` | Gateway & Sub-agents | Parallel execution intervals overlap |
| **All E2E Tiers** | `tsx tests/e2e/run-all.ts` | All Monorepo packages | 100% test pass rate across all tiers |
| **Hero Acceptance Demo** | `pnpm test:demo` | Full System | Stage 1, 2, 3 complete cleanly with exit code 0 |

---

## 6. Implementation Status & Readiness

- Test harness foundation established at `tests/e2e/`.
- All 26 features (FEAT-C01 through FEAT-T01) mapped with explicit oracle requirements.
- Full Windows support without hypervisor or virtualization dependencies.
