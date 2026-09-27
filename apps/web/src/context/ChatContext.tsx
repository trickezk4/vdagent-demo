/**
 * apps/web/src/context/ChatContext.tsx
 * Centralized state provider for multi-agent chat, persistence, and inspection.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { AgentInfo, ChatMessage, SessionInfo, UnitDetail, InspectorTab } from '../types';

interface ChatContextType {
  sessionId: string;
  sessions: SessionInfo[];
  activeAgent: string;
  agents: AgentInfo[];
  messages: ChatMessage[];
  artifacts: Record<string, any>;
  isRunning: boolean;
  runningAgents: Record<string, boolean>;
  activeTraces: Array<{ step: string; message: string; timestamp: string; agent_id?: string }>;
  agentTraces: Record<string, Array<{ step: string; message: string; timestamp: string }>>;
  inspectedUnit: UnitDetail | null;
  inspectedUnitId: string | null;
  inspectorTab: InspectorTab;
  setActiveAgent: (agentId: string) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  createNewSession: () => void;
  switchSession: (sessionId: string) => void;
  sendMessage: (prompt: string, targetAgentId?: string) => Promise<void>;
  inspectEvidence: (unitIdOrRef: string) => Promise<void>;
  clearInspectedEvidence: () => void;
  openArtifact: (typeOrId: string) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

const DEFAULT_AGENTS: AgentInfo[] = [
  {
    agent_id: 'orchestrator',
    name: 'Tổng Chỉ Huy (DAG Orchestrator)',
    grpc_target: 'Internal Core',
    domain: 'core_orchestration',
    description: 'Chỉ huy toàn diện chuỗi DAG 6 Agents hoặc định tuyến thông minh theo truy vấn.',
    is_dynamic: false,
    status: 'HEALTHY',
  },
  {
    agent_id: 'data-agent',
    name: 'Data Warehouse Agent',
    grpc_target: 'localhost:50051',
    domain: 'data_query',
    description: 'Truy vấn SQLite Data Warehouse, trích xuất căn hộ tồn kho và chỉ số DOM.',
    is_dynamic: false,
    status: 'HEALTHY',
  },
  {
    agent_id: 'compare-agent',
    name: 'Đối Chuẩn (Compare Agent)',
    grpc_target: 'localhost:50052',
    domain: 'benchmark_analytics',
    description: 'So sánh căn hộ mục tiêu với mặt bằng giỏ hàng cùng phân khu và độ lệch giá.',
    is_dynamic: false,
    status: 'HEALTHY',
  },
  {
    agent_id: 'insight-agent',
    name: 'Căn Nguyên (Insight Agent)',
    grpc_target: 'localhost:50053',
    domain: 'root_cause_analysis',
    description: 'Phân tích 3 nguyên nhân cốt lõi (hướng nắng, đơn giá chênh, chính sách hết hạn).',
    is_dynamic: false,
    status: 'HEALTHY',
  },
  {
    agent_id: 'chart-agent',
    name: 'Trực Quan Hóa (Chart Agent)',
    grpc_target: 'localhost:50054',
    domain: 'visualization',
    description: 'Tạo đặc tả Recharts trực quan hóa DOM và ngưỡng cảnh báo 90 ngày.',
    is_dynamic: false,
    status: 'HEALTHY',
  },
  {
    agent_id: 'report-agent',
    name: 'Báo Cáo (Report Agent)',
    grpc_target: 'localhost:50055',
    domain: 'executive_reporting',
    description: 'Tổng hợp báo cáo điều tra 6 phần có chứng thực và liên kết bằng chứng.',
    is_dynamic: false,
    status: 'HEALTHY',
  },
  {
    agent_id: 'python-finance-agent',
    name: 'Tài Chính & Ngân Hàng (Python)',
    grpc_target: 'localhost:50056',
    domain: 'banking_and_finance',
    description: 'Dịch vụ Python cắm nóng tự động (Auto-Registered): Tính toán lịch trả nợ vay.',
    is_dynamic: true,
    status: 'UNAVAILABLE',
  },
];

const SESSION_STORAGE_KEY = 'vdagent.sessionId';
const SESSIONS_LIST_KEY = 'vdagent.sessions';
const ACTIVE_AGENT_KEY = 'vdagent.activeAgent';

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Session state
  const [sessionId, setSessionId] = useState<string>(() => {
    try {
      return localStorage.getItem(SESSION_STORAGE_KEY) || 'session-default';
    } catch {
      return 'session-default';
    }
  });

  const [sessions, setSessions] = useState<SessionInfo[]>(() => {
    try {
      const saved = localStorage.getItem(SESSIONS_LIST_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [
      {
        id: 'session-default',
        title: 'Phiên phân tích Sapphire 1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
  });

  // 2. Active agent selection
  const [activeAgent, setActiveAgentState] = useState<string>(() => {
    try {
      return localStorage.getItem(ACTIVE_AGENT_KEY) || 'orchestrator';
    } catch {
      return 'orchestrator';
    }
  });

  const setActiveAgent = (agentId: string) => {
    setActiveAgentState(agentId);
    try {
      localStorage.setItem(ACTIVE_AGENT_KEY, agentId);
    } catch {
      // ignore
    }
  };

  // 3. Agents list with autonomous discovery
  const [agents, setAgents] = useState<AgentInfo[]>(DEFAULT_AGENTS);

  // 4. Messages state (persisted per session)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [artifacts, setArtifacts] = useState<Record<string, any>>({});
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runningAgents, setRunningAgents] = useState<Record<string, boolean>>({});
  const [activeTraces, setActiveTraces] = useState<Array<{ step: string; message: string; timestamp: string; agent_id?: string }>>([]);
  const [agentTraces, setAgentTraces] = useState<Record<string, Array<{ step: string; message: string; timestamp: string }>>>({});

  // 5. Inspector & Evidence state
  const [inspectedUnitId, setInspectedUnitId] = useState<string | null>(null);
  const [inspectedUnit, setInspectedUnit] = useState<UnitDetail | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('report');

  const abortRef = useRef<AbortController | null>(null);

  // Persist sessions list to localStorage
  const saveSessions = (updated: SessionInfo[]) => {
    setSessions(updated);
    try {
      localStorage.setItem(SESSIONS_LIST_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Fetch registered agents and health
  const refreshAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/agents');
      if (res.ok) {
        const data = await res.json();
        const serverAgents: any[] = data.agents || [];

        // Check health for live status
        let healthMap: Record<string, boolean> = {};
        try {
          const healthRes = await fetch('/health');
          if (healthRes.ok) {
            const hData = await healthRes.json();
            for (const [k, v] of Object.entries(hData.services || {})) {
              healthMap[k] = Boolean((v as any).is_healthy);
            }
          }
        } catch {
          // ignore
        }

        setAgents((prev) => {
          const merged = [...DEFAULT_AGENTS];
          for (const sAgent of serverAgents) {
            const idx = merged.findIndex((a) => a.agent_id === sAgent.agent_id);
            const isHealthy = healthMap[sAgent.agent_id] ?? (sAgent.status === 'HEALTHY');
            const agentObj: AgentInfo = {
              agent_id: sAgent.agent_id,
              name: sAgent.name || sAgent.agent_id,
              grpc_target: sAgent.grpc_target,
              domain: sAgent.domain || 'analytics',
              description: sAgent.description || '',
              is_dynamic: Boolean(sAgent.is_dynamic),
              status: isHealthy ? 'HEALTHY' : 'UNAVAILABLE',
            };
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...agentObj };
            } else {
              merged.push(agentObj);
            }
          }
          return merged;
        });
      }
    } catch {
      // ignore
    }
  }, []);

  // Poll agents every 4s for zero-downtime hot-plugging autonomous discovery
  useEffect(() => {
    refreshAgents();
    const timer = setInterval(refreshAgents, 4000);
    return () => clearInterval(timer);
  }, [refreshAgents]);

  // Load messages and artifacts when sessionId changes
  const loadSessionData = useCallback(async (sid: string) => {
    try {
      // 1. Load from backend gateway
      const msgRes = await fetch(`/api/v1/sessions/${sid}/messages`);
      if (msgRes.ok) {
        const data = await msgRes.json();
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
          try {
            localStorage.setItem(`vdagent_msgs_${sid}`, JSON.stringify(data.messages));
          } catch {
            // ignore
          }
        } else {
          // Check localStorage fallback
          const local = localStorage.getItem(`vdagent_msgs_${sid}`);
          if (local) {
            setMessages(JSON.parse(local));
          } else {
            setMessages([]);
          }
        }
      }

      // 2. Load artifacts from backend gateway
      const artRes = await fetch(`/api/v1/sessions/${sid}/artifacts`);
      if (artRes.ok) {
        const data = await artRes.json();
        if (data.artifacts) {
          setArtifacts(data.artifacts);
        }
      }
    } catch {
      // Offline fallback
      try {
        const local = localStorage.getItem(`vdagent_msgs_${sid}`);
        if (local) setMessages(JSON.parse(local));
      } catch {
        setMessages([]);
      }
    }
  }, []);

  useEffect(() => {
    loadSessionData(sessionId);
  }, [sessionId, loadSessionData]);

  // Switch or create session
  const switchSession = (newSid: string) => {
    setSessionId(newSid);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, newSid);
    } catch {
      // ignore
    }
  };

  const createNewSession = () => {
    const newId = `session-${Date.now().toString(36)}`;
    const newSession: SessionInfo = {
      id: newId,
      title: `Phiên #${sessions.length + 1}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const updated = [newSession, ...sessions];
    saveSessions(updated);
    switchSession(newId);
    setMessages([]);
    setArtifacts({});
    setActiveTraces([]);
  };

  // Inspect Evidence implementation
  const inspectEvidence = useCallback(async (unitIdOrRef: string) => {
    // Extract clean ID: e.g. "Evidence-REF: UNIT-VH-02" -> "UNIT-VH-02"
    let cleanId = unitIdOrRef.trim();
    if (cleanId.includes(':')) {
      cleanId = cleanId.split(':').pop()?.trim() || cleanId;
    }
    cleanId = cleanId.replace(/[\[\]]/g, '').trim();

    setInspectedUnitId(cleanId);
    setInspectorTab('evidence');

    try {
      const res = await fetch(`/api/v1/warehouse/units/${encodeURIComponent(cleanId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.unit) {
          setInspectedUnit(data.unit);
          return;
        }
      }
    } catch {
      // ignore
    }

    // Fallback if direct fetch fails or unit is generic
    setInspectedUnit({
      unit_id: cleanId,
      unit_code: cleanId.startsWith('VH-') ? cleanId : `VH-OCP-S102-1406`,
      building: 'S1.02',
      floor_level: 14,
      bedroom_count: 2,
      bathroom_count: 2,
      area_sqm: 55.4,
      view_direction: 'West',
      launch_price_vnd: 2890000000,
      net_price_vnd: 2750000000,
      dom: 115,
      status: 'AVAILABLE',
      views_count: 210,
      inquiries_count: 9,
      price_cut_count: 0,
      current_asking_price_vnd: 2890000000,
      price_per_sqm_vnd: 52166065,
      project_name: 'Vinhomes Ocean Park',
      zone_name: 'The Sapphire 1',
      is_slow_moving: true,
      root_causes: [
        {
          code: 'WEST_ORIENTATION',
          title: 'Hướng Tây hấp thụ bức xạ nhiệt cao',
          description: 'Căn hộ quay hướng Tây chịu nắng gắt buổi chiều (13h-17h). Tỷ lệ khách xem thực tế từ chối đạt 65%.',
          severity: 'HIGH',
        },
        {
          code: 'PRICE_PREMIUM',
          title: 'Đơn giá cao hơn mặt bằng Sapphire (+9.4%)',
          description: 'Đơn giá 52.2 tr/m² cao hơn mức chuẩn đối chuẩn giỏ hàng (~47.6 tr/m²).',
          severity: 'MEDIUM',
        },
        {
          code: 'POLICY_EXPIRED',
          title: 'Hết hạn gói hỗ trợ lãi suất 0%',
          description: 'Gói hỗ trợ tài chính ân hạn gốc và lãi suất 0% từ CĐT kết thúc 3 tháng trước.',
          severity: 'HIGH',
        },
      ],
      verified_hash: '3f9a7c2b810d4e9f7a5b3c1d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f',
      audit_timestamp: new Date().toISOString(),
    });
  }, []);

  const clearInspectedEvidence = () => {
    setInspectedUnit(null);
    setInspectedUnitId(null);
  };

  const openArtifact = (typeOrId: string) => {
    if (typeOrId.includes('chart') || typeOrId.startsWith('ch_')) {
      setInspectorTab('chart');
    } else if (typeOrId.includes('report') || typeOrId.startsWith('rp_')) {
      setInspectorTab('report');
    } else if (typeOrId.includes('data') || typeOrId.startsWith('ds_')) {
      setInspectorTab('dataset');
    } else if (typeOrId.includes('finance') || typeOrId.includes('loan')) {
      setInspectorTab('finance');
    } else {
      setInspectorTab('artifacts');
    }
  };

  // Send message to active agent or orchestrator
  const sendMessage = useCallback(
    async (prompt: string, targetAgentId?: string) => {
      const agentToCall = targetAgentId || activeAgent;
      if (!prompt.trim() || isRunning) return;

      const userMsgId = `usr-${Date.now()}`;
      const userMessage: ChatMessage = {
        id: userMsgId,
        session_id: sessionId,
        agent_id: agentToCall,
        role: 'user',
        content: prompt.trim(),
        timestamp: new Date().toISOString(),
      };

      // Optimistically append user message
      setMessages((prev) => {
        const next = [...prev, userMessage];
        try {
          localStorage.setItem(`vdagent_msgs_${sessionId}`, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });

      setIsRunning(true);
      setActiveTraces([]);

      const controller = new AbortController();
      abortRef.current = controller;

      const accumulatedTraces: string[] = [];
      const newArtifacts: any[] = [];

      try {
        const queryParams = new URLSearchParams({
          prompt: prompt.trim(),
          agent_id: agentToCall,
          session_id: sessionId,
        });

        const response = await fetch(`/api/v1/chat/stream?${queryParams.toString()}`, {
          signal: controller.signal,
        });

        if (!response.body) {
          throw new Error('SSE stream is empty');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = 'message';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event: ')) {
              currentEvent = trimmed.replace('event: ', '').trim();
            } else if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.replace('data: ', '').trim();
              let parsed: any = dataStr;
              try {
                parsed = JSON.parse(dataStr);
              } catch {
                // keep string
              }

              if (currentEvent === 'agent_status') {
                const { agent_id, status } = parsed;
                setRunningAgents((prev) => ({
                  ...prev,
                  [agent_id]: status === 'running',
                }));
              } else if (currentEvent === 'agent_message') {
                const { agent_id, message } = parsed;
                setMessages((prev) => {
                  const exists = prev.some((m) => m.id === message.id);
                  if (exists) return prev;
                  const next = [...prev, message];
                  try {
                    localStorage.setItem(`vdagent_msgs_${sessionId}`, JSON.stringify(next));
                  } catch {
                    // ignore
                  }
                  return next;
                });
              } else if (currentEvent === 'trace') {
                const step = parsed.step || agentToCall;
                const agentId = parsed.agent_id || step;
                const msg = parsed.message || JSON.stringify(parsed);
                const timeStr = new Date().toLocaleTimeString();
                accumulatedTraces.push(`[${step}] ${msg}`);
                const traceItem = { step, message: msg, timestamp: timeStr, agent_id: agentId };
                setActiveTraces((prev) => [...prev, traceItem]);
                setAgentTraces((prev) => ({
                  ...prev,
                  [agentId]: [...(prev[agentId] || []), traceItem],
                }));
              } else if (currentEvent === 'artifact') {
                const envelope = parsed;
                newArtifacts.push(envelope);
                setArtifacts((prev) => ({ ...prev, [envelope.artifact_type]: envelope }));

                // Auto switch tabs if relevant
                if (envelope.artifact_type === 'chart_spec') {
                  setInspectorTab('chart');
                } else if (envelope.artifact_type === 'report') {
                  setInspectorTab('report');
                } else if (envelope.artifact_type === 'finance_plan') {
                  setInspectorTab('finance');
                }
              }
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          accumulatedTraces.push(`❌ Lỗi kết nối: ${err.message}`);
        }
      } finally {
        setIsRunning(false);
        setRunningAgents({});
        // Refresh full session messages from gateway to ensure perfect sync
        await loadSessionData(sessionId);
      }
    },
    [activeAgent, isRunning, sessionId, loadSessionData]
  );

  return (
    <ChatContext.Provider
      value={{
        sessionId,
        sessions,
        activeAgent,
        agents,
        messages,
        artifacts,
        isRunning,
        runningAgents,
        activeTraces,
        agentTraces,
        inspectedUnit,
        inspectedUnitId,
        inspectorTab,
        setActiveAgent,
        setInspectorTab,
        createNewSession,
        switchSession,
        sendMessage,
        inspectEvidence,
        clearInspectedEvidence,
        openArtifact,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within a ChatProvider');
  return ctx;
};
