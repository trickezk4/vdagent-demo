# Project: VDaAgent PoC (Virtual Distributed Analytics Agent)

## Architecture
VDaAgent PoC is a distributed, local-first multi-agent real estate intelligence platform built on Node.js/TypeScript and Python microservices communicating over gRPC / Protocol Buffers, orchestrated by an API Gateway (Hono) on port 3000, and controlled via a React 19 + Vite + Tailwind CSS web interface on port 5173.

### Network Topology & Port Map
- `apps/web`: Port 5173 (HTTP / React 19 Frontend)
- `apps/gateway`: Port 3000 (HTTP / SSE / Dynamic Intent Router / DAG Orchestrator / gRPC Client Hub)
- `apps/agents/data-agent`: Port 50051 (gRPC SubAgentService)
- `apps/agents/compare-agent`: Port 50052 (gRPC SubAgentService)
- `apps/agents/insight-agent`: Port 50053 (gRPC SubAgentService)
- `apps/agents/chart-agent`: Port 50054 (gRPC SubAgentService)
- `apps/agents/report-agent`: Port 50055 (gRPC SubAgentService)
- `external-agents/python-finance-agent`: Port 50056 (gRPC SubAgentService, Dynamic Hot-Plug)

### Data Flow
1. User submits prompt via Web UI or HTTP/SSE client.
2. Gateway inspects intent:
   - If Financial intent and Agent 7 is registered: routes directly to Python Finance Agent (:50056).
   - If Real Estate Investigation intent: routes to 4-stage DAG Orchestrator.
3. DAG Orchestrator:
   - Step 1: `data-agent` (:50051) queries `mock-warehouse` for slow-moving units (DOM > 90) -> `DatasetArtifact`.
   - Step 2 (Parallel): `Promise.all([compare-agent (:50052), insight-agent (:50053)])` -> `ComparisonArtifact` and `InsightArtifact` (with `evidence_id` links).
   - Step 3: `chart-agent` (:50054) generates Recharts spec -> `ChartSpecArtifact`.
   - Step 4: `report-agent` (:50055) compiles 6-section Markdown report -> `ReportArtifact`.
4. Gateway streams real-time `TRACE` events and completed `ArtifactEnvelope`s to SSE client.
5. Hot-Plugging: Python Finance Agent starts on Port 50056 and registers via `POST /api/v1/agents/register` with zero gateway downtime.

---

## Feature Inventory
| # | Category | Feature ID | Feature | Description | Milestone | Source |
|---|----------|------------|---------|-------------|-----------|--------|
| 1 | Contract | FEAT-C01 | Protobuf Pipeline Definition | `proto/agent_pipeline.proto` with `SubAgentService` (`ExecuteStep`, `CheckHealth`) | M1 | AGENT.md §3.1, REQ R1 |
| 2 | Contract | FEAT-C02 | ArtifactEnvelope Zod Schema | Common envelope schema with UUIDs, status enum, SHA-256 hash, and evidence refs | M1 | AGENT.md §3.2, REQ R1 |
| 3 | Contract | FEAT-C03 | Domain Artifact Schemas | Type schemas for Dataset, Comparison, Insight, ChartSpec, Report, FinancePlan | M1 | AGENT.md §3.2, REQ R1 |
| 4 | Warehouse | FEAT-W01 | 4-Tier Real Estate Schema | SQLite DDL for `Market -> Project -> Zone -> Unit` plus snapshot fact table | M1 | AGENT.md §2, REQ R1 |
| 5 | Warehouse | FEAT-W02 | Seed Data with DOM > 90 | Seed dataset with Vinhomes Ocean Park, Sapphire zone, 10 units, 3 units with DOM = 115 days | M1 | AGENT.md §1.1/§6, REQ R1 |
| 6 | Sub-Agent | FEAT-A01 | Base gRPC Server Runner | Reusable server helper `createSubAgentServer` with health check and streaming handler | M2 | AGENT.md §6 Bước 3 |
| 7 | Sub-Agent | FEAT-A02 | Data Agent Service | Microservice on port 50051 querying warehouse and emitting `DatasetArtifact` | M2 | AGENT.md §4.2, REQ R2 |
| 8 | Sub-Agent | FEAT-A03 | Compare Agent Service | Microservice on port 50052 benchmarking against peer group and emitting `ComparisonArtifact` | M2 | AGENT.md §4.3, REQ R2 |
| 9 | Sub-Agent | FEAT-A04 | Insight Agent Service | Microservice on port 50053 discovering root causes with bound `evidence_id` | M2 | AGENT.md §4.4, REQ R2 |
| 10 | Sub-Agent | FEAT-A05 | Chart Agent Service | Microservice on port 50054 producing Recharts-compliant `ChartSpecArtifact` | M2 | AGENT.md §4.5, REQ R2 |
| 11 | Sub-Agent | FEAT-A06 | Report Agent Service | Microservice on port 50055 producing 6-section Markdown `ReportArtifact` with evidence links | M2 | AGENT.md §4.6, REQ R2 |
| 12 | Reliability | FEAT-R01 | Deterministic Mock LLM Fallback | Automatic fallback to deterministic mock generators upon API failure (HTTP 402/timeout) | M2 | AGENT.md §4, REQ R2 |
| 13 | Gateway | FEAT-G01 | Hono HTTP & SSE Server | Web server on port 3000 handling HTTP requests and SSE streams | M3 | AGENT.md §6 Bước 5, REQ R3 |
| 14 | Gateway | FEAT-G02 | gRPC Hub Connection Pool | Connection manager with static client pool and dynamic registration support | M3 | AGENT.md §6 Bước 5, REQ R3 |
| 15 | Gateway | FEAT-G03 | Dynamic Intent Router | Routes real estate investigation to DAG and banking queries to Python agent | M3 | AGENT.md §4.1, REQ R3 |
| 16 | Gateway | FEAT-G04 | Parallel DAG Orchestrator | Coordinates sequential steps and parallel Step 2 (`Promise.all`), streams TRACE events | M3 | AGENT.md §4.1, REQ R3 |
| 17 | Gateway | FEAT-G05 | Zero-Downtime Hot-Plug Endpoint | `POST /api/v1/agents/register` registering remote agents without restart | M3 | AGENT.md §5, REQ R3 |
| 18 | External | FEAT-P01 | Python Finance Agent Server | Python gRPC service on port 50056 implementing `SubAgentService` | M4 | AGENT.md §5, REQ R4 |
| 19 | External | FEAT-P02 | Python Mortgage Calculation | Pydantic model and formula computing loan payments, interest, and terms | M4 | AGENT.md §5.C, REQ R4 |
| 20 | External | FEAT-P03 | Python Hot-Plug Registration Script | Standalone script calling Gateway registration endpoint via HTTP POST | M4 | AGENT.md §5.D, REQ R4 |
| 21 | UI | FEAT-U01 | Investigation Prompt Bar | User input with pre-canned suggestion chips for RE investigation and finance | M5 | AGENT.md §7, REQ R5 |
| 22 | UI | FEAT-U02 | Agent DAG Pipeline Stepper | Visual stepper showing 5 stages, status spinner, and live thought process from TRACE | M5 | AGENT.md §7, REQ R5 |
| 23 | UI | FEAT-U03 | Recharts Dashboard | Visualizes DOM and price variance from `ChartSpecArtifact` | M5 | AGENT.md §7, REQ R5 |
| 24 | UI | FEAT-U04 | 6-Section Report Viewer | Renders Markdown report with clickable `[Evidence-REF]` badges | M5 | AGENT.md §7, REQ R5 |
| 25 | UI | FEAT-U05 | Hot-Plugging Control Panel | Interactive panel displaying active agents and "Cắm Agent Tài chính" button | M5 | AGENT.md §7, REQ R5 |
| 26 | Testing | FEAT-T01 | Automated E2E Test Suite | 3-stage validation script verifying Core Pipeline, Hot-Plugging, and Polyglot Routing | M6 | AGENT.md §6 Bước 8, REQ R6 |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Contracts & Warehouse Foundation | Monorepo root config, `proto/agent_pipeline.proto`, `packages/contracts` (Zod schemas), `packages/mock-warehouse` (SQLite DDL & seed data) | none | DONE |
| M2 | Core 6-Agent gRPC Services | Base agent server runner, 5 independent microservices (:50051-:50055), OpenRouter + Deterministic Mock Fallback, evidence citations | M1 | IN_PROGRESS |
| M3 | API Gateway & DAG Orchestrator | Hono server (:3000), `grpc-hub`, `dag-orchestrator` (`Promise.all`), `dynamic-router`, SSE stream, hot-plug endpoint `POST /register` | M1, M2 | PLANNED |
| M4 | Python Finance Agent & Hot-Plugging | Standalone Python gRPC service (:50056), protoc stubs, Pydantic mortgage model, registration script, Windows support | M1, M3 | PLANNED |
| M5 | Interactive Web UI Dashboard | React 19 + Vite + Tailwind CSS + Recharts (:5173), Prompt Bar, DAG Stepper, Dashboard, HotPlug Panel | M3, M4 | PLANNED |
| M6 | E2E Integration & Acceptance Verification | Pass 100% of E2E test suite (Tiers 1-4 from `TEST_READY.md`), adversarial hardening (Tier 5), all Acceptance Criteria | M1, M2, M3, M4, M5, TEST_READY.md | PLANNED |

---

## Interface Contracts

### 1. Protobuf Service Contract (`proto/agent_pipeline.proto`)
- **Package**: `vda.agent.v1`
- **Service**: `SubAgentService`
  - `rpc ExecuteStep (StepExecutionRequest) returns (stream StepStreamEvent);`
  - `rpc CheckHealth (HealthRequest) returns (HealthResponse);`
- **Event Types**: `TRACE = 0`, `TOKEN = 1`, `COMPLETE = 2`, `ERROR = 3`.
- In `COMPLETE` event: `output_artifact_json` contains full serialized `ArtifactEnvelope`.

### 2. Envelope Contract (`packages/contracts`)
- Every artifact must validate against `ArtifactEnvelopeSchema`:
  ```typescript
  {
    artifact_id: string (uuid),
    run_id: string (uuid),
    task_id: string,
    artifact_type: 'dataset' | 'comparison' | 'insight' | 'chart_spec' | 'report' | 'finance_plan',
    schema_version: '1.0.0',
    status: 'VALID',
    producer: string,
    content_hash: string (sha256 of canonical JSON payload),
    payload: Record<string, unknown>,
    evidence_refs: string[],
    input_artifact_refs: string[],
    created_at: string (iso8601)
  }
  ```

### 3. Gateway HTTP & SSE Contract (`apps/gateway`)
- `GET /health` -> `{ status: 'OK', services: [...] }`
- `GET /api/v1/agents` -> Array of registered agents with health status and `is_dynamic` flag.
- `POST /api/v1/agents/register` -> Body: `{ agent_id, grpc_target, domain, description, supported_intents }` -> Returns `{ success: true, registered_agent: ... }`.
- `GET /api/v1/chat/stream?prompt=...` -> SSE stream:
  - `event: trace` -> `{ step: string, message: string }`
  - `event: artifact` -> `{ artifact_type: string, envelope: ArtifactEnvelope }`
  - `event: done` -> `{ run_id: string, status: 'SUCCESS' }`
  - `event: error` -> `{ message: string }`

---

## Code Layout
```
vdagent-demo/
├── proto/
│   └── agent_pipeline.proto
├── packages/
│   ├── contracts/
│   │   ├── src/
│   │   │   ├── envelope.ts
│   │   │   ├── artifacts.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── mock-warehouse/
│       ├── src/
│       │   ├── schema.sql
│       │   ├── seed-data.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── apps/
│   ├── gateway/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── grpc-hub.ts
│   │   │   ├── dag-orchestrator.ts
│   │   │   ├── dynamic-router.ts
│   │   │   └── registry.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── agents/
│   │   ├── base-agent.ts
│   │   ├── data-agent/
│   │   ├── compare-agent/
│   │   ├── insight-agent/
│   │   ├── chart-agent/
│   │   └── report-agent/
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   │   ├── AgentStepper.tsx
│       │   │   ├── ChartViewer.tsx
│       │   │   ├── ReportViewer.tsx
│       │   │   └── HotPlugPanel.tsx
│       │   ├── hooks/useAgentSSE.ts
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── package.json
│       └── vite.config.ts
├── external-agents/
│   └── python-finance-agent/
│       ├── proto/
│       ├── src/
│       │   ├── server.py
│       │   ├── models.py
│       │   └── register.py
│       ├── requirements.txt
│       └── run.ps1
├── tests/
│   └── e2e/
├── scripts/
│   └── run-demo-flow.ts
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```
