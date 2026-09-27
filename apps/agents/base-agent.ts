/**
 * apps/agents/base-agent.ts
 * Reusable gRPC Sub-Agent Server Runner for VDaAgent PoC
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import {
  type ArtifactEnvelope,
  createArtifactEnvelope,
  validateEnvelope,
  computeContentHash,
  type ArtifactType,
} from '@vda/contracts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StepExecutionRequestProto {
  run_id: string;
  task_id: string;
  session_id: string;
  user_prompt: string;
  agent_role: string;
  input_artifacts: Array<{
    artifact_id: string;
    artifact_type: string;
    content_json: string;
  }>;
  execution_context_json: string;
}

export interface StepStreamEventProto {
  type: 'TRACE' | 'TOKEN' | 'COMPLETE' | 'ERROR' | number;
  message: string;
  output_artifact_json: string;
}

export interface AgentExecutionContext {
  runId: string;
  taskId: string;
  sessionId: string;
  userPrompt: string;
  agentRole: string;
  inputArtifacts: StepExecutionRequestProto['input_artifacts'];
  parsedContext: Record<string, unknown>;
  emitTrace: (message: string) => void;
  emitToken?: (token: string) => void;
  rawRequest: StepExecutionRequestProto;
}

export interface HandlerResult {
  artifact_type: ArtifactType;
  payload: Record<string, unknown>;
  evidence_refs?: string[];
  input_artifact_refs?: string[];
  limitations?: string[];
  producer?: string;
}

export type SubAgentHandler = (
  request: StepExecutionRequestProto,
  context: AgentExecutionContext
) => Promise<HandlerResult | ArtifactEnvelope>;

export interface SubAgentServerOptions {
  role: string;
  port: number;
  handler: SubAgentHandler;
  protoPath?: string;
  host?: string;
}

export interface SubAgentServerInstance {
  server: grpc.Server;
  port: number;
  role: string;
  start: () => Promise<number>;
  stop: () => Promise<void>;
}

/**
 * Resolves proto file path across repo root, local package, or custom path
 */
export function resolveProtoFilePath(customPath?: string): string {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }
  if (process.env.PROTO_PATH && fs.existsSync(process.env.PROTO_PATH)) {
    return process.env.PROTO_PATH;
  }
  const candidatePaths = [
    path.resolve(process.cwd(), 'proto/agent_pipeline.proto'),
    path.resolve(__dirname, '../../proto/agent_pipeline.proto'),
    path.resolve(__dirname, '../../../proto/agent_pipeline.proto'),
    path.resolve(__dirname, '../proto/agent_pipeline.proto'),
  ];
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Unable to locate agent_pipeline.proto. Checked:\n${candidatePaths.join('\n')}`);
}

/**
 * Factory helper creating a standardized, resilient gRPC Sub-Agent microservice
 */
export function createSubAgentServer(options: SubAgentServerOptions): SubAgentServerInstance {
  const { role, port, handler, host = '0.0.0.0' } = options;
  const protoFile = resolveProtoFilePath(options.protoPath);

  const packageDefinition = protoLoader.loadSync(protoFile, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });

  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
  const subAgentService = protoDescriptor.vda?.agent?.v1?.SubAgentService?.service;

  if (!subAgentService) {
    throw new Error('vda.agent.v1.SubAgentService definition not found in loaded proto');
  }

  const server = new grpc.Server({
    'grpc.max_receive_message_length': 10 * 1024 * 1024,
    'grpc.max_send_message_length': 10 * 1024 * 1024,
  });

  server.addService(subAgentService, {
    CheckHealth: (_call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
      callback(null, {
        is_healthy: true,
        status_message: `${role} is healthy and operational on port ${port}`,
      });
    },

    ExecuteStep: async (call: grpc.ServerWritableStream<StepExecutionRequestProto, StepStreamEventProto>) => {
      const request = call.request;
      console.log(`[${role}] ExecuteStep invoked by client for task ${request?.task_id}`);

      const emitTrace = (message: string) => {
        if (!call.destroyed && call.writable) {
          call.write({
            type: 'TRACE',
            message,
            output_artifact_json: '',
          });
        }
      };

      const emitToken = (token: string) => {
        if (!call.destroyed && call.writable) {
          call.write({
            type: 'TOKEN',
            message: token,
            output_artifact_json: '',
          });
        }
      };

      let parsedContext: Record<string, unknown> = {};
      try {
        if (request.execution_context_json) {
          parsedContext = JSON.parse(request.execution_context_json);
        }
      } catch {
        parsedContext = {};
      }

      const isUuid = (val?: string): boolean =>
        Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val));

      const executionContext: AgentExecutionContext = {
        runId: isUuid(request.run_id) ? request.run_id : crypto.randomUUID(),
        taskId: request.task_id || `task-${role}-${Date.now()}`,
        sessionId: request.session_id || 'default-session',
        userPrompt: request.user_prompt || '',
        agentRole: request.agent_role || role,
        inputArtifacts: request.input_artifacts || [],
        parsedContext,
        emitTrace,
        emitToken,
        rawRequest: request,
      };

      try {
        emitTrace(`[${role}] Received execution request for task: ${executionContext.taskId}`);
        const result = await handler(request, executionContext);

        let envelope: ArtifactEnvelope;
        if ('content_hash' in result && 'artifact_id' in result) {
          envelope = result as ArtifactEnvelope;
          if (!envelope.content_hash) {
            envelope.content_hash = computeContentHash(envelope.payload);
          }
          validateEnvelope(envelope);
        } else {
          const hr = result as HandlerResult;
          envelope = createArtifactEnvelope({
            run_id: executionContext.runId,
            task_id: executionContext.taskId,
            artifact_type: hr.artifact_type,
            producer: hr.producer || `${role}@1.0.0`,
            payload: hr.payload,
            evidence_refs: hr.evidence_refs || [],
            input_artifact_refs: hr.input_artifact_refs || request.input_artifacts?.map((a) => a.artifact_id) || [],
            limitations: hr.limitations,
          });
        }

        if (!call.destroyed && call.writable) {
          call.write({
            type: 'COMPLETE',
            message: `[${role}] Execution completed successfully. Artifact ${envelope.artifact_type} produced.`,
            output_artifact_json: JSON.stringify(envelope),
          });
          call.end();
        }
      } catch (err: any) {
        console.error(`[${role}] Execution error:`, err);
        if (!call.destroyed && call.writable) {
          call.write({
            type: 'ERROR',
            message: `[${role}] Error during execution: ${err?.message || String(err)}`,
            output_artifact_json: '',
          });
          call.end();
        }
      }
    },
  });

  return {
    server,
    port,
    role,
    start: () =>
      new Promise<number>((resolve, reject) => {
        server.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
          if (err) {
            reject(err);
          } else if (boundPort <= 0) {
            reject(new Error(`Failed to bind ${role} to ${host}:${port}`));
          } else {
            console.log(`[${role}] gRPC server running at ${host}:${boundPort}`);
            resolve(boundPort);
          }
        });
      }),
    stop: async () => {
      await new Promise<void>((resolve) => {
        server.tryShutdown((err) => {
          if (err) {
            server.forceShutdown();
          }
          resolve();
        });
      });
      // Ensure TCP port is fully unbound and released before resolving
      const startTime = Date.now();
      while (Date.now() - startTime < 3000) {
        const isFree = await new Promise<boolean>((res) => {
          const tester = net.createServer()
            .once('error', () => res(false))
            .once('listening', () => {
              tester.once('close', () => res(true)).close();
            })
            .listen(port, host === '0.0.0.0' ? '0.0.0.0' : host);
        });
        if (isFree) break;
        await new Promise((r) => setTimeout(r, 50));
      }
    },
  };
}
