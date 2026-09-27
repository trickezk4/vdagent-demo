/**
 * apps/gateway/src/grpc-hub.ts
 * Manages gRPC connection pool to core and dynamic sub-agents.
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StepExecutionRequest {
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

export interface StepStreamEvent {
  type: string | number;
  message: string;
  output_artifact_json: string;
}

export class GrpcHub {
  private clientPool: Map<string, any> = new Map();
  private targets: Map<string, string> = new Map();
  private subAgentClientConstructor: any = null;

  constructor() {
    this.initProto();
    this.initDefaultTargets();
  }

  private resolveProtoPath(): string {
    const candidates = [
      path.resolve(process.cwd(), 'proto/agent_pipeline.proto'),
      path.resolve(__dirname, '../../../proto/agent_pipeline.proto'),
      path.resolve(__dirname, '../../proto/agent_pipeline.proto'),
      path.resolve(__dirname, '../proto/agent_pipeline.proto'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }
    throw new Error(`Unable to locate agent_pipeline.proto in candidate paths: ${candidates.join(', ')}`);
  }

  private initProto(): void {
    const protoPath = this.resolveProtoPath();
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
    this.subAgentClientConstructor = protoDescriptor.vda?.agent?.v1?.SubAgentService;

    if (!this.subAgentClientConstructor) {
      throw new Error('Failed to resolve vda.agent.v1.SubAgentService from proto definition');
    }
  }

  private initDefaultTargets(): void {
    this.targets.set('data-agent', 'localhost:50051');
    this.targets.set('compare-agent', 'localhost:50052');
    this.targets.set('insight-agent', 'localhost:50053');
    this.targets.set('chart-agent', 'localhost:50054');
    this.targets.set('report-agent', 'localhost:50055');
  }

  public registerDynamicClient(role: string, target: string): void {
    console.log(`[GrpcHub] Registering dynamic gRPC client: ${role} -> ${target}`);
    // If client existed before, close it first
    if (this.clientPool.has(role)) {
      try {
        this.clientPool.get(role).close();
      } catch {
        // ignore
      }
      this.clientPool.delete(role);
    }
    this.targets.set(role, target);
  }

  public getClient(role: string): any {
    if (this.clientPool.has(role)) {
      return this.clientPool.get(role);
    }

    const target = this.targets.get(role);
    if (!target) {
      throw new Error(`Target gRPC address not found for role: ${role}`);
    }

    const client = new this.subAgentClientConstructor(
      target,
      grpc.credentials.createInsecure(),
      {
        'grpc.keepalive_time_ms': 10000,
        'grpc.keepalive_timeout_ms': 5000,
        'grpc.max_receive_message_length': 10 * 1024 * 1024,
        'grpc.max_send_message_length': 10 * 1024 * 1024,
      }
    );

    this.clientPool.set(role, client);
    return client;
  }

  public async checkHealth(role: string): Promise<{ is_healthy: boolean; status_message: string }> {
    const client = this.getClient(role);
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + 3000);
      client.CheckHealth({}, { deadline }, (err: any, response: any) => {
        if (err) {
          return reject(err);
        }
        resolve({
          is_healthy: Boolean(response?.is_healthy),
          status_message: response?.status_message || '',
        });
      });
    });
  }

  public executeStep(
    role: string,
    request: StepExecutionRequest,
    onEvent: (event: StepStreamEvent) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const client = this.getClient(role);
      const call = client.ExecuteStep(request);
      let completeArtifactJson = '';

      call.on('data', (chunk: any) => {
        const event: StepStreamEvent = {
          type: chunk.type,
          message: chunk.message || '',
          output_artifact_json: chunk.output_artifact_json || '',
        };
        onEvent(event);
        if (chunk.type === 'COMPLETE' || chunk.type === 2) {
          completeArtifactJson = chunk.output_artifact_json;
        }
      });

      call.on('error', (err: any) => {
        reject(err);
      });

      call.on('end', () => {
        resolve(completeArtifactJson);
      });
    });
  }

  public closeAll(): void {
    for (const [role, client] of this.clientPool.entries()) {
      try {
        client.close();
      } catch {
        // ignore
      }
    }
    this.clientPool.clear();
  }
}

export const grpcHub = new GrpcHub();
