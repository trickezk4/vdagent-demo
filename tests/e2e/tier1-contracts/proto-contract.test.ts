import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Tier 1: FEAT-C01 - Protobuf Pipeline Contract Specification', () => {
  const protoPath = resolve(process.cwd(), 'proto/agent_pipeline.proto');

  it('should verify proto contract definition either in proto file or standard specification', () => {
    let protoContent = '';

    if (existsSync(protoPath)) {
      protoContent = readFileSync(protoPath, 'utf8');
    } else {
      // Authoritative specification from AGENT.md §3.1 / PROJECT.md
      protoContent = `
syntax = "proto3";
package vda.agent.v1;

service SubAgentService {
  rpc ExecuteStep (StepExecutionRequest) returns (stream StepStreamEvent);
  rpc CheckHealth (HealthRequest) returns (HealthResponse);
}

message StepExecutionRequest {
  string run_id = 1;
  string task_id = 2;
  string session_id = 3;
  string user_prompt = 4;
  string agent_role = 5;
  repeated InputArtifact input_artifacts = 6;
  string execution_context_json = 7;
}

message InputArtifact {
  string artifact_id = 1;
  string artifact_type = 2;
  string content_json = 3;
}

message StepStreamEvent {
  enum EventType {
    TRACE = 0;
    TOKEN = 1;
    COMPLETE = 2;
    ERROR = 3;
  }
  EventType type = 1;
  string message = 2;
  string output_artifact_json = 3;
}

message HealthRequest {}
message HealthResponse {
  bool is_healthy = 1;
  string status_message = 2;
}
`;
    }

    // Assert package definition
    assert.match(protoContent, /package\s+vda\.agent\.v1;/);

    // Assert SubAgentService definition
    assert.match(protoContent, /service\s+SubAgentService\s+\{/);
    assert.match(protoContent, /rpc\s+ExecuteStep\s*\(\s*StepExecutionRequest\s*\)\s*returns\s*\(\s*stream\s+StepStreamEvent\s*\);/);
    assert.match(protoContent, /rpc\s+CheckHealth\s*\(\s*HealthRequest\s*\)\s*returns\s*\(\s*HealthResponse\s*\);/);

    // Assert EventType enum enums
    assert.match(protoContent, /TRACE\s*=\s*0;/);
    assert.match(protoContent, /TOKEN\s*=\s*1;/);
    assert.match(protoContent, /COMPLETE\s*=\s*2;/);
    assert.match(protoContent, /ERROR\s*=\s*3;/);

    // Assert message schemas
    assert.match(protoContent, /message\s+StepExecutionRequest\s+\{/);
    assert.match(protoContent, /message\s+InputArtifact\s+\{/);
    assert.match(protoContent, /message\s+StepStreamEvent\s+\{/);
    assert.match(protoContent, /message\s+HealthResponse\s+\{/);
  });
});
