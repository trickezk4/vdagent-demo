/**
 * apps/gateway/src/registry.ts
 * Agent Registry managing static core agents and dynamic hot-plugged agents.
 */

export interface RegisteredAgent {
  agent_id: string;
  grpc_target: string;
  domain: string;
  description: string;
  supported_intents: string[];
  is_dynamic: boolean;
  status: 'HEALTHY' | 'UNAVAILABLE' | 'INITIALIZING';
  registered_at: string;
}

export interface RegisterAgentPayload {
  agent_id: string;
  grpc_target: string;
  domain: string;
  description: string;
  supported_intents: string[];
}

export class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();

  constructor() {
    this.initDefaultCoreAgents();
  }

  private initDefaultCoreAgents(): void {
    const defaults: RegisterAgentPayload[] = [
      {
        agent_id: 'data-agent',
        grpc_target: 'localhost:50051',
        domain: 'real_estate_data',
        description: 'Truy vấn mock data warehouse BĐS và trích xuất dữ liệu căn hộ bán chậm (DOM > 90)',
        supported_intents: ['investigate_slow_moving', 'data_lookup'],
      },
      {
        agent_id: 'compare-agent',
        grpc_target: 'localhost:50052',
        domain: 'real_estate_benchmark',
        description: 'So sánh và đối chuẩn peer group thị trường BĐS',
        supported_intents: ['peer_comparison', 'market_benchmark'],
      },
      {
        agent_id: 'insight-agent',
        grpc_target: 'localhost:50053',
        domain: 'real_estate_insight',
        description: 'Phân tích nguyên nhân gốc rễ (Root Cause) gắn liền với bằng chứng evidence_id',
        supported_intents: ['root_cause_analysis', 'evidence_mining'],
      },
      {
        agent_id: 'chart-agent',
        grpc_target: 'localhost:50054',
        domain: 'data_visualization',
        description: 'Sinh cấu hình biểu đồ Recharts (Bar/Scatter) trực quan hóa DOM và giá',
        supported_intents: ['chart_generation', 'visualize_metrics'],
      },
      {
        agent_id: 'report-agent',
        grpc_target: 'localhost:50055',
        domain: 'report_generation',
        description: 'Tổng hợp báo cáo 6 phần theo chuẩn PRD với liên kết bằng chứng hoàn chỉnh',
        supported_intents: ['report_synthesis', 'action_recommendations'],
      },
    ];

    for (const def of defaults) {
      this.agents.set(def.agent_id, {
        ...def,
        is_dynamic: false,
        status: 'HEALTHY',
        registered_at: new Date().toISOString(),
      });
    }
  }

  public register(payload: RegisterAgentPayload, isDynamic = true): RegisteredAgent {
    const agent: RegisteredAgent = {
      ...payload,
      is_dynamic: isDynamic,
      status: 'HEALTHY',
      registered_at: new Date().toISOString(),
    };
    this.agents.set(payload.agent_id, agent);
    return agent;
  }

  public get(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  public getAll(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  public has(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  public updateStatus(agentId: string, status: RegisteredAgent['status']): void {
    const existing = this.agents.get(agentId);
    if (existing) {
      existing.status = status;
    }
  }

  public findAgentForIntent(intent: string): RegisteredAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.supported_intents.includes(intent)) {
        return agent;
      }
    }
    return undefined;
  }
}

export const registry = new AgentRegistry();
